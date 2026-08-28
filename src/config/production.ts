import { z } from 'zod';
import { loadJwtBearerAuthConfig } from './auth.js';
import { loadPostgresConfig } from './postgres.js';
import { loadRedisWorkingMemoryConfig } from './redis.js';
import { loadQdrantSemanticSearchConfig } from './qdrant.js';
import { loadNeo4jKnowledgeGraphConfig } from './neo4j.js';
import { loadOpikObservabilityConfig } from './opik.js';
import { loadEmbeddingProviderConfig } from './embeddings.js';
import type { JwtBearerAuthConfig } from './auth.js';
import type { PostgresConfig } from './postgres.js';
import type { RedisWorkingMemoryConfig } from './redis.js';
import type { QdrantSemanticSearchConfig } from './qdrant.js';
import type { Neo4jKnowledgeGraphConfig } from './neo4j.js';
import type { OpikObservabilityConfig } from './opik.js';
import type { EmbeddingProviderConfig } from './embeddings.js';

const productionGateSchema = z.object({
  /** Must be "production" for createProductionRuntime. */
  APP_MODE: z.literal('production'),
  PORT: z.coerce.number().int().positive().default(3000),
  /**
   * When true, Twilio webhook routes mount (requires TWILIO_*).
   * Default false — voice/Twilio optional at process level.
   */
  ENABLE_TWILIO: z
    .enum(['true', 'false', '1', '0', ''])
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  /**
   * When true, voice stack is composed (requires injectable or Gemini voice).
   */
  ENABLE_VOICE: z
    .enum(['true', 'false', '1', '0', ''])
    .optional()
    .transform((v) => v === 'true' || v === '1'),
});

export type ProductionConfig = {
  appMode: 'production';
  port: number;
  enableTwilio: boolean;
  enableVoice: boolean;
  postgres: PostgresConfig;
  redis: RedisWorkingMemoryConfig;
  auth: JwtBearerAuthConfig;
  embeddings: EmbeddingProviderConfig;
  qdrant: QdrantSemanticSearchConfig;
  neo4j: Neo4jKnowledgeGraphConfig;
  opik: OpikObservabilityConfig;
};

/**
 * Aggregated production config — fails closed if required env is missing/invalid.
 * Composition only. Domain/application never import this.
 *
 * Required: APP_MODE=production, DATABASE_URL, REDIS_URL, AUTH_*, embedding credentials.
 * Refuses DEMO_AUTH and EMBEDDING_MODE=deterministic.
 * Opik remains optional (fail-open when unset).
 */
export function loadProductionConfig(
  env: NodeJS.ProcessEnv = process.env,
): ProductionConfig {
  if (env.APP_MODE === 'demo' || env.DEMO_AUTH === 'true') {
    throw new Error(
      'Production config refused: APP_MODE=demo / DEMO_AUTH is set. Use createDemo* stacks.',
    );
  }

  if (env.EMBEDDING_MODE === 'deterministic') {
    throw new Error(
      'Production config refused: EMBEDDING_MODE=deterministic. Use remote embeddings with EMBEDDING_API_KEY / OPENROUTER_API_KEY.',
    );
  }

  const gate = productionGateSchema.parse({
    APP_MODE: env.APP_MODE,
    PORT: env.PORT,
    ENABLE_TWILIO: env.ENABLE_TWILIO,
    ENABLE_VOICE: env.ENABLE_VOICE,
  });

  // Production Redis must be explicit — do not silently default for SoT-adjacent ops.
  if (!env.REDIS_URL?.trim()) {
    throw new Error('REDIS_URL is required for production');
  }

  return {
    appMode: 'production',
    port: gate.PORT,
    enableTwilio: gate.ENABLE_TWILIO ?? false,
    enableVoice: gate.ENABLE_VOICE ?? false,
    postgres: loadPostgresConfig(env),
    redis: loadRedisWorkingMemoryConfig(env),
    auth: loadJwtBearerAuthConfig(env),
    embeddings: loadEmbeddingProviderConfig(env),
    qdrant: loadQdrantSemanticSearchConfig(env),
    neo4j: loadNeo4jKnowledgeGraphConfig(env),
    opik: loadOpikObservabilityConfig(env),
  };
}
