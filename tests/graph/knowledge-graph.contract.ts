import { describe, expect, it } from 'vitest';
import type { KnowledgeGraph } from '../../src/ports/platform/knowledge-graph.js';
import { KnowledgeGraphUnavailableError } from '../../src/ports/platform/knowledge-graph.js';
import { PREFERS, VISITED } from '../../src/application/index.js';

/**
 * Behavioral contract for KnowledgeGraph adapters.
 * Asserts graph capability — not Neo4j/InMemory internals.
 */
export function defineKnowledgeGraphContract(
  name: string,
  createGraph: () => KnowledgeGraph | Promise<KnowledgeGraph>,
  options: {
    afterEach?: (graph: KnowledgeGraph) => Promise<void> | void;
  } = {},
): void {
  describe(`KnowledgeGraph contract: ${name}`, () => {
    async function withGraph(
      run: (graph: KnowledgeGraph) => Promise<void>,
    ): Promise<void> {
      const graph = await createGraph();
      try {
        await run(graph);
      } finally {
        await options.afterEach?.(graph);
      }
    }

    it('replaceGraph writes nodes/relations and supports converging query', async () => {
      await withGraph(async (graph) => {
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

        const hits = await graph.findConvergingTargets({
          startId: 'pat_a',
          outwardRelation: PREFERS,
          inwardPeerRelation: PREFERS,
          peerOutwardRelation: VISITED,
        });
        expect(hits).toEqual([{ id: 'doc_1', score: 1 }]);
      });
    });

    it('replaceGraph removes stale content absent from the new snapshot', async () => {
      await withGraph(async (graph) => {
        await graph.replaceGraph({
          nodes: [
            { id: 'pat_a' },
            { id: 'pat_b' },
            { id: 'spec_1' },
            { id: 'doc_old' },
          ],
          relations: [
            { subjectId: 'pat_a', relationType: PREFERS, objectId: 'spec_1' },
            { subjectId: 'pat_b', relationType: PREFERS, objectId: 'spec_1' },
            { subjectId: 'pat_b', relationType: VISITED, objectId: 'doc_old' },
          ],
        });

        await graph.replaceGraph({
          nodes: [
            { id: 'pat_a' },
            { id: 'pat_b' },
            { id: 'spec_1' },
            { id: 'doc_new' },
          ],
          relations: [
            { subjectId: 'pat_a', relationType: PREFERS, objectId: 'spec_1' },
            { subjectId: 'pat_b', relationType: PREFERS, objectId: 'spec_1' },
            { subjectId: 'pat_b', relationType: VISITED, objectId: 'doc_new' },
          ],
        });

        const hits = await graph.findConvergingTargets({
          startId: 'pat_a',
          outwardRelation: PREFERS,
          inwardPeerRelation: PREFERS,
          peerOutwardRelation: VISITED,
        });
        expect(hits.map((h) => h.id)).toEqual(['doc_new']);
        expect(hits.map((h) => h.id)).not.toContain('doc_old');
      });
    });

    it('empty replaceGraph clears the graph', async () => {
      await withGraph(async (graph) => {
        await graph.replaceGraph({
          nodes: [{ id: 'pat_a' }, { id: 'spec_1' }],
          relations: [
            { subjectId: 'pat_a', relationType: PREFERS, objectId: 'spec_1' },
          ],
        });
        await graph.replaceGraph({ nodes: [], relations: [] });
        const rels = await graph.listRelations('pat_a');
        expect(rels).toEqual([]);
      });
    });

    it('rejects forbidden PII/auth/chat property keys', async () => {
      await withGraph(async (graph) => {
        await expect(
          graph.upsertNode('n1', [], { phoneNumber: '+15551212' }),
        ).rejects.toBeInstanceOf(KnowledgeGraphUnavailableError);

        await expect(
          graph.replaceGraph({
            nodes: [{ id: 'n1', properties: { jwt: 'secret' } }],
            relations: [],
          }),
        ).rejects.toBeInstanceOf(KnowledgeGraphUnavailableError);
      });
    });

    it('counts distinct peers once even across multiple shared mids', async () => {
      await withGraph(async (graph) => {
        await graph.replaceGraph({
          nodes: [
            { id: 'pat_a' },
            { id: 'pat_b' },
            { id: 'spec_1' },
            { id: 'spec_2' },
            { id: 'doc_1' },
          ],
          relations: [
            { subjectId: 'pat_a', relationType: PREFERS, objectId: 'spec_1' },
            { subjectId: 'pat_a', relationType: PREFERS, objectId: 'spec_2' },
            { subjectId: 'pat_b', relationType: PREFERS, objectId: 'spec_1' },
            { subjectId: 'pat_b', relationType: PREFERS, objectId: 'spec_2' },
            { subjectId: 'pat_b', relationType: VISITED, objectId: 'doc_1' },
          ],
        });

        const hits = await graph.findConvergingTargets({
          startId: 'pat_a',
          outwardRelation: PREFERS,
          inwardPeerRelation: PREFERS,
          peerOutwardRelation: VISITED,
        });
        expect(hits).toEqual([{ id: 'doc_1', score: 1 }]);
      });
    });
  });
}
