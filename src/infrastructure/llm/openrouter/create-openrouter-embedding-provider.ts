import type { EmbeddingProvider } from '../../../ports/platform/embedding-provider.js';
import { loadEmbeddingProviderConfig } from '../../../config/embeddings.js';
import { createFetchOpenRouterHttpClient } from './openrouter-http.js';
import { OpenRouterEmbeddingProvider } from './openrouter-embedding-provider.js';

/**
 * Env → EmbeddingProviderConfig → OpenRouterEmbeddingProvider.
 * Never returns a deterministic/in-memory provider.
 */
export function createOpenRouterEmbeddingProvider(
  env: NodeJS.ProcessEnv = process.env,
): EmbeddingProvider {
  const config = loadEmbeddingProviderConfig(env);
  return OpenRouterEmbeddingProvider.fromConfig(
    config,
    createFetchOpenRouterHttpClient(),
  );
}
