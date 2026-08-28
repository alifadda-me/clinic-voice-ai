import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { defineWorkingMemoryContract } from '../../memory/working-memory.contract.js';
import { RedisWorkingMemory } from '../../../src/infrastructure/memory/redis/redis-working-memory.js';
import {
  WorkingMemoryCorruptedError,
  WorkingMemoryUnavailableError,
} from '../../../src/ports/platform/working-memory.js';

const REDIS_URL =
  process.env.REDIS_URL ?? 'redis://127.0.0.1:63799';

const keyPrefix = `clinic:wm:test:${randomUUID().slice(0, 8)}`;

describe('Redis WorkingMemory integration', () => {
  let redis: Redis;
  let memory: RedisWorkingMemory;

  beforeAll(async () => {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    await redis.connect();
    await redis.ping();
    memory = new RedisWorkingMemory(redis, {
      ttlSeconds: 3600,
      keyPrefix,
      maxTurns: 100,
    });
  });

  afterAll(async () => {
    const keys = await redis.keys(`${keyPrefix}:*`);
    if (keys.length > 0) await redis.del(...keys);
    await redis.quit();
  });

  defineWorkingMemoryContract(
    'RedisWorkingMemory',
    () => memory,
    {
      afterEach: async (wm) => {
        // Isolate contract cases that reuse fixed session ids
        await wm.clearSession('s1');
        await wm.clearSession('missing');
        await wm.clearSession('gone');
      },
    },
  );

  it('expires session after TTL', async () => {
    const shortLived = new RedisWorkingMemory(redis, {
      ttlSeconds: 1,
      keyPrefix: `${keyPrefix}:ttl`,
      maxTurns: 50,
    });
    const sessionId = `ttl-${randomUUID()}`;
    await shortLived.createSession(sessionId, { k: 'v' });
    await shortLived.appendTurn(sessionId, {
      role: 'user',
      content: 'temp',
      at: new Date(),
    });
    expect(await shortLived.getSession(sessionId)).not.toBeNull();

    await sleep(1500);
    expect(await shortLived.getSession(sessionId)).toBeNull();
    expect(await shortLived.getRecentTurns(sessionId, 5)).toEqual([]);
  });

  it('trims stored turns to maxTurns', async () => {
    const capped = new RedisWorkingMemory(redis, {
      ttlSeconds: 60,
      keyPrefix: `${keyPrefix}:cap`,
      maxTurns: 3,
    });
    const sessionId = `cap-${randomUUID()}`;
    await capped.createSession(sessionId);
    for (let i = 0; i < 5; i += 1) {
      await capped.appendTurn(sessionId, {
        role: 'user',
        content: `n${i}`,
        at: new Date(),
      });
    }
    const session = await capped.getSession(sessionId);
    expect(session!.turns.map((t) => t.content)).toEqual(['n2', 'n3', 'n4']);
    await capped.clearSession(sessionId);
  });

  it('throws WorkingMemoryCorruptedError for malformed turn JSON', async () => {
    const sessionId = `bad-${randomUUID()}`;
    await memory.createSession(sessionId);
    await redis.rpush(`${keyPrefix}:${sessionId}:turns`, '{not-json');
    await expect(memory.getSession(sessionId)).rejects.toBeInstanceOf(
      WorkingMemoryCorruptedError,
    );
    await expect(memory.getRecentTurns(sessionId, 5)).rejects.toBeInstanceOf(
      WorkingMemoryCorruptedError,
    );
    await memory.clearSession(sessionId);
  });

  it('throws WorkingMemoryUnavailableError when Redis is unreachable', async () => {
    const failingRedis = {
      pipeline() {
        throw new Error('connect ECONNREFUSED');
      },
      async hgetall() {
        throw new Error('connect ECONNREFUSED');
      },
      async hget() {
        throw new Error('connect ECONNREFUSED');
      },
      async lrange() {
        throw new Error('connect ECONNREFUSED');
      },
      async del() {
        throw new Error('connect ECONNREFUSED');
      },
    } as unknown as Redis;

    const wm = new RedisWorkingMemory(failingRedis, {
      ttlSeconds: 60,
      keyPrefix: `${keyPrefix}:dead`,
      maxTurns: 10,
    });

    await expect(wm.createSession('x')).rejects.toBeInstanceOf(
      WorkingMemoryUnavailableError,
    );
    await expect(wm.getSession('x')).rejects.toBeInstanceOf(
      WorkingMemoryUnavailableError,
    );
    await expect(wm.clearSession('x')).rejects.toBeInstanceOf(
      WorkingMemoryUnavailableError,
    );
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
