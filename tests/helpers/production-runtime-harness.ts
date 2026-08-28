import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  createProductionRuntime,
  type ProductionRuntime,
} from '../../src/runtime/production-runtime.js';
import {
  Doctor,
  Specialty,
  asClinicId,
  asDoctorId,
  asSpecialtyId,
} from '../../src/domain/index.js';
import { clinics } from '../../src/infrastructure/database/postgres/schema.js';
import {
  InMemoryCalendarGateway,
  InMemoryKnowledgeGraph,
  InMemorySemanticSearch,
} from '../../src/infrastructure/memory/index.js';
import { ScriptedLiveVoiceProvider } from '../../src/infrastructure/voice/index.js';
import type { ObservabilityPort } from '../../src/ports/platform/observability.js';
import type { SemanticSearch } from '../../src/ports/platform/semantic-search.js';
import type { KnowledgeGraph } from '../../src/ports/platform/knowledge-graph.js';
import {
  createTestJwtFixture,
  TEST_AUTH_AUDIENCE,
  TEST_AUTH_ISSUER,
  type TestJwtFixture,
} from './jwt-fixture.js';
import { ScriptedChatModel } from './scripted-chat-model.js';
import { RemoteKindHashEmbeddingProvider } from './remote-kind-hash-embedding.js';

const DEFAULT_DATABASE_URL =
  'postgresql://clinic:clinic@localhost:54329/clinic_voice_ai';
const DEFAULT_REDIS_URL = 'redis://127.0.0.1:63799';

export type ClinicSeed = {
  clinicId: ReturnType<typeof asClinicId>;
  cardiology: Specialty;
  dermatology: Specialty;
  drSara: Doctor;
  drOmar: Doctor;
};

export type ProductionTestHarness = {
  runtime: ProductionRuntime;
  jwt: TestJwtFixture;
  chat: ScriptedChatModel;
  voice: ScriptedLiveVoiceProvider;
  calendar: InMemoryCalendarGateway;
  embeddings: RemoteKindHashEmbeddingProvider;
  semanticSearch: InMemorySemanticSearch;
  knowledgeGraph: InMemoryKnowledgeGraph;
  env: NodeJS.ProcessEnv;
  seedClinicData: () => Promise<ClinicSeed>;
  resetDb: () => Promise<void>;
  close: () => Promise<void>;
};

export type CreateProductionTestHarnessOptions = {
  /** Extra / override env vars merged into production test env. */
  env?: NodeJS.ProcessEnv;
  observability?: ObservabilityPort;
  /**
   * When true and QDRANT_URL is set, use real Qdrant instead of InMemory.
   * Default false — deterministic suite prefers InMemory.
   */
  useRealQdrant?: boolean;
  /**
   * When true and NEO4J_URI is set, use real Neo4j instead of InMemory.
   * Default false — deterministic suite prefers InMemory.
   */
  useRealNeo4j?: boolean;
};

/** Build env that satisfies loadProductionConfig without live JWKS. */
export function buildProductionTestEnv(
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const keyPrefix = `clinic:wm:prod:${randomUUID().slice(0, 8)}`;
  return {
    APP_MODE: 'production',
    DATABASE_URL: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL ?? DEFAULT_REDIS_URL,
    AUTH_ISSUER: TEST_AUTH_ISSUER,
    AUTH_AUDIENCE: TEST_AUTH_AUDIENCE,
    // Gateway is injected; JWKS URL only needs to satisfy config validation.
    AUTH_JWKS_URL: 'https://auth.test.clinic-voice-ai.local/.well-known/jwks.json',
    ENABLE_VOICE: 'true',
    ENABLE_TWILIO: 'true',
    TWILIO_AUTH_TOKEN: 'prod_test_twilio_token',
    TWILIO_VOICE_WEBHOOK_URL: 'https://clinic.test/v1/twilio/voice',
    TWILIO_MEDIA_STREAM_WS_URL: 'wss://clinic.test/v1/twilio/media',
    WORKING_MEMORY_KEY_PREFIX: keyPrefix,
    // Satisfy production embedding gate without live HTTP (provider is injected).
    EMBEDDING_API_KEY: 'prod-test-embedding-key-not-used',
    EMBEDDING_DIMENSIONS: '32',
    EMBEDDING_MODEL: 'test/hash-embedding',
    QDRANT_URL: process.env.QDRANT_URL ?? 'http://127.0.0.1:63339',
    NEO4J_URI: process.env.NEO4J_URI ?? 'bolt://127.0.0.1:17687',
    NEO4J_USER: process.env.NEO4J_USER ?? 'neo4j',
    NEO4J_PASSWORD: process.env.NEO4J_PASSWORD ?? 'clinic-voice-ai',
    ...overrides,
  };
}

/**
 * Production runtime for integration/e2e tests.
 * Injects JWT gateway + scripted LLM/voice + InMemory calendar/search/graph
 * so Google/OpenRouter/Gemini/Twilio live APIs and Qdrant/Neo4j containers
 * are optional for the deterministic suite.
 */
export async function createProductionTestHarness(
  options: CreateProductionTestHarnessOptions = {},
): Promise<ProductionTestHarness> {
  const jwt = await createTestJwtFixture();
  const chat = new ScriptedChatModel();
  const voice = new ScriptedLiveVoiceProvider();
  const calendar = new InMemoryCalendarGateway();
  const embeddings = new RemoteKindHashEmbeddingProvider(32);
  const semanticSearch = new InMemorySemanticSearch();
  const knowledgeGraph = new InMemoryKnowledgeGraph();
  const env = buildProductionTestEnv(options.env);

  const useRealQdrant =
    options.useRealQdrant === true && Boolean(env.QDRANT_URL?.trim());
  const useRealNeo4j =
    options.useRealNeo4j === true && Boolean(env.NEO4J_URI?.trim());

  const runtime = await createProductionRuntime({
    env,
    embeddings,
    chatModel: chat,
    calendar,
    authGateway: jwt.gateway,
    voiceProvider: voice,
    ...(options.observability ? { observability: options.observability } : {}),
    ...(useRealQdrant
      ? {}
      : { semanticSearch: semanticSearch as SemanticSearch }),
    ...(useRealNeo4j
      ? {}
      : {
          knowledgeGraph: knowledgeGraph as KnowledgeGraph & {
            close?: () => Promise<void>;
          },
        }),
  });

  async function resetDb(): Promise<void> {
    await runtime.infra.db.execute(sql`
      truncate table principal_patient_links, patient_preferences, appointments,
        doctor_specialties, doctors, specialties, patients, clinics
        restart identity cascade
    `);
    semanticSearch.setUnavailable(false);
    knowledgeGraph.setUnavailable(false);
    embeddings.setUnavailable(false);
  }

  async function seedClinicData(): Promise<ClinicSeed> {
    const clinicId = asClinicId(randomUUID());
    await runtime.infra.db.insert(clinics).values({
      id: clinicId,
      name: 'Demo Clinic',
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
    await runtime.infra.repositories.specialties.save(cardiology);
    await runtime.infra.repositories.specialties.save(dermatology);

    const drSara = Doctor.create({
      id: asDoctorId(randomUUID()),
      clinicId,
      fullName: 'Dr Sara Hassan',
      specialtyIds: [cardiology.id],
      bio: 'Senior cardiologist',
      calendarResourceId: `cal_sara_${randomUUID().slice(0, 8)}`,
    });
    const drOmar = Doctor.create({
      id: asDoctorId(randomUUID()),
      clinicId,
      fullName: 'Dr Omar Nabil',
      specialtyIds: [dermatology.id],
      bio: 'Dermatologist',
      calendarResourceId: `cal_omar_${randomUUID().slice(0, 8)}`,
    });
    await runtime.infra.repositories.doctors.save(drSara);
    await runtime.infra.repositories.doctors.save(drOmar);

    await runtime.rebuildSpecialtySearchIndex();
    await runtime.rebuildDoctorSearchIndex();

    return { clinicId, cardiology, dermatology, drSara, drOmar };
  }

  return {
    runtime,
    jwt,
    chat,
    voice,
    calendar,
    embeddings,
    semanticSearch,
    knowledgeGraph,
    env,
    seedClinicData,
    resetDb,
    close: () => runtime.close(),
  };
}

/** Probe PG + Redis; returns false when local containers are down. */
export async function canReachProductionTestDependencies(
  env: NodeJS.ProcessEnv = buildProductionTestEnv(),
): Promise<boolean> {
  const { default: pg } = await import('pg');
  const { Redis } = await import('ioredis');

  const databaseUrl = env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  const redisUrl = env.REDIS_URL ?? DEFAULT_REDIS_URL;

  const client = new pg.Client({ connectionString: databaseUrl });
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    enableOfflineQueue: false,
    connectTimeout: 2000,
  });

  try {
    await client.connect();
    await client.query('select 1');
    await redis.connect();
    await redis.ping();
    return true;
  } catch {
    return false;
  } finally {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
    try {
      redis.disconnect();
    } catch {
      /* ignore */
    }
  }
}

export function uniquePhone(_label?: string): string {
  const digits = randomUUID().replace(/\D/g, '').slice(0, 8).padEnd(8, '0');
  return `+2010${digits}`;
}
