import { beforeAll, describe, expect, it } from 'vitest';
import { config as loadDotenv } from 'dotenv';
import { QdrantClient } from '@qdrant/js-client-rest';
import { loadQdrantSemanticSearchConfig } from '../../../src/config/qdrant.js';
import {
  createSdkQdrantOperations,
  QdrantSemanticSearch,
} from '../../../src/infrastructure/vector/qdrant/index.js';
import { InMemoryEmbeddingProvider } from '../../../src/infrastructure/memory/index.js';
import { createTestWorld } from '../../helpers/test-world.js';
import { defineSemanticSearchContract } from '../../vector/semantic-search.contract.js';
import {
  EmbeddingUnavailableError,
  SemanticSearchUnavailableError,
} from '../../../src/ports/platform/semantic-search.js';
import {
  RebuildDoctorSearchIndex,
  SearchDoctors,
} from '../../../src/application/index.js';

loadDotenv();

const qdrantConfigured = Boolean(process.env.QDRANT_URL?.trim());

async function qdrantReachable(): Promise<boolean> {
  if (!qdrantConfigured) return false;
  try {
    const config = loadQdrantSemanticSearchConfig(process.env);
    const client = new QdrantClient({
      url: config.url,
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
      timeout: 3_000,
    });
    await client.getCollections();
    return true;
  } catch {
    return false;
  }
}

describe('Qdrant integration (opt-in)', () => {
  let ready = false;

  beforeAll(async () => {
    ready = await qdrantReachable();
  });

  it('is skipped when QDRANT_URL is unset (opt-in only)', () => {
    if (!qdrantConfigured) {
      expect(ready).toBe(false);
    }
  });

  describe.runIf(qdrantConfigured)('when QDRANT_URL is set', () => {
    beforeAll(async () => {
      if (!ready) {
        throw new Error(
          'QDRANT_URL is set but Qdrant is unreachable. Run: docker compose up -d qdrant',
        );
      }
    });

    defineSemanticSearchContract(
      'QdrantSemanticSearch',
      () => {
        const config = loadQdrantSemanticSearchConfig({
          ...process.env,
          QDRANT_COLLECTION_PREFIX: `clinic_it_${Date.now()}_`,
        });
        return new QdrantSemanticSearch(
          createSdkQdrantOperations(config),
          config,
        );
      },
      { vectorSize: 32 },
    );

    it('rebuild + SearchDoctors hydrates from clinic repos and skips inactive', async () => {
      const config = loadQdrantSemanticSearchConfig({
        ...process.env,
        QDRANT_COLLECTION_PREFIX: `clinic_app_${Date.now()}_`,
      });
      const semanticSearch = new QdrantSemanticSearch(
        createSdkQdrantOperations(config),
        config,
      );
      const embeddings = new InMemoryEmbeddingProvider(32);
      const world = createTestWorld();
      const seed = await world.seed();

      const rebuild = new RebuildDoctorSearchIndex(
        world.doctors,
        world.specialties,
        semanticSearch,
        embeddings,
      );
      const searchDoctors = new SearchDoctors(
        world.doctors,
        semanticSearch,
        embeddings,
      );

      await rebuild.execute();
      const result = await searchDoctors.execute({
        query: 'cardiologist heart',
        limit: 10,
      });

      expect(result.doctors.some((d) => d.id === seed.drSara.id)).toBe(true);
      expect(result.doctors.some((d) => d.id === seed.inactive.id)).toBe(false);
      expect(result.scores[seed.drSara.id]).toEqual(expect.any(Number));
    });

    it('distinguishes embedding failure from Qdrant failure', async () => {
      const config = loadQdrantSemanticSearchConfig({
        ...process.env,
        QDRANT_COLLECTION_PREFIX: `clinic_err_${Date.now()}_`,
      });
      const semanticSearch = new QdrantSemanticSearch(
        createSdkQdrantOperations(config),
        config,
      );
      const embeddings = new InMemoryEmbeddingProvider(32);
      const world = createTestWorld();
      await world.seed();

      embeddings.setUnavailable(true);
      const searchDoctors = new SearchDoctors(
        world.doctors,
        semanticSearch,
        embeddings,
      );
      await expect(
        searchDoctors.execute({ query: 'cardio' }),
      ).rejects.toBeInstanceOf(EmbeddingUnavailableError);

      embeddings.setUnavailable(false);
      const down = new QdrantSemanticSearch(
        createSdkQdrantOperations({
          ...config,
          url: 'http://127.0.0.1:1',
          timeoutMs: 500,
        }),
        { ...config, url: 'http://127.0.0.1:1', timeoutMs: 500 },
      );
      const searchDown = new SearchDoctors(world.doctors, down, embeddings);
      await expect(
        searchDown.execute({ query: 'cardio' }),
      ).rejects.toBeInstanceOf(SemanticSearchUnavailableError);
    });
  });
});
