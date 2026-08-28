import { describe, expect, it } from 'vitest';
import { loadProductionConfig } from '../../src/config/production.js';
import { createProductionHttpApp } from '../../src/interfaces/http/index.js';
import { createProductionTwilioPstnStack } from '../../src/interfaces/telephony/create-twilio-pstn-stack.js';
import { DemoAuthGateway } from '../../src/infrastructure/auth/index.js';
import { ScriptedLiveVoiceProvider } from '../../src/infrastructure/voice/index.js';
import { InMemoryWorkingMemory } from '../../src/infrastructure/memory/index.js';
import { InMemoryPrincipalPatientDirectory } from '../../src/infrastructure/memory/clinic/principal-patient-directory.js';
import { createAgentTestWorld } from '../helpers/agent-world.js';
import { ScriptedChatModel } from '../helpers/scripted-chat-model.js';
import { createTestJwtFixture } from '../helpers/jwt-fixture.js';
import {
  InMemoryConversationRegistry,
  ToolLoopAgent,
  createClinicTools,
  createToolRegistry,
} from '../../src/agent/index.js';
import { ResolveClinicActor } from '../../src/application/identity/resolve-clinic-actor.js';
import { LinkPrincipalToPatient } from '../../src/application/identity/link-principal-to-patient.js';
import { EnrollAuthenticatedPatient } from '../../src/application/identity/enroll-authenticated-patient.js';
import request from 'supertest';

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

describe('Production config gate', () => {
  it('loads when APP_MODE=production and required env present', () => {
    const config = loadProductionConfig({ ...baseProdEnv });
    expect(config.appMode).toBe('production');
    expect(config.postgres.databaseUrl).toContain('postgresql://');
    expect(config.redis.redisUrl).toContain('redis://');
  });

  it('fails closed without APP_MODE=production', () => {
    expect(() =>
      loadProductionConfig({
        ...baseProdEnv,
        APP_MODE: undefined,
      }),
    ).toThrow();
  });

  it('refuses demo markers', () => {
    expect(() =>
      loadProductionConfig({
        ...baseProdEnv,
        DEMO_AUTH: 'true',
      }),
    ).toThrow(/demo/i);
  });

  it('requires explicit REDIS_URL', () => {
    expect(() =>
      loadProductionConfig({
        ...baseProdEnv,
        REDIS_URL: '',
      }),
    ).toThrow(/REDIS_URL/);
  });

  it('requires AUTH_*', () => {
    expect(() =>
      loadProductionConfig({
        ...baseProdEnv,
        AUTH_ISSUER: undefined,
      }),
    ).toThrow();
  });

  it('refuses EMBEDDING_MODE=deterministic', () => {
    expect(() =>
      loadProductionConfig({
        ...baseProdEnv,
        EMBEDDING_MODE: 'deterministic',
      }),
    ).toThrow(/deterministic/i);
  });

  it('requires embedding API key', () => {
    expect(() =>
      loadProductionConfig({
        ...baseProdEnv,
        EMBEDDING_API_KEY: undefined,
        OPENROUTER_API_KEY: undefined,
      }),
    ).toThrow(/EMBEDDING_API_KEY|OPENROUTER_API_KEY/);
  });
});

describe('Production runtime refuses demo auth', () => {
  it('createProductionHttpApp rejects demo AuthGateway', async () => {
    const ctx = createAgentTestWorld();
    await ctx.world.seed();
    const demo = new DemoAuthGateway();
    const principalPatients = new InMemoryPrincipalPatientDirectory();
    const resolveClinicActor = new ResolveClinicActor(principalPatients);
    const link = new LinkPrincipalToPatient(
      principalPatients,
      ctx.world.patients,
    );
    const enroll = new EnrollAuthenticatedPatient(
      ctx.useCases.registerPatient,
      link,
      principalPatients,
    );
    const conversations = new InMemoryConversationRegistry();
    const agent = new ToolLoopAgent(
      new ScriptedChatModel(),
      createToolRegistry(createClinicTools(ctx.useCases)),
      new InMemoryWorkingMemory(),
    );

    expect(() =>
      createProductionHttpApp({
        agent,
        conversations,
        authGateway: demo,
        resolveClinicActor,
        enrollAuthenticatedPatient: enroll,
        linkPrincipalToPatient: link,
        health: { check: async () => [] },
      }),
    ).toThrow(/demo/i);
  });

  it('createProductionTwilioPstnStack rejects demo AuthGateway', () => {
    const ctx = createAgentTestWorld();
    expect(() =>
      createProductionTwilioPstnStack({
        mode: 'production',
        config: {
          authToken: 'test-token',
          voiceWebhookUrl: 'https://example.com/v1/twilio/voice',
          mediaStreamWsUrl: 'wss://example.com/v1/twilio/media',
        },
        authGateway: new DemoAuthGateway(),
        voiceProvider: new ScriptedLiveVoiceProvider(),
        useCases: ctx.useCases,
        principalPatients: new InMemoryPrincipalPatientDirectory(),
        workingMemory: new InMemoryWorkingMemory(),
      }),
    ).toThrow(/demo/i);
  });

  it('createProductionTwilioPstnStack accepts production JWT gateway', async () => {
    const ctx = createAgentTestWorld();
    await ctx.world.seed();
    const jwt = await createTestJwtFixture();
    const stack = createProductionTwilioPstnStack({
      mode: 'production',
      config: {
        authToken: 'test-token',
        voiceWebhookUrl: 'https://example.com/v1/twilio/voice',
        mediaStreamWsUrl: 'wss://example.com/v1/twilio/media',
      },
      authGateway: jwt.gateway,
      voiceProvider: new ScriptedLiveVoiceProvider(),
      useCases: ctx.useCases,
      principalPatients: new InMemoryPrincipalPatientDirectory(),
      workingMemory: new InMemoryWorkingMemory(),
    });
    expect(stack.twilioRouter).toBeDefined();
    expect(stack.voiceSession).toBeDefined();
  });
});

describe('Production health endpoints', () => {
  it('reports liveness and readiness from probes', async () => {
    const jwt = await createTestJwtFixture();
    const ctx = createAgentTestWorld();
    await ctx.world.seed();
    const principalPatients = new InMemoryPrincipalPatientDirectory();
    const resolveClinicActor = new ResolveClinicActor(principalPatients);
    const link = new LinkPrincipalToPatient(
      principalPatients,
      ctx.world.patients,
    );
    const enroll = new EnrollAuthenticatedPatient(
      ctx.useCases.registerPatient,
      link,
      principalPatients,
    );
    const conversations = new InMemoryConversationRegistry();
    const agent = new ToolLoopAgent(
      new ScriptedChatModel(),
      createToolRegistry(createClinicTools(ctx.useCases)),
      new InMemoryWorkingMemory(),
    );

    const app = createProductionHttpApp({
      agent,
      conversations,
      authGateway: jwt.gateway,
      resolveClinicActor,
      enrollAuthenticatedPatient: enroll,
      linkPrincipalToPatient: link,
      health: {
        check: async () => [
          { name: 'postgres', required: true, ok: true },
          { name: 'redis', required: true, ok: true },
          { name: 'qdrant', required: false, ok: false, detail: 'down' },
        ],
      },
    });

    const live = await request(app).get('/health');
    expect(live.status).toBe(200);
    expect(live.body.status).toBe('ok');

    const ready = await request(app).get('/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.status).toBe('ready');
    expect(ready.body.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'qdrant', ok: false }),
      ]),
    );
  });

  it('readiness fails when required probe fails', async () => {
    const jwt = await createTestJwtFixture();
    const ctx = createAgentTestWorld();
    await ctx.world.seed();
    const principalPatients = new InMemoryPrincipalPatientDirectory();
    const resolveClinicActor = new ResolveClinicActor(principalPatients);
    const link = new LinkPrincipalToPatient(
      principalPatients,
      ctx.world.patients,
    );
    const enroll = new EnrollAuthenticatedPatient(
      ctx.useCases.registerPatient,
      link,
      principalPatients,
    );

    const app = createProductionHttpApp({
      agent: new ToolLoopAgent(
        new ScriptedChatModel(),
        createToolRegistry(createClinicTools(ctx.useCases)),
        new InMemoryWorkingMemory(),
      ),
      conversations: new InMemoryConversationRegistry(),
      authGateway: jwt.gateway,
      resolveClinicActor,
      enrollAuthenticatedPatient: enroll,
      linkPrincipalToPatient: link,
      health: {
        check: async () => [
          { name: 'postgres', required: true, ok: false, detail: 'down' },
        ],
      },
    });

    const ready = await request(app).get('/ready');
    expect(ready.status).toBe(503);
    expect(ready.body.status).toBe('not_ready');
  });
});
