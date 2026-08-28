import type {
  SearchIndexId,
  SemanticDocument,
  SemanticQuery,
  SemanticSearch,
  SemanticSearchHit,
} from '../../../ports/platform/semantic-search.js';
import { SemanticSearchUnavailableError } from '../../../ports/platform/semantic-search.js';
import type { QdrantSemanticSearchConfig } from '../../../config/qdrant.js';
import {
  ENTITY_ID_PAYLOAD_KEY,
  TEXT_PAYLOAD_KEY,
  aliasNameForIndex,
  entityIdToPointUuid,
  physicalCollectionName,
} from './qdrant-ids.js';
import type { QdrantOperations, QdrantPointInput } from './qdrant-operations.js';

/**
 * Qdrant adapter for SemanticSearch.
 *
 * replaceIndex consistency (NOT in-place atomic point rewrite):
 *   1. Create a new physical collection
 *   2. Upsert the full document set (failure → delete temp, live alias unchanged)
 *   3. Atomically swap the live alias to the new collection
 *   4. Delete the previous physical collection
 *
 * Search never returns Qdrant payloads as clinic truth — only { id, score }
 * where id is the clinic entity id stored at index time.
 */
export class QdrantSemanticSearch implements SemanticSearch {
  constructor(
    private readonly ops: QdrantOperations,
    private readonly config: QdrantSemanticSearchConfig,
  ) {}

  async index(
    indexId: SearchIndexId,
    documents: ReadonlyArray<SemanticDocument>,
  ): Promise<void> {
    try {
      if (documents.length === 0) return;
      const vectorSize = requireUniformVectorSize(documents);
      const alias = this.alias(indexId);
      const target = await this.resolveWritableCollection(alias, vectorSize);
      await this.ops.upsertPoints(target, documents.map(toPoint));
    } catch (error) {
      throw mapUnavailable(error);
    }
  }

  async replaceIndex(
    indexId: SearchIndexId,
    documents: ReadonlyArray<SemanticDocument>,
  ): Promise<void> {
    const alias = this.alias(indexId);
    let tempCollection: string | undefined;

    try {
      const previous = await this.findAliasTarget(alias);
      if (documents.length === 0 && !previous) {
        // Nothing searchable and nothing to clear.
        return;
      }

      const vectorSize =
        documents.length > 0
          ? requireUniformVectorSize(documents)
          : await this.ops.getCollectionVectorSize(previous!);

      tempCollection = physicalCollectionName(alias);
      await this.ops.createCollection(tempCollection, vectorSize);

      if (documents.length > 0) {
        await this.ops.upsertPoints(tempCollection, documents.map(toPoint));
      }

      const actions: Parameters<QdrantOperations['updateAliases']>[0] = [];
      if (previous) {
        actions.push({ deleteAlias: { aliasName: alias } });
      }
      actions.push({
        createAlias: { aliasName: alias, collectionName: tempCollection },
      });
      await this.ops.updateAliases(actions);

      // Commit succeeded — temp is now live; do not delete it on later errors.
      const committed = tempCollection;
      tempCollection = undefined;

      if (previous && previous !== committed) {
        try {
          await this.ops.deleteCollection(previous);
        } catch {
          // Rebuild already committed; orphan cleanup is best-effort.
        }
      }
    } catch (error) {
      if (tempCollection) {
        try {
          await this.ops.deleteCollection(tempCollection);
        } catch {
          // Swallow cleanup failure; surface the original rebuild error.
        }
      }
      throw mapUnavailable(error);
    }
  }

  async clearIndex(indexId: SearchIndexId): Promise<void> {
    await this.replaceIndex(indexId, []);
  }

  async search(
    indexId: SearchIndexId,
    query: SemanticQuery,
    vector?: number[],
  ): Promise<SemanticSearchHit[]> {
    try {
      if (!vector || vector.length === 0) {
        throw new SemanticSearchUnavailableError(
          'Semantic search requires a query vector from EmbeddingProvider',
        );
      }

      const alias = this.alias(indexId);
      const target = await this.findAliasTarget(alias);
      if (!target) {
        return [];
      }

      const size = await this.ops.getCollectionVectorSize(target);
      if (vector.length !== size) {
        throw new SemanticSearchUnavailableError(
          `Query vector dimension ${vector.length} does not match index dimension ${size}`,
        );
      }

      const limit = query.limit ?? 10;
      const scored = await this.ops.search(target, vector, limit);
      const hits: SemanticSearchHit[] = [];
      for (const point of scored) {
        const entityId = point.payload?.[ENTITY_ID_PAYLOAD_KEY];
        if (typeof entityId !== 'string' || !entityId.trim()) continue;
        hits.push({ id: entityId, score: point.score });
      }
      return hits;
    } catch (error) {
      if (error instanceof SemanticSearchUnavailableError) throw error;
      throw mapUnavailable(error);
    }
  }

  /**
   * Fail closed when an existing live index has a different vector size than
   * the configured EmbeddingProvider. Missing indexes are OK (rebuild creates them).
   */
  async assertCompatibleDimensions(
    expectedDimensions: number,
    indexIds: ReadonlyArray<SearchIndexId>,
  ): Promise<void> {
    try {
      for (const indexId of indexIds) {
        const alias = this.alias(indexId);
        const target = await this.findAliasTarget(alias);
        if (!target) continue;
        const size = await this.ops.getCollectionVectorSize(target);
        if (size !== expectedDimensions) {
          throw new SemanticSearchUnavailableError(
            `Qdrant index '${indexId}' has dimension ${size}, embeddings expect ${expectedDimensions}. Rebuild search indexes after changing EMBEDDING_DIMENSIONS.`,
          );
        }
      }
    } catch (error) {
      if (error instanceof SemanticSearchUnavailableError) throw error;
      throw mapUnavailable(error);
    }
  }

  private alias(indexId: SearchIndexId): string {
    return aliasNameForIndex(this.config.collectionPrefix, indexId);
  }

  private async findAliasTarget(alias: string): Promise<string | null> {
    const aliases = await this.ops.listAliases();
    return aliases.find((a) => a.aliasName === alias)?.collectionName ?? null;
  }

  private async resolveWritableCollection(
    alias: string,
    vectorSize: number,
  ): Promise<string> {
    const existing = await this.findAliasTarget(alias);
    if (existing) {
      const size = await this.ops.getCollectionVectorSize(existing);
      if (size !== vectorSize) {
        throw new SemanticSearchUnavailableError(
          `Index dimension mismatch: collection has ${size}, documents have ${vectorSize}. Rebuild with replaceIndex.`,
        );
      }
      return existing;
    }

    const physical = physicalCollectionName(alias);
    await this.ops.createCollection(physical, vectorSize);
    await this.ops.updateAliases([
      { createAlias: { aliasName: alias, collectionName: physical } },
    ]);
    return physical;
  }
}

function toPoint(doc: SemanticDocument): QdrantPointInput {
  if (!doc.vector || doc.vector.length === 0) {
    throw new SemanticSearchUnavailableError(
      'Semantic documents require vectors from EmbeddingProvider before indexing',
    );
  }
  return {
    id: entityIdToPointUuid(doc.id),
    vector: doc.vector,
    payload: {
      [ENTITY_ID_PAYLOAD_KEY]: doc.id,
      ...(doc.text ? { [TEXT_PAYLOAD_KEY]: doc.text } : {}),
    },
  };
}

function requireUniformVectorSize(
  documents: ReadonlyArray<SemanticDocument>,
): number {
  const sizes = new Set(
    documents.map((d) => {
      if (!d.vector || d.vector.length === 0) {
        throw new SemanticSearchUnavailableError(
          'Semantic documents require vectors from EmbeddingProvider before indexing',
        );
      }
      return d.vector.length;
    }),
  );
  if (sizes.size !== 1) {
    throw new SemanticSearchUnavailableError(
      'All documents in a replaceIndex/index batch must share the same vector dimension',
    );
  }
  return [...sizes][0]!;
}

function mapUnavailable(error: unknown): SemanticSearchUnavailableError {
  if (error instanceof SemanticSearchUnavailableError) return error;
  const message =
    error instanceof Error ? error.message : 'Qdrant request failed';
  return new SemanticSearchUnavailableError(message);
}
