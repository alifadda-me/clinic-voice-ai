/**
 * Platform chat model — provider-neutral; no OpenRouter/OpenAI/Gemini types.
 *
 * Capabilities used by ToolLoopAgent:
 *   - message history (roles: system | user | assistant | tool)
 *   - optional tool definitions
 *   - text response and/or tool calls
 *
 * Finish reasons and streaming are intentionally omitted until a second
 * provider forces them into the port.
 * Optional token usage is provider-neutral metrics only.
 */

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export type ChatMessage = {
  role: ChatRole;
  content: string;
  /** Present when role === 'tool' — correlates with a prior tool call. */
  toolCallId?: string | undefined;
  name?: string | undefined;
  /** Present when assistant requested tools in this turn. */
  toolCalls?: readonly ChatToolCall[] | undefined;
};

export type ChatToolDefinition = {
  name: string;
  description: string;
  /** JSON-schema-like parameter object (provider-neutral). */
  parameters: Record<string, unknown>;
};

export type ChatToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type ChatTokenUsage = {
  promptTokens?: number | undefined;
  completionTokens?: number | undefined;
  totalTokens?: number | undefined;
};

export type ChatRequest = {
  messages: readonly ChatMessage[];
  systemInstruction?: string | undefined;
  tools?: readonly ChatToolDefinition[] | undefined;
};

export type ChatResponse = {
  content?: string | undefined;
  toolCalls?: readonly ChatToolCall[] | undefined;
  usage?: ChatTokenUsage | undefined;
};

export class ChatModelUnavailableError extends Error {
  readonly code = 'CHAT_MODEL_UNAVAILABLE';

  constructor(message = 'Chat model is temporarily unavailable') {
    super(message);
    this.name = 'ChatModelUnavailableError';
  }
}

export class ChatModelInvalidResponseError extends Error {
  readonly code = 'CHAT_MODEL_INVALID_RESPONSE';

  constructor(message = 'Chat model returned an unusable response') {
    super(message);
    this.name = 'ChatModelInvalidResponseError';
  }
}

export interface ChatModel {
  generate(request: ChatRequest): Promise<ChatResponse>;
}
