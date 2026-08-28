import { randomUUID } from 'node:crypto';
import type { AuthCredentials } from '../../ports/platform/auth.js';
import type {
  LiveVoiceSession,
  VoiceAudioChunk,
} from '../../ports/platform/live-voice-provider.js';
import type { ObservabilityPort } from '../../ports/platform/observability.js';
import type { TrustedExecutionContext } from '../../agent/execution-context.js';
import { createSafeObservability } from '../../agent/safe-observability.js';
import type { VoiceClinicSession } from '../voice/voice-clinic-session.js';

/**
 * Media stream events — produced by a Twilio WS adapter or a fake in tests.
 * No Twilio SDK types.
 */
export type TwilioMediaStreamEvent =
  | {
      type: 'start';
      callSid: string;
      streamSid: string;
      /** Spoofable; never used as AuthCredentials. */
      callerIdClaim?: string | undefined;
    }
  | {
      type: 'media';
      callSid: string;
      payloadBase64: string;
      track?: string | undefined;
    }
  | { type: 'stop'; callSid: string };

export type TwilioPstnActiveCall = {
  callSid: string;
  conversationId: string;
  execution: TrustedExecutionContext;
  liveSession: LiveVoiceSession;
  callerIdClaim: string | null;
};

/**
 * Bridges Twilio Media Stream events into VoiceClinicSession.
 * Lives in interfaces (not infrastructure) so it may depend on VoiceClinicSession.
 *
 * Caller ID ≠ authentication. Optional credentials are explicit only.
 */
export class TwilioPstnCallBridge {
  private readonly observability: ObservabilityPort;
  private readonly active = new Map<string, TwilioPstnActiveCall>();

  constructor(
    private readonly deps: {
      voiceClinicSession: VoiceClinicSession;
      observability?: ObservabilityPort | undefined;
    },
  ) {
    this.observability = createSafeObservability(deps.observability);
  }

  getActiveCall(callSid: string): TwilioPstnActiveCall | undefined {
    return this.active.get(callSid);
  }

  async handleMediaEvent(
    event: TwilioMediaStreamEvent,
    auth?: { credentials?: AuthCredentials | undefined },
  ): Promise<TwilioPstnActiveCall | null> {
    if (event.type === 'start') {
      return this.startCall(event, auth?.credentials);
    }
    if (event.type === 'media') {
      await this.forwardMedia(event.callSid, {
        dataBase64: event.payloadBase64,
        mimeType: 'audio/pcmu',
      });
      return this.active.get(event.callSid) ?? null;
    }
    if (event.type === 'stop') {
      await this.stopCall(event.callSid);
      return null;
    }
    return null;
  }

  private async startCall(
    event: Extract<TwilioMediaStreamEvent, { type: 'start' }>,
    credentials: AuthCredentials | undefined,
  ): Promise<TwilioPstnActiveCall> {
    const span = this.observability.startTrace('twilio.call.start', {
      channel: 'twilio_voice',
    });

    try {
      const conversationId = randomUUID();
      const started = await this.deps.voiceClinicSession.start({
        conversationId,
        channel: 'twilio_voice',
        requestCorrelationId: event.callSid,
        credentials: credentials ?? {},
      });

      const active: TwilioPstnActiveCall = {
        callSid: event.callSid,
        conversationId,
        execution: started.execution,
        liveSession: started.session,
        callerIdClaim: event.callerIdClaim?.trim() || null,
      };
      this.active.set(event.callSid, active);
      span.setAttribute('authenticated', Boolean(started.execution.actor));
      span.setAttribute('status', 'ok');
      span.end();
      return active;
    } catch (error) {
      span.setAttribute('status', 'error');
      span.end();
      throw error;
    }
  }

  private async forwardMedia(
    callSid: string,
    chunk: VoiceAudioChunk,
  ): Promise<void> {
    const call = this.active.get(callSid);
    if (!call) return;
    try {
      await call.liveSession.sendAudio(chunk);
    } catch {
      /* transport failure must not mutate clinic */
    }
  }

  async stopCall(callSid: string): Promise<void> {
    const call = this.active.get(callSid);
    if (!call) return;
    this.active.delete(callSid);
    try {
      await call.liveSession.close();
    } catch {
      /* best-effort */
    }
    await this.observability.recordEvent('twilio.call.stop', {
      channel: 'twilio_voice',
    });
  }
}
