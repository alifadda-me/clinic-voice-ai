/**
 * Live embeddings + Qdrant integration (opt-in).
 *
 * Live OpenRouter embeddings run only when:
 *   (OPENROUTER_API_KEY || EMBEDDING_API_KEY) && LIVE_EMBEDDINGS=1
 *
 * Real Qdrant runs when reachable (QDRANT_URL or default http://127.0.0.1:63339).
 * Fake-HTTP OpenRouterEmbeddingProvider coverage lives in tests/llm/.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { config as loadDotenv } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { QdrantClient } from '@qdrant/js-client-rest';
import {
  RebuildDoctorSearchIndex,
  RebuildSpecialtySearchIndex,
  SearchDoctors,
  SearchSpecialties,
} from '../../../src/application/index.js';
import { createOpenRouterEmbeddingProvider } from '../../../src/infrastructure/llm/openrouter/create-openrouter-embedding-provider.js';
import { loadEmbeddingProviderConfig } from '../../../src/config/embeddings.js';
import { loadQdrantSemanticSearchConfig } from '../../../src/config/qdrant.js';
import {
  Doctor,
  Specialty,
  asClinicId,
  asDoctorId,
  asSpecialtyId,
} from '../../../src/domain/index.js';
import { createPostgresInfrastructure } from '../../../src/infrastructure/database/postgres/index.js';
import { clinics } from '../../../src/infrastructure/database/postgres/schema.js';
import type { PostgresInfrastructure } from '../../../src/infrastructure/database/postgres/index.js';
import {
  InMemoryDoctorRepository,
  InMemorySpecialtyRepository,
} from '../../../src/infrastructure/memory/index.js';
import {
  createSdkQdrantOperations,
  QdrantSemanticSearch,
} from '../../../src/infrastructure/vector/qdrant/index.js';
import type { EmbeddingProvider } from '../../../src/ports/platform/embedding-provider.js';
import { SemanticSearchUnavailableError } from '../../../src/ports/platform/semantic-search.js';
import { RemoteKindHashEmbeddingProvider } from '../../helpers/remote-kind-hash-embedding.js';

loadDotenv();

const DEFAULT_QDRANT_URL = 'http://127.0.0.1:63339';
const DEFAULT_DATABASE_URL =
  'postgresql://clinic:clinic@localhost:54329/clinic_voice_ai';

const hasEmbeddingKey = Boolean(
  process.env.EMBEDDING_API_KEY?.trim() ||
    process.env.OPENROUTER_API_KEY?.trim(),
);
const liveEmbeddingsEnabled =
  hasEmbeddingKey && process.env.LIVE_EMBEDDINGS === '1';

const qdrantUrl = process.env.QDRANT_URL?.trim() || DEFAULT_QDRANT_URL;

async function qdrantReachable(url: string): Promise<boolean> {
  try {
    const config = loadQdrantSemanticSearchConfig({
      ...process.env,
      QDRANT_URL: url,
    });
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

async function postgresReachable(): Promise<boolean> {
  try {
    const { default: pg } = await import('pg');
    const client = new pg.Client({
      connectionString: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    });
    await client.connect();
    await client.query('select 1');
    await client.end();
    return true;
  } catch {
    return false;
  }
}

describe('Embeddings + Qdrant (opt-in)', () => {
  let qdrantReady = false;
  let pgReady = false;

  beforeAll(async () => {
    qdrantReady = await qdrantReachable(qdrantUrl);
    pgReady = await postgresReachable();

    if (!liveEmbeddingsEnabled) {
      console.warn(
        '[embeddings] Live OpenRouter embeddings skipped — set LIVE_EMBEDDINGS=1 and EMBEDDING_API_KEY or OPENROUTER_API_KEY. Fake-HTTP coverage: tests/llm/openrouter-embedding-provider.test.ts',
      );
    }
    if (!qdrantReady) {
      console.warn(
        `[embeddings] Qdrant unreachable at ${qdrantUrl} — skipping live Qdrant path. Run: docker compose up -d qdrant`,
      );
    }
  }, 30_000);

  it('reports gate status (always)', () => {
    expect(typeof liveEmbeddingsEnabled).toBe('boolean');
    expect(typeof qdrantReady).toBe('boolean');
  });

  describe.runIf(liveEmbeddingsEnabled)('live OpenRouter embeddings', () => {
    it('embeds probe text and matches EMBEDDING_DIMENSIONS', async () => {
      const config = loadEmbeddingProviderConfig(process.env);
      const provider = createOpenRouterEmbeddingProvider(process.env);

      expect(provider.kind).toBe('remote');
      expect(provider.dimensions()).toBe(config.dimensions);

      const vector = await provider.embed(
        'cardiologist heart specialty clinic appointment',
      );
      expect(vector).toHaveLength(config.dimensions);
      expect(vector.every((n) => typeof n === 'number')).toBe(true);
    }, 60_000);
  });

  it('assertCompatibleDimensions fails for wrong collection size', async ({
    skip,
  }) => {
    if (!qdrantReady) return skip();

    const prefix = `clinic_emb_dim_${Date.now()}_`;
    const config = loadQdrantSemanticSearchConfig({
      ...process.env,
      QDRANT_URL: qdrantUrl,
      QDRANT_COLLECTION_PREFIX: prefix,
    });
    const ops = createSdkQdrantOperations(config);
    const search = new QdrantSemanticSearch(ops, config);
    const wrongPhysical = `${prefix}doctors__wrongdims`;

    await ops.createCollection(wrongPhysical, 8);
    await ops.updateAliases([
      {
        createAlias: {
          aliasName: `${prefix}doctors`,
          collectionName: wrongPhysical,
        },
      },
    ]);

    try {
      await expect(
        search.assertCompatibleDimensions(32, ['doctors']),
      ).rejects.toBeInstanceOf(SemanticSearchUnavailableError);
    } finally {
      try {
        await ops.updateAliases([
          { deleteAlias: { aliasName: `${prefix}doctors` } },
        ]);
      } catch {
        /* ignore */
      }
      try {
        await ops.deleteCollection(wrongPhysical);
      } catch {
        /* ignore */
      }
    }
  }, 30_000);

  it('indexes with embeddings, searches, and excludes deactivated doctors', async ({
    skip,
  }) => {
    if (!qdrantReady) return skip();

    const embeddings: EmbeddingProvider = liveEmbeddingsEnabled
      ? createOpenRouterEmbeddingProvider(process.env)
      : new RemoteKindHashEmbeddingProvider(32);

    const dims = embeddings.dimensions();
    const prefix = `clinic_emb_${Date.now()}_`;
    const qdrantConfig = loadQdrantSemanticSearchConfig({
      ...process.env,
      QDRANT_URL: qdrantUrl,
      QDRANT_COLLECTION_PREFIX: prefix,
    });
    const semanticSearch = new QdrantSemanticSearch(
      createSdkQdrantOperations(qdrantConfig),
      qdrantConfig,
    );

    await semanticSearch.assertCompatibleDimensions(dims, [
      'doctors',
      'specialties',
    ]);

    if (pgReady) {
      await runPostgresPath(semanticSearch, embeddings);
    } else {
      await runInMemoryPath(semanticSearch, embeddings);
    }
  }, 120_000);
});

async function runInMemoryPath(
  semanticSearch: QdrantSemanticSearch,
  embeddings: EmbeddingProvider,
): Promise<void> {
  const specialties = new InMemorySpecialtyRepository();
  const doctors = new InMemoryDoctorRepository();
  const clinicId = asClinicId('clinic_emb');

  const cardiology = Specialty.create({
    id: asSpecialtyId(`spec_${randomUUID().slice(0, 8)}`),
    name: 'Cardiology',
    description: 'Heart and cardiovascular care',
  });
  await specialties.save(cardiology);
  await specialties.save(
    Specialty.create({
      id: asSpecialtyId(`spec_${randomUUID().slice(0, 8)}`),
      name: 'Dermatology',
      description: 'Skin care',
    }),
  );

  const drSara = Doctor.create({
    id: asDoctorId(`doc_${randomUUID().slice(0, 8)}`),
    clinicId,
    fullName: 'Dr Sara Hassan',
    specialtyIds: [cardiology.id],
    bio: 'Senior cardiologist',
  });
  const inactive = Doctor.create({
    id: asDoctorId(`doc_${randomUUID().slice(0, 8)}`),
    clinicId,
    fullName: 'Dr Inactive',
    specialtyIds: [cardiology.id],
    bio: 'Inactive cardiologist',
    active: false,
  });
  await doctors.save(drSara);
  await doctors.save(inactive);

  await new RebuildSpecialtySearchIndex(
    specialties,
    semanticSearch,
    embeddings,
  ).execute();
  await new RebuildDoctorSearchIndex(
    doctors,
    specialties,
    semanticSearch,
    embeddings,
  ).execute();

  const searchDoctors = new SearchDoctors(doctors, semanticSearch, embeddings);
  const searchSpecialties = new SearchSpecialties(
    specialties,
    semanticSearch,
    embeddings,
  );

  const doctorHits = await searchDoctors.execute({
    query: 'cardiologist heart',
    limit: 10,
  });
  expect(doctorHits.doctors.some((d) => d.id === drSara.id)).toBe(true);
  expect(doctorHits.doctors.some((d) => d.id === inactive.id)).toBe(false);

  const specialtyHits = await searchSpecialties.execute({
    query: 'heart cardiovascular',
    limit: 10,
  });
  expect(specialtyHits.some((s) => s.id === cardiology.id)).toBe(true);

  await doctors.save(
    Doctor.create({
      id: drSara.id,
      clinicId: drSara.clinicId,
      fullName: drSara.fullName,
      specialtyIds: drSara.specialtyIds,
      bio: drSara.bio,
      active: false,
      calendarResourceId: drSara.calendarResourceId,
    }),
  );

  const after = await searchDoctors.execute({
    query: 'cardiologist heart',
    limit: 10,
  });
  expect(after.doctors.some((d) => d.id === drSara.id)).toBe(false);
}

async function runPostgresPath(
  semanticSearch: QdrantSemanticSearch,
  embeddings: EmbeddingProvider,
): Promise<void> {
  let infra: PostgresInfrastructure | undefined;
  try {
    infra = createPostgresInfrastructure({
      databaseUrl: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    });

    await infra.db.execute(sql`
      truncate table principal_patient_links, patient_preferences, appointments,
        doctor_specialties, doctors, specialties, patients, clinics
        restart identity cascade
    `);

    const clinicId = asClinicId(randomUUID());
    await infra.db.insert(clinics).values({
      id: clinicId,
      name: 'Embeddings Clinic',
      timezone: 'Africa/Cairo',
    });

    const cardiology = Specialty.create({
      id: asSpecialtyId(randomUUID()),
      name: `Cardiology-${randomUUID().slice(0, 8)}`,
      description: 'Heart and cardiovascular care',
    });
    const dermatology = Specialty.create({
      id: asSpecialtyId(randomUUID()),
      name: `Dermatology-${randomUUID().slice(0, 8)}`,
      description: 'Skin care',
    });
    await infra.repositories.specialties.save(cardiology);
    await infra.repositories.specialties.save(dermatology);

    const drSara = Doctor.create({
      id: asDoctorId(randomUUID()),
      clinicId,
      fullName: 'Dr Sara Hassan',
      specialtyIds: [cardiology.id],
      bio: 'Senior cardiologist',
    });
    const inactive = Doctor.create({
      id: asDoctorId(randomUUID()),
      clinicId,
      fullName: 'Dr Inactive',
      specialtyIds: [cardiology.id],
      bio: 'Inactive cardiologist',
      active: false,
    });
    await infra.repositories.doctors.save(drSara);
    await infra.repositories.doctors.save(inactive);

    await new RebuildSpecialtySearchIndex(
      infra.repositories.specialties,
      semanticSearch,
      embeddings,
    ).execute();
    await new RebuildDoctorSearchIndex(
      infra.repositories.doctors,
      infra.repositories.specialties,
      semanticSearch,
      embeddings,
    ).execute();

    const searchDoctors = new SearchDoctors(
      infra.repositories.doctors,
      semanticSearch,
      embeddings,
    );
    const searchSpecialties = new SearchSpecialties(
      infra.repositories.specialties,
      semanticSearch,
      embeddings,
    );

    const doctorHits = await searchDoctors.execute({
      query: 'cardiologist heart',
      limit: 10,
    });
    expect(doctorHits.doctors.some((d) => d.id === drSara.id)).toBe(true);
    expect(doctorHits.doctors.some((d) => d.id === inactive.id)).toBe(false);

    const specialtyHits = await searchSpecialties.execute({
      query: 'heart cardiovascular',
      limit: 10,
    });
    expect(specialtyHits.some((s) => s.id === cardiology.id)).toBe(true);

    await infra.repositories.doctors.save(
      Doctor.create({
        id: drSara.id,
        clinicId: drSara.clinicId,
        fullName: drSara.fullName,
        specialtyIds: drSara.specialtyIds,
        bio: drSara.bio,
        active: false,
        calendarResourceId: drSara.calendarResourceId,
      }),
    );

    const after = await searchDoctors.execute({
      query: 'cardiologist heart',
      limit: 10,
    });
    expect(after.doctors.some((d) => d.id === drSara.id)).toBe(false);
  } finally {
    await infra?.close();
  }
}
