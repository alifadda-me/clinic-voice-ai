import type {
  LiveVoiceProvider,
  LiveVoiceSession,
  StartVoiceSessionParams,
  VoiceAudioChunk,
  VoiceToolCall,
} from '../../../ports/platform/live-voice-provider.js';
import { LiveVoiceUnavailableError } from '../../../ports/platform/live-voice-provider.js';

export type ScriptedVoiceEvent =
  | { type: 'transcript'; role: 'user' | 'assistant'; text: string }
  | { type: 'toolCall'; call: VoiceToolCall }
  | { type: 'audio'; chunk: VoiceAudioChunk }
  | { type: 'error'; error: Error }
  | { type: 'close' }
  | { type: 'failStart'; message?: string };

/**
 * Deterministic LiveVoiceProvider for tests.
 * Queued events fire after startSession (microtask), and again after sendText.
 */
export class ScriptedLiveVoiceProvider implements LiveVoiceProvider {
  private readonly queue: ScriptedVoiceEvent[] = [];
  readonly started: StartVoiceSessionParams[] = [];
  unavailable = false;

  enqueue(...events: ScriptedVoiceEvent[]): void {
    this.queue.push(...events);
  }

  /** Drop queued events (test isolation between cases). */
  clearQueue(): void {
    this.queue.length = 0;
  }

  setUnavailable(unavailable: boolean): void {
    this.unavailable = unavailable;
  }

  async startSession(
    params: StartVoiceSessionParams,
  ): Promise<LiveVoiceSession> {
    if (this.unavailable) {
      throw new LiveVoiceUnavailableError('Scripted voice marked unavailable');
    }

    const fail = this.queue.find((e) => e.type === 'failStart');
    if (fail && fail.type === 'failStart') {
      this.queue.splice(this.queue.indexOf(fail), 1);
      throw new LiveVoiceUnavailableError(
        fail.message ?? 'Scripted voice failed to start',
      );
    }

    this.started.push(params);
    let closed = false;

    const drain = async () => {
      while (this.queue.length > 0 && !closed) {
        const event = this.queue.shift()!;
        await dispatchEvent(params, event);
        if (event.type === 'close' || event.type === 'error') {
          closed = true;
          break;
        }
      }
    };

    queueMicrotask(() => {
      void drain();
    });

    return {
      async sendAudio(_chunk: VoiceAudioChunk) {
        if (closed) return;
      },
      async sendText(_text: string) {
        if (closed) return;
        await drain();
      },
      async close() {
        if (closed) return;
        closed = true;
        params.handlers.onClose?.();
      },
    };
  }
}

async function dispatchEvent(
  params: StartVoiceSessionParams,
  event: ScriptedVoiceEvent,
): Promise<void> {
  switch (event.type) {
    case 'transcript':
      params.handlers.onTranscript?.(event.text, event.role);
      return;
    case 'toolCall': {
      if (!params.handlers.onToolCall) return;
      await params.handlers.onToolCall(event.call);
      return;
    }
    case 'audio':
      params.handlers.onAudio?.(event.chunk);
      return;
    case 'error':
      params.handlers.onError?.(event.error);
      return;
    case 'close':
      params.handlers.onClose?.();
      return;
    case 'failStart':
      return;
  }
}
