/**
 * Ops CLI: rebuild disposable derived stores from PostgreSQL.
 *
 *   npx tsx src/bin/rebuild-derived-stores.ts search
 *   npx tsx src/bin/rebuild-derived-stores.ts graph
 *   npx tsx src/bin/rebuild-derived-stores.ts all
 *
 * Requires APP_MODE=production + DATABASE_URL + REDIS_URL + AUTH_* +
 * remote embedding credentials + Qdrant/Neo4j.
 * Search rebuild uses the real EmbeddingProvider — never deterministic.
 */

import { createProductionRuntime } from '../runtime/production-runtime.js';
import type { ChatModel } from '../ports/platform/chat-model.js';

const unusedChatModel: ChatModel = {
  async generate() {
    throw new Error('ChatModel not used by rebuild CLI');
  },
};

async function main(): Promise<void> {
  const target = process.argv[2] ?? 'all';
  if (!['search', 'graph', 'all'].includes(target)) {
    throw new Error('Usage: rebuild-derived-stores.ts <search|graph|all>');
  }

  const runtime = await createProductionRuntime({
    env: process.env,
    chatModel: unusedChatModel,
  });

  try {
    if (target === 'search' || target === 'all') {
      const doctors = await runtime.rebuildDoctorSearchIndex();
      const specialties = await runtime.rebuildSpecialtySearchIndex();
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          event: 'rebuild_search_ok',
          doctors: doctors.indexedCount,
          specialties: specialties.indexedCount,
          embeddingDimensions: runtime.embeddings.dimensions(),
          embeddingKind: runtime.embeddings.kind,
        }),
      );
    }
    if (target === 'graph' || target === 'all') {
      const graph = await runtime.rebuildPatientAffinityGraph();
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          event: 'rebuild_graph_ok',
          nodes: graph.nodeCount,
          relations: graph.relationCount,
        }),
      );
    }
  } finally {
    await runtime.close();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      event: 'rebuild_failed',
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
});
