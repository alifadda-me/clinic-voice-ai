import { describe, expect, it, vi } from 'vitest';
import { dispatchGeminiLiveServerMessage } from '../../src/infrastructure/voice/gemini-live/dispatch-gemini-live-server-message.js';
import type { GeminiLiveTransportMessage } from '../../src/infrastructure/voice/gemini-live/gemini-live-transport.js';

function collectMessages(
  message: unknown,
): Promise<GeminiLiveTransportMessage[]> {
  const messages: GeminiLiveTransportMessage[] = [];
  return dispatchGeminiLiveServerMessage(message, (msg) => {
    messages.push(msg);
  }).then(() => messages);
}

describe('dispatchGeminiLiveServerMessage', () => {
  it('emits inline part audio without duplicating message.data', async () => {
    const audioChunk = 'AQID';
    const messages = await collectMessages({
      serverContent: {
        modelTurn: {
          parts: [{ inlineData: { data: audioChunk, mimeType: 'audio/pcm;rate=24000' } }],
        },
      },
      data: audioChunk,
    });

    expect(messages).toEqual([
      {
        kind: 'audio',
        audioBase64: audioChunk,
        mimeType: 'audio/pcm;rate=24000',
      },
    ]);
  });

  it('falls back to message.data when no inline parts', async () => {
    const audioChunk = 'BAUG';
    const messages = await collectMessages({ data: audioChunk });

    expect(messages).toEqual([
      {
        kind: 'audio',
        audioBase64: audioChunk,
        mimeType: 'audio/pcm;rate=24000',
      },
    ]);
  });

  it('forwards interrupted turns', async () => {
    const onMessage = vi.fn();
    await dispatchGeminiLiveServerMessage(
      { serverContent: { interrupted: true } },
      onMessage,
    );
    expect(onMessage).toHaveBeenCalledWith({ kind: 'interrupt' });
  });

  it('ignores setupComplete-only payloads', async () => {
    const messages = await collectMessages({ setupComplete: true });
    expect(messages).toEqual([]);
  });
});
