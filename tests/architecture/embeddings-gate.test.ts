import { describe, expect, it } from 'vitest';
import { loadProductionConfig } from '../../src/config/production.js';
import { assertProductionEmbeddings } from '../../src/runtime/production-runtime.js';
import { InMemoryEmbeddingProvider } from '../../src/infrastructure/memory/index.js';
import { QdrantSemanticSearch } from '../../src/infrastructure/vector/qdrant/qdrant-semantic-search.js';
import type {
  QdrantOperations,
  QdrantPointInput,
} from '../../src/infrastructure/vector/qdrant/qdrant-operations.js';
import { SemanticSearchUnavailableError } from '../../src/ports/platform/semantic-search.js';
import { RemoteKindHashEmbeddingProvider } from '../helpers/remote-kind-hash-embedding.js';

const baseProdEnv = {
  APP_MODE: 'production',
  DATABASE_URL: 'postgresql://clinic:clinic@localhost:54329/clinic_voice_ai',
  REDIS_URL: 'redis://127.0.0.1:63799',
  AUTH_ISSUER: 'https://auth.example.com/',
  AUTH_AUDIENCE: 'clinic-voice-ai',
  AUTH_JWKS_URL: 'https://auth.example.com/.well-known/jwks.json',
  EMBEDDING_API_KEY: 'test-embedding-key',
  EMBEDDING_DIMENSIONS: '1536',
  EMBEDDING_MODEL: 'openai/text-embedding-3-small',
} as const;

describe('Production embeddings gate', () => {
  it('loadProductionConfig + assertProductionEmbeddings accept matching remote provider', () => {
    const config = loadProductionConfig({ ...baseProdEnv });
    expect(config.embeddings.dimensions).toBe(1536);
    expect(config.embeddings.model).toBe('openai/text-embedding-3-small');

    const embeddings = new RemoteKindHashEmbeddingProvider(
      config.embeddings.dimensions,
    );
    expect(() =>
      assertProductionEmbeddings(embeddings, config.embeddings.dimensions),
    ).not.toThrow();
  });

  it('refuses InMemoryEmbeddingProvider (deterministic)', () => {
    expect(() =>
      assertProductionEmbeddings(new InMemoryEmbeddingProvider(32), 32),
    ).toThrow(/deterministic/);
  });

  it('refuses dimension mismatch', () => {
    expect(() =>
      assertProductionEmbeddings(new RemoteKindHashEmbeddingProvider(32), 1536),
    ).toThrow(/dimensions/);
  });

  it('accepts RemoteKindHashEmbeddingProvider with matching dimensions', () => {
    expect(() =>
      assertProductionEmbeddings(new RemoteKindHashEmbeddingProvider(32), 32),
    ).not.toThrow();
  });

  it('assertCompatibleDimensions fails when live collection has wrong size', async () => {
    const collections = new Map<
      string,
      { size: number; points: QdrantPointInput[] }
    >();
    const aliases = new Map<string, string>([
      ['clinic_doctors', 'clinic_doctors__wrong'],
    ]);
    collections.set('clinic_doctors__wrong', { size: 8, points: [] });

    const ops: QdrantOperations = {
      async listCollectionNames() {
        return [...collections.keys()];
      },
      async listAliases() {
        return [...aliases.entries()].map(([aliasName, collectionName]) => ({
          aliasName,
          collectionName,
        }));
      },
      async getCollectionVectorSize(name) {
        const col = collections.get(name);
        if (!col) throw new Error(`missing ${name}`);
        return col.size;
      },
      async createCollection() {
        throw new Error('not used');
      },
      async deleteCollection() {},
      async upsertPoints() {},
      async search() {
        return [];
      },
      async updateAliases() {},
    };

    const search = new QdrantSemanticSearch(ops, {
      url: 'http://localhost:6333',
      collectionPrefix: 'clinic_',
      timeoutMs: 5_000,
    });

    await expect(
      search.assertCompatibleDimensions(32, ['doctors']),
    ).rejects.toBeInstanceOf(SemanticSearchUnavailableError);

    await expect(
      search.assertCompatibleDimensions(32, ['doctors']),
    ).rejects.toThrow(/dimension/i);
  });

  it('assertCompatibleDimensions allows missing indexes', async () => {
    const ops: QdrantOperations = {
      async listCollectionNames() {
        return [];
      },
      async listAliases() {
        return [];
      },
      async getCollectionVectorSize() {
        throw new Error('should not be called');
      },
      async createCollection() {},
      async deleteCollection() {},
      async upsertPoints() {},
      async search() {
        return [];
      },
      async updateAliases() {},
    };

    const search = new QdrantSemanticSearch(ops, {
      url: 'http://localhost:6333',
      collectionPrefix: 'clinic_',
      timeoutMs: 5_000,
    });

    await expect(
      search.assertCompatibleDimensions(1536, ['doctors', 'specialties']),
    ).resolves.toBeUndefined();
  });
});
