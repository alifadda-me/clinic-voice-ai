import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import request from 'supertest';
import { createHmac, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  AppointmentStatuses,
  Doctor,
  TimeSlot,
} from '../../../src/domain/index.js';
import { TimeSlotUnavailableError } from '../../../src/application/shared/errors.js';
import { KnowledgeGraphUnavailableError } from '../../../src/ports/platform/knowledge-graph.js';
import { sanitizeTraceAttributes } from '../../../src/ports/platform/trace-attributes.js';
import type {
  ObservabilityPort,
  ObservabilitySpan,
} from '../../../src/ports/platform/observability.js';
import {
  canReachProductionTestDependencies,
  createProductionTestHarness,
  uniquePhone,
  type ClinicSeed,
  type ProductionTestHarness,
} from '../../helpers/production-runtime-harness.js';

const TWILIO_WEBHOOK_URL = 'https://clinic.test/v1/twilio/voice';

function twilioSign(
  authToken: string,
  params: Record<string, string>,
): string {
  const paramString = Object.keys(params)
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join('');
  return createHmac('sha1', authToken)
    .update(`${TWILIO_WEBHOOK_URL}${paramString}`)
    .digest('base64');
}

function explodingObservability(): ObservabilityPort {
  return {
    startTrace(): ObservabilitySpan {
      throw new Error('opik down — must not fail clinic ops');
    },
    async recordScore() {
      throw new Error('opik down');
    },
    async recordEvent() {
      throw new Error('opik down');
    },
  };
}

describe('Production e2e', () => {
  let depsAvailable = false;
  let harness: ProductionTestHarness;
  let seed: ClinicSeed;

  beforeAll(async () => {
    depsAvailable = await canReachProductionTestDependencies();
    if (!depsAvailable) {
      console.warn(
        '[production] Skipping production e2e — PostgreSQL/Redis not reachable. Run: docker compose up -d postgres redis',
      );
      return;
    }
    harness = await createProductionTestHarness();
  }, 60_000);

  afterAll(async () => {
    if (depsAvailable && harness) {
      await harness.close();
    }
  });

  beforeEach(async () => {
    if (!depsAvailable) return;
    await harness.resetDb();
    seed = await harness.seedClinicData();
    harness.voice.clearQueue();
  });

  it('health: GET /health 200; GET /ready requires postgres+redis', async ({
    skip,
  }) => {
    if (!depsAvailable) return skip();
    const live = await request(harness.runtime.app).get('/health');
    expect(live.status).toBe(200);
    expect(live.body.status).toBe('ok');

    const ready = await request(harness.runtime.app).get('/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.status).toBe('ready');
    expect(ready.body.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'postgres', required: true, ok: true }),
        expect.objectContaining({ name: 'redis', required: true, ok: true }),
      ]),
    );
  });

  it('anonymous discovery: search_doctors / get_available without Bearer', async ({
    skip,
  }) => {
    if (!depsAvailable) return skip();
    const created = await request(harness.runtime.app)
      .post('/v1/conversations')
      .send();
    expect(created.status).toBe(201);

    harness.chat.enqueue(
      {
        toolCalls: [
          {
            id: '1',
            name: 'search_doctors',
            arguments: { query: 'cardiology' },
          },
        ],
      },
      { content: 'Found cardiologists.' },
    );

    const search = await request(harness.runtime.app)
      .post('/v1/chat')
      .set('x-conversation-id', created.body.conversationId)
      .send({ message: 'Find a cardiologist' });

    expect(search.status).toBe(200);
    expect(search.body.authenticated).toBe(false);
    expect(search.body.toolsInvoked).toContain('search_doctors');

    harness.chat.enqueue(
      {
        toolCalls: [
          {
            id: '2',
            name: 'get_available_appointments',
            arguments: {
              doctorId: seed.drSara.id,
              from: '2026-08-25T08:00:00.000Z',
              to: '2026-08-25T18:00:00.000Z',
            },
          },
        ],
      },
      { content: 'Here are slots.' },
    );

    const avail = await request(harness.runtime.app)
      .post('/v1/chat')
      .set('x-conversation-id', created.body.conversationId)
      .send({ message: 'When is she free?' });

    expect(avail.status).toBe(200);
    expect(avail.body.authenticated).toBe(false);
    expect(avail.body.toolsInvoked).toContain('get_available_appointments');
  });

  it('authenticated HTTP: enroll → book → cancel own appointment', async ({
    skip,
  }) => {
    if (!depsAvailable) return skip();
    const token = await harness.jwt.signAccessToken({
      subject: 'prod-book-sub',
    });
    const enroll = await request(harness.runtime.app)
      .post('/v1/enroll')
      .set('Authorization', `Bearer ${token}`)
      .send({ phoneNumber: uniquePhone('book'), fullName: 'Booker' });
    expect(enroll.status).toBe(201);
    expect(enroll.body.linked).toBe(true);
    const patientId = enroll.body.patientId as string;

    const created = await request(harness.runtime.app)
      .post('/v1/conversations')
      .send();

    harness.chat.enqueue(
      {
        toolCalls: [
          {
            id: '1',
            name: 'book_appointment',
            arguments: {
              doctorId: seed.drSara.id,
              start: '2026-08-25T10:00:00.000Z',
              end: '2026-08-25T10:30:00.000Z',
            },
          },
        ],
      },
      { content: 'Booked.' },
    );

    const bookRes = await request(harness.runtime.app)
      .post('/v1/chat')
      .set('x-conversation-id', created.body.conversationId)
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Book Sara Tuesday 10am' });

    expect(bookRes.status).toBe(200);
    expect(bookRes.body.authenticated).toBe(true);
    expect(bookRes.body.toolsInvoked).toContain('book_appointment');

    const appts = await harness.runtime.infra.repositories.appointments.findMany(
      {},
    );
    expect(appts).toHaveLength(1);
    expect(appts[0]?.patientId).toBe(patientId);
    const appointmentId = appts[0]!.id;

    harness.chat.enqueue(
      {
        toolCalls: [
          {
            id: '2',
            name: 'cancel_appointment',
            arguments: { appointmentId },
          },
        ],
      },
      { content: 'Cancelled.' },
    );

    const cancelRes = await request(harness.runtime.app)
      .post('/v1/chat')
      .set('x-conversation-id', created.body.conversationId)
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Cancel that appointment' });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.toolsInvoked).toContain('cancel_appointment');
    const cancelled =
      await harness.runtime.infra.repositories.appointments.findById(
        appointmentId,
      );
    expect(cancelled?.status).toBe(AppointmentStatuses.Cancelled);
  });

  it('invalid JWT → 401 on enroll/chat', async ({ skip }) => {
    if (!depsAvailable) return skip();
    const enroll = await request(harness.runtime.app)
      .post('/v1/enroll')
      .set('Authorization', 'Bearer not-a-valid-jwt')
      .send({ phoneNumber: uniquePhone('bad'), fullName: 'Bad' });
    expect(enroll.status).toBe(401);
    expect(enroll.body.error.code).toBe('INVALID_AUTH_CREDENTIALS');

    const created = await request(harness.runtime.app)
      .post('/v1/conversations')
      .send();
    const chat = await request(harness.runtime.app)
      .post('/v1/chat')
      .set('x-conversation-id', created.body.conversationId)
      .set('Authorization', 'Bearer also-invalid')
      .send({ message: 'hi' });
    expect(chat.status).toBe(401);
    expect(chat.body.error.code).toBe('INVALID_AUTH_CREDENTIALS');
    expect(JSON.stringify(chat.body)).not.toMatch(/jwks|stack|openssl/i);
  });

  it('stolen conversationId alone does not authenticate; book requires actor', async ({
    skip,
  }) => {
    if (!depsAvailable) return skip();
    const token = await harness.jwt.signAccessToken({
      subject: 'prod-stolen',
    });
    await request(harness.runtime.app)
      .post('/v1/enroll')
      .set('Authorization', `Bearer ${token}`)
      .send({ phoneNumber: uniquePhone('stolen'), fullName: 'Stolen' });

    const created = await request(harness.runtime.app)
      .post('/v1/conversations')
      .send();

    harness.chat.enqueue(
      {
        toolCalls: [
          {
            id: '1',
            name: 'book_appointment',
            arguments: {
              doctorId: seed.drSara.id,
              start: '2026-08-25T11:00:00.000Z',
              end: '2026-08-25T11:30:00.000Z',
            },
          },
        ],
      },
      { content: 'Need auth.' },
    );

    const res = await request(harness.runtime.app)
      .post('/v1/chat')
      .set('x-conversation-id', created.body.conversationId)
      .send({ message: 'Book without token' });

    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(false);
    const appts = await harness.runtime.infra.repositories.appointments.findMany(
      {},
    );
    expect(appts).toHaveLength(0);
  });

  it('forged patientId in tool args uses TrustedExecutionContext actor', async ({
    skip,
  }) => {
    if (!depsAvailable) return skip();
    const token = await harness.jwt.signAccessToken({
      subject: 'prod-forged',
    });
    const enroll = await request(harness.runtime.app)
      .post('/v1/enroll')
      .set('Authorization', `Bearer ${token}`)
      .send({ phoneNumber: uniquePhone('forged'), fullName: 'Trusted' });
    const patientId = enroll.body.patientId as string;

    const victim = await harness.runtime.useCases.registerPatient.execute({
      phoneNumber: uniquePhone('victim'),
      fullName: 'Victim',
    });

    const created = await request(harness.runtime.app)
      .post('/v1/conversations')
      .send();

    harness.chat.enqueue(
      {
        toolCalls: [
          {
            id: '1',
            name: 'book_appointment',
            arguments: {
              patientId: victim.patient.id,
              doctorId: seed.drSara.id,
              start: '2026-08-25T12:00:00.000Z',
              end: '2026-08-25T12:30:00.000Z',
            },
          },
        ],
      },
      { content: 'Booked for you.' },
    );

    const res = await request(harness.runtime.app)
      .post('/v1/chat')
      .set('x-conversation-id', created.body.conversationId)
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Book as victim' });

    expect(res.status).toBe(200);
    const appts = await harness.runtime.infra.repositories.appointments.findMany(
      {},
    );
    expect(appts).toHaveLength(1);
    expect(appts[0]?.patientId).toBe(patientId);
    expect(appts[0]?.patientId).not.toBe(victim.patient.id);
  });

  it('cross-patient cancel denied (ownership)', async ({ skip }) => {
    if (!depsAvailable) return skip();
    const tokenA = await harness.jwt.signAccessToken({ subject: 'prod-a' });
    const tokenB = await harness.jwt.signAccessToken({ subject: 'prod-b' });

    await request(harness.runtime.app)
      .post('/v1/enroll')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ phoneNumber: uniquePhone('a'), fullName: 'A' });
    const enrollB = await request(harness.runtime.app)
      .post('/v1/enroll')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ phoneNumber: uniquePhone('b'), fullName: 'B' });

    const appt = await harness.runtime.useCases.bookAppointment.execute({
      patientId: enrollB.body.patientId,
      doctorId: seed.drSara.id,
      start: '2026-08-25T13:00:00.000Z',
      end: '2026-08-25T13:30:00.000Z',
    });

    const created = await request(harness.runtime.app)
      .post('/v1/conversations')
      .send();
    harness.chat.enqueue(
      {
        toolCalls: [
          {
            id: '1',
            name: 'cancel_appointment',
            arguments: { appointmentId: appt.id },
          },
        ],
      },
      { content: 'Cannot cancel.' },
    );

    const res = await request(harness.runtime.app)
      .post('/v1/chat')
      .set('x-conversation-id', created.body.conversationId)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: 'Cancel B appointment' });

    expect(res.status).toBe(200);
    const still =
      await harness.runtime.infra.repositories.appointments.findById(appt.id);
    expect(still?.status).toBe(AppointmentStatuses.Scheduled);
  });

  it('voice authenticated path uses actor; channel voice', async ({ skip }) => {
    if (!depsAvailable) return skip();
    const token = await harness.jwt.signAccessToken({
      subject: 'prod-voice',
    });
    const enroll = await request(harness.runtime.app)
      .post('/v1/enroll')
      .set('Authorization', `Bearer ${token}`)
      .send({ phoneNumber: uniquePhone('voice'), fullName: 'Voice' });
    const patientId = enroll.body.patientId as string;

    harness.voice.enqueue({
      type: 'toolCall',
      call: {
        id: '1',
        name: 'book_appointment',
        arguments: {
          patientId: 'forged-voice-victim',
          doctorId: seed.drSara.id,
          start: '2026-08-25T14:00:00.000Z',
          end: '2026-08-25T14:30:00.000Z',
        },
      },
    });

    const started = await harness.runtime.voiceStack!.voiceSession.start({
      conversationId: randomUUID(),
      credentials: { authorizationHeader: `Bearer ${token}` },
    });

    expect(started.execution.channel).toBe('voice');
    expect(started.execution.actor?.patientId).toBe(patientId);

    await new Promise((r) => setTimeout(r, 40));

    const appts = await harness.runtime.infra.repositories.appointments.findMany(
      {},
    );
    expect(appts).toHaveLength(1);
    expect(appts[0]?.patientId).toBe(patientId);
  });

  it('Twilio: From phone ≠ patientId; anonymous by default; credentials authenticate', async ({
    skip,
  }) => {
    if (!depsAvailable) return skip();
    expect(harness.runtime.twilioStack).toBeDefined();
    const authToken = harness.env.TWILIO_AUTH_TOKEN!;

    const params = { CallSid: 'CA_PROD_ANON', From: '+15551212' };
    const webhook = await request(harness.runtime.app)
      .post('/v1/twilio/voice')
      .set('x-twilio-signature', twilioSign(authToken, params))
      .type('form')
      .send(params);
    expect(webhook.status).toBe(200);
    expect(webhook.text).toContain('<Stream');

    await harness.runtime.useCases.registerPatient.execute({
      phoneNumber: '+15551212',
      fullName: 'Caller Claim Victim',
    });

    harness.voice.enqueue({
      type: 'toolCall',
      call: { id: '1', name: 'get_patient_profile', arguments: {} },
    });

    const anon = await harness.runtime.twilioStack!.callBridge.handleMediaEvent({
      type: 'start',
      callSid: 'CA_PROD_FROM',
      streamSid: 'MZ_PROD_1',
      callerIdClaim: '+15551212',
    });
    expect(anon?.execution.channel).toBe('twilio_voice');
    expect(anon?.execution.actor).toBeNull();
    expect(anon?.callerIdClaim).toBe('+15551212');
    await new Promise((r) => setTimeout(r, 40));

    const token = await harness.jwt.signAccessToken({
      subject: 'prod-twilio-auth',
    });
    const enroll = await request(harness.runtime.app)
      .post('/v1/enroll')
      .set('Authorization', `Bearer ${token}`)
      .send({ phoneNumber: uniquePhone('twilio'), fullName: 'Twilio Auth' });

    harness.voice.enqueue({
      type: 'toolCall',
      call: { id: '2', name: 'get_patient_profile', arguments: {} },
    });

    const authed =
      await harness.runtime.twilioStack!.callBridge.handleMediaEvent(
        {
          type: 'start',
          callSid: 'CA_PROD_AUTH',
          streamSid: 'MZ_PROD_2',
          callerIdClaim: '+19999999',
        },
        { credentials: { authorizationHeader: `Bearer ${token}` } },
      );

    expect(authed?.execution.actor?.patientId).toBe(enroll.body.patientId);
    expect(authed?.callerIdClaim).toBe('+19999999');
    await new Promise((r) => setTimeout(r, 40));
  });

  it('Qdrant/InMemory rebuild: removed/inactive doctors not returned after hydrate', async ({
    skip,
  }) => {
    if (!depsAvailable) return skip();
    const before = await harness.runtime.useCases.searchDoctors.execute({
      query: 'cardiologist Hassan',
    });
    expect(before.doctors.some((d) => d.id === seed.drSara.id)).toBe(true);

    await harness.runtime.infra.repositories.doctors.save(
      Doctor.create({
        id: seed.drSara.id,
        clinicId: seed.clinicId,
        fullName: seed.drSara.fullName,
        specialtyIds: [...seed.drSara.specialtyIds],
        bio: seed.drSara.bio,
        calendarResourceId: seed.drSara.calendarResourceId,
        active: false,
      }),
    );
    await harness.runtime.rebuildDoctorSearchIndex();

    const afterInactive = await harness.runtime.useCases.searchDoctors.execute({
      query: 'cardiologist Hassan',
    });
    expect(afterInactive.doctors.some((d) => d.id === seed.drSara.id)).toBe(
      false,
    );

    await harness.runtime.infra.db.execute(
      sql`delete from doctor_specialties where doctor_id = ${seed.drOmar.id}`,
    );
    await harness.runtime.infra.db.execute(
      sql`delete from doctors where id = ${seed.drOmar.id}`,
    );
    await harness.runtime.rebuildDoctorSearchIndex();

    const afterDelete = await harness.runtime.useCases.searchDoctors.execute({
      query: 'dermatologist Omar',
    });
    expect(afterDelete.doctors.some((d) => d.id === seed.drOmar.id)).toBe(
      false,
    );
  });

  it('Neo4j/InMemory peer affinity: rebuild + suggest active only; unavailable does not fabricate', async ({
    skip,
  }) => {
    if (!depsAvailable) return skip();
    const patientA = await harness.runtime.useCases.registerPatient.execute({
      phoneNumber: uniquePhone('affA'),
      fullName: 'Affinity A',
    });
    const patientB = await harness.runtime.useCases.registerPatient.execute({
      phoneNumber: uniquePhone('affB'),
      fullName: 'Affinity B',
    });

    await harness.runtime.useCases.savePatientPreference.execute({
      patientId: patientA.patient.id,
      kind: 'specialty',
      value: 'Cardiology',
      specialtyId: seed.cardiology.id,
    });
    await harness.runtime.useCases.savePatientPreference.execute({
      patientId: patientB.patient.id,
      kind: 'specialty',
      value: 'Cardiology',
      specialtyId: seed.cardiology.id,
    });

    const visit = await harness.runtime.useCases.bookAppointment.execute({
      patientId: patientB.patient.id,
      doctorId: seed.drSara.id,
      start: '2026-08-25T09:00:00.000Z',
      end: '2026-08-25T09:30:00.000Z',
    });
    await harness.runtime.useCases.completeAppointment.execute({
      appointmentId: visit.id,
    });

    const rebuild = await harness.runtime.rebuildPatientAffinityGraph();
    expect(rebuild.relationCount).toBeGreaterThan(0);

    const suggest =
      await harness.runtime.useCases.suggestDoctorsFromPeerAffinity!.execute({
        patientId: patientA.patient.id,
      });
    expect(suggest.doctors.map((d) => d.id)).toContain(seed.drSara.id);

    harness.knowledgeGraph.setUnavailable(true);
    await expect(
      harness.runtime.useCases.suggestDoctorsFromPeerAffinity!.execute({
        patientId: patientA.patient.id,
      }),
    ).rejects.toBeInstanceOf(KnowledgeGraphUnavailableError);
  });

  it('Redis/WM orthogonal: booking use case succeeds without relying on WorkingMemory', async ({
    skip,
  }) => {
    if (!depsAvailable) return skip();
    const { patient } = await harness.runtime.useCases.registerPatient.execute({
      phoneNumber: uniquePhone('wm'),
      fullName: 'WM Independent',
    });

    // Missing session is fine — use case never touches WorkingMemory.
    const missing = await harness.runtime.workingMemory.getSession(
      'nonexistent-session-prod',
    );
    expect(missing).toBeNull();

    const appt = await harness.runtime.useCases.bookAppointment.execute({
      patientId: patient.id,
      doctorId: seed.drSara.id,
      start: '2026-08-26T10:00:00.000Z',
      end: '2026-08-26T10:30:00.000Z',
    });
    expect(appt.id).toBeTruthy();
    expect(appt.status).toBe(AppointmentStatuses.Scheduled);
  });

  it('Opik fail-open: exploding ObservabilityPort does not break chat', async ({
    skip,
  }) => {
    if (!depsAvailable) return skip();
    const local = await createProductionTestHarness({
      observability: explodingObservability(),
    });
    try {
      await local.resetDb();
      await local.seedClinicData();
      const created = await request(local.runtime.app)
        .post('/v1/conversations')
        .send();
      local.chat.enqueue({ content: 'Hello despite Opik down.' });
      const res = await request(local.runtime.app)
        .post('/v1/chat')
        .set('x-conversation-id', created.body.conversationId)
        .send({ message: 'hi' });
      expect(res.status).toBe(200);
      expect(res.body.reply).toMatch(/Hello despite Opik/i);
    } finally {
      await local.close();
    }
  });

  it('calendar compensation: booking fails when calendar slot already reserved', async ({
    skip,
  }) => {
    if (!depsAvailable) return skip();
    const { patient } = await harness.runtime.useCases.registerPatient.execute({
      phoneNumber: uniquePhone('cal'),
      fullName: 'Cal',
    });
    const slot = TimeSlot.create(
      new Date('2026-08-25T15:00:00.000Z'),
      new Date('2026-08-25T15:30:00.000Z'),
    );
    await harness.calendar.reserveSlot({
      resourceId: seed.drSara.schedulingResourceId(),
      slot,
      title: 'External hold',
    });

    await expect(
      harness.runtime.useCases.bookAppointment.execute({
        patientId: patient.id,
        doctorId: seed.drSara.id,
        start: '2026-08-25T15:00:00.000Z',
        end: '2026-08-25T15:30:00.000Z',
      }),
    ).rejects.toBeInstanceOf(TimeSlotUnavailableError);

    const appts = await harness.runtime.infra.repositories.appointments.findMany(
      {},
    );
    expect(appts).toHaveLength(0);
  });

  it('Derived ≠ SoT: booking works with knowledgeGraph + semanticSearch unavailable', async ({
    skip,
  }) => {
    if (!depsAvailable) return skip();
    harness.knowledgeGraph.setUnavailable(true);
    harness.semanticSearch.setUnavailable(true);

    const { patient } = await harness.runtime.useCases.registerPatient.execute({
      phoneNumber: uniquePhone('sot'),
      fullName: 'SoT Only',
    });
    const appt = await harness.runtime.useCases.bookAppointment.execute({
      patientId: patient.id,
      doctorId: seed.drSara.id,
      start: '2026-08-26T11:00:00.000Z',
      end: '2026-08-26T11:30:00.000Z',
    });
    expect(appt.status).toBe(AppointmentStatuses.Scheduled);
  });

  it('provider errors are structured codes, not raw SDK dumps', async ({
    skip,
  }) => {
    if (!depsAvailable) return skip();
    const token = await harness.jwt.signAccessToken({
      subject: 'prod-err',
    });
    await request(harness.runtime.app)
      .post('/v1/enroll')
      .set('Authorization', `Bearer ${token}`)
      .send({ phoneNumber: uniquePhone('err'), fullName: 'Err' });

    const slot = TimeSlot.create(
      new Date('2026-08-25T16:00:00.000Z'),
      new Date('2026-08-25T16:30:00.000Z'),
    );
    await harness.calendar.reserveSlot({
      resourceId: seed.drSara.schedulingResourceId(),
      slot,
      title: 'hold',
    });

    const created = await request(harness.runtime.app)
      .post('/v1/conversations')
      .send();
    harness.chat.enqueue(
      {
        toolCalls: [
          {
            id: '1',
            name: 'book_appointment',
            arguments: {
              doctorId: seed.drSara.id,
              start: '2026-08-25T16:00:00.000Z',
              end: '2026-08-25T16:30:00.000Z',
            },
          },
        ],
      },
      { content: 'Could not book.' },
    );

    const res = await request(harness.runtime.app)
      .post('/v1/chat')
      .set('x-conversation-id', created.body.conversationId)
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Book conflicting slot' });

    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/ECONNREFUSED|googleapis|ioredis|neo4j|qdrant/i);
    expect(body).not.toMatch(/at Object\.|node_modules/);
  });

  it('PII: graph rejects phone properties; sanitizeTraceAttributes drops PII keys', async ({
    skip,
  }) => {
    if (!depsAvailable) return skip();
    await expect(
      harness.knowledgeGraph.replaceGraph({
        nodes: [
          {
            id: 'patient_x',
            properties: { phoneNumber: '+201011112222' },
          },
        ],
        relations: [],
      }),
    ).rejects.toBeInstanceOf(KnowledgeGraphUnavailableError);

    const sanitized = sanitizeTraceAttributes({
      phoneNumber: '+201011112222',
      message: 'secret utterance',
      tool_name: 'book_appointment',
      tool_ok: true,
    });
    expect(sanitized.phoneNumber).toBeUndefined();
    expect(sanitized.message).toBeUndefined();
    expect(sanitized.tool_name).toBe('book_appointment');
    expect(sanitized.tool_ok).toBe(true);
  });
});

describe.runIf(Boolean(process.env.QDRANT_URL && process.env.REAL_QDRANT))(
  'Real Qdrant rebuild (opt-in)',
  () => {
    let harness: ProductionTestHarness;

    beforeAll(async () => {
      harness = await createProductionTestHarness({ useRealQdrant: true });
      await harness.resetDb();
      await harness.seedClinicData();
    }, 60_000);

    afterAll(async () => {
      await harness?.close();
    });

    it('rebuilds doctor index against live Qdrant', async () => {
      const result = await harness.runtime.rebuildDoctorSearchIndex();
      expect(result.indexedCount).toBeGreaterThanOrEqual(2);
    });
  },
);

describe.runIf(Boolean(process.env.NEO4J_URI && process.env.REAL_NEO4J))(
  'Real Neo4j rebuild (opt-in)',
  () => {
    let harness: ProductionTestHarness;

    beforeAll(async () => {
      harness = await createProductionTestHarness({ useRealNeo4j: true });
      await harness.resetDb();
      await harness.seedClinicData();
    }, 60_000);

    afterAll(async () => {
      await harness?.close();
    });

    it('rebuilds affinity graph against live Neo4j', async () => {
      const result = await harness.runtime.rebuildPatientAffinityGraph();
      expect(result.nodeCount).toBeGreaterThanOrEqual(0);
    });
  },
);
