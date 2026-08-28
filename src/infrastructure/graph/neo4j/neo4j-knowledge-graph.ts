import type {
  KnowledgeGraph,
  GraphRelation,
  GraphSnapshot,
  ConvergingPathQuery,
  GraphHit,
} from '../../../ports/platform/knowledge-graph.js';
import { KnowledgeGraphUnavailableError } from '../../../ports/platform/knowledge-graph.js';
import type { Neo4jDriverLike, Neo4jSessionLike } from './neo4j-driver-like.js';

const FORBIDDEN_GRAPH_PROP =
  /^(phone|phonenumber|fullname|subjectid|authorization|jwt|token|message|content|transcript|conversationid|demosubject)$/i;

/**
 * Neo4j KnowledgeGraph adapter — Cypher only here.
 * Nodes: (:GraphEntity {id}) with optional secondary labels via MERGE.
 * Relationships: typed edges between GraphEntity nodes.
 * No APOC — labels are sanitized and inlined into MERGE.
 */
export class Neo4jKnowledgeGraph implements KnowledgeGraph {
  constructor(
    private readonly driver: Neo4jDriverLike,
    private readonly database: string,
  ) {}

  async upsertNode(
    nodeId: string,
    labels: string[] = [],
    properties: Record<string, string> = {},
  ): Promise<void> {
    assertOpaqueProperties(properties);
    await this.withSession(async (session) => {
      const labelCypher = labelClause(['GraphEntity', ...labels]);
      await session.run(
        `MERGE (n${labelCypher} {id: $id})
         SET n += $props
         RETURN n`,
        { id: nodeId, props: { id: nodeId, ...properties } },
      );
    });
  }

  async addRelation(
    relation: Omit<GraphRelation, 'createdAt'> & { createdAt?: Date },
  ): Promise<void> {
    if (relation.metadata) assertOpaqueProperties(relation.metadata);
    const relType = sanitizeRelType(relation.relationType);
    await this.withSession(async (session) => {
      await session.run(
        `MERGE (a:GraphEntity {id: $subjectId})
         MERGE (b:GraphEntity {id: $objectId})
         MERGE (a)-[r:${relType}]->(b)
         SET r.createdAt = $createdAt
         RETURN r`,
        {
          subjectId: relation.subjectId,
          objectId: relation.objectId,
          createdAt: (relation.createdAt ?? new Date()).toISOString(),
        },
      );
    });
  }

  async listRelations(
    subjectId: string,
    relationType?: string,
  ): Promise<GraphRelation[]> {
    return this.withSession(async (session) => {
      const result = relationType
        ? await session.run(
            `MATCH (a:GraphEntity {id: $subjectId})-[r:${sanitizeRelType(relationType)}]->(b:GraphEntity)
             RETURN type(r) AS relationType, b.id AS objectId, r.createdAt AS createdAt`,
            { subjectId },
          )
        : await session.run(
            `MATCH (a:GraphEntity {id: $subjectId})-[r]->(b:GraphEntity)
             RETURN type(r) AS relationType, b.id AS objectId, r.createdAt AS createdAt`,
            { subjectId },
          );

      return result.records.map((rec) => ({
        subjectId,
        relationType: String(rec.get('relationType')),
        objectId: String(rec.get('objectId')),
        createdAt: parseDate(rec.get('createdAt')),
      }));
    });
  }

  async clearRelations(subjectId: string, relationType?: string): Promise<void> {
    await this.withSession(async (session) => {
      if (relationType) {
        await session.run(
          `MATCH (a:GraphEntity {id: $subjectId})-[r:${sanitizeRelType(relationType)}]->()
           DELETE r`,
          { subjectId },
        );
      } else {
        await session.run(
          `MATCH (a:GraphEntity {id: $subjectId})-[r]->()
           DELETE r`,
          { subjectId },
        );
      }
    });
  }

  async replaceGraph(snapshot: GraphSnapshot): Promise<void> {
    for (const node of snapshot.nodes) {
      if (node.properties) assertOpaqueProperties(node.properties);
    }
    for (const rel of snapshot.relations) {
      if (rel.metadata) assertOpaqueProperties(rel.metadata);
    }

    await this.withSession(async (session) => {
      // Full replace in one session: delete all, then write. Failure → throw
      // (caller must not treat as success). Empty snapshot = clear only.
      await session.run(`MATCH (n:GraphEntity) DETACH DELETE n`);

      for (const node of snapshot.nodes) {
        const labelCypher = labelClause([
          'GraphEntity',
          ...(node.labels ?? []),
        ]);
        const props = { id: node.id, ...(node.properties ?? {}) };
        await session.run(
          `MERGE (n${labelCypher} {id: $id})
           SET n += $props
           RETURN n`,
          { id: node.id, props },
        );
      }

      for (const relation of snapshot.relations) {
        const relType = sanitizeRelType(relation.relationType);
        await session.run(
          `MERGE (a:GraphEntity {id: $subjectId})
           MERGE (b:GraphEntity {id: $objectId})
           MERGE (a)-[r:${relType}]->(b)
           SET r.createdAt = $createdAt
           RETURN r`,
          {
            subjectId: relation.subjectId,
            objectId: relation.objectId,
            createdAt: (relation.createdAt ?? new Date()).toISOString(),
          },
        );
      }
    });
  }

  async findConvergingTargets(query: ConvergingPathQuery): Promise<GraphHit[]> {
    const outward = sanitizeRelType(query.outwardRelation);
    const inward = sanitizeRelType(query.inwardPeerRelation);
    const peerOut = sanitizeRelType(query.peerOutwardRelation);
    const excludeStart = query.excludeStartAsPeer !== false;
    const limit = query.limit ?? 10;

    return this.withSession(async (session) => {
      const result = await session.run(
        `MATCH (start:GraphEntity {id: $startId})-[:${outward}]->(mid)<-[:${inward}]-(peer)-[:${peerOut}]->(target)
         WHERE ($excludeStart = false OR peer.id <> $startId)
         RETURN target.id AS id, count(DISTINCT peer) AS score
         ORDER BY score DESC
         LIMIT $limit`,
        {
          startId: query.startId,
          excludeStart,
          limit: Math.floor(limit),
        },
      );

      return result.records.map((rec) => ({
        id: String(rec.get('id')),
        score: toNumber(rec.get('score')),
      }));
    });
  }

  async close(): Promise<void> {
    await this.driver.close();
  }

  private async withSession<T>(
    fn: (session: Neo4jSessionLike) => Promise<T>,
  ): Promise<T> {
    let session: Neo4jSessionLike | undefined;
    try {
      session = this.driver.session({ database: this.database });
      return await fn(session);
    } catch (error) {
      if (error instanceof KnowledgeGraphUnavailableError) throw error;
      throw new KnowledgeGraphUnavailableError(
        error instanceof Error ? error.message : 'Neo4j operation failed',
      );
    } finally {
      try {
        await session?.close();
      } catch {
        /* ignore */
      }
    }
  }
}

function labelClause(labels: string[]): string {
  return sanitizeLabels(labels)
    .map((l) => `:${l}`)
    .join('');
}

function sanitizeRelType(type: string): string {
  if (!/^[A-Z][A-Z0-9_]*$/.test(type)) {
    throw new KnowledgeGraphUnavailableError(
      `Invalid relation type '${type}'`,
    );
  }
  return type;
}

function sanitizeLabels(labels: string[]): string[] {
  return [...new Set(labels)].filter((l) => /^[A-Za-z][A-Za-z0-9_]*$/.test(l));
}

function assertOpaqueProperties(properties: Record<string, string>): void {
  for (const key of Object.keys(properties)) {
    if (FORBIDDEN_GRAPH_PROP.test(key)) {
      throw new KnowledgeGraphUnavailableError(
        `Forbidden graph property '${key}' — opaque ids only`,
      );
    }
  }
}

function parseDate(value: unknown): Date {
  if (typeof value === 'string') return new Date(value);
  return new Date();
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (
    value != null &&
    typeof value === 'object' &&
    'toNumber' in value &&
    typeof (value as { toNumber: () => number }).toNumber === 'function'
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value);
}
