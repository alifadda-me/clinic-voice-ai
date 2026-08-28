import { GoogleGenAI, Modality, type Session } from '@google/genai';
import type { GeminiLiveVoiceConfig } from '../../../config/gemini-live.js';
import { LiveVoiceUnavailableError } from '../../../ports/platform/live-voice-provider.js';
import type {
  GeminiLiveTransport,
  GeminiLiveTransportMessage,
} from './gemini-live-transport.js';

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

      try {
        session = await ai.live.connect({
          model: config.model,
          config: {
            responseModalities: [Modality.AUDIO],
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
              void mapServerMessage(message, params.onMessage);
            },
            onerror: (e) => {
              void params.onMessage({
                kind: 'error',
                error: new LiveVoiceUnavailableError(
                  e instanceof Error ? e.message : 'Gemini Live error',
                ),
              });
            },
            onclose: () => {
              void params.onMessage({ kind: 'close' });
            },
          },
        });
      } catch (error) {
        throw new LiveVoiceUnavailableError(
          error instanceof Error
            ? error.message
            : 'Failed to connect Gemini Live',
        );
      }

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
        async close() {
          active.close();
        },
      };
    },
  };
}

async function mapServerMessage(
  message: unknown,
  onMessage: (msg: GeminiLiveTransportMessage) => void | Promise<void>,
): Promise<void> {
  const root = message as {
    serverContent?: {
      modelTurn?: {
        parts?: Array<{
          text?: string;
          inlineData?: { data?: string; mimeType?: string };
        }>;
      };
      inputTranscription?: { text?: string };
      outputTranscription?: { text?: string };
    };
    toolCall?: {
      functionCalls?: Array<{
        id?: string;
        name?: string;
        args?: Record<string, unknown>;
      }>;
    };
  };

  const inputTx = root.serverContent?.inputTranscription?.text;
  if (inputTx) {
    await onMessage({
      kind: 'transcript',
      transcript: inputTx,
      transcriptRole: 'user',
    });
  }

  const outputTx = root.serverContent?.outputTranscription?.text;
  if (outputTx) {
    await onMessage({
      kind: 'transcript',
      transcript: outputTx,
      transcriptRole: 'assistant',
    });
  }

  const parts = root.serverContent?.modelTurn?.parts ?? [];
  for (const part of parts) {
    if (part.text) {
      await onMessage({
        kind: 'transcript',
        transcript: part.text,
        transcriptRole: 'assistant',
      });
    }
    if (part.inlineData?.data) {
      await onMessage({
        kind: 'audio',
        audioBase64: part.inlineData.data,
        mimeType: part.inlineData.mimeType ?? 'audio/pcm',
      });
    }
  }

  const calls = root.toolCall?.functionCalls ?? [];
  for (const call of calls) {
    if (!call.name) continue;
    await onMessage({
      kind: 'toolCall',
      toolCall: {
        id: call.id?.trim() || `voice_tool_${call.name}`,
        name: call.name,
        arguments:
          call.args && typeof call.args === 'object' && !Array.isArray(call.args)
            ? call.args
            : {},
      },
    });
  }
}
