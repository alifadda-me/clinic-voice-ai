import type {
  ChatModel,
  ChatMessage,
  ChatToolCall,
} from '../ports/platform/chat-model.js';
import {
  ChatModelInvalidResponseError,
  ChatModelUnavailableError,
} from '../ports/platform/chat-model.js';
import type { WorkingMemory } from '../ports/platform/working-memory.js';
import type { ObservabilityPort } from '../ports/platform/observability.js';
import type { TrustedExecutionContext } from './execution-context.js';
import type { ToolRegistry, ToolResult } from './tools/types.js';
import { CLINIC_AGENT_SYSTEM_INSTRUCTION } from './prompts.js';
import { createSafeObservability } from './safe-observability.js';
import {
  loadTraceLoggingConfig,
  logTraceEvent,
} from '../config/trace-logging.js';

export type AgentTurnInput = {
  message: string;
  /** Immutable trusted context for this turn — built at the interface boundary. */
  execution: TrustedExecutionContext;
};

export type AgentTurnResult = {
  reply: string;
  toolNamesInvoked: string[];
};

export type ClinicAgent = {
  handle(input: AgentTurnInput): Promise<AgentTurnResult>;
};

const DEFAULT_MAX_STEPS = 6;

/**
 * Minimal tool-loop agent (not LangGraph).
 *
 * Patient authority comes only from input.execution (frozen).
 * conversationId is used solely for WorkingMemory correlation.
 * Tools cannot mutate execution context between steps.
 * Observability is fail-open and never receives raw message/PII by default.
 */
export class ToolLoopAgent implements ClinicAgent {
  private readonly observability: ObservabilityPort;

  constructor(
    private readonly chat: ChatModel,
    private readonly tools: ToolRegistry,
    private readonly workingMemory: WorkingMemory,
    private readonly options: {
      maxSteps?: number;
      observability?: ObservabilityPort;
    } = {},
  ) {
    this.observability = createSafeObservability(options.observability);
  }

  async handle(input: AgentTurnInput): Promise<AgentTurnResult> {
    const execution = input.execution;
    const conversationId = execution.conversationId;
    const turnSpan = this.observability.startTrace('agent.turn', {
      conversation_id: conversationId,
      channel: execution.channel,
      authenticated: Boolean(execution.actor),
      ...(execution.requestCorrelationId
        ? { request_correlation_id: execution.requestCorrelationId }
        : {}),
    });
    const turnStarted = Date.now();

    try {
      const existing = await this.workingMemory.getSession(conversationId);
      if (!existing) {
        await this.workingMemory.createSession(conversationId);
      }

      await this.workingMemory.appendTurn(conversationId, {
        role: 'user',
        content: input.message,
        at: new Date(),
      });

      const recent = await this.workingMemory.getRecentTurns(conversationId, 20);
      const loopMessages: ChatMessage[] = recent.map((t) => ({
        role: t.role,
        content: t.content,
      }));

      const toolNamesInvoked: string[] = [];
      const maxSteps = this.options.maxSteps ?? DEFAULT_MAX_STEPS;
      const systemInstruction = buildSystemInstruction(execution);

      for (let step = 0; step < maxSteps; step += 1) {
        const llmSpan = turnSpan.startChild('llm.generate', { step });
        const llmStarted = Date.now();
        let response;
        try {
          response = await this.chat.generate({
            messages: loopMessages,
            systemInstruction,
            tools: this.tools.listDefinitions(),
          });
          llmSpan.setAttribute('status', 'ok');
          llmSpan.setAttribute('latency_ms', Date.now() - llmStarted);
          if (response.usage?.promptTokens !== undefined) {
            llmSpan.setAttribute('prompt_tokens', response.usage.promptTokens);
          }
          if (response.usage?.completionTokens !== undefined) {
            llmSpan.setAttribute(
              'completion_tokens',
              response.usage.completionTokens,
            );
          }
          if (response.usage?.totalTokens !== undefined) {
            llmSpan.setAttribute('total_tokens', response.usage.totalTokens);
          }
          const toolCallCount = response.toolCalls?.length ?? 0;
          llmSpan.setAttribute('tool_call_count', toolCallCount);
          llmSpan.end();
        } catch (error) {
          llmSpan.setAttribute('status', 'error');
          llmSpan.setAttribute('latency_ms', Date.now() - llmStarted);
          llmSpan.setAttribute('error_code', chatErrorCode(error));
          llmSpan.end();
          await this.observability.recordEvent('llm.error', {
            error_code: chatErrorCode(error),
          });
          const reply = mapChatFailureToReply(error);
          await this.workingMemory.appendTurn(conversationId, {
            role: 'assistant',
            content: reply,
            at: new Date(),
          });
          turnSpan.setAttribute('status', 'llm_error');
          turnSpan.setAttribute('latency_ms', Date.now() - turnStarted);
          turnSpan.end();
          return { reply, toolNamesInvoked };
        }

        const toolCalls = normalizeToolCalls(response.toolCalls);
        if (toolCalls.length > 0) {
          loopMessages.push({
            role: 'assistant',
            content: response.content?.trim() ?? '',
            toolCalls,
          });
          for (const call of toolCalls) {
            toolNamesInvoked.push(call.name);
            const toolSpan = turnSpan.startChild('tool.dispatch', {
              tool_name: call.name,
              step,
            });
            const toolStarted = Date.now();
            const result = await this.tools.dispatch(
              call.name,
              call.arguments,
              { execution },
            );
            toolSpan.setAttribute('tool_ok', result.ok);
            toolSpan.setAttribute('latency_ms', Date.now() - toolStarted);
            if (!result.ok && 'code' in result && typeof result.code === 'string') {
              toolSpan.setAttribute('error_code', result.code);
            }
            toolSpan.end();
            logToolDispatch({
              conversationId,
              step,
              call,
              result,
              latencyMs: Date.now() - toolStarted,
            });
            appendToolResult(loopMessages, call, result);
          }
          continue;
        }

        const reply =
          response.content?.trim() ||
          'I could not produce a response. Please try again.';
        await this.workingMemory.appendTurn(conversationId, {
          role: 'assistant',
          content: reply,
          at: new Date(),
        });
        turnSpan.setAttribute('status', 'ok');
        turnSpan.setAttribute('latency_ms', Date.now() - turnStarted);
          turnSpan.setAttribute('tools_invoked', toolNamesInvoked.length);
          turnSpan.end();
          logAgentTurn({
            conversationId,
            authenticated: Boolean(execution.actor),
            toolNamesInvoked,
            status: 'ok',
            latencyMs: Date.now() - turnStarted,
          });
          return { reply, toolNamesInvoked };
      }

      const fallback =
        'I need another moment — please rephrase or try a simpler request.';
      await this.workingMemory.appendTurn(conversationId, {
        role: 'assistant',
        content: fallback,
        at: new Date(),
      });
      turnSpan.setAttribute('status', 'max_steps');
      turnSpan.setAttribute('latency_ms', Date.now() - turnStarted);
      turnSpan.end();
      return { reply: fallback, toolNamesInvoked };
    } catch (error) {
      turnSpan.setAttribute('status', 'error');
      turnSpan.setAttribute('latency_ms', Date.now() - turnStarted);
      turnSpan.setAttribute(
        'error_code',
        error instanceof Error ? error.name : 'UNKNOWN',
      );
      turnSpan.end();
      throw error;
    }
  }
}

function buildSystemInstruction(execution: TrustedExecutionContext): string {
  const status = execution.actor
    ? 'Auth status: an authenticated clinic patient is linked for this turn. Do not ask them to authenticate again unless a tool reports PATIENT_NOT_IDENTIFIED. Doctor/specialty search and availability also work without authentication.'
    : 'Auth status: anonymous (no authenticated clinic patient). Doctor/specialty search and availability are allowed. Profile, preferences, booking, cancel, and reschedule require authentication.';

  return `${CLINIC_AGENT_SYSTEM_INSTRUCTION}\n\n${status}`;
}

function normalizeToolCalls(
  toolCalls: readonly ChatToolCall[] | undefined,
): ChatToolCall[] {
  if (!toolCalls || toolCalls.length === 0) return [];
  return toolCalls
    .filter((c) => typeof c.name === 'string' && c.name.trim().length > 0)
    .map((c, index) => ({
      id: c.id?.trim() || `call_${index + 1}`,
      name: c.name.trim(),
      arguments:
        c.arguments && typeof c.arguments === 'object' && !Array.isArray(c.arguments)
          ? c.arguments
          : {},
    }));
}

function appendToolResult(
  messages: ChatMessage[],
  call: ChatToolCall,
  result: ToolResult,
): void {
  messages.push({
    role: 'tool',
    toolCallId: call.id,
    name: call.name,
    content: JSON.stringify(result),
  });
}

function mapChatFailureToReply(error: unknown): string {
  if (error instanceof ChatModelUnavailableError) {
    return 'I am temporarily unable to reach the language model. Please try again shortly.';
  }
  if (error instanceof ChatModelInvalidResponseError) {
    return 'I received an unusable model response. Please try again.';
  }
  return 'Something went wrong while generating a reply. Please try again.';
}

function chatErrorCode(error: unknown): string {
  if (error instanceof ChatModelUnavailableError) return error.code;
  if (error instanceof ChatModelInvalidResponseError) return error.code;
  if (error instanceof Error && error.name) return error.name;
  return 'CHAT_MODEL_ERROR';
}

function logToolDispatch(input: {
  conversationId: string;
  step: number;
  call: ChatToolCall;
  result: ToolResult;
  latencyMs: number;
}): void {
  if (!loadTraceLoggingConfig().tools) return;

  const payload: Record<string, unknown> = {
    event: 'tool_dispatch',
    conversation_id: input.conversationId,
    step: input.step,
    tool: input.call.name,
    ok: input.result.ok,
    latency_ms: input.latencyMs,
    arguments: input.call.arguments,
  };

  if (!input.result.ok && 'code' in input.result) {
    payload.code = input.result.code;
    if ('message' in input.result && typeof input.result.message === 'string') {
      payload.message = input.result.message;
    }
  } else if (input.result.ok && 'message' in input.result) {
    const raw = input.result.message;
    payload.result_preview =
      typeof raw === 'string' && raw.length > 240 ? `${raw.slice(0, 240)}…` : raw;
  }

  logTraceEvent(payload);
}

function logAgentTurn(input: {
  conversationId: string;
  authenticated: boolean;
  toolNamesInvoked: string[];
  status: string;
  latencyMs: number;
}): void {
  if (!loadTraceLoggingConfig().agent) return;
  logTraceEvent({
    event: 'agent_turn',
    conversation_id: input.conversationId,
    authenticated: input.authenticated,
    tools_invoked: input.toolNamesInvoked,
    status: input.status,
    latency_ms: input.latencyMs,
  });
}
