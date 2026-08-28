import { Redis } from 'ioredis';
import type { WorkingMemory } from '../../../ports/platform/working-memory.js';
import type { RedisWorkingMemoryConfig } from '../../../config/redis.js';
import { RedisWorkingMemory } from './redis-working-memory.js';

export function createRedisWorkingMemory(config: RedisWorkingMemoryConfig): {
  workingMemory: WorkingMemory;
  close: () => Promise<void>;
} {
  const redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    lazyConnect: false,
  });

  const workingMemory = new RedisWorkingMemory(redis, {
    ttlSeconds: config.ttlSeconds,
    keyPrefix: config.keyPrefix,
    maxTurns: config.maxTurns,
  });

  return {
    workingMemory,
    close: async () => {
      await redis.quit();
    },
  };
}

export { RedisWorkingMemory } from './redis-working-memory.js';
