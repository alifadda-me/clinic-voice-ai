import { describe, expect, it } from 'vitest';
import type { SemanticSearch } from '../../src/ports/platform/semantic-search.js';
import { SemanticSearchUnavailableError } from '../../src/ports/platform/semantic-search.js';

/**
 * Behavioral contract for SemanticSearch adapters.
 * Asserts retrieval capability — not Qdrant/InMemory internals.
 */
export function defineSemanticSearchContract(
  name: string,
  createSearch: () => SemanticSearch | Promise<SemanticSearch>,
  options: {
    afterEach?: (search: SemanticSearch) => Promise<void> | void;
    vectorSize?: number;
  } = {},
): void {
  const dim = options.vectorSize ?? 4;

  function vec(seed: number): number[] {
    const v = new Array<number>(dim).fill(0);
    v[seed % dim] = 1;
    return v;
  }

  describe(`SemanticSearch contract: ${name}`, () => {
    async function withSearch(
      run: (search: SemanticSearch) => Promise<void>,
    ): Promise<void> {
      const search = await createSearch();
      try {
        await run(search);
      } finally {
        await options.afterEach?.(search);
      }
    }

    it('replaceIndex makes documents searchable by id+score only', async () => {
      await withSearch(async (search) => {
        await search.replaceIndex('contract_idx', [
          { id: 'a', text: 'alpha', vector: vec(0) },
          { id: 'b', text: 'beta', vector: vec(1) },
        ]);
        const hits = await search.search(
          'contract_idx',
          { text: 'q', limit: 10 },
          vec(0),
        );
        expect(hits.length).toBeGreaterThan(0);
        expect(hits[0]).toEqual(
          expect.objectContaining({
            id: expect.any(String),
            score: expect.any(Number),
          }),
        );
        expect(hits[0]).not.toHaveProperty('payload');
        expect(hits[0]).not.toHaveProperty('text');
        expect(hits.some((h) => h.id === 'a')).toBe(true);
      });
    });

    it('replaceIndex removes stale documents absent from the new set', async () => {
      await withSearch(async (search) => {
        await search.replaceIndex('stale_idx', [
          { id: 'keep', text: 'keep', vector: vec(0) },
          { id: 'gone', text: 'gone', vector: vec(1) },
        ]);
        await search.replaceIndex('stale_idx', [
          { id: 'keep', text: 'keep', vector: vec(0) },
          { id: 'new', text: 'new', vector: vec(2) },
        ]);
        const hits = await search.search(
          'stale_idx',
          { text: 'q', limit: 20 },
          vec(1),
        );
        const ids = hits.map((h) => h.id);
        expect(ids).not.toContain('gone');
      });
    });

    it('clearIndex leaves no searchable hits', async () => {
      await withSearch(async (search) => {
        await search.replaceIndex('clear_idx', [
          { id: 'x', text: 'x', vector: vec(0) },
        ]);
        await search.clearIndex('clear_idx');
        const hits = await search.search(
          'clear_idx',
          { text: 'q', limit: 10 },
          vec(0),
        );
        expect(hits).toEqual([]);
      });
    });

    it('dimension mismatch on search fails with SemanticSearchUnavailableError', async () => {
      await withSearch(async (search) => {
        await search.replaceIndex('dim_idx', [
          { id: 'x', text: 'x', vector: vec(0) },
        ]);
        const wrong = new Array<number>(dim + 1).fill(0);
        wrong[0] = 1;
        await expect(
          search.search('dim_idx', { text: 'q', limit: 5 }, wrong),
        ).rejects.toBeInstanceOf(SemanticSearchUnavailableError);
      });
    });
  });
}
