import { describe, expect, it } from 'vitest';
import type { LiveVoiceProvider } from '../../src/ports/platform/live-voice-provider.js';
import { LiveVoiceUnavailableError } from '../../src/ports/platform/live-voice-provider.js';
import { InMemoryLiveVoiceProvider } from '../../src/infrastructure/voice/in-memory/in-memory-live-voice-provider.js';
import { ScriptedLiveVoiceProvider } from '../../src/infrastructure/voice/scripted/scripted-live-voice-provider.js';
import { GeminiLiveVoiceProvider } from '../../src/infrastructure/voice/gemini-live/gemini-live-voice-provider.js';
import type { GeminiLiveTransport } from '../../src/infrastructure/voice/gemini-live/gemini-live-transport.js';

function runContract(name: string, factory: () => LiveVoiceProvider) {
  describe(`LiveVoiceProvider contract: ${name}`, () => {
    it('starts a session and accepts audio/text/close', async () => {
      const provider = factory();
      const session = await provider.startSession({
        sessionId: 's1',
        systemInstruction: 'test',
        handlers: {},
      });
      await expect(
        session.sendAudio({ dataBase64: 'AA==', mimeType: 'audio/pcm' }),
      ).resolves.toBeUndefined();
      await expect(session.sendText('hello')).resolves.toBeUndefined();
      await expect(session.close()).resolves.toBeUndefined();
    });

    it('surfaces unavailability as LiveVoiceUnavailableError', async () => {
      const provider = factory();
      if (
        'setUnavailable' in provider &&
        typeof provider.setUnavailable === 'function'
      ) {
        provider.setUnavailable(true);
        await expect(
          provider.startSession({
            sessionId: 's2',
            systemInstruction: 'test',
            handlers: {},
          }),
        ).rejects.toBeInstanceOf(LiveVoiceUnavailableError);
      }
    });
  });
}

runContract('InMemoryLiveVoiceProvider', () => new InMemoryLiveVoiceProvider());
runContract('ScriptedLiveVoiceProvider', () => new ScriptedLiveVoiceProvider());

describe('ScriptedLiveVoiceProvider events', () => {
  it('delivers tool calls and transcripts to handlers', async () => {
    const provider = new ScriptedLiveVoiceProvider();
    const transcripts: string[] = [];
    const toolNames: string[] = [];

    provider.enqueue(
      { type: 'transcript', role: 'user', text: 'find a doctor' },
      {
        type: 'toolCall',
        call: {
          id: '1',
          name: 'search_doctors',
          arguments: { query: 'cardio' },
        },
      },
      { type: 'transcript', role: 'assistant', text: 'here you go' },
      { type: 'close' },
    );

    await provider.startSession({
      sessionId: 'scripted',
      systemInstruction: 'x',
      handlers: {
        onTranscript: (text) => {
          transcripts.push(text);
        },
        onToolCall: async (call) => {
          toolNames.push(call.name);
          return '{"ok":true}';
        },
      },
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(transcripts).toEqual(['find a doctor', 'here you go']);
    expect(toolNames).toEqual(['search_doctors']);
  });
});

describe('GeminiLiveVoiceProvider with fake transport', () => {
  it('maps transport messages to handlers and fails closed on connect error', async () => {
    const transcripts: string[] = [];
    const transport: GeminiLiveTransport = {
      async connect(params) {
        queueMicrotask(() => {
          void params.onMessage({
            kind: 'transcript',
            transcript: 'hi',
            transcriptRole: 'assistant',
          });
        });
        return {
          async sendAudio() {},
          async sendText() {},
          async sendToolResponse() {},
          async close() {
            await params.onMessage({ kind: 'close' });
          },
        };
      },
    };

    const provider = new GeminiLiveVoiceProvider(transport);
    await provider.startSession({
      sessionId: 'g1',
      systemInstruction: 'sys',
      handlers: {
        onTranscript: (t) => {
          transcripts.push(t);
        },
      },
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(transcripts).toEqual(['hi']);

    const failing: GeminiLiveTransport = {
      async connect() {
        throw new Error('network down');
      },
    };
    await expect(
      new GeminiLiveVoiceProvider(failing).startSession({
        sessionId: 'g2',
        systemInstruction: 'sys',
        handlers: {},
      }),
    ).rejects.toBeInstanceOf(LiveVoiceUnavailableError);
  });
});
