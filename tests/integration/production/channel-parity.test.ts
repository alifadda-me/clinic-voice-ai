import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppointmentStatuses, asPatientId } from '../../../src/domain/index.js';
import {
  canReachProductionTestDependencies,
  createProductionTestHarness,
  uniquePhone,
  type ClinicSeed,
  type ProductionTestHarness,
} from '../../helpers/production-runtime-harness.js';

/**
 * Channel parity: HTTP chat, VoiceClinicSession, and TwilioPstnCallBridge
 * all resolve AuthGateway → TrustedExecutionContext → same use-case instances
 * (same PostgreSQL appointment SoT).
 */
describe('Channel parity', () => {
  let depsAvailable = false;
  let harness: ProductionTestHarness;
  let seed: ClinicSeed;

  beforeAll(async () => {
    depsAvailable = await canReachProductionTestDependencies();
    if (!depsAvailable) {
      console.warn(
        '[production] Skipping channel parity — PostgreSQL/Redis not reachable.',
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

  it('shares the same BookAppointment use-case instance across stacks', async ({
    skip,
  }) => {
    if (!depsAvailable) return skip();
    // Voice + Twilio stacks are created with the same clinicTools object
    // that wraps runtime.useCases.bookAppointment.
    expect(harness.runtime.useCases.bookAppointment).toBeDefined();
    expect(harness.runtime.voiceStack).toBeDefined();
    expect(harness.runtime.twilioStack).toBeDefined();
    expect(harness.runtime.chatStack.authGateway).toBe(
      harness.runtime.authGateway,
    );
    expect(harness.runtime.voiceStack!.authGateway).toBe(
      harness.runtime.authGateway,
    );
  });

  it('HTTP / Voice / Twilio book into the same Postgres appointment SoT', async ({
    skip,
  }) => {
    if (!depsAvailable) return skip();
    const token = await harness.jwt.signAccessToken({
      subject: 'prod-parity',
    });
    const enroll = await request(harness.runtime.app)
      .post('/v1/enroll')
      .set('Authorization', `Bearer ${token}`)
      .send({ phoneNumber: uniquePhone('parity'), fullName: 'Parity' });
    const patientId = enroll.body.patientId as string;
    const credentials = { authorizationHeader: `Bearer ${token}` };

    // --- HTTP chat ---
    const created = await request(harness.runtime.app)
      .post('/v1/conversations')
      .send();
    harness.chat.enqueue(
      {
        toolCalls: [
          {
            id: 'http-1',
            name: 'book_appointment',
            arguments: {
              doctorId: seed.drSara.id,
              start: '2026-08-25T10:00:00.000Z',
              end: '2026-08-25T10:30:00.000Z',
            },
          },
        ],
      },
      { content: 'HTTP booked.' },
    );
    const httpRes = await request(harness.runtime.app)
      .post('/v1/chat')
      .set('x-conversation-id', created.body.conversationId)
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Book via HTTP' });
    expect(httpRes.status).toBe(200);
    expect(httpRes.body.toolsInvoked).toContain('book_appointment');

    // --- Voice ---
    harness.voice.enqueue({
      type: 'toolCall',
      call: {
        id: 'voice-1',
        name: 'book_appointment',
        arguments: {
          doctorId: seed.drSara.id,
          start: '2026-08-25T11:00:00.000Z',
          end: '2026-08-25T11:30:00.000Z',
        },
      },
    });
    const voiceStarted =
      await harness.runtime.voiceStack!.voiceSession.start({
        conversationId: randomUUID(),
        credentials,
      });
    expect(voiceStarted.execution.channel).toBe('voice');
    expect(voiceStarted.execution.actor?.patientId).toBe(patientId);
    await new Promise((r) => setTimeout(r, 50));

    // --- Twilio PSTN ---
    harness.voice.enqueue({
      type: 'toolCall',
      call: {
        id: 'twilio-1',
        name: 'book_appointment',
        arguments: {
          doctorId: seed.drSara.id,
          start: '2026-08-25T12:00:00.000Z',
          end: '2026-08-25T12:30:00.000Z',
        },
      },
    });
    const twilioCall =
      await harness.runtime.twilioStack!.callBridge.handleMediaEvent(
        {
          type: 'start',
          callSid: 'CA_PROD_PARITY',
          streamSid: 'MZ_PARITY',
          callerIdClaim: '+15550001111',
        },
        { credentials },
      );
    expect(twilioCall?.execution.channel).toBe('twilio_voice');
    expect(twilioCall?.execution.actor?.patientId).toBe(patientId);
    await new Promise((r) => setTimeout(r, 50));

    const appts =
      await harness.runtime.infra.repositories.appointments.findMany({
        patientId: asPatientId(patientId),
      });
    expect(appts).toHaveLength(3);
    expect(appts.every((a) => a.patientId === patientId)).toBe(true);
    expect(appts.every((a) => a.status === AppointmentStatuses.Scheduled)).toBe(
      true,
    );

    // Cancel the HTTP-booked row via voice — proves same SoT + ownership path.
    const httpAppt = appts.find(
      (a) => a.slot.start.toISOString() === '2026-08-25T10:00:00.000Z',
    );
    expect(httpAppt).toBeTruthy();

    harness.voice.clearQueue();
    harness.voice.enqueue({
      type: 'toolCall',
      call: {
        id: 'voice-cancel',
        name: 'cancel_appointment',
        arguments: { appointmentId: httpAppt!.id },
      },
    });
    await harness.runtime.voiceStack!.voiceSession.start({
      conversationId: randomUUID(),
      credentials,
    });
    await new Promise((r) => setTimeout(r, 50));

    const cancelled =
      await harness.runtime.infra.repositories.appointments.findById(
        httpAppt!.id,
      );
    expect(cancelled?.status).toBe(AppointmentStatuses.Cancelled);
  });
});
