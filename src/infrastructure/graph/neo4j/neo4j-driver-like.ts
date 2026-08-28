/**
 * Injectable Neo4j session surface for the KnowledgeGraph adapter.
 * Real neo4j-driver or fakes implement this — keeps unit tests offline.
 */

export type Neo4jQueryResult = {
  records: Array<{ get(key: string): unknown }>;
};

export type Neo4jSessionLike = {
  run(
    cypher: string,
    params?: Record<string, unknown>,
  ): Promise<Neo4jQueryResult>;
  close(): Promise<void>;
};

export type Neo4jDriverLike = {
  session(options?: { database?: string }): Neo4jSessionLike;
  close(): Promise<void>;
};
