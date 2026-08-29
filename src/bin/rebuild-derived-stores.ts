/**
 * Ops CLI: rebuild disposable derived stores from PostgreSQL.
 *
 *   npx tsx src/bin/rebuild-derived-stores.ts search
 *   npx tsx src/bin/rebuild-derived-stores.ts graph
 *   npx tsx src/bin/rebuild-derived-stores.ts all
 *
 * Requires APP_MODE=production + DATABASE_URL + REDIS_URL + AUTH_* +
 * Search rebuild uses the real EmbeddingProvider — never deterministic.
 * Graph rebuild (Neo4j) is optional for `all` — failures log rebuild_graph_failed
 * unless REBUILD_REQUIRE_GRAPH=true.
 */

import { loadEnvFile } from './load-env-file.js';
import { createProductionRuntime } from '../runtime/production-runtime.js';
import type { ChatModel } from '../ports/platform/chat-model.js';

const unusedChatModel: ChatModel = {
  async generate() {
    throw new Error('ChatModel not used by rebuild CLI');
  },
};

async function main(): Promise<void> {
  loadEnvFile();
  const target = process.argv[2] ?? 'all';
  if (!['search', 'graph', 'all'].includes(target)) {
    throw new Error('Usage: rebuild-derived-stores.ts <search|graph|all>');
  }

  const runtime = await createProductionRuntime({
    env: process.env,
    chatModel: unusedChatModel,
  });

  try {
    let searchOk = false;
    let graphOk = false;
    let graphError: string | undefined;

    if (target === 'search' || target === 'all') {
      const doctors = await runtime.rebuildDoctorSearchIndex();
      const specialties = await runtime.rebuildSpecialtySearchIndex();
      searchOk = true;
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
      try {
        const graph = await runtime.rebuildPatientAffinityGraph();
        graphOk = true;
        // eslint-disable-next-line no-console
        console.log(
          JSON.stringify({
            event: 'rebuild_graph_ok',
            nodes: graph.nodeCount,
            relations: graph.relationCount,
          }),
        );
      } catch (error) {
        graphError =
          error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.warn(
          JSON.stringify({
            event: 'rebuild_graph_failed',
            message: graphError,
            hint:
              'Doctor search still works via Qdrant. Fix NEO4J_URI (bolt://), NEO4J_USER, NEO4J_PASSWORD on Railway, then run npm run rebuild:graph',
          }),
        );
        if (target === 'graph' || process.env.REBUILD_REQUIRE_GRAPH === 'true') {
          throw error;
        }
      }
    }

    if (target === 'all' && searchOk && !graphOk && graphError) {
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          event: 'rebuild_partial_ok',
          search: true,
          graph: false,
          note: 'Search index ready; graph skipped due to Neo4j error.',
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
