import { describe, expect, it } from 'vitest';
import { ToolLoopAgent } from '../../src/agent/tool-loop-agent.js';
import { createTrustedExecutionContext } from '../../src/agent/execution-context.js';
import { createToolRegistry, createClinicTools } from '../../src/agent/index.js';
import { InMemoryObservability } from '../../src/infrastructure/memory/index.js';
import { InMemoryWorkingMemory } from '../../src/infrastructure/memory/index.js';
import { ChatModelUnavailableError } from '../../src/ports/platform/chat-model.js';
import { createAgentTestWorld } from '../helpers/agent-world.js';
import { ScriptedChatModel } from '../helpers/scripted-chat-model.js';
import type { ObservabilityPort, ObservabilitySpan } from '../../src/ports/platform/observability.js';

describe('ToolLoopAgent observability', () => {
  it('records llm and tool spans with usage and without message bodies', async () => {
    const chat = new ScriptedChatModel();
    chat.enqueue(
      {
        toolCalls: [
          { id: '1', name: 'search_doctors', arguments: { query: 'cardio' } },
        ],
        usage: { promptTokens: 11, completionTokens: 3, totalTokens: 14 },
      },
      {
        content: 'Here are doctors.',
        usage: { promptTokens: 20, completionTokens: 5, totalTokens: 25 },
      },
    );

    const ctx = createAgentTestWorld(chat);
    await ctx.world.seed();
    const obs = new InMemoryObservability();
    const agent = new ToolLoopAgent(
      chat,
      ctx.tools,
      ctx.workingMemory,
      { observability: obs },
    );

    const userMessage = 'Find a cardiologist for my brother Ahmed +2010555';
    const result = await agent.handle({
      message: userMessage,
      execution: createTrustedExecutionContext({
        conversationId: 'obs-convo',
        principal: null,
        actor: null,
        channel: 'http_chat',
        requestCorrelationId: 'corr-1',
      }),
    });

    expect(result.toolNamesInvoked).toContain('search_doctors');
    expect(obs.traces).toHaveLength(1);
    const turn = obs.traces[0]!;
    expect(turn.name).toBe('agent.turn');
    expect(turn.attributes.conversation_id).toBe('obs-convo');
    expect(turn.attributes.channel).toBe('http_chat');
    expect(turn.attributes.request_correlation_id).toBe('corr-1');
    expect(turn.attributes).not.toHaveProperty('message');
    expect(JSON.stringify(turn)).not.toContain(userMessage);
    expect(JSON.stringify(turn)).not.toContain('+2010555');

    const llmSpans = turn.children.filter((c) => c.name === 'llm.generate');
    expect(llmSpans.length).toBeGreaterThanOrEqual(1);
    expect(llmSpans[0]!.attributes.prompt_tokens).toBe(11);
    expect(llmSpans[0]!.attributes.total_tokens).toBe(14);

    const toolSpans = turn.children.filter((c) => c.name === 'tool.dispatch');
    expect(toolSpans.some((s) => s.attributes.tool_name === 'search_doctors')).toBe(
      true,
    );
  });

  it('records llm errors and still returns a chat reply', async () => {
    const failing = {
      async generate() {
        throw new ChatModelUnavailableError('down');
      },
    };
    const ctx = createAgentTestWorld();
    await ctx.world.seed();
    const obs = new InMemoryObservability();
    const agent = new ToolLoopAgent(
      failing,
      createToolRegistry(createClinicTools(ctx.useCases)),
      new InMemoryWorkingMemory(),
      { observability: obs },
    );

    const result = await agent.handle({
      message: 'hello',
      execution: createTrustedExecutionContext({
        conversationId: 'err-convo',
        principal: null,
        actor: null,
        channel: 'http_chat',
      }),
    });

    expect(result.reply).toMatch(/unable to reach/i);
    const llm = obs.traces[0]?.children.find((c) => c.name === 'llm.generate');
    expect(llm?.attributes.status).toBe('error');
    expect(llm?.attributes.error_code).toBe('CHAT_MODEL_UNAVAILABLE');
    expect(obs.events.some((e) => e.name === 'llm.error')).toBe(true);
  });

  it('continues chat when ObservabilityPort throws on every call', async () => {
    const chat = new ScriptedChatModel();
    chat.enqueue({ content: 'ok reply' });
    const ctx = createAgentTestWorld(chat);
    await ctx.world.seed();

    const exploding: ObservabilityPort = {
      startTrace(): ObservabilitySpan {
        throw new Error('observability down');
      },
      async recordScore() {
        throw new Error('observability down');
      },
      async recordEvent() {
        throw new Error('observability down');
      },
    };

    const agent = new ToolLoopAgent(
      chat,
      ctx.tools,
      ctx.workingMemory,
      { observability: exploding },
    );

    const result = await agent.handle({
      message: 'hi',
      execution: createTrustedExecutionContext({
        conversationId: 'failopen',
        principal: null,
        actor: null,
      }),
    });

    expect(result.reply).toBe('ok reply');
  });
});
