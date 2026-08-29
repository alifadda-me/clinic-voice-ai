import type { GeminiLiveTransportMessage } from './gemini-live-transport.js';

/**
 * Maps one Gemini Live server event to transport messages.
 * Exported for unit tests — SDK `message.data` duplicates inline part audio.
 */
export async function dispatchGeminiLiveServerMessage(
  message: unknown,
  onMessage: (msg: GeminiLiveTransportMessage) => void | Promise<void>,
): Promise<void> {
  const root = message as {
    setupComplete?: boolean;
    serverContent?: {
      interrupted?: boolean;
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
    data?: string;
    text?: string;
  };

  if (root.setupComplete) {
    return;
  }

  if (root.serverContent?.interrupted) {
    await onMessage({ kind: 'interrupt' });
  }

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
  let emittedAudioFromParts = false;

  for (const part of parts) {
    const thoughtPart = part as { thought?: boolean; text?: string };
    if (thoughtPart.thought) continue;
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
        mimeType: part.inlineData.mimeType ?? 'audio/pcm;rate=24000',
      });
      emittedAudioFromParts = true;
    }
  }

  // SDK `message.data` concatenates the same inline audio — skip when parts already emitted.
  if (!emittedAudioFromParts && root.data) {
    await onMessage({
      kind: 'audio',
      audioBase64: root.data,
      mimeType: 'audio/pcm;rate=24000',
    });
  }

  if (root.text) {
    await onMessage({
      kind: 'transcript',
      transcript: root.text,
      transcriptRole: 'assistant',
    });
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
