import { sql } from 'drizzle-orm';
import { loadProductionConfig, type ProductionConfig } from '../config/production.js';
import { loadTwilioTelephonyConfig } from '../config/twilio.js';
import { createPostgresBackedUseCases } from './postgres-use-cases.js';
import { createProductionChatStack } from '../interfaces/http/create-chat-stack.js';
import { createProductionVoiceStack } from '../interfaces/voice/create-voice-stack.js';
import { createProductionTwilioPstnStack } from '../interfaces/telephony/create-twilio-pstn-stack.js';
import { createObservabilityFromEnv } from '../infrastructure/observability/create-observability-from-env.js';
import { createQdrantSemanticSearch } from '../infrastructure/vector/qdrant/create-qdrant-semantic-search.js';
import { createNeo4jKnowledgeGraph } from '../infrastructure/graph/neo4j/create-neo4j-knowledge-graph.js';
import { createOpenRouterChatModel } from '../infrastructure/llm/openrouter/create-openrouter-chat-model.js';
import { createOpenRouterEmbeddingProvider } from '../infrastructure/llm/openrouter/create-openrouter-embedding-provider.js';
import { createRedisWorkingMemory } from '../infrastructure/memory/redis/index.js';
import { createGeminiLiveVoiceProviderFromEnv } from '../infrastructure/voice/index.js';
import { JwtBearerAuthGateway } from '../infrastructure/auth/index.js';
import { InMemoryConversationRegistry } from '../agent/index.js';
import type { ConversationRegistry } from '../agent/index.js';
import type { ClinicToolUseCases } from '../agent/tools/clinic-tools.js';
import { createProductionHttpApp } from '../interfaces/http/index.js';
import type { HealthProbeResult } from '../interfaces/http/index.js';
import type { AuthGateway } from '../ports/platform/auth.js';
import type { CalendarGateway } from '../ports/platform/calendar-gateway.js';
import type { ChatModel } from '../ports/platform/chat-model.js';
import type { EmbeddingProvider } from '../ports/platform/embedding-provider.js';
import type { KnowledgeGraph } from '../ports/platform/knowledge-graph.js';
import type { LiveVoiceProvider } from '../ports/platform/live-voice-provider.js';
import type { ObservabilityPort } from '../ports/platform/observability.js';
import type { SemanticSearch } from '../ports/platform/semantic-search.js';
import type { WorkingMemory } from '../ports/platform/working-memory.js';
import type { VoiceStack } from '../interfaces/voice/create-voice-stack.js';
import type { TwilioPstnStack } from '../interfaces/telephony/create-twilio-pstn-stack.js';
import { QdrantSemanticSearch } from '../infrastructure/vector/qdrant/qdrant-semantic-search.js';
import {
  DOCTOR_SEARCH_INDEX,
  SPECIALTY_SEARCH_INDEX,
} from '../application/index.js';

export type ProductionRuntime = {
  config: ProductionConfig;
  app: ReturnType<typeof createProductionHttpApp>;
  authGateway: AuthGateway;
  observability: ObservabilityPort;
  workingMemory: WorkingMemory;
  embeddings: EmbeddingProvider;
  semanticSearch: SemanticSearch;
  knowledgeGraph: KnowledgeGraph;
  useCases: ReturnType<typeof createPostgresBackedUseCases>['useCases'];
  infra: ReturnType<typeof createPostgresBackedUseCases>['infra'];
  chatStack: ReturnType<typeof createProductionChatStack>;
  voiceStack?: VoiceStack | undefined;
  twilioStack?: TwilioPstnStack | undefined;
  rebuildDoctorSearchIndex: () => Promise<{ indexedCount: number }>;
  rebuildSpecialtySearchIndex: () => Promise<{ indexedCount: number }>;
  rebuildPatientAffinityGraph: () => Promise<{
    nodeCount: number;
    relationCount: number;
  }>;
  close: () => Promise<void>;
};

export type CreateProductionRuntimeInput = {
  env?: NodeJS.ProcessEnv;
  /**
   * Defaults to OpenRouterEmbeddingProvider from env.
   * Must be kind 'remote' and dimensions must match EMBEDDING_DIMENSIONS.
   */
  embeddings?: EmbeddingProvider;
  /** Defaults to OpenRouter when OPENROUTER_API_KEY is set. */
  chatModel?: ChatModel;
  calendar?: CalendarGateway;
  /** Defaults to JwtBearerAuthGateway from AUTH_* env. Must be kind production. */
  authGateway?: AuthGateway;
  voiceProvider?: LiveVoiceProvider;
  conversations?: ConversationRegistry;
  observability?: ObservabilityPort;
  semanticSearch?: SemanticSearch;
  knowledgeGraph?: KnowledgeGraph & { close?: () => Promise<void> };
};

/**
 * Production process bootstrap.
 * Refuses demo auth, deterministic embeddings, missing embedding config,
 * and Qdrant dimension mismatches.
 */
export async function createProductionRuntime(
  input: CreateProductionRuntimeInput = {},
): Promise<ProductionRuntime> {
  const env = input.env ?? process.env;
  const config = loadProductionConfig(env);

  const authGateway =
    input.authGateway ?? JwtBearerAuthGateway.fromConfig(config.auth);
  if (authGateway.kind !== 'production') {
    throw new Error(
      'Production runtime refuses AuthGateway with kind !== "production"',
    );
  }

  const embeddings =
    input.embeddings ?? createOpenRouterEmbeddingProvider(env);
  assertProductionEmbeddings(embeddings, config.embeddings.dimensions);

  const observability =
    input.observability ?? createObservabilityFromEnv(env);

  const redis = createRedisWorkingMemory(config.redis);
  const semanticSearch =
    input.semanticSearch ?? createQdrantSemanticSearch(env);

  if (semanticSearch instanceof QdrantSemanticSearch) {
    await semanticSearch.assertCompatibleDimensions(
      embeddings.dimensions(),
      [DOCTOR_SEARCH_INDEX, SPECIALTY_SEARCH_INDEX],
    );
  }

  const knowledgeGraphHandle =
    input.knowledgeGraph ?? createNeo4jKnowledgeGraph(env);
  const knowledgeGraph: KnowledgeGraph = knowledgeGraphHandle;

  const chatModel =
    input.chatModel ??
    (() => {
      if (!env.OPENROUTER_API_KEY?.trim()) {
        throw new Error(
          'OPENROUTER_API_KEY is required when chatModel is not injected',
        );
      }
      return createOpenRouterChatModel(env);
    })();

  const { infra, useCases } = createPostgresBackedUseCases({
    embeddings,
    semanticSearch,
    knowledgeGraph,
    ...(input.calendar ? { calendar: input.calendar } : {}),
    env,
  });

  const clinicTools: ClinicToolUseCases = {
    registerPatient: useCases.registerPatient,
    getPatientProfile: useCases.getPatientProfile,
    getPatientContext: useCases.getPatientContext,
    savePatientPreference: useCases.savePatientPreference,
    searchDoctors: useCases.searchDoctors,
    searchSpecialties: useCases.searchSpecialties,
    getAvailableAppointments: useCases.getAvailableAppointments,
    bookAppointment: useCases.bookAppointment,
    cancelAppointment: useCases.cancelAppointment,
    rescheduleAppointment: useCases.rescheduleAppointment,
    ...(useCases.suggestDoctorsFromPeerAffinity
      ? {
          suggestDoctorsFromPeerAffinity:
            useCases.suggestDoctorsFromPeerAffinity,
        }
      : {}),
  };

  const conversations =
    input.conversations ?? new InMemoryConversationRegistry();

  const chatStack = createProductionChatStack({
    mode: 'production',
    authGateway,
    useCases: clinicTools,
    chatModel,
    patients: infra.repositories.patients,
    principalPatients: infra.repositories.principalPatients,
    workingMemory: redis.workingMemory,
    conversations,
    observability,
  });

  const resolvedVoiceProvider =
    input.voiceProvider ??
    (config.enableVoice || config.enableTwilio
      ? createGeminiLiveVoiceProviderFromEnv(env)
      : undefined);

  let voiceStack: VoiceStack | undefined;
  if (config.enableVoice) {
    if (!resolvedVoiceProvider) {
      throw new Error(
        'ENABLE_VOICE=true requires GEMINI_API_KEY or an injected LiveVoiceProvider',
      );
    }
    voiceStack = createProductionVoiceStack({
      mode: 'production',
      authGateway,
      voiceProvider: resolvedVoiceProvider,
      useCases: clinicTools,
      principalPatients: infra.repositories.principalPatients,
      workingMemory: redis.workingMemory,
      observability,
    });
  }

  let twilioStack: TwilioPstnStack | undefined;
  if (config.enableTwilio) {
    const twilioConfig = loadTwilioTelephonyConfig(env);
    if (!twilioConfig) {
      throw new Error(
        'ENABLE_TWILIO=true requires TWILIO_AUTH_TOKEN, TWILIO_VOICE_WEBHOOK_URL, TWILIO_MEDIA_STREAM_WS_URL',
      );
    }
    const voiceProvider = resolvedVoiceProvider ?? voiceStack?.voiceProvider;
    if (!voiceProvider) {
      throw new Error(
        'ENABLE_TWILIO=true requires GEMINI_API_KEY with voice enabled, or an injected LiveVoiceProvider',
      );
    }
    twilioStack = createProductionTwilioPstnStack({
      mode: 'production',
      config: twilioConfig,
      authGateway,
      voiceProvider,
      useCases: clinicTools,
      principalPatients: infra.repositories.principalPatients,
      workingMemory: redis.workingMemory,
      observability,
    });
  }

  const health = {
    check: async (): Promise<HealthProbeResult[]> => {
      const results: HealthProbeResult[] = [];

      const pgStart = Date.now();
      try {
        await infra.db.execute(sql`select 1`);
        results.push({
          name: 'postgres',
          required: true,
          ok: true,
          latencyMs: Date.now() - pgStart,
        });
      } catch (error) {
        results.push({
          name: 'postgres',
          required: true,
          ok: false,
          detail: error instanceof Error ? error.message : 'postgres failed',
          latencyMs: Date.now() - pgStart,
        });
      }

      const redisStart = Date.now();
      try {
        // getSession returns null for missing keys — proves Redis is reachable.
        await redis.workingMemory.getSession('__health_probe__');
        results.push({
          name: 'redis',
          required: true,
          ok: true,
          latencyMs: Date.now() - redisStart,
        });
      } catch (error) {
        results.push({
          name: 'redis',
          required: true,
          ok: false,
          detail: error instanceof Error ? error.message : 'redis failed',
          latencyMs: Date.now() - redisStart,
        });
      }

      const qdrantStart = Date.now();
      try {
        await semanticSearch.search(
          '__health__',
          { text: 'health', limit: 1 },
          [0],
        );
        results.push({
          name: 'qdrant',
          required: false,
          ok: true,
          latencyMs: Date.now() - qdrantStart,
        });
      } catch (error) {
        results.push({
          name: 'qdrant',
          required: false,
          ok: false,
          detail: error instanceof Error ? error.message : 'qdrant failed',
          latencyMs: Date.now() - qdrantStart,
        });
      }

      const neoStart = Date.now();
      try {
        await knowledgeGraph.listRelations('__health_probe__');
        results.push({
          name: 'neo4j',
          required: false,
          ok: true,
          latencyMs: Date.now() - neoStart,
        });
      } catch (error) {
        results.push({
          name: 'neo4j',
          required: false,
          ok: false,
          detail: error instanceof Error ? error.message : 'neo4j failed',
          latencyMs: Date.now() - neoStart,
        });
      }

      return results;
    },
  };

  const app = createProductionHttpApp({
    agent: chatStack.agent,
    conversations: chatStack.conversations,
    authGateway,
    resolveClinicActor: chatStack.resolveClinicActor,
    enrollAuthenticatedPatient: chatStack.enrollAuthenticatedPatient,
    linkPrincipalToPatient: chatStack.linkPrincipalToPatient,
    health,
    ...(twilioStack ? { twilioRouter: twilioStack.twilioRouter } : {}),
  });

  return {
    config,
    app,
    authGateway,
    observability,
    workingMemory: redis.workingMemory,
    embeddings,
    semanticSearch,
    knowledgeGraph,
    useCases,
    infra,
    chatStack,
    ...(voiceStack ? { voiceStack } : {}),
    ...(twilioStack ? { twilioStack } : {}),
    rebuildDoctorSearchIndex: async () =>
      useCases.rebuildDoctorSearchIndex.execute(),
    rebuildSpecialtySearchIndex: async () =>
      useCases.rebuildSpecialtySearchIndex.execute(),
    rebuildPatientAffinityGraph: async () => {
      if (!useCases.rebuildPatientAffinityGraph) {
        throw new Error('KnowledgeGraph not wired');
      }
      return useCases.rebuildPatientAffinityGraph.execute();
    },
    close: async () => {
      await redis.close();
      if ('close' in knowledgeGraphHandle && typeof knowledgeGraphHandle.close === 'function') {
        await knowledgeGraphHandle.close();
      }
      await infra.close();
    },
  };
}

export function assertProductionEmbeddings(
  embeddings: EmbeddingProvider,
  expectedDimensions: number,
): void {
  if (embeddings.kind === 'deterministic') {
    throw new Error(
      'Production runtime refuses deterministic embeddings. Configure remote EMBEDDING_* / OPENROUTER_API_KEY.',
    );
  }
  if (embeddings.dimensions() !== expectedDimensions) {
    throw new Error(
      `Embedding provider dimensions (${embeddings.dimensions()}) do not match EMBEDDING_DIMENSIONS (${expectedDimensions})`,
    );
  }
}
