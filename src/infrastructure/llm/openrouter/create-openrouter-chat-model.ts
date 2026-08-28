import { loadOpenRouterChatConfig } from '../../../config/openrouter.js';
import type { ChatModel } from '../../../ports/platform/chat-model.js';
import { createFetchOpenRouterHttpClient } from './openrouter-http.js';
import { OpenRouterChatModel } from './openrouter-chat-model.js';

/**
 * Env → validated config → OpenRouterChatModel.
 */
export function createOpenRouterChatModel(
  env: NodeJS.ProcessEnv = process.env,
): ChatModel {
  const config = loadOpenRouterChatConfig(env);
  const http = createFetchOpenRouterHttpClient();
  return new OpenRouterChatModel(http, config);
}
