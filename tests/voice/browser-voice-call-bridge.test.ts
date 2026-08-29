import { beforeEach, describe, expect, it } from 'vitest';
import { BrowserVoiceCallBridge } from '../../src/interfaces/voice/browser-voice-call-bridge.js';
import { VoiceClinicSession } from '../../src/interfaces/voice/voice-clinic-session.js';
import { ScriptedLiveVoiceProvider } from '../../src/infrastructure/voice/scripted/scripted-live-voice-provider.js';
import { createAgentTestWorld, type AgentTestWorld } from '../helpers/agent-world.js';
import { createToolRegistry, createClinicTools } from '../../src/agent/index.js';
import type { BrowserVoiceServerMessage } from '../../src/interfaces/voice/browser-voice-protocol.js';

describe('BrowserVoiceCallBridge', () => {
  let ctx: AgentTestWorld;
  let voice: ScriptedLiveVoiceProvider;
  let bridge: BrowserVoiceCallBridge;
  let outbound: BrowserVoiceServerMessage[];

  beforeEach(async () => {
    ctx = createAgentTestWorld();
    await ctx.world.seed();
    voice = new ScriptedLiveVoiceProvider();
    outbound = [];
    const session = new VoiceClinicSession({
      voiceProvider: voice,
      authGateway: ctx.authGateway,
      resolveClinicActor: ctx.resolveClinicActor,
      tools: createToolRegistry(createClinicTools(ctx.useCases)),
      workingMemory: ctx.workingMemory,
    });
    bridge = new BrowserVoiceCallBridge({ voiceClinicSession: session });
  });

  function send(msg: BrowserVoiceServerMessage) {
    outbound.push(msg);
  }

  it('starts session and emits ready', async () => {
    await bridge.handleMessage(
      'conn-1',
      { type: 'start', conversationId: 'browser-voice-1' },
      send,
    );
    await new Promise((r) => setTimeout(r, 20));

    expect(outbound.some((m) => m.type === 'ready')).toBe(true);
    const ready = outbound.find((m) => m.type === 'ready');
    expect(ready && ready.type === 'ready' && ready.conversationId).toBe(
      'browser-voice-1',
    );
    expect(bridge.getActive('conn-1')?.conversationId).toBe('browser-voice-1');
  });

  it('forwards audio to live session', async () => {
    await bridge.handleMessage(
      'conn-2',
      { type: 'start', conversationId: 'browser-voice-2' },
      send,
    );

    const started = voice.started[0];
    expect(started).toBeDefined();

    await bridge.handleMessage(
      'conn-2',
      {
        type: 'audio',
        dataBase64: 'AAAA',
        mimeType: 'audio/pcm;rate=16000',
      },
      send,
    );

    const live = bridge.getActive('conn-2');
    expect(live).toBeDefined();
  });

  it('relays provider audio and transcripts to browser', async () => {
    voice.enqueue({
      type: 'transcript',
      role: 'assistant',
      text: 'مرحبا',
    });

    await bridge.handleMessage(
      'conn-3',
      { type: 'start', conversationId: 'browser-voice-3' },
      send,
    );
    await new Promise((r) => setTimeout(r, 30));

    const session = voice.started[0];
    expect(session).toBeDefined();
    session!.handlers.onAudio?.({
      dataBase64: 'AQID',
      mimeType: 'audio/pcm;rate=24000',
    });
    session!.handlers.onTranscript?.('hello', 'user');

    expect(outbound.some((m) => m.type === 'audio')).toBe(true);
    expect(
      outbound.some(
        (m) => m.type === 'transcript' && m.role === 'user' && m.text === 'hello',
      ),
    ).toBe(true);
  });

  it('stops session on stop message', async () => {
    await bridge.handleMessage(
      'conn-4',
      { type: 'start', conversationId: 'browser-voice-4' },
      send,
    );
    await bridge.handleMessage('conn-4', { type: 'stop' }, send);

    expect(bridge.getActive('conn-4')).toBeUndefined();
    expect(outbound.some((m) => m.type === 'closed')).toBe(true);
  });
});
