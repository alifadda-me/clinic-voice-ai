import { describe, expect, it } from 'vitest';
import { InMemoryKnowledgeGraph } from '../../src/infrastructure/memory/index.js';
import { KnowledgeGraphUnavailableError } from '../../src/ports/platform/knowledge-graph.js';
import { defineKnowledgeGraphContract } from './knowledge-graph.contract.js';

describe('InMemoryKnowledgeGraph', () => {
  defineKnowledgeGraphContract('InMemoryKnowledgeGraph', () => {
    return new InMemoryKnowledgeGraph();
  });

  it('surfaces KnowledgeGraphUnavailableError when marked unavailable', async () => {
    const graph = new InMemoryKnowledgeGraph();
    graph.setUnavailable(true);
    await expect(graph.listRelations('x')).rejects.toBeInstanceOf(
      KnowledgeGraphUnavailableError,
    );
    await expect(
      graph.findConvergingTargets({
        startId: 'x',
        outwardRelation: 'PREFERS',
        inwardPeerRelation: 'PREFERS',
        peerOutwardRelation: 'VISITED',
      }),
    ).rejects.toBeInstanceOf(KnowledgeGraphUnavailableError);
  });
});
