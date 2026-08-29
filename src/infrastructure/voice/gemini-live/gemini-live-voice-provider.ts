import type {
  LiveVoiceProvider,
  LiveVoiceSession,
  StartVoiceSessionParams,
  VoiceAudioChunk,
} from '../../../ports/platform/live-voice-provider.js';
import { LiveVoiceUnavailableError } from '../../../ports/platform/live-voice-provider.js';
import type { GeminiLiveTransport } from './gemini-live-transport.js';

/**
 * LiveVoiceProvider adapter over an injectable Gemini Live transport.
 * @google/genai types stay inside createSdkGeminiLiveTransport only.
 */
export class GeminiLiveVoiceProvider implements LiveVoiceProvider {
  constructor(private readonly transport: GeminiLiveTransport) {}

  async startSession(
    params: StartVoiceSessionParams,
  ): Promise<LiveVoiceSession> {
    try {
      const remote = await this.transport.connect({
        systemInstruction: params.systemInstruction,
        tools: params.tools ?? [],
        onMessage: async (message) => {
          try {
            switch (message.kind) {
              case 'audio':
                if (message.audioBase64) {
                  params.handlers.onAudio?.({
                    dataBase64: message.audioBase64,
                    mimeType: message.mimeType ?? 'audio/pcm',
                  });
                }
                return;
              case 'transcript':
                if (message.transcript) {
                  params.handlers.onTranscript?.(
                    message.transcript,
                    message.transcriptRole ?? 'assistant',
                  );
                }
                return;
              case 'toolCall':
                if (message.toolCall && params.handlers.onToolCall) {
                  const resultJson = await params.handlers.onToolCall(
                    message.toolCall,
                  );
                  let responseBody: Record<string, unknown>;
                  try {
                    responseBody = JSON.parse(resultJson) as Record<
                      string,
                      unknown
                    >;
                  } catch {
                    responseBody = { output: resultJson };
                  }
                  await remote.sendToolResponse(
                    message.toolCall.id,
                    message.toolCall.name,
                    { output: responseBody },
                  );
                }
                return;
              case 'error':
                params.handlers.onError?.(
                  message.error ?? new LiveVoiceUnavailableError(),
                );
                return;
              case 'close':
                params.handlers.onClose?.();
                return;
              case 'interrupt':
                params.handlers.onInterrupt?.();
                return;
            }
          } catch (error) {
            params.handlers.onError?.(
              error instanceof Error
                ? error
                : new LiveVoiceUnavailableError(String(error)),
            );
          }
        },
      });

      return {
        async sendAudio(chunk: VoiceAudioChunk) {
          try {
            await remote.sendAudio(chunk.dataBase64, chunk.mimeType);
          } catch (error) {
            throw new LiveVoiceUnavailableError(
              error instanceof Error ? error.message : 'Voice sendAudio failed',
            );
          }
        },
        async sendText(text: string) {
          try {
            await remote.sendText(text);
          } catch (error) {
            throw new LiveVoiceUnavailableError(
              error instanceof Error ? error.message : 'Voice sendText failed',
            );
          }
        },
        async close() {
          try {
            await remote.close();
          } catch {
            /* best-effort close */
          }
          params.handlers.onClose?.();
        },
      };
    } catch (error) {
      if (error instanceof LiveVoiceUnavailableError) throw error;
      throw new LiveVoiceUnavailableError(
        error instanceof Error ? error.message : 'Voice session failed to start',
      );
    }
  }
}
