import { z } from 'zod';

const qdrantEnvSchema = z.object({
  QDRANT_URL: z.string().url().default('http://127.0.0.1:63339'),
  QDRANT_API_KEY: z.string().optional(),
  QDRANT_COLLECTION_PREFIX: z.string().min(1).default('clinic_'),
  QDRANT_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
});

export type QdrantSemanticSearchConfig = {
  url: string;
  apiKey?: string | undefined;
  collectionPrefix: string;
  timeoutMs: number;
};

/**
 * Load Qdrant adapter config. Composition only — never read in domain/application.
 */
export function loadQdrantSemanticSearchConfig(
  env: NodeJS.ProcessEnv = process.env,
): QdrantSemanticSearchConfig {
  const parsed = qdrantEnvSchema.parse({
    QDRANT_URL: env.QDRANT_URL,
    QDRANT_API_KEY: env.QDRANT_API_KEY,
    QDRANT_COLLECTION_PREFIX: env.QDRANT_COLLECTION_PREFIX,
    QDRANT_TIMEOUT_MS: env.QDRANT_TIMEOUT_MS,
  });

  return {
    url: parsed.QDRANT_URL.replace(/\/$/, ''),
    ...(parsed.QDRANT_API_KEY ? { apiKey: parsed.QDRANT_API_KEY } : {}),
    collectionPrefix: parsed.QDRANT_COLLECTION_PREFIX,
    timeoutMs: parsed.QDRANT_TIMEOUT_MS,
  };
}
