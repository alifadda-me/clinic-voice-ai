/**
 * Narrow Qdrant operations used by QdrantSemanticSearch.
 * Keeps the adapter testable without mocking the full SDK surface.
 * Implementations live only under infrastructure/vector/qdrant.
 */

export type QdrantCollectionInfo = {
  name: string;
  vectorSize: number;
};

export type QdrantScoredPoint = {
  score: number;
  payload?: Record<string, unknown> | null | undefined;
};

export type QdrantPointInput = {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
};

export interface QdrantOperations {
  listCollectionNames(): Promise<string[]>;
  listAliases(): Promise<Array<{ aliasName: string; collectionName: string }>>;
  getCollectionVectorSize(collectionName: string): Promise<number>;
  createCollection(collectionName: string, vectorSize: number): Promise<void>;
  deleteCollection(collectionName: string): Promise<void>;
  upsertPoints(collectionName: string, points: QdrantPointInput[]): Promise<void>;
  search(
    collectionName: string,
    vector: number[],
    limit: number,
  ): Promise<QdrantScoredPoint[]>;
  /**
   * Apply alias changes atomically (Qdrant ChangeAliasesOperation).
   * Used to swap the live alias to a newly built physical collection.
   */
  updateAliases(
    actions: Array<
      | { createAlias: { aliasName: string; collectionName: string } }
      | { deleteAlias: { aliasName: string } }
    >,
  ): Promise<void>;
}
