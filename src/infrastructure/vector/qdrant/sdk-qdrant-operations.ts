import { QdrantClient } from '@qdrant/js-client-rest';
import type { QdrantSemanticSearchConfig } from '../../../config/qdrant.js';
import type {
  QdrantOperations,
  QdrantPointInput,
  QdrantScoredPoint,
} from './qdrant-operations.js';

/**
 * SDK-backed QdrantOperations. Provider types stay inside this module.
 */
export function createSdkQdrantOperations(
  config: QdrantSemanticSearchConfig,
): QdrantOperations {
  const client = new QdrantClient({
    url: config.url,
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    timeout: config.timeoutMs,
    checkCompatibility: false,
  });

  return {
    async listCollectionNames() {
      const result = await client.getCollections();
      return result.collections.map((c) => c.name);
    },

    async listAliases() {
      const result = await client.getAliases();
      return result.aliases.map((a) => ({
        aliasName: a.alias_name,
        collectionName: a.collection_name,
      }));
    },

    async getCollectionVectorSize(collectionName) {
      const info = await client.getCollection(collectionName);
      const vectors = info.config?.params?.vectors;
      if (vectors && typeof vectors === 'object' && 'size' in vectors) {
        return Number((vectors as { size: number }).size);
      }
      throw new Error(
        `Collection '${collectionName}' has no single vector size configuration`,
      );
    },

    async createCollection(collectionName, vectorSize) {
      await client.createCollection(collectionName, {
        vectors: { size: vectorSize, distance: 'Cosine' },
      });
    },

    async deleteCollection(collectionName) {
      await client.deleteCollection(collectionName);
    },

    async upsertPoints(collectionName, points) {
      if (points.length === 0) return;
      // Batch to avoid oversized payloads.
      const batchSize = 64;
      for (let i = 0; i < points.length; i += batchSize) {
        const batch = points.slice(i, i + batchSize);
        await client.upsert(collectionName, {
          wait: true,
          points: batch.map((p) => ({
            id: p.id,
            vector: p.vector,
            payload: p.payload,
          })),
        });
      }
    },

    async search(collectionName, vector, limit) {
      const hits = await client.search(collectionName, {
        vector,
        limit,
        with_payload: true,
        with_vector: false,
      });
      return hits.map(
        (h): QdrantScoredPoint => ({
          score: h.score,
          payload: (h.payload ?? undefined) as
            | Record<string, unknown>
            | null
            | undefined,
        }),
      );
    },

    async updateAliases(actions) {
      await client.updateCollectionAliases({
        actions: actions.map((action) => {
          if ('createAlias' in action) {
            return {
              create_alias: {
                alias_name: action.createAlias.aliasName,
                collection_name: action.createAlias.collectionName,
              },
            };
          }
          return {
            delete_alias: {
              alias_name: action.deleteAlias.aliasName,
            },
          };
        }),
      });
    },
  };
}

export type { QdrantPointInput };
