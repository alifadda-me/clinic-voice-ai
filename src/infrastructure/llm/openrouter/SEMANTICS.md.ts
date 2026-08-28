/**
 * OpenRouter ChatModel semantics
 * ==============================
 *
 * Port: ChatModel (provider-neutral)
 * Adapter: OpenRouterChatModel + injectable HTTP client
 *
 * Mapping:
 *   ChatRequest.messages + systemInstruction → OpenAI-compatible messages
 *   ChatToolDefinition → tools[].function
 *   choices[0].message.tool_calls → ChatToolCall[] (arguments JSON-parsed)
 *
 * Failures:
 *   network/timeout/5xx/429 → ChatModelUnavailableError
 *   malformed JSON / missing message / bad tool args → ChatModelInvalidResponseError
 *
 * Does NOT:
 *   touch Redis, Postgres, tools, or clinic state
 */

export {};
