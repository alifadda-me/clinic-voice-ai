/**
 * Platform knowledge graph — generic nodes/edges.
 * Disposable derived store (see DERIVED_STORES). No clinic SoT.
 *
 * Prefer opaque ids only in properties. Never phone/auth/chat content.
 */

export type GraphRelation = {
  subjectId: string;
  relationType: string;
  objectId: string;
  metadata?: Record<string, string> | undefined;
  createdAt: Date;
};

export type GraphNode = {
  id: string;
  labels?: string[] | undefined;
  /** Opaque string properties only — no PII. */
  properties?: Record<string, string> | undefined;
};

export type GraphSnapshot = {
  nodes: ReadonlyArray<GraphNode>;
  relations: ReadonlyArray<
    Omit<GraphRelation, 'createdAt'> & { createdAt?: Date }
  >;
};

export type GraphHit = {
  id: string;
  score: number;
};

/**
 * Multi-hop converging path (provider-neutral):
 *   start -[:outward]-> mid <-[:inwardPeer]- peer -[:peerOutward]-> target
 *
 * Used by peer-affinity enrichment; adapters implement without leaking Cypher.
 */
export type ConvergingPathQuery = {
  startId: string;
  outwardRelation: string;
  inwardPeerRelation: string;
  peerOutwardRelation: string;
  /** Exclude startId from peer set (default true). */
  excludeStartAsPeer?: boolean | undefined;
  limit?: number | undefined;
};

export class KnowledgeGraphUnavailableError extends Error {
  readonly code = 'KNOWLEDGE_GRAPH_UNAVAILABLE';

  constructor(message = 'Knowledge graph is temporarily unavailable') {
    super(message);
    this.name = 'KnowledgeGraphUnavailableError';
  }
}

export interface KnowledgeGraph {
  upsertNode(
    nodeId: string,
    labels?: string[],
    properties?: Record<string, string>,
  ): Promise<void>;
  addRelation(
    relation: Omit<GraphRelation, 'createdAt'> & { createdAt?: Date },
  ): Promise<void>;
  listRelations(
    subjectId: string,
    relationType?: string,
  ): Promise<GraphRelation[]>;
  clearRelations(subjectId: string, relationType?: string): Promise<void>;

  /**
   * Full rebuild: replace all graph content with the snapshot.
   * Must not report success if the write was only partial.
   * Empty snapshot clears the graph.
   */
  replaceGraph(snapshot: GraphSnapshot): Promise<void>;

  /** Multi-hop peer/convergence query — ranked target ids + scores. */
  findConvergingTargets(query: ConvergingPathQuery): Promise<GraphHit[]>;
}
