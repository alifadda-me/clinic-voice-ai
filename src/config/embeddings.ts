import { z } from 'zod';

const embeddingEnvSchema = z.object({
  /**
   * Prefer dedicated key; falls back to OPENROUTER_API_KEY at load time.
   */
  EMBEDDING_API_KEY: z.string().min(1).optional(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  EMBEDDING_BASE_URL: z
    .string()
    .url()
    .default('https://openrouter.ai/api/v1'),
  /** OpenAI-compatible embedding model id (e.g. openai/text-embedding-3-small). */
  EMBEDDING_MODEL: z.string().min(1).default('openai/text-embedding-3-small'),
  /** Must match the model output size and Qdrant collection vector size. */
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1536),
  EMBEDDING_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  EMBEDDING_HTTP_REFERER: z.string().optional(),
  EMBEDDING_APP_TITLE: z.string().optional(),
  /**
   * Forbidden in APP_MODE=production. Local/dev only.
   * "remote" (default when key present) | "deterministic" (tests/local).
   */
  EMBEDDING_MODE: z.enum(['remote', 'deterministic']).optional(),
});

export type EmbeddingProviderConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  dimensions: number;
  timeoutMs: number;
  httpReferer?: string | undefined;
  appTitle?: string | undefined;
};

/**
 * Load remote embedding config. Composition only.
 * Fails if API key missing — never invents credentials or silently uses deterministic mode.
 */
export function loadEmbeddingProviderConfig(
  env: NodeJS.ProcessEnv = process.env,
): EmbeddingProviderConfig {
  if (env.EMBEDDING_MODE === 'deterministic') {
    throw new Error(
      'EMBEDDING_MODE=deterministic is not allowed for loadEmbeddingProviderConfig. Use InMemoryEmbeddingProvider only in tests/local non-production bootstrap.',
    );
  }

  const parsed = embeddingEnvSchema.parse({
    EMBEDDING_API_KEY: env.EMBEDDING_API_KEY,
    OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
    EMBEDDING_BASE_URL: env.EMBEDDING_BASE_URL,
    EMBEDDING_MODEL: env.EMBEDDING_MODEL,
    EMBEDDING_DIMENSIONS: env.EMBEDDING_DIMENSIONS,
    EMBEDDING_TIMEOUT_MS: env.EMBEDDING_TIMEOUT_MS,
    EMBEDDING_HTTP_REFERER: env.EMBEDDING_HTTP_REFERER,
    EMBEDDING_APP_TITLE: env.EMBEDDING_APP_TITLE,
    EMBEDDING_MODE: env.EMBEDDING_MODE,
  });

  const apiKey =
    parsed.EMBEDDING_API_KEY?.trim() || parsed.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'EMBEDDING_API_KEY (or OPENROUTER_API_KEY) is required for remote embeddings',
    );
  }

  return {
    apiKey,
    baseUrl: parsed.EMBEDDING_BASE_URL.replace(/\/$/, ''),
    model: parsed.EMBEDDING_MODEL,
    dimensions: parsed.EMBEDDING_DIMENSIONS,
    timeoutMs: parsed.EMBEDDING_TIMEOUT_MS,
    ...(parsed.EMBEDDING_HTTP_REFERER
      ? { httpReferer: parsed.EMBEDDING_HTTP_REFERER }
      : {}),
    ...(parsed.EMBEDDING_APP_TITLE
      ? { appTitle: parsed.EMBEDDING_APP_TITLE }
      : {}),
  };
}
