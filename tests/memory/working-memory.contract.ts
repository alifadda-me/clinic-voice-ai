import { describe, expect, it } from 'vitest';
import type { WorkingMemory } from '../../src/ports/platform/working-memory.js';
import {
  WorkingMemorySessionNotFoundError,
} from '../../src/ports/platform/working-memory.js';

/**
 * Behavioral contract for WorkingMemory adapters.
 * Asserts session capability — not Redis commands or serialization details.
 */
export function defineWorkingMemoryContract(
  name: string,
  createMemory: () => WorkingMemory | Promise<WorkingMemory>,
  options: {
    afterEach?: (memory: WorkingMemory) => Promise<void> | void;
  } = {},
): void {
  describe(`WorkingMemory contract: ${name}`, () => {
    async function withMemory(
      run: (memory: WorkingMemory) => Promise<void>,
    ): Promise<void> {
      const memory = await createMemory();
      try {
        await run(memory);
      } finally {
        await options.afterEach?.(memory);
      }
    }

    it('creates a session and returns empty turns', async () => {
      await withMemory(async (memory) => {
        await memory.createSession('s1', { channel: 'voice' });
        const session = await memory.getSession('s1');
        expect(session).not.toBeNull();
        expect(session!.sessionId).toBe('s1');
        expect(session!.turns).toEqual([]);
        expect(session!.metadata).toEqual({ channel: 'voice' });
      });
    });

    it('returns null for unknown sessions', async () => {
      await withMemory(async (memory) => {
        expect(await memory.getSession('missing')).toBeNull();
        expect(await memory.getRecentTurns('missing', 5)).toEqual([]);
      });
    });

    it('appends turns and preserves chronological order', async () => {
      await withMemory(async (memory) => {
        await memory.createSession('s1');
        const t0 = new Date('2026-08-24T10:00:00.000Z');
        const t1 = new Date('2026-08-24T10:00:01.000Z');
        const t2 = new Date('2026-08-24T10:00:02.000Z');

        await memory.appendTurn('s1', {
          role: 'user',
          content: 'hello',
          at: t0,
        });
        await memory.appendTurn('s1', {
          role: 'assistant',
          content: 'hi',
          at: t1,
        });
        await memory.appendTurn('s1', {
          role: 'user',
          content: 'book',
          at: t2,
        });

        const session = await memory.getSession('s1');
        expect(session!.turns.map((t) => t.content)).toEqual([
          'hello',
          'hi',
          'book',
        ]);
        expect(session!.turns.map((t) => t.role)).toEqual([
          'user',
          'assistant',
          'user',
        ]);
        expect(session!.turns[0]!.at.toISOString()).toBe(t0.toISOString());
      });
    });

    it('limits recent turns to the newest N in order', async () => {
      await withMemory(async (memory) => {
        await memory.createSession('s1');
        for (let i = 0; i < 5; i += 1) {
          await memory.appendTurn('s1', {
            role: 'user',
            content: `m${i}`,
            at: new Date(`2026-08-24T10:00:0${i}.000Z`),
          });
        }
        const recent = await memory.getRecentTurns('s1', 2);
        expect(recent.map((t) => t.content)).toEqual(['m3', 'm4']);
        expect(await memory.getRecentTurns('s1', 0)).toEqual([]);
      });
    });

    it('rejects append/merge on missing sessions', async () => {
      await withMemory(async (memory) => {
        await expect(
          memory.appendTurn('gone', {
            role: 'user',
            content: 'x',
            at: new Date(),
          }),
        ).rejects.toBeInstanceOf(WorkingMemorySessionNotFoundError);

        await expect(
          memory.mergeMetadata('gone', { a: '1' }),
        ).rejects.toBeInstanceOf(WorkingMemorySessionNotFoundError);
      });
    });

    it('merges metadata without dropping existing keys', async () => {
      await withMemory(async (memory) => {
        await memory.createSession('s1', { a: '1' });
        await memory.mergeMetadata('s1', { b: '2' });
        await memory.mergeMetadata('s1', { a: '3' });
        const session = await memory.getSession('s1');
        expect(session!.metadata).toEqual({ a: '3', b: '2' });
      });
    });

    it('clears a session', async () => {
      await withMemory(async (memory) => {
        await memory.createSession('s1');
        await memory.appendTurn('s1', {
          role: 'user',
          content: 'bye',
          at: new Date(),
        });
        await memory.clearSession('s1');
        expect(await memory.getSession('s1')).toBeNull();
        expect(await memory.getRecentTurns('s1', 10)).toEqual([]);
      });
    });

    it('does not drop concurrent appends', async () => {
      await withMemory(async (memory) => {
        await memory.createSession('s1');
        const count = 20;
        await Promise.all(
          Array.from({ length: count }, (_, i) =>
            memory.appendTurn('s1', {
              role: 'user',
              content: `c${i}`,
              at: new Date(Date.UTC(2026, 7, 24, 10, 0, i)),
            }),
          ),
        );
        const session = await memory.getSession('s1');
        expect(session!.turns).toHaveLength(count);
        const contents = new Set(session!.turns.map((t) => t.content));
        expect(contents.size).toBe(count);
      });
    });
  });
}
