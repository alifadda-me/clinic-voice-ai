import type {
  LiveVoiceProvider,
  LiveVoiceSession,
  StartVoiceSessionParams,
  VoiceAudioChunk,
} from '../../../ports/platform/live-voice-provider.js';
import { LiveVoiceUnavailableError } from '../../../ports/platform/live-voice-provider.js';

/**
 * No-op voice provider for bootstrap defaults / smoke tests.
 * Prefer ScriptedLiveVoiceProvider for behavioral tests.
 */
export class InMemoryLiveVoiceProvider implements LiveVoiceProvider {
  private unavailable = false;
  readonly sessions: StartVoiceSessionParams[] = [];

  setUnavailable(unavailable: boolean): void {
    this.unavailable = unavailable;
  }

  async startSession(
    params: StartVoiceSessionParams,
  ): Promise<LiveVoiceSession> {
    if (this.unavailable) {
      throw new LiveVoiceUnavailableError(
        'InMemoryLiveVoiceProvider is marked unavailable',
      );
    }
    this.sessions.push(params);
    return {
      async sendAudio(_chunk: VoiceAudioChunk) {
        /* no-op */
      },
      async sendText(text: string) {
        params.handlers.onTranscript?.(text, 'user');
      },
      async close() {
        params.handlers.onClose?.();
      },
    };
  }
}
