import type {
  KnowledgeGraph,
  GraphRelation,
  GraphSnapshot,
  ConvergingPathQuery,
  GraphHit,
} from '../../../ports/platform/knowledge-graph.js';
import { KnowledgeGraphUnavailableError } from '../../../ports/platform/knowledge-graph.js';
import type {
  MemoryTurn,
  SessionMemory,
  WorkingMemory,
} from '../../../ports/platform/working-memory.js';
import { WorkingMemorySessionNotFoundError } from '../../../ports/platform/working-memory.js';
import type {
  ObservabilityPort,
  ObservabilitySpan,
  ObservationScore,
  TraceAttributes,
} from '../../../ports/platform/observability.js';
import type { EmbeddingProvider } from '../../../ports/platform/embedding-provider.js';
import type {
  SemanticSearch,
  SemanticQuery,
  SemanticSearchHit,
  SearchIndexId,
} from '../../../ports/platform/semantic-search.js';
import { SemanticSearchUnavailableError } from '../../../ports/platform/semantic-search.js';
import { EmbeddingUnavailableError } from '../../../ports/platform/semantic-search.js';
import type {
  ChatModel,
  ChatRequest,
  ChatResponse,
} from '../../../ports/platform/chat-model.js';

export class InMemoryWorkingMemory implements WorkingMemory {
  private readonly sessions = new Map<string, SessionMemory>();

  async createSession(
    sessionId: string,
    metadata: Record<string, string> = {},
  ): Promise<void> {
    this.sessions.set(sessionId, {
      sessionId,
      turns: [],
      metadata: { ...metadata },
    });
  }

  async getSession(sessionId: string): Promise<SessionMemory | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return {
      sessionId: session.sessionId,
      turns: [...session.turns],
      metadata: { ...session.metadata },
    };
  }

  async getRecentTurns(sessionId: string, limit: number): Promise<MemoryTurn[]> {
    if (limit <= 0) return [];
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return session.turns.slice(-limit).map((t) => ({ ...t, at: new Date(t.at) }));
  }

  async appendTurn(sessionId: string, turn: MemoryTurn): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new WorkingMemorySessionNotFoundError(sessionId);
    }
    session.turns.push({
      role: turn.role,
      content: turn.content,
      at: new Date(turn.at.getTime()),
    });
  }

  async mergeMetadata(
    sessionId: string,
    metadata: Record<string, string>,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new WorkingMemorySessionNotFoundError(sessionId);
    }
    session.metadata = { ...session.metadata, ...metadata };
  }

  async clearSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}

export class InMemoryKnowledgeGraph implements KnowledgeGraph {
  private readonly nodes = new Map<
    string,
    { labels: string[]; properties: Record<string, string> }
  >();
  private readonly relations: GraphRelation[] = [];
  private unavailable = false;

  setUnavailable(unavailable: boolean): void {
    this.unavailable = unavailable;
  }

  async upsertNode(
    nodeId: string,
    labels: string[] = [],
    properties: Record<string, string> = {},
  ): Promise<void> {
    this.assertAvailable();
    assertOpaqueProperties(properties);
    const existing = this.nodes.get(nodeId);
    this.nodes.set(nodeId, {
      labels: labels.length ? labels : (existing?.labels ?? []),
      properties: { ...(existing?.properties ?? {}), ...properties },
    });
  }

  async addRelation(
    relation: Omit<GraphRelation, 'createdAt'> & { createdAt?: Date },
  ): Promise<void> {
    this.assertAvailable();
    if (relation.metadata) assertOpaqueProperties(relation.metadata);
    this.relations.push({
      subjectId: relation.subjectId,
      relationType: relation.relationType,
      objectId: relation.objectId,
      metadata: relation.metadata,
      createdAt: relation.createdAt ?? new Date(),
    });
  }

  async listRelations(
    subjectId: string,
    relationType?: string,
  ): Promise<GraphRelation[]> {
    this.assertAvailable();
    return this.relations.filter(
      (r) =>
        r.subjectId === subjectId &&
        (relationType ? r.relationType === relationType : true),
    );
  }

  async clearRelations(subjectId: string, relationType?: string): Promise<void> {
    this.assertAvailable();
    for (let i = this.relations.length - 1; i >= 0; i -= 1) {
      const r = this.relations[i]!;
      if (
        r.subjectId === subjectId &&
        (relationType ? r.relationType === relationType : true)
      ) {
        this.relations.splice(i, 1);
      }
    }
  }

  async replaceGraph(snapshot: GraphSnapshot): Promise<void> {
    this.assertAvailable();
    for (const node of snapshot.nodes) {
      if (node.properties) assertOpaqueProperties(node.properties);
    }
    for (const rel of snapshot.relations) {
      if (rel.metadata) assertOpaqueProperties(rel.metadata);
    }

    this.nodes.clear();
    this.relations.length = 0;

    for (const node of snapshot.nodes) {
      this.nodes.set(node.id, {
        labels: [...(node.labels ?? [])],
        properties: { ...(node.properties ?? {}) },
      });
    }
    for (const relation of snapshot.relations) {
      this.relations.push({
        subjectId: relation.subjectId,
        relationType: relation.relationType,
        objectId: relation.objectId,
        metadata: relation.metadata,
        createdAt: relation.createdAt ?? new Date(),
      });
    }
  }

  async findConvergingTargets(query: ConvergingPathQuery): Promise<GraphHit[]> {
    this.assertAvailable();
    const excludeStart = query.excludeStartAsPeer !== false;
    const limit = query.limit ?? 10;

    const mids = this.relations
      .filter(
        (r) =>
          r.subjectId === query.startId &&
          r.relationType === query.outwardRelation,
      )
      .map((r) => r.objectId);

    /** targetId → distinct peer ids (matches Neo4j count(DISTINCT peer)). */
    const peersByTarget = new Map<string, Set<string>>();
    for (const mid of mids) {
      const peers = this.relations
        .filter(
          (r) =>
            r.objectId === mid &&
            r.relationType === query.inwardPeerRelation &&
            (!excludeStart || r.subjectId !== query.startId),
        )
        .map((r) => r.subjectId);

      for (const peer of peers) {
        const targets = this.relations.filter(
          (r) =>
            r.subjectId === peer &&
            r.relationType === query.peerOutwardRelation,
        );
        for (const t of targets) {
          let set = peersByTarget.get(t.objectId);
          if (!set) {
            set = new Set();
            peersByTarget.set(t.objectId, set);
          }
          set.add(peer);
        }
      }
    }

    return [...peersByTarget.entries()]
      .map(([id, peers]) => ({ id, score: peers.size }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private assertAvailable(): void {
    if (this.unavailable) {
      throw new KnowledgeGraphUnavailableError(
        'InMemoryKnowledgeGraph is marked unavailable',
      );
    }
  }
}

const FORBIDDEN_GRAPH_PROP =
  /^(phone|phonenumber|fullname|subjectid|authorization|jwt|token|message|content|transcript|conversationid|demoSubject)$/i;

function assertOpaqueProperties(properties: Record<string, string>): void {
  for (const key of Object.keys(properties)) {
    if (FORBIDDEN_GRAPH_PROP.test(key)) {
      throw new KnowledgeGraphUnavailableError(
        `Forbidden graph property '${key}' — opaque ids only`,
      );
    }
  }
}

export class InMemoryObservability implements ObservabilityPort {
  readonly events: Array<{
    name: string;
    attributes?: TraceAttributes | undefined;
  }> = [];
  readonly scores: Array<{ traceName: string; score: ObservationScore }> = [];
  readonly traces: Array<{
    name: string;
    attributes: TraceAttributes;
    children: Array<{
      name: string;
      attributes: TraceAttributes;
      ended: boolean;
    }>;
    ended: boolean;
  }> = [];

  startTrace(name: string, attributes?: TraceAttributes): ObservabilitySpan {
    const record = {
      name,
      attributes: { ...(attributes ?? {}) },
      children: [] as Array<{
        name: string;
        attributes: TraceAttributes;
        ended: boolean;
      }>,
      ended: false,
    };
    this.traces.push(record);
    return createRecordingSpan(record.attributes, (child) => {
      record.children.push(child);
    }, () => {
      record.ended = true;
    });
  }

  async recordScore(
    traceName: string,
    score: ObservationScore,
  ): Promise<void> {
    this.scores.push({ traceName, score });
  }

  async recordEvent(
    name: string,
    attributes?: TraceAttributes,
  ): Promise<void> {
    this.events.push({ name, attributes });
  }
}

function createRecordingSpan(
  attrs: TraceAttributes,
  onChild: (child: {
    name: string;
    attributes: TraceAttributes;
    ended: boolean;
  }) => void,
  onEnd: () => void,
): ObservabilitySpan {
  return {
    setAttribute(key, value) {
      attrs[key] = value;
    },
    startChild(name, attributes) {
      const child = {
        name,
        attributes: { ...(attributes ?? {}) },
        ended: false,
      };
      onChild(child);
      return createRecordingSpan(
        child.attributes,
        () => {
          /* nested children flattened unused in tests */
        },
        () => {
          child.ended = true;
        },
      );
    },
    end() {
      onEnd();
    },
  };
}

/**
 * Deterministic bag-of-characters embedding for tests — not ML-quality.
 * kind is always 'deterministic' — refused by APP_MODE=production runtime.
 */
export class InMemoryEmbeddingProvider implements EmbeddingProvider {
  readonly kind = 'deterministic' as const;

  constructor(private readonly dims = 32) {}

  private unavailable = false;

  setUnavailable(unavailable: boolean): void {
    this.unavailable = unavailable;
  }

  dimensions(): number {
    return this.dims;
  }

  async embed(text: string): Promise<number[]> {
    this.assertAvailable();
    const vector = new Array<number>(this.dims).fill(0);
    const normalized = text.toLowerCase();
    for (let i = 0; i < normalized.length; i += 1) {
      const idx = normalized.charCodeAt(i) % this.dims;
      vector[idx] = (vector[idx] ?? 0) + 1;
    }
    const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0)) || 1;
    return vector.map((v) => v / norm);
  }

  async embedMany(texts: readonly string[]): Promise<number[][]> {
    this.assertAvailable();
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  private assertAvailable(): void {
    if (this.unavailable) {
      throw new EmbeddingUnavailableError(
        'InMemoryEmbeddingProvider is marked unavailable',
      );
    }
  }
}

type IndexedDoc = {
  id: string;
  text: string;
  payload: Record<string, unknown>;
  vector?: number[] | undefined;
};

/**
 * In-memory SemanticSearch for tests and local development.
 * Call setUnavailable(true) to simulate provider outage.
 */
export class InMemorySemanticSearch implements SemanticSearch {
  private readonly indexes = new Map<SearchIndexId, IndexedDoc[]>();
  private readonly dimensions = new Map<SearchIndexId, number>();
  private unavailable = false;

  setUnavailable(unavailable: boolean): void {
    this.unavailable = unavailable;
  }

  /** Test helper — inspect derived documents without provider APIs. */
  listDocumentIds(indexId: SearchIndexId): string[] {
    return (this.indexes.get(indexId) ?? []).map((d) => d.id);
  }

  async index(
    indexId: SearchIndexId,
    documents: ReadonlyArray<{
      id: string;
      text: string;
      payload?: Record<string, unknown>;
      vector?: number[];
    }>,
  ): Promise<void> {
    this.assertAvailable();
    if (documents.length > 0) {
      this.assertOrSetDimension(indexId, documents);
    }
    const list = this.indexes.get(indexId) ?? [];
    for (const doc of documents) {
      const existingIdx = list.findIndex((d) => d.id === doc.id);
      const next: IndexedDoc = {
        id: doc.id,
        text: doc.text,
        payload: doc.payload ?? {},
        vector: doc.vector,
      };
      if (existingIdx >= 0) list[existingIdx] = next;
      else list.push(next);
    }
    this.indexes.set(indexId, list);
  }

  async replaceIndex(
    indexId: SearchIndexId,
    documents: ReadonlyArray<{
      id: string;
      text: string;
      payload?: Record<string, unknown>;
      vector?: number[];
    }>,
  ): Promise<void> {
    this.assertAvailable();
    if (documents.length === 0) {
      this.indexes.set(indexId, []);
      this.dimensions.delete(indexId);
      return;
    }
    this.dimensions.set(indexId, requireUniformDim(documents));
    this.indexes.set(
      indexId,
      documents.map((doc) => ({
        id: doc.id,
        text: doc.text,
        payload: doc.payload ?? {},
        vector: doc.vector,
      })),
    );
  }

  async clearIndex(indexId: SearchIndexId): Promise<void> {
    this.assertAvailable();
    this.indexes.delete(indexId);
    this.dimensions.delete(indexId);
  }

  async search(
    indexId: SearchIndexId,
    query: SemanticQuery,
    vector?: number[],
  ): Promise<SemanticSearchHit[]> {
    this.assertAvailable();
    if (vector && this.dimensions.has(indexId)) {
      const expected = this.dimensions.get(indexId)!;
      if (vector.length !== expected) {
        throw new SemanticSearchUnavailableError(
          `Query vector dimension ${vector.length} does not match index dimension ${expected}`,
        );
      }
    }
    const docs = this.indexes.get(indexId) ?? [];

    const scored = docs.map((d) => {
      let score = textScore(query.text, d.text);
      if (vector && d.vector) {
        score = Math.max(score, cosine(vector, d.vector));
      }
      return { id: d.id, score };
    });

    return scored
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, query.limit ?? 10);
  }

  private assertOrSetDimension(
    indexId: SearchIndexId,
    documents: ReadonlyArray<{ vector?: number[] | undefined }>,
  ): void {
    const size = requireUniformDim(documents);
    const existing = this.dimensions.get(indexId);
    if (existing !== undefined && existing !== size) {
      throw new SemanticSearchUnavailableError(
        `Index dimension mismatch: collection has ${existing}, documents have ${size}. Rebuild with replaceIndex.`,
      );
    }
    this.dimensions.set(indexId, size);
  }

  private assertAvailable(): void {
    if (this.unavailable) {
      throw new SemanticSearchUnavailableError(
        'InMemorySemanticSearch is marked unavailable',
      );
    }
  }
}

function requireUniformDim(
  documents: ReadonlyArray<{ vector?: number[] | undefined }>,
): number {
  const sizes = new Set(
    documents.map((d) => {
      if (!d.vector || d.vector.length === 0) {
        throw new SemanticSearchUnavailableError(
          'Semantic documents require vectors before indexing',
        );
      }
      return d.vector.length;
    }),
  );
  if (sizes.size !== 1) {
    throw new SemanticSearchUnavailableError(
      'All documents in a batch must share the same vector dimension',
    );
  }
  return [...sizes][0]!;
}

function textScore(query: string, text: string): number {
  const q = query.toLowerCase().trim();
  const t = text.toLowerCase();
  if (!q) return 0;
  if (t.includes(q)) return 1;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  const hits = tokens.filter((tok) => t.includes(tok)).length;
  return hits / tokens.length;
}

function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export class InMemoryChatModel implements ChatModel {
  constructor(private readonly reply = 'ok') {}

  async generate(_request: ChatRequest): Promise<ChatResponse> {
    return { content: this.reply };
  }
}

/** @deprecated Import from infrastructure/voice — kept for barrel compatibility. */
export { InMemoryLiveVoiceProvider } from '../../voice/in-memory/in-memory-live-voice-provider.js';
