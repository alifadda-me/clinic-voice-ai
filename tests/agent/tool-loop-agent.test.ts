import { beforeEach, describe, expect, it } from 'vitest';
import { createAgentTestWorld, type AgentTestWorld } from '../helpers/agent-world.js';
import type { TestWorld } from '../helpers/test-world.js';
import { ScriptedChatModel } from '../helpers/scripted-chat-model.js';
import { ToolLoopAgent } from '../../src/agent/tool-loop-agent.js';
import {
  ChatModelInvalidResponseError,
  ChatModelUnavailableError,
} from '../../src/ports/platform/chat-model.js';
import type { ChatModel, ChatRequest, ChatResponse } from '../../src/ports/platform/chat-model.js';

describe('ToolLoopAgent', () => {
  let ctx: AgentTestWorld;
  let seed: Awaited<ReturnType<TestWorld['seed']>>;
  let chat: ScriptedChatModel;

  beforeEach(async () => {
    chat = new ScriptedChatModel();
    ctx = createAgentTestWorld(chat);
    seed = await ctx.world.seed();
  });

  async function handle(
    message: string,
    opts?: { conversationId?: string; subjectId?: string },
  ) {
    return ctx.agent.handle({
      message,
      execution: await ctx.execution({
        conversationId: opts?.conversationId ?? 'agent-convo',
        ...(opts?.subjectId !== undefined
          ? { subjectId: opts.subjectId }
          : {}),
      }),
    });
  }

  it('invokes tools then returns the model reply', async () => {
    chat.enqueue(
      {
        toolCalls: [
          {
            id: '1',
            name: 'register_patient',
            arguments: { phoneNumber: '+201011112222', fullName: 'Ali' },
          },
        ],
      },
      {
        toolCalls: [
          {
            id: '2',
            name: 'search_doctors',
            arguments: {
              query: 'heart cardiologist',
              specialtyId: seed.cardiology.id,
            },
          },
        ],
      },
      { content: 'I found Dr Sara for cardiology.' },
    );

    const result = await handle('Register me and find a cardiologist');

    expect(result.toolNamesInvoked).toEqual([
      'register_patient',
      'search_doctors',
    ]);
    expect(result.reply).toContain('Dr Sara');
    // register_patient must not authenticate
    const after = await ctx.execution({ subjectId: 'nobody' });
    expect(after.actor).toBeNull();
  });

  it('does not book when the model only chats without tools', async () => {
    chat.enqueue({ content: 'Sure, consider it booked!' });
    const before = await ctx.world.appointments.findMany({});
    const result = await handle('Book me with Dr Sara tomorrow');
    expect(result.toolNamesInvoked).toEqual([]);
    expect(result.reply).toContain('booked');
    const after = await ctx.world.appointments.findMany({});
    expect(after).toHaveLength(before.length);
  });

  it('stores user and final assistant turns in working memory', async () => {
    chat.enqueue({ content: 'Hello!' });
    await handle('Hi', { conversationId: 's3' });
    const mem = await ctx.workingMemory.getSession('s3');
    expect(mem?.turns.some((t) => t.role === 'user' && t.content === 'Hi')).toBe(
      true,
    );
    expect(
      mem?.turns.some((t) => t.role === 'assistant' && t.content === 'Hello!'),
    ).toBe(true);
  });

  it('stops after maxSteps without infinite looping', async () => {
    const looping = new ScriptedChatModel();
    for (let i = 0; i < 20; i += 1) {
      looping.enqueue({
        toolCalls: [
          {
            id: `t${i}`,
            name: 'search_specialties',
            arguments: { query: 'skin' },
          },
        ],
      });
    }
    const world = createAgentTestWorld(looping, { maxSteps: 3 });
    await world.world.seed();
    const result = await world.agent.handle({
      message: 'keep searching',
      execution: await world.execution({ conversationId: 'loop' }),
    });
    expect(result.toolNamesInvoked).toHaveLength(3);
    expect(result.reply).toMatch(/another moment|rephrase/i);
  });

  it('handles unknown tools via registry without crashing', async () => {
    chat.enqueue(
      {
        toolCalls: [{ id: '1', name: 'delete_database', arguments: {} }],
      },
      { content: 'I could not run that action.' },
    );
    const result = await handle('hack the clinic');
    expect(result.toolNamesInvoked).toEqual(['delete_database']);
    expect(result.reply).toContain('could not');
  });

  it('maps ChatModelUnavailableError to a safe reply without clinic writes', async () => {
    const failing: ChatModel = {
      async generate(_request: ChatRequest): Promise<ChatResponse> {
        throw new ChatModelUnavailableError('timeout');
      },
    };
    const world = createAgentTestWorld(failing);
    await world.world.seed();
    const before = await world.world.appointments.findMany({});
    const result = await world.agent.handle({
      message: 'book something',
      execution: await world.execution({ conversationId: 'fail' }),
    });
    expect(result.reply).toMatch(/unable to reach|try again/i);
    expect(result.toolNamesInvoked).toEqual([]);
    const after = await world.world.appointments.findMany({});
    expect(after).toHaveLength(before.length);
  });

  it('maps invalid model responses safely', async () => {
    const failing: ChatModel = {
      async generate(): Promise<ChatResponse> {
        throw new ChatModelInvalidResponseError('bad json');
      },
    };
    const world = createAgentTestWorld(failing);
    const result = await world.agent.handle({
      message: 'hello',
      execution: await world.execution({ conversationId: 'bad' }),
    });
    expect(result.reply).toMatch(/unusable model response/i);
  });

  it('skips malformed tool calls with empty names', async () => {
    chat.enqueue({
      toolCalls: [{ id: '1', name: '   ', arguments: {} }],
      content: 'Falling back to text.',
    });
    const result = await handle('hi');
    expect(result.toolNamesInvoked).toEqual([]);
    expect(result.reply).toContain('Falling back');
  });

  it('keeps the same trusted actor across multiple tool calls in one turn', async () => {
    await ctx.authenticateAs({
      subjectId: 'stable-sub',
      phoneNumber: '+201033334444',
      fullName: 'Stable',
    });
    const seen: Array<string | undefined> = [];
    const probing = new ScriptedChatModel();
    probing.enqueue(
      {
        toolCalls: [
          { id: '1', name: 'get_patient_profile', arguments: {} },
          { id: '2', name: 'get_patient_context', arguments: {} },
        ],
      },
      { content: 'Done.' },
    );
    const world = createAgentTestWorld(probing);
    await world.world.seed();
    await world.authenticateAs({
      subjectId: 'stable-sub',
      phoneNumber: '+201033334444',
      fullName: 'Stable',
    });
    // Wrap dispatch to observe actor — use agent with custom tools observation via spy on tools
    const original = world.tools.dispatch.bind(world.tools);
    world.tools.dispatch = async (name, args, toolCtx) => {
      seen.push(toolCtx.execution.actor?.patientId);
      return original(name, args, toolCtx);
    };
    // Need agent using same tools reference — recreate agent
    const agent = new ToolLoopAgent(probing, world.tools, world.workingMemory);
    await agent.handle({
      message: 'profile and context',
      execution: await world.execution({
        conversationId: 'stable',
        subjectId: 'stable-sub',
      }),
    });
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBeTruthy();
    expect(seen[0]).toBe(seen[1]);
  });
});
