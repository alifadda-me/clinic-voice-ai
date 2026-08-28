/**
 * Platform semantic retrieval — text + optional vector only.
 *
 * Disposable derived index (see architecture/DERIVED_STORES.md.ts).
 * No provider query DSL. Application owns eligibility after hydrate.
 *
 * Capabilities:
 *   - replaceIndex / index / clearIndex — manage derived documents
 *   - search — ranked candidate ids + scores only
 *
 * Adapters may store opaque payloads internally; search hits never expose them.
 */

export type SearchIndexId = string;

export type SemanticQuery = {
  text: string;
  limit?: number | undefined;
};

export type SemanticDocument = {
  id: string;
  text: string;
  /** Opaque provider storage only — not part of search hit contract. */
  payload?: Record<string, unknown> | undefined;
  vector?: number[] | undefined;
};

export type SemanticSearchHit = {
  id: string;
  score: number;
};

export class SemanticSearchUnavailableError extends Error {
  readonly code = 'SEMANTIC_SEARCH_UNAVAILABLE';

  constructor(message = 'Semantic search is temporarily unavailable') {
    super(message);
    this.name = 'SemanticSearchUnavailableError';
  }
}

export class EmbeddingUnavailableError extends Error {
  readonly code = 'EMBEDDING_UNAVAILABLE';

  constructor(message = 'Embedding provider is temporarily unavailable') {
    super(message);
    this.name = 'EmbeddingUnavailableError';
  }
}

export interface SemanticSearch {
  /**
   * Upsert documents by id within an index.
   * Does not remove documents absent from this batch.
   */
  index(
    indexId: SearchIndexId,
    documents: ReadonlyArray<SemanticDocument>,
  ): Promise<void>;

  /**
   * Rebuild / full-replace for an index with explicit consistency semantics.
   *
   * This is a rebuild operation — NOT necessarily an atomic in-place point swap.
   * Implementations must:
   *   - not report success if only part of the new document set was written
   *   - leave readers on the previous committed index until rebuild commits
   *   - remove stale documents that are absent from the new set (after commit)
   *
   * Empty array clears searchable content for that index.
   */
  replaceIndex(
    indexId: SearchIndexId,
    documents: ReadonlyArray<SemanticDocument>,
  ): Promise<void>;

  /** Remove all documents for an index. Does not affect clinic SoT. */
  clearIndex(indexId: SearchIndexId): Promise<void>;

  search(
    indexId: SearchIndexId,
    query: SemanticQuery,
    vector?: number[],
  ): Promise<SemanticSearchHit[]>;
}
