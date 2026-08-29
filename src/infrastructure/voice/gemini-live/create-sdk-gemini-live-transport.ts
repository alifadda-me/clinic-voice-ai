import { GoogleGenAI, Modality, ThinkingLevel, type Session } from '@google/genai';
import type { GeminiLiveVoiceConfig } from '../../../config/gemini-live.js';
import { LiveVoiceUnavailableError } from '../../../ports/platform/live-voice-provider.js';
import type { GeminiLiveTransport } from './gemini-live-transport.js';
import { dispatchGeminiLiveServerMessage } from './dispatch-gemini-live-server-message.js';

const SETUP_TIMEOUT_MS = 20_000;

function thinkingConfigForLiveModel(model: string) {
  if (model.startsWith('gemini-3.')) {
    return { thinkingLevel: ThinkingLevel.MINIMAL };
  }
  return { includeThoughts: false };
}

/**
 * Real @google/genai Live transport. Only imported from this file (depcruise).
 */
export function createSdkGeminiLiveTransport(
  config: GeminiLiveVoiceConfig,
): GeminiLiveTransport {
  if (!config.apiKey) {
    throw new LiveVoiceUnavailableError('GEMINI_API_KEY is required');
  }

  const ai = new GoogleGenAI({ apiKey: config.apiKey });

  return {
    async connect(params) {
      let session: Session | undefined;
      let setupComplete = false;
      let setupFailed: Error | undefined;

      let resolveSetup!: () => void;
      let rejectSetup!: (error: Error) => void;
      const setupGate = new Promise<void>((resolve, reject) => {
        resolveSetup = resolve;
        rejectSetup = reject;
      });

      const setupTimer = setTimeout(() => {
        if (!setupComplete) {
          setupFailed = new LiveVoiceUnavailableError(
            'Gemini Live setup timed out',
          );
          rejectSetup(setupFailed);
        }
      }, SETUP_TIMEOUT_MS);

      try {
        session = await ai.live.connect({
          model: config.model,
          config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            thinkingConfig: thinkingConfigForLiveModel(config.model),
            systemInstruction: params.systemInstruction,
            ...(params.tools.length > 0
              ? {
                  tools: [
                    {
                      functionDeclarations: params.tools.map((t) => ({
                        name: t.name,
                        description: t.description,
                        parametersJsonSchema: t.parametersSchema,
                      })),
                    },
                  ],
                }
              : {}),
          },
          callbacks: {
            onmessage: (message) => {
              if (message.setupComplete && !setupComplete) {
                setupComplete = true;
                clearTimeout(setupTimer);
                resolveSetup();
              }
              void dispatchGeminiLiveServerMessage(message, params.onMessage);
            },
            onerror: (e) => {
              const error = new LiveVoiceUnavailableError(
                e instanceof Error ? e.message : 'Gemini Live error',
              );
              if (!setupComplete) {
                setupFailed = error;
                clearTimeout(setupTimer);
                rejectSetup(error);
              }
              void params.onMessage({ kind: 'error', error });
            },
            onclose: (event) => {
              clearTimeout(setupTimer);
              if (!setupComplete) {
                const reason =
                  typeof event === 'object' &&
                  event &&
                  'reason' in event &&
                  typeof event.reason === 'string' &&
                  event.reason.trim()
                    ? event.reason.trim()
                    : 'Gemini Live closed before setup completed';
                setupFailed = new LiveVoiceUnavailableError(reason);
                rejectSetup(setupFailed);
              }
              void params.onMessage({ kind: 'close' });
            },
          },
        });
      } catch (error) {
        clearTimeout(setupTimer);
        throw new LiveVoiceUnavailableError(
          error instanceof Error
            ? error.message
            : 'Failed to connect Gemini Live',
        );
      }

      await setupGate;

      const active = session;
      return {
        async sendAudio(dataBase64, mimeType) {
          active.sendRealtimeInput({
            audio: { data: dataBase64, mimeType },
          });
        },
        async sendText(text) {
          active.sendRealtimeInput({ text });
        },
        async sendToolResponse(id, name, response) {
          active.sendToolResponse({
            functionResponses: {
              id,
              name,
              response,
            },
          });
        },
        async close() {
          active.close();
        },
      };
    },
  };
}
