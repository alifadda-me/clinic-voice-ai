import { describe, expect, it } from 'vitest';
import { QdrantSemanticSearch } from '../../src/infrastructure/vector/qdrant/qdrant-semantic-search.js';
import type {
  QdrantOperations,
  QdrantPointInput,
  QdrantScoredPoint,
} from '../../src/infrastructure/vector/qdrant/qdrant-operations.js';
import { ENTITY_ID_PAYLOAD_KEY } from '../../src/infrastructure/vector/qdrant/qdrant-ids.js';
import { SemanticSearchUnavailableError } from '../../src/ports/platform/semantic-search.js';

const config = {
  url: 'http://localhost:6333',
  collectionPrefix: 'test_',
  timeoutMs: 5_000,
};

function createFakeOps(options?: {
  failUpsertAfter?: number;
  failAliasSwap?: boolean;
}): {
  ops: QdrantOperations;
  state: {
    collections: Map<string, { size: number; points: QdrantPointInput[] }>;
    aliases: Map<string, string>;
    deleted: string[];
  };
} {
  const collections = new Map<
    string,
    { size: number; points: QdrantPointInput[] }
  >();
  const aliases = new Map<string, string>();
  const deleted: string[] = [];
  let upsertCount = 0;

  const ops: QdrantOperations = {
    async listCollectionNames() {
      return [...collections.keys()];
    },
    async listAliases() {
      return [...aliases.entries()].map(([aliasName, collectionName]) => ({
        aliasName,
        collectionName,
      }));
    },
    async getCollectionVectorSize(name) {
      const col = collections.get(name);
      if (!col) throw new Error(`missing collection ${name}`);
      return col.size;
    },
    async createCollection(name, vectorSize) {
      collections.set(name, { size: vectorSize, points: [] });
    },
    async deleteCollection(name) {
      collections.delete(name);
      deleted.push(name);
    },
    async upsertPoints(name, points) {
      for (const point of points) {
        upsertCount += 1;
        if (
          options?.failUpsertAfter !== undefined &&
          upsertCount > options.failUpsertAfter
        ) {
          throw new Error('simulated upsert failure');
        }
        const col = collections.get(name);
        if (!col) throw new Error(`missing collection ${name}`);
        col.points = col.points.filter((p) => p.id !== point.id);
        col.points.push(point);
      }
    },
    async search(name, vector, limit) {
      const col = collections.get(name);
      if (!col) return [];
      return col.points
        .map((p): QdrantScoredPoint => {
          let score = 0;
          for (let i = 0; i < vector.length; i += 1) {
            score += (vector[i] ?? 0) * (p.vector[i] ?? 0);
          }
          return { score, payload: p.payload };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },
    async updateAliases(actions) {
      if (options?.failAliasSwap) {
        throw new Error('simulated alias swap failure');
      }
      for (const action of actions) {
        if ('deleteAlias' in action) {
          aliases.delete(action.deleteAlias.aliasName);
        } else {
          aliases.set(
            action.createAlias.aliasName,
            action.createAlias.collectionName,
          );
        }
      }
    },
  };

  return { ops, state: { collections, aliases, deleted } };
}

describe('QdrantSemanticSearch (fake ops)', () => {
  it('replaceIndex swaps alias and removes stale ids from search', async () => {
    const { ops, state } = createFakeOps();
    const search = new QdrantSemanticSearch(ops, config);

    await search.replaceIndex('doctors', [
      { id: 'doc_a', text: 'a', vector: [1, 0, 0, 0] },
      { id: 'doc_b', text: 'b', vector: [0, 1, 0, 0] },
    ]);
    const firstAliasTarget = state.aliases.get('test_doctors');
    expect(firstAliasTarget).toBeTruthy();

    await search.replaceIndex('doctors', [
      { id: 'doc_a', text: 'a', vector: [1, 0, 0, 0] },
    ]);
    const hits = await search.search('doctors', { text: 'q', limit: 10 }, [
      0, 1, 0, 0,
    ]);
    expect(hits.map((h) => h.id)).not.toContain('doc_b');
    expect(state.aliases.get('test_doctors')).not.toBe(firstAliasTarget);
    expect(state.deleted).toContain(firstAliasTarget!);
  });

  it('does not report successful rebuild when upsert fails mid-write', async () => {
    const { ops, state } = createFakeOps({ failUpsertAfter: 1 });
    const search = new QdrantSemanticSearch(ops, config);

    await search.replaceIndex('doctors', [
      { id: 'doc_a', text: 'a', vector: [1, 0, 0, 0] },
    ]);
    const liveBefore = state.aliases.get('test_doctors');

    await expect(
      search.replaceIndex('doctors', [
        { id: 'doc_a', text: 'a', vector: [1, 0, 0, 0] },
        { id: 'doc_b', text: 'b', vector: [0, 1, 0, 0] },
      ]),
    ).rejects.toBeInstanceOf(SemanticSearchUnavailableError);

    expect(state.aliases.get('test_doctors')).toBe(liveBefore);
    // Temp collection from failed rebuild should be cleaned up.
    expect(
      [...state.collections.keys()].filter((n) => n !== liveBefore),
    ).toHaveLength(0);
  });

  it('does not swap alias when alias update fails after upsert', async () => {
    const { ops, state } = createFakeOps({ failAliasSwap: true });
    const search = new QdrantSemanticSearch(ops, config);

    await expect(
      search.replaceIndex('doctors', [
        { id: 'doc_a', text: 'a', vector: [1, 0, 0, 0] },
      ]),
    ).rejects.toBeInstanceOf(SemanticSearchUnavailableError);

    expect(state.aliases.size).toBe(0);
    expect(state.collections.size).toBe(0);
  });

  it('search returns entity ids from payload, never Qdrant-only fields as truth', async () => {
    const { ops } = createFakeOps();
    const search = new QdrantSemanticSearch(ops, config);
    await search.replaceIndex('doctors', [
      { id: 'doc_sara', text: 'cardiologist', vector: [1, 0, 0, 0] },
    ]);
    const hits = await search.search('doctors', { text: 'q', limit: 5 }, [
      1, 0, 0, 0,
    ]);
    expect(hits[0]?.id).toBe('doc_sara');
    expect(hits[0]).not.toHaveProperty(ENTITY_ID_PAYLOAD_KEY);
  });

  it('dimension mismatch fails loudly', async () => {
    const { ops } = createFakeOps();
    const search = new QdrantSemanticSearch(ops, config);
    await search.replaceIndex('doctors', [
      { id: 'doc_a', text: 'a', vector: [1, 0, 0, 0] },
    ]);
    await expect(
      search.search('doctors', { text: 'q', limit: 5 }, [1, 0]),
    ).rejects.toBeInstanceOf(SemanticSearchUnavailableError);
  });

  it('maps transport failures to SemanticSearchUnavailableError', async () => {
    const { ops } = createFakeOps();
    ops.listAliases = async () => {
      throw new Error('ECONNREFUSED qdrant');
    };
    const search = new QdrantSemanticSearch(ops, config);
    await expect(
      search.search('doctors', { text: 'q', limit: 5 }, [1, 0, 0, 0]),
    ).rejects.toBeInstanceOf(SemanticSearchUnavailableError);
  });
});
