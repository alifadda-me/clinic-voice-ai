import { randomUUID } from 'node:crypto';
import type { AuthCredentials } from '../../ports/platform/auth.js';
import { InvalidAuthCredentialsError } from '../../ports/platform/auth.js';
import type { LiveVoiceSession } from '../../ports/platform/live-voice-provider.js';
import { LiveVoiceUnavailableError } from '../../ports/platform/live-voice-provider.js';
import type { ObservabilityPort } from '../../ports/platform/observability.js';
import type { TrustedExecutionContext } from '../../agent/execution-context.js';
import { createSafeObservability } from '../../agent/safe-observability.js';
import type { VoiceClinicSession } from './voice-clinic-session.js';
import type {
  BrowserVoiceClientMessage,
  BrowserVoiceServerMessage,
} from './browser-voice-protocol.js';

export type BrowserVoiceActiveSession = {
  connectionId: string;
  conversationId: string;
  execution: TrustedExecutionContext;
  liveSession: LiveVoiceSession;
};

export type BrowserVoiceOutbound = (
  message: BrowserVoiceServerMessage,
) => void;

/**
 * Bridges browser mic/speaker WebSocket events into VoiceClinicSession.
 * Dev/test transport — same trust path as Twilio PSTN, channel: voice.
 */
export class BrowserVoiceCallBridge {
  private readonly observability: ObservabilityPort;
  private readonly active = new Map<string, BrowserVoiceActiveSession>();
  private readonly starting = new Set<string>();
  private readonly pendingAudio = new Map<
    string,
    Extract<BrowserVoiceClientMessage, { type: 'audio' }>[]
  >();

  constructor(
    private readonly deps: {
      voiceClinicSession: VoiceClinicSession;
      observability?: ObservabilityPort | undefined;
    },
  ) {
    this.observability = createSafeObservability(deps.observability);
  }

  getActive(connectionId: string): BrowserVoiceActiveSession | undefined {
    return this.active.get(connectionId);
  }

  async handleMessage(
    connectionId: string,
    message: BrowserVoiceClientMessage,
    send: BrowserVoiceOutbound,
  ): Promise<void> {
    if (message.type === 'start') {
      await this.startSession(connectionId, message, send);
      return;
    }

    if (message.type === 'audio') {
      if (this.starting.has(connectionId)) {
        const queue = this.pendingAudio.get(connectionId) ?? [];
        queue.push(message);
        this.pendingAudio.set(connectionId, queue);
        return;
      }

      const active = this.active.get(connectionId);
      if (!active) {
        send({
          type: 'error',
          code: 'VOICE_NOT_STARTED',
          message: 'Send start before audio',
        });
        return;
      }

      await active.liveSession.sendAudio({
        dataBase64: message.dataBase64,
        mimeType: message.mimeType,
      });
      return;
    }

    const active = this.active.get(connectionId);
    if (!active && message.type === 'stop') {
      this.pendingAudio.delete(connectionId);
      send({ type: 'closed' });
      return;
    }

    if (!active) {
      send({
        type: 'error',
        code: 'VOICE_NOT_STARTED',
        message: 'Send start before audio',
      });
      return;
    }

    if (message.type === 'stop') {
      await this.stopSession(connectionId, send);
    }
  }

  async stopSession(
    connectionId: string,
    send?: BrowserVoiceOutbound,
  ): Promise<void> {
    this.starting.delete(connectionId);
    this.pendingAudio.delete(connectionId);
    const active = this.active.get(connectionId);
    if (!active) return;
    this.active.delete(connectionId);
    try {
      await active.liveSession.close();
    } catch {
      /* close must not throw to caller */
    }
    send?.({ type: 'closed' });
  }

  private async startSession(
    connectionId: string,
    message: Extract<BrowserVoiceClientMessage, { type: 'start' }>,
    send: BrowserVoiceOutbound,
  ): Promise<void> {
    if (this.active.has(connectionId)) {
      await this.stopSession(connectionId);
    }

    this.starting.add(connectionId);
    this.pendingAudio.set(connectionId, []);

    const span = this.observability.startTrace('browser.voice.start', {
      channel: 'voice',
    });

    const conversationId =
      message.conversationId?.trim() || randomUUID();
    const credentials = toAuthCredentials(message.authorization);

    try {
      const started = await this.deps.voiceClinicSession.start({
        conversationId,
        channel: 'voice',
        credentials,
        sessionListeners: {
          onAudio: (chunk) => {
            send({
              type: 'audio',
              dataBase64: chunk.dataBase64,
              mimeType: chunk.mimeType,
            });
          },
          onTranscript: (text, role) => {
            send({ type: 'transcript', role, text });
          },
          onToolInvoked: (name, ok) => {
            send({ type: 'tool', name, ok });
          },
          onError: (error) => {
            send({
              type: 'error',
              code:
                error instanceof LiveVoiceUnavailableError
                  ? error.code
                  : 'VOICE_ERROR',
              message: error.message,
            });
          },
          onInterrupt: () => {
            send({ type: 'interrupt' });
          },
        },
      });

      this.active.set(connectionId, {
        connectionId,
        conversationId,
        execution: started.execution,
        liveSession: started.session,
      });

      span.setAttribute('authenticated', Boolean(started.execution.actor));
      span.setAttribute('status', 'ok');
      span.end();

      send({
        type: 'ready',
        conversationId,
        authenticated: Boolean(started.execution.actor),
      });

      await this.flushPendingAudio(connectionId, send);
    } catch (error) {
      span.setAttribute('status', 'error');
      span.end();
      if (error instanceof InvalidAuthCredentialsError) {
        send({
          type: 'error',
          code: error.code,
          message: error.message,
        });
        return;
      }
      send({
        type: 'error',
        code: 'VOICE_START_FAILED',
        message:
          error instanceof Error ? error.message : 'Voice session failed',
      });
    } finally {
      this.starting.delete(connectionId);
    }
  }

  private async flushPendingAudio(
    connectionId: string,
    send: BrowserVoiceOutbound,
  ): Promise<void> {
    const queued = this.pendingAudio.get(connectionId) ?? [];
    this.pendingAudio.delete(connectionId);
    for (const message of queued) {
      await this.handleMessage(connectionId, message, send);
    }
  }
}

function toAuthCredentials(
  authorization: string | undefined,
): AuthCredentials {
  const trimmed = authorization?.trim();
  if (!trimmed) return {};
  const header = trimmed.toLowerCase().startsWith('bearer ')
    ? trimmed
    : `Bearer ${trimmed}`;
  return { authorizationHeader: header };
}
