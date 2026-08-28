import { describe, expect, it } from 'vitest';
import { Neo4jKnowledgeGraph } from '../../src/infrastructure/graph/neo4j/neo4j-knowledge-graph.js';
import type {
  Neo4jDriverLike,
  Neo4jQueryResult,
  Neo4jSessionLike,
} from '../../src/infrastructure/graph/neo4j/neo4j-driver-like.js';
import { KnowledgeGraphUnavailableError } from '../../src/ports/platform/knowledge-graph.js';
import { PREFERS, VISITED } from '../../src/application/index.js';

function createFakeDriver(options?: {
  failOnRun?: boolean;
  failMessage?: string;
}): {
  driver: Neo4jDriverLike;
  cypher: string[];
} {
  const cypher: string[] = [];
  const nodes = new Map<string, Set<string>>();
  const relations: Array<{
    subjectId: string;
    type: string;
    objectId: string;
  }> = [];

  const session: Neo4jSessionLike = {
    async run(query, params = {}) {
      if (options?.failOnRun) {
        throw new Error(options.failMessage ?? 'bolt failure');
      }
      cypher.push(query);

      if (query.includes('DETACH DELETE')) {
        nodes.clear();
        relations.length = 0;
        return { records: [] };
      }

      if (query.includes('MERGE (n') && query.includes('SET n += $props')) {
        const id = String(params.id);
        const labels = new Set<string>(['GraphEntity']);
        nodes.set(id, labels);
        return { records: [] };
      }

      if (query.includes('MERGE (a)-[r:') && query.includes(']->(b)')) {
        relations.push({
          subjectId: String(params.subjectId),
          type: query.includes(`:${PREFERS}`)
            ? PREFERS
            : query.includes(`:${VISITED}`)
              ? VISITED
              : 'UNKNOWN',
          objectId: String(params.objectId),
        });
        nodes.set(String(params.subjectId), new Set(['GraphEntity']));
        nodes.set(String(params.objectId), new Set(['GraphEntity']));
        return { records: [] };
      }

      if (query.includes('count(DISTINCT peer)')) {
        const startId = String(params.startId);
        const excludeStart = params.excludeStart !== false;
        const limit = Number(params.limit ?? 10);

        const mids = relations
          .filter((r) => r.subjectId === startId && r.type === PREFERS)
          .map((r) => r.objectId);
        const peersByTarget = new Map<string, Set<string>>();
        for (const mid of mids) {
          const peers = relations
            .filter(
              (r) =>
                r.objectId === mid &&
                r.type === PREFERS &&
                (!excludeStart || r.subjectId !== startId),
            )
            .map((r) => r.subjectId);
          for (const peer of peers) {
            for (const t of relations.filter(
              (r) => r.subjectId === peer && r.type === VISITED,
            )) {
              let set = peersByTarget.get(t.objectId);
              if (!set) {
                set = new Set();
                peersByTarget.set(t.objectId, set);
              }
              set.add(peer);
            }
          }
        }
        const records = [...peersByTarget.entries()]
          .map(([id, peers]) => ({
            get(key: string) {
              if (key === 'id') return id;
              if (key === 'score') return peers.size;
              return undefined;
            },
          }))
          .sort(
            (a, b) => Number(b.get('score')) - Number(a.get('score')),
          )
          .slice(0, limit);
        return { records } satisfies Neo4jQueryResult;
      }

      if (query.includes('RETURN type(r)')) {
        const subjectId = String(params.subjectId);
        const records = relations
          .filter((r) => r.subjectId === subjectId)
          .map((r) => ({
            get(key: string) {
              if (key === 'relationType') return r.type;
              if (key === 'objectId') return r.objectId;
              if (key === 'createdAt') return new Date().toISOString();
              return undefined;
            },
          }));
        return { records };
      }

      return { records: [] };
    },
    async close() {},
  };

  return {
    cypher,
    driver: {
      session() {
        return session;
      },
      async close() {},
    },
  };
}

describe('Neo4jKnowledgeGraph (fake driver)', () => {
  it('maps driver failures to KnowledgeGraphUnavailableError', async () => {
    const { driver } = createFakeDriver({
      failOnRun: true,
      failMessage: 'connection refused',
    });
    const graph = new Neo4jKnowledgeGraph(driver, 'neo4j');
    await expect(
      graph.replaceGraph({ nodes: [], relations: [] }),
    ).rejects.toBeInstanceOf(KnowledgeGraphUnavailableError);
  });

  it('upsertNode uses MERGE labels without APOC', async () => {
    const { driver, cypher } = createFakeDriver();
    const graph = new Neo4jKnowledgeGraph(driver, 'neo4j');
    await graph.upsertNode('pat_1', ['Patient'], {});
    expect(cypher.some((q) => q.includes('apoc'))).toBe(false);
    expect(cypher[0]).toMatch(/MERGE \(n:GraphEntity:Patient \{id: \$id\}\)/);
  });

  it('replaceGraph + findConvergingTargets via Cypher path', async () => {
    const { driver, cypher } = createFakeDriver();
    const graph = new Neo4jKnowledgeGraph(driver, 'neo4j');
    await graph.replaceGraph({
      nodes: [
        { id: 'pat_a', labels: ['Patient'] },
        { id: 'pat_b', labels: ['Patient'] },
        { id: 'spec_1', labels: ['Specialty'] },
        { id: 'doc_1', labels: ['Doctor'] },
      ],
      relations: [
        { subjectId: 'pat_a', relationType: PREFERS, objectId: 'spec_1' },
        { subjectId: 'pat_b', relationType: PREFERS, objectId: 'spec_1' },
        { subjectId: 'pat_b', relationType: VISITED, objectId: 'doc_1' },
      ],
    });
    expect(cypher.some((q) => q.includes('DETACH DELETE'))).toBe(true);
    expect(cypher.some((q) => q.includes('apoc'))).toBe(false);

    const hits = await graph.findConvergingTargets({
      startId: 'pat_a',
      outwardRelation: PREFERS,
      inwardPeerRelation: PREFERS,
      peerOutwardRelation: VISITED,
    });
    expect(hits).toEqual([{ id: 'doc_1', score: 1 }]);
  });

  it('rejects forbidden properties before Cypher', async () => {
    const { driver, cypher } = createFakeDriver();
    const graph = new Neo4jKnowledgeGraph(driver, 'neo4j');
    await expect(
      graph.upsertNode('x', [], { phone: '+1' }),
    ).rejects.toBeInstanceOf(KnowledgeGraphUnavailableError);
    expect(cypher).toHaveLength(0);
  });
});
