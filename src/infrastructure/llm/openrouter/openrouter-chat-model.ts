import type {
  ChatMessage,
  ChatModel,
  ChatRequest,
  ChatResponse,
  ChatToolCall,
  ChatToolDefinition,
} from '../../../ports/platform/chat-model.js';
import {
  ChatModelInvalidResponseError,
  ChatModelUnavailableError,
} from '../../../ports/platform/chat-model.js';
import type { OpenRouterChatConfig } from '../../../config/openrouter.js';
import type { OpenRouterHttpClient } from './openrouter-http.js';

/**
 * Production ChatModel via OpenRouter's OpenAI-compatible chat completions API.
 * Provider JSON never leaves this module.
 */
export class OpenRouterChatModel implements ChatModel {
  constructor(
    private readonly http: OpenRouterHttpClient,
    private readonly config: OpenRouterChatConfig,
  ) {}

  async generate(request: ChatRequest): Promise<ChatResponse> {
    const body = {
      model: this.config.model,
      messages: mapMessages(request),
      ...(request.tools && request.tools.length > 0
        ? { tools: request.tools.map(mapTool) }
        : {}),
    };

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
    };
    if (this.config.httpReferer) {
      headers['HTTP-Referer'] = this.config.httpReferer;
    }
    if (this.config.appTitle) {
      headers['X-Title'] = this.config.appTitle;
    }

    let response;
    try {
      response = await this.http.postJson({
        url: `${this.config.baseUrl}/chat/completions`,
        headers,
        body,
        timeoutMs: this.config.timeoutMs,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'OpenRouter request failed';
      throw new ChatModelUnavailableError(message);
    }

    if (response.status === 408 || response.status === 429 || response.status >= 500) {
      throw new ChatModelUnavailableError(
        'Chat provider temporarily unavailable',
      );
    }
    if (response.status < 200 || response.status >= 300) {
      throw new ChatModelUnavailableError(
        `Chat provider request failed (HTTP ${response.status})`,
      );
    }

    return parseCompletionBody(response.bodyText);
  }
}

function mapTool(tool: ChatToolDefinition): unknown {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

function mapMessages(request: ChatRequest): unknown[] {
  const messages: unknown[] = [];
  if (request.systemInstruction) {
    messages.push({ role: 'system', content: request.systemInstruction });
  }
  for (const message of request.messages) {
    messages.push(mapMessage(message));
  }
  return messages;
}

function mapMessage(message: ChatMessage): unknown {
  if (message.role === 'tool') {
    return {
      role: 'tool',
      tool_call_id: message.toolCallId ?? 'unknown',
      content: message.content,
      ...(message.name ? { name: message.name } : {}),
    };
  }
  if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
    return {
      role: 'assistant',
      content: message.content || null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: {
          name: call.name,
          arguments: JSON.stringify(call.arguments ?? {}),
        },
      })),
    };
  }
  return { role: message.role, content: message.content };
}

function parseCompletionBody(bodyText: string): ChatResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new ChatModelInvalidResponseError('Response was not valid JSON');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new ChatModelInvalidResponseError('Response root was not an object');
  }

  const root = parsed as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{
          id?: string;
          type?: string;
          function?: { name?: string; arguments?: string };
        }>;
      };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };

  const message = root.choices?.[0]?.message;
  if (!message) {
    throw new ChatModelInvalidResponseError('Missing choices[0].message');
  }

  const toolCalls = mapToolCalls(message.tool_calls);
  const content =
    typeof message.content === 'string' && message.content.trim()
      ? message.content
      : undefined;

  if ((!toolCalls || toolCalls.length === 0) && content === undefined) {
    throw new ChatModelInvalidResponseError(
      'Message had neither content nor tool calls',
    );
  }

  const usage = mapUsage(root.usage);

  return {
    ...(content !== undefined ? { content } : {}),
    ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
    ...(usage ? { usage } : {}),
  };
}

function mapUsage(
  raw:
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      }
    | undefined,
): ChatResponse['usage'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const promptTokens =
    typeof raw.prompt_tokens === 'number' ? raw.prompt_tokens : undefined;
  const completionTokens =
    typeof raw.completion_tokens === 'number'
      ? raw.completion_tokens
      : undefined;
  const totalTokens =
    typeof raw.total_tokens === 'number' ? raw.total_tokens : undefined;
  if (
    promptTokens === undefined &&
    completionTokens === undefined &&
    totalTokens === undefined
  ) {
    return undefined;
  }
  return {
    ...(promptTokens !== undefined ? { promptTokens } : {}),
    ...(completionTokens !== undefined ? { completionTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
  };
}

function mapToolCalls(
  raw: Array<{
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }> | undefined,
): ChatToolCall[] | undefined {
  if (!raw || raw.length === 0) return undefined;
  const calls: ChatToolCall[] = [];
  for (const item of raw) {
    const name = item.function?.name?.trim();
    if (!name) {
      throw new ChatModelInvalidResponseError('Tool call missing function name');
    }
    let args: Record<string, unknown> = {};
    const argText = item.function?.arguments ?? '{}';
    try {
      const parsed = JSON.parse(argText) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      } else {
        throw new Error('arguments must be a JSON object');
      }
    } catch (error) {
      throw new ChatModelInvalidResponseError(
        `Tool call arguments were not valid JSON object: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    calls.push({
      id: item.id?.trim() || `call_${calls.length + 1}`,
      name,
      arguments: args,
    });
  }
  return calls;
}
