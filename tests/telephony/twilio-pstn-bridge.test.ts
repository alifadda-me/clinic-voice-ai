import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createHmac } from 'node:crypto';
import { createTwilioPstnStack } from '../../src/interfaces/telephony/create-twilio-pstn-stack.js';
import { createAgentTestWorld, type AgentTestWorld } from '../helpers/agent-world.js';
import { ScriptedLiveVoiceProvider } from '../../src/infrastructure/voice/scripted/scripted-live-voice-provider.js';
import { InMemoryObservability } from '../../src/infrastructure/memory/index.js';
import { errorMiddleware } from '../../src/interfaces/http/map-error.js';
import { AppointmentStatuses } from '../../src/domain/index.js';
import type { ObservabilityPort, ObservabilitySpan } from '../../src/ports/platform/observability.js';

const AUTH_TOKEN = 'twilio_test_token';
const WEBHOOK_URL = 'https://clinic.test/v1/twilio/voice';

function sign(params: Record<string, string>): string {
  const paramString = Object.keys(params)
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join('');
  return createHmac('sha1', AUTH_TOKEN)
    .update(`${WEBHOOK_URL}${paramString}`)
    .digest('base64');
}

describe('Twilio PSTN bridge', () => {
  let ctx: AgentTestWorld;
  let voice: ScriptedLiveVoiceProvider;
  let obs: InMemoryObservability;
  let stack: ReturnType<typeof createTwilioPstnStack>;
  let app: express.Express;

  beforeEach(async () => {
    ctx = createAgentTestWorld();
    await ctx.world.seed();
    voice = new ScriptedLiveVoiceProvider();
    obs = new InMemoryObservability();
    stack = createTwilioPstnStack({
      config: {
        authToken: AUTH_TOKEN,
        voiceWebhookUrl: WEBHOOK_URL,
        mediaStreamWsUrl: 'wss://clinic.test/v1/twilio/media',
      },
      authGateway: ctx.authGateway,
      voiceProvider: voice,
      useCases: ctx.useCases,
      principalPatients: ctx.principalPatients,
      workingMemory: ctx.workingMemory,
      observability: obs,
    });
    app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use('/v1', stack.twilioRouter);
    app.use(errorMiddleware);
  });

  it('HTTP webhook returns TwiML when signature is valid', async () => {
    const params = { CallSid: 'CA_HTTP', From: '+15551212' };
    const res = await request(app)
      .post('/v1/twilio/voice')
      .set('x-twilio-signature', sign(params))
      .type('form')
      .send(params);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/xml/);
    expect(res.text).toContain('<Stream');
  });

  it('HTTP webhook rejects invalid signature with 403', async () => {
    const res = await request(app)
      .post('/v1/twilio/voice')
      .set('x-twilio-signature', 'invalid')
      .type('form')
      .send({ CallSid: 'CA_BAD', From: '+15551212' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TWILIO_SIGNATURE_INVALID');
  });

  it('caller ID alone never authenticates (adversarial)', async () => {
    await ctx.authenticateAs({
      subjectId: 'real-sub',
      phoneNumber: '+15551212',
      fullName: 'Victim',
    });

    voice.enqueue({
      type: 'toolCall',
      call: { id: '1', name: 'get_patient_profile', arguments: {} },
    });

    const active = await stack.callBridge.handleMediaEvent({
      type: 'start',
      callSid: 'CA_SPOOF',
      streamSid: 'MZ1',
      callerIdClaim: '+15551212',
    });

    expect(active?.execution.channel).toBe('twilio_voice');
    expect(active?.execution.actor).toBeNull();
    expect(active?.callerIdClaim).toBe('+15551212');

    await new Promise((r) => setTimeout(r, 30));
    const tool = obs.traces
      .flatMap((t) => t.children)
      .find((c) => c.name === 'voice.tool.dispatch');
    expect(tool?.attributes.error_code).toBe('PATIENT_NOT_IDENTIFIED');
  });

  it('anonymous caller may search doctors', async () => {
    voice.enqueue({
      type: 'toolCall',
      call: {
        id: '1',
        name: 'search_doctors',
        arguments: { query: 'cardio' },
      },
    });

    const active = await stack.callBridge.handleMediaEvent({
      type: 'start',
      callSid: 'CA_ANON',
      streamSid: 'MZ2',
      callerIdClaim: '+15559999',
    });
    expect(active?.execution.actor).toBeNull();
    await new Promise((r) => setTimeout(r, 30));
    const tool = obs.traces
      .flatMap((t) => t.children)
      .find((c) => c.name === 'voice.tool.dispatch');
    expect(tool?.attributes.tool_ok).toBe(true);
  });

  it('explicit AuthGateway credentials yield trusted actor (not From=)', async () => {
    const { patientId } = await ctx.authenticateAs({
      subjectId: 'twilio-user',
      phoneNumber: '+15553333',
      fullName: 'Auth User',
    });

    voice.enqueue({
      type: 'toolCall',
      call: { id: '1', name: 'get_patient_profile', arguments: {} },
    });

    const active = await stack.callBridge.handleMediaEvent(
      {
        type: 'start',
        callSid: 'CA_AUTH',
        streamSid: 'MZ3',
        callerIdClaim: '+19999999',
      },
      { credentials: { demoSubject: 'twilio-user' } },
    );

    expect(active?.execution.actor?.patientId).toBe(patientId);
    expect(active?.callerIdClaim).toBe('+19999999');
    await new Promise((r) => setTimeout(r, 30));
    expect(
      obs.traces
        .flatMap((t) => t.children)
        .find((c) => c.name === 'voice.tool.dispatch')?.attributes.tool_ok,
    ).toBe(true);
  });

  it('denies cross-patient cancel over Twilio voice path', async () => {
    const seed = await ctx.world.seed();
    await ctx.authenticateAs({
      subjectId: 'twilio-a',
      phoneNumber: '+15554441',
      fullName: 'A',
    });
    const other = await ctx.useCases.registerPatient.execute({
      phoneNumber: '+15554442',
      fullName: 'B',
    });
    const appt = await ctx.useCases.bookAppointment.execute({
      patientId: other.patient.id,
      doctorId: seed.drSara.id,
      start: '2026-08-25T10:00:00.000Z',
      end: '2026-08-25T10:30:00.000Z',
    });

    voice.enqueue({
      type: 'toolCall',
      call: {
        id: '1',
        name: 'cancel_appointment',
        arguments: { appointmentId: appt.id },
      },
    });

    await stack.callBridge.handleMediaEvent(
      { type: 'start', callSid: 'CA_OWN', streamSid: 'MZ4' },
      { credentials: { demoSubject: 'twilio-a' } },
    );
    await new Promise((r) => setTimeout(r, 30));

    const still = await ctx.world.appointments.findById(appt.id);
    expect(still?.status).toBe(AppointmentStatuses.Scheduled);
  });

  it('transport failure / stop does not invent clinic patients', async () => {
    voice.setUnavailable(true);
    await expect(
      stack.callBridge.handleMediaEvent({
        type: 'start',
        callSid: 'CA_FAIL',
        streamSid: 'MZ5',
      }),
    ).rejects.toThrow();

    expect(
      await ctx.world.patients.findByPhoneNumber('+15550000'),
    ).toBeNull();
  });

  it('media stop closes live session without clinic mutation', async () => {
    const active = await stack.callBridge.handleMediaEvent({
      type: 'start',
      callSid: 'CA_STOP',
      streamSid: 'MZ6',
    });
    expect(active).toBeTruthy();
    await stack.callBridge.handleMediaEvent({
      type: 'stop',
      callSid: 'CA_STOP',
    });
    expect(stack.callBridge.getActiveCall('CA_STOP')).toBeUndefined();
  });

  it('observability failure remains fail-open on Twilio bridge', async () => {
    const exploding: ObservabilityPort = {
      startTrace(): ObservabilitySpan {
        throw new Error('obs down');
      },
      async recordScore() {
        throw new Error('obs down');
      },
      async recordEvent() {
        throw new Error('obs down');
      },
    };

    const local = createTwilioPstnStack({
      config: {
        authToken: AUTH_TOKEN,
        voiceWebhookUrl: WEBHOOK_URL,
        mediaStreamWsUrl: 'wss://clinic.test/v1/twilio/media',
      },
      authGateway: ctx.authGateway,
      voiceProvider: new ScriptedLiveVoiceProvider(),
      useCases: ctx.useCases,
      principalPatients: ctx.principalPatients,
      workingMemory: ctx.workingMemory,
      observability: exploding,
    });

    await expect(
      local.callBridge.handleMediaEvent({
        type: 'start',
        callSid: 'CA_OBS',
        streamSid: 'MZ7',
      }),
    ).resolves.toMatchObject({
      execution: { channel: 'twilio_voice' },
    });
  });
});
