import { z } from 'zod';

/**
 * Redis / WorkingMemory config — bootstrap/config boundary only.
 */

const redisEnvSchema = z.object({
  REDIS_URL: z.string().min(1).default('redis://127.0.0.1:63799'),
  WORKING_MEMORY_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  WORKING_MEMORY_KEY_PREFIX: z.string().min(1).default('clinic:wm'),
  WORKING_MEMORY_MAX_TURNS: z.coerce.number().int().positive().default(100),
});

export type RedisWorkingMemoryConfig = {
  redisUrl: string;
  ttlSeconds: number;
  keyPrefix: string;
  maxTurns: number;
};

export function loadRedisWorkingMemoryConfig(
  env: NodeJS.ProcessEnv = process.env,
): RedisWorkingMemoryConfig {
  const parsed = redisEnvSchema.parse({
    REDIS_URL: env.REDIS_URL,
    WORKING_MEMORY_TTL_SECONDS: env.WORKING_MEMORY_TTL_SECONDS,
    WORKING_MEMORY_KEY_PREFIX: env.WORKING_MEMORY_KEY_PREFIX,
    WORKING_MEMORY_MAX_TURNS: env.WORKING_MEMORY_MAX_TURNS,
  });

  return {
    redisUrl: parsed.REDIS_URL,
    ttlSeconds: parsed.WORKING_MEMORY_TTL_SECONDS,
    keyPrefix: parsed.WORKING_MEMORY_KEY_PREFIX,
    maxTurns: parsed.WORKING_MEMORY_MAX_TURNS,
  };
}
