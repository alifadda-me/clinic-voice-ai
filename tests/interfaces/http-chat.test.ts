import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDemoChatStack } from '../../src/interfaces/http/create-chat-stack.js';
import { createAgentTestWorld, type AgentTestWorld } from '../helpers/agent-world.js';
import { ScriptedChatModel } from '../helpers/scripted-chat-model.js';

describe('HTTP chat interface', () => {
  let ctx: AgentTestWorld;
  let chat: ScriptedChatModel;
  let app: ReturnType<typeof createDemoChatStack>['app'];

  beforeEach(async () => {
    chat = new ScriptedChatModel();
    ctx = createAgentTestWorld(chat);
    await ctx.world.seed();
    const stack = createDemoChatStack({
      mode: 'demo',
      useCases: ctx.useCases,
      chatModel: chat,
      patients: ctx.world.patients,
      workingMemory: ctx.workingMemory,
      principalPatients: ctx.principalPatients,
      authGateway: ctx.authGateway,
    });
    app = stack.app;
  });

  it('creates a conversation (demo identity mode)', async () => {
    const res = await request(app).post('/v1/conversations').send();
    expect(res.status).toBe(201);
    expect(typeof res.body.conversationId).toBe('string');
    expect(res.body.identityMode).toBe('demo');
  });

  it('requires conversation id for chat', async () => {
    const res = await request(app).post('/v1/chat').send({ message: 'hello' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CONVERSATION_REQUIRED');
  });

  it('allows anonymous chat for discovery', async () => {
    const created = await request(app).post('/v1/conversations').send();
    const conversationId = created.body.conversationId as string;
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
      .set('x-conversation-id', conversationId)
      .send({ message: 'Find a cardiologist' });

    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(false);
    expect(res.body.toolsInvoked).toContain('search_doctors');
  });

  it('rejects private context for anonymous users via tools', async () => {
    const created = await request(app).post('/v1/conversations').send();
    chat.enqueue(
      {
        toolCalls: [{ id: '1', name: 'get_patient_context', arguments: {} }],
      },
      { content: 'You need to authenticate first.' },
    );
    const res = await request(app)
      .post('/v1/chat')
      .set('x-conversation-id', created.body.conversationId)
      .send({ message: 'Show my context' });
    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(false);
    expect(res.body.toolsInvoked).toEqual(['get_patient_context']);
  });

  it('authenticates via x-demo-subject when principal is linked', async () => {
    await ctx.authenticateAs({
      subjectId: 'demo-ali',
      phoneNumber: '+201011112222',
      fullName: 'Ali',
    });
    const created = await request(app).post('/v1/conversations').send();
    chat.enqueue(
      {
        toolCalls: [{ id: '1', name: 'get_patient_profile', arguments: {} }],
      },
      { content: 'Here is your profile.' },
    );
    const res = await request(app)
      .post('/v1/chat')
      .set('x-conversation-id', created.body.conversationId)
      .set('x-demo-subject', 'demo-ali')
      .send({ message: 'My profile' });
    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(true);
  });

  it('maps unknown conversation to 404', async () => {
    const res = await request(app)
      .post('/v1/chat')
      .set('x-conversation-id', 'missing')
      .send({ message: 'Hello' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CONVERSATION_NOT_FOUND');
  });

  it('accepts legacy x-session-id as conversation correlation only', async () => {
    const created = await request(app).post('/v1/sessions').send();
    chat.enqueue({ content: 'Welcome.' });
    const res = await request(app)
      .post('/v1/chat')
      .set('x-session-id', created.body.sessionId)
      .send({ message: 'Hello' });
    expect(res.status).toBe(200);
    expect(res.body.reply).toBe('Welcome.');
  });
});
