import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createProductionChatStack } from '../../src/interfaces/http/create-chat-stack.js';
import { createAgentTestWorld, type AgentTestWorld } from '../helpers/agent-world.js';
import { ScriptedChatModel } from '../helpers/scripted-chat-model.js';
import {
  createTestJwtFixture,
  type TestJwtFixture,
} from '../helpers/jwt-fixture.js';
import { InMemoryWorkingMemory } from '../../src/infrastructure/memory/index.js';
import { DemoAuthGateway } from '../../src/infrastructure/auth/index.js';

describe('HTTP production auth', () => {
  let ctx: AgentTestWorld;
  let chat: ScriptedChatModel;
  let fixture: TestJwtFixture;
  let app: ReturnType<typeof createProductionChatStack>['app'];

  beforeAll(async () => {
    fixture = await createTestJwtFixture();
  });

  beforeEach(async () => {
    chat = new ScriptedChatModel();
    ctx = createAgentTestWorld(chat);
    await ctx.world.seed();
    const stack = createProductionChatStack({
      mode: 'production',
      authGateway: fixture.gateway,
      useCases: ctx.useCases,
      chatModel: chat,
      patients: ctx.world.patients,
      principalPatients: ctx.principalPatients,
      workingMemory: new InMemoryWorkingMemory(),
    });
    app = stack.app;
  });

  it('refuses to compose with DemoAuthGateway', () => {
    expect(() =>
      createProductionChatStack({
        mode: 'production',
        authGateway: new DemoAuthGateway(),
        useCases: ctx.useCases,
        chatModel: chat,
        patients: ctx.world.patients,
        principalPatients: ctx.principalPatients,
        workingMemory: new InMemoryWorkingMemory(),
      }),
    ).toThrow(/cannot use demo auth/i);
  });

  it('allows anonymous discovery without Authorization', async () => {
    const created = await request(app).post('/v1/conversations').send();
    chat.enqueue(
      {
        toolCalls: [
          { id: '1', name: 'search_doctors', arguments: { query: 'cardio' } },
        ],
      },
      { content: 'Here are doctors.' },
    );

    const res = await request(app)
      .post('/v1/chat')
      .set('x-conversation-id', created.body.conversationId)
      .send({ message: 'Find a cardiologist' });

    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(false);
    expect(created.body.identityMode).toBe('production');
  });

  it('returns 401 for malformed Bearer on chat', async () => {
    const created = await request(app).post('/v1/conversations').send();
    const res = await request(app)
      .post('/v1/chat')
      .set('x-conversation-id', created.body.conversationId)
      .set('Authorization', 'Bearer not-valid')
      .send({ message: 'hi' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_AUTH_CREDENTIALS');
  });

  it('enroll requires auth and auto-links new patient', async () => {
    const missing = await request(app)
      .post('/v1/enroll')
      .send({ phoneNumber: '+201011118001', fullName: 'A' });
    expect(missing.status).toBe(401);

    const token = await fixture.signAccessToken({ subject: 'enroll-sub' });
    const res = await request(app)
      .post('/v1/enroll')
      .set('Authorization', `Bearer ${token}`)
      .send({ phoneNumber: '+201011118001', fullName: 'Enrolled' });

    expect(res.status).toBe(201);
    expect(res.body.linked).toBe(true);
    expect(res.body.patientId).toBeTruthy();

    chat.enqueue(
      {
        toolCalls: [{ id: '1', name: 'get_patient_profile', arguments: {} }],
      },
      { content: 'Here is your profile.' },
    );
    const created = await request(app).post('/v1/conversations').send();
    const chatRes = await request(app)
      .post('/v1/chat')
      .set('x-conversation-id', created.body.conversationId)
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'My profile' });

    expect(chatRes.status).toBe(200);
    expect(chatRes.body.authenticated).toBe(true);
    expect(chatRes.body.toolsInvoked).toContain('get_patient_profile');
  });

  it('conversationId alone never authenticates', async () => {
    const token = await fixture.signAccessToken({ subject: 'convo-sub' });
    await request(app)
      .post('/v1/enroll')
      .set('Authorization', `Bearer ${token}`)
      .send({ phoneNumber: '+201011118002', fullName: 'C' });

    const created = await request(app).post('/v1/conversations').send();
    chat.enqueue(
      {
        toolCalls: [{ id: '1', name: 'get_patient_profile', arguments: {} }],
      },
      { content: 'Need auth.' },
    );

    const res = await request(app)
      .post('/v1/chat')
      .set('x-conversation-id', created.body.conversationId)
      .send({ message: 'profile' });

    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(false);
  });

  it('does not accept x-demo-subject in production', async () => {
    const created = await request(app).post('/v1/conversations').send();
    chat.enqueue({ content: 'anon' });
    const res = await request(app)
      .post('/v1/chat')
      .set('x-conversation-id', created.body.conversationId)
      .set('x-demo-subject', 'spoofed')
      .send({ message: 'hi' });
    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(false);
  });

  it('explicit link endpoint links existing patient', async () => {
    const registered = await ctx.useCases.registerPatient.execute({
      phoneNumber: '+201011118003',
      fullName: 'Linked',
    });
    const token = await fixture.signAccessToken({ subject: 'link-sub' });

    const linkRes = await request(app)
      .post('/v1/identity/link')
      .set('Authorization', `Bearer ${token}`)
      .send({ patientId: registered.patient.id });
    expect(linkRes.status).toBe(204);

    chat.enqueue(
      {
        toolCalls: [{ id: '1', name: 'get_patient_profile', arguments: {} }],
      },
      { content: 'ok' },
    );
    const created = await request(app).post('/v1/conversations').send();
    const chatRes = await request(app)
      .post('/v1/chat')
      .set('x-conversation-id', created.body.conversationId)
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'profile' });
    expect(chatRes.body.authenticated).toBe(true);
  });
});
