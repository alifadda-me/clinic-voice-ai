import { Redis } from 'ioredis';
import type {
  MemoryTurn,
  SessionMemory,
  WorkingMemory,
} from '../../../ports/platform/working-memory.js';
import {
  WorkingMemoryCorruptedError,
  WorkingMemorySessionNotFoundError,
  WorkingMemoryUnavailableError,
} from '../../../ports/platform/working-memory.js';
import type { RedisWorkingMemoryConfig } from '../../../config/redis.js';

type TurnPayload = {
  role: MemoryTurn['role'];
  content: string;
  at: string;
};

/**
 * Redis adapter for WorkingMemory.
 * ioredis types never leave this module's public API surface for consumers
 * that only depend on WorkingMemory.
 */
export class RedisWorkingMemory implements WorkingMemory {
  constructor(
    private readonly redis: Redis,
    private readonly config: Omit<RedisWorkingMemoryConfig, 'redisUrl'>,
  ) {}

  async createSession(
    sessionId: string,
    metadata: Record<string, string> = {},
  ): Promise<void> {
    try {
      const metaKey = this.metaKey(sessionId);
      const turnsKey = this.turnsKey(sessionId);
      const pipeline = this.redis.pipeline();
      pipeline.del(metaKey, turnsKey);
      pipeline.hset(metaKey, {
        __exists: '1',
        ...sanitizeMetadata(metadata),
      });
      pipeline.expire(metaKey, this.config.ttlSeconds);
      await pipeline.exec();
    } catch (error) {
      throw this.wrapUnavailable(error);
    }
  }

  async getSession(sessionId: string): Promise<SessionMemory | null> {
    try {
      const metaKey = this.metaKey(sessionId);
      const rawMeta = await this.redis.hgetall(metaKey);
      if (!rawMeta || Object.keys(rawMeta).length === 0 || !rawMeta.__exists) {
        return null;
      }

      const turns = await this.loadAllTurns(sessionId);
      const metadata = { ...rawMeta };
      delete metadata.__exists;

      return {
        sessionId,
        turns,
        metadata,
      };
    } catch (error) {
      if (error instanceof WorkingMemoryCorruptedError) throw error;
      throw this.wrapUnavailable(error);
    }
  }

  async getRecentTurns(sessionId: string, limit: number): Promise<MemoryTurn[]> {
    if (limit <= 0) return [];
    try {
      const exists = await this.sessionExists(sessionId);
      if (!exists) return [];

      const raw = (await this.redis.lrange(
        this.turnsKey(sessionId),
        -limit,
        -1,
      )) as string[];
      return raw.map((item: string, index: number) =>
        this.parseTurn(sessionId, item, index),
      );
    } catch (error) {
      if (error instanceof WorkingMemoryCorruptedError) throw error;
      throw this.wrapUnavailable(error);
    }
  }

  async appendTurn(sessionId: string, turn: MemoryTurn): Promise<void> {
    try {
      const payload: TurnPayload = {
        role: turn.role,
        content: turn.content,
        at: turn.at.toISOString(),
      };

      // Atomic: session-exists check + RPUSH + LTRIM + EXPIRE (no distributed lock).
      const result = await this.redis.eval(
        APPEND_TURN_LUA,
        2,
        this.metaKey(sessionId),
        this.turnsKey(sessionId),
        JSON.stringify(payload),
        String(this.config.maxTurns),
        String(this.config.ttlSeconds),
      );

      if (result === 0) {
        throw new WorkingMemorySessionNotFoundError(sessionId);
      }
    } catch (error) {
      if (error instanceof WorkingMemorySessionNotFoundError) throw error;
      throw this.wrapUnavailable(error);
    }
  }

  async mergeMetadata(
    sessionId: string,
    metadata: Record<string, string>,
  ): Promise<void> {
    try {
      const exists = await this.sessionExists(sessionId);
      if (!exists) {
        throw new WorkingMemorySessionNotFoundError(sessionId);
      }
      const safe = sanitizeMetadata(metadata);
      if (Object.keys(safe).length === 0) return;

      const metaKey = this.metaKey(sessionId);
      const pipeline = this.redis.pipeline();
      pipeline.hset(metaKey, safe);
      pipeline.expire(metaKey, this.config.ttlSeconds);
      pipeline.expire(this.turnsKey(sessionId), this.config.ttlSeconds);
      await pipeline.exec();
    } catch (error) {
      if (error instanceof WorkingMemorySessionNotFoundError) throw error;
      throw this.wrapUnavailable(error);
    }
  }

  async clearSession(sessionId: string): Promise<void> {
    try {
      await this.redis.del(this.metaKey(sessionId), this.turnsKey(sessionId));
    } catch (error) {
      throw this.wrapUnavailable(error);
    }
  }

  private async sessionExists(sessionId: string): Promise<boolean> {
    const exists = await this.redis.hget(this.metaKey(sessionId), '__exists');
    return exists === '1';
  }

  private async loadAllTurns(sessionId: string): Promise<MemoryTurn[]> {
    const raw = (await this.redis.lrange(
      this.turnsKey(sessionId),
      0,
      -1,
    )) as string[];
    return raw.map((item: string, index: number) =>
      this.parseTurn(sessionId, item, index),
    );
  }

  private parseTurn(
    sessionId: string,
    raw: string,
    index: number,
  ): MemoryTurn {
    try {
      const parsed = JSON.parse(raw) as TurnPayload;
      if (
        !parsed ||
        typeof parsed.content !== 'string' ||
        typeof parsed.at !== 'string' ||
        (parsed.role !== 'user' &&
          parsed.role !== 'assistant' &&
          parsed.role !== 'system')
      ) {
        throw new Error('invalid turn shape');
      }
      const at = new Date(parsed.at);
      if (Number.isNaN(at.getTime())) {
        throw new Error('invalid turn timestamp');
      }
      return { role: parsed.role, content: parsed.content, at };
    } catch (error) {
      throw new WorkingMemoryCorruptedError(
        sessionId,
        `turn[${index}] ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private metaKey(sessionId: string): string {
    return `${this.config.keyPrefix}:${sessionId}:meta`;
  }

  private turnsKey(sessionId: string): string {
    return `${this.config.keyPrefix}:${sessionId}:turns`;
  }

  private wrapUnavailable(error: unknown): WorkingMemoryUnavailableError {
    const message =
      error instanceof Error ? error.message : 'Redis working memory failure';
    return new WorkingMemoryUnavailableError(message);
  }
}

/** Reserved Redis hash fields must not be writable via opaque metadata. */
function sanitizeMetadata(
  metadata: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (key === '__exists') continue;
    out[key] = value;
  }
  return out;
}

/**
 * KEYS[1]=meta KEYS[2]=turns
 * ARGV[1]=turnJson ARGV[2]=maxTurns ARGV[3]=ttlSeconds
 * Returns 1 on success, 0 if session missing/expired.
 */
const APPEND_TURN_LUA = `
local exists = redis.call('HGET', KEYS[1], '__exists')
if exists ~= '1' then
  return 0
end
redis.call('RPUSH', KEYS[2], ARGV[1])
redis.call('LTRIM', KEYS[2], -tonumber(ARGV[2]), -1)
redis.call('EXPIRE', KEYS[2], tonumber(ARGV[3]))
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
return 1
`;
