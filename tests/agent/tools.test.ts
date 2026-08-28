import { beforeEach, describe, expect, it } from 'vitest';
import {
  createToolRegistry,
  createTrustedExecutionContext,
  stripUntrustedIdentityArgs,
} from '../../src/agent/index.js';
import { createAgentTestWorld, type AgentTestWorld } from '../helpers/agent-world.js';

describe('clinic tools identity', () => {
  let ctx: AgentTestWorld;

  beforeEach(async () => {
    ctx = createAgentTestWorld();
    await ctx.world.seed();
  });

  it('rejects invalid register_patient arguments', async () => {
    const execution = await ctx.execution();
    const result = await ctx.tools.dispatch(
      'register_patient',
      { phoneNumber: '1' },
      { execution },
    );
    expect(result.ok).toBe(false);
  });

  it('registers patient without establishing authenticated authority', async () => {
    const execution = await ctx.execution({ subjectId: 'sub-1' });
    const result = await ctx.tools.dispatch(
      'register_patient',
      { phoneNumber: '+201011112222', fullName: 'Ali' },
      { execution },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const body = JSON.parse(result.message) as {
        authenticated: boolean;
        patientId: string;
      };
      expect(body.authenticated).toBe(false);
      expect(body.patientId).toBeTruthy();
    }
    // Still no actor — register does not link principal.
    const after = await ctx.execution({ subjectId: 'sub-1' });
    expect(after.actor).toBeNull();
  });

  it('requires authenticated actor for profile', async () => {
    const execution = await ctx.execution();
    const result = await ctx.tools.dispatch(
      'get_patient_profile',
      {},
      { execution },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('PATIENT_NOT_IDENTIFIED');
  });

  it('returns profile for linked authenticated actor', async () => {
    const { patientId } = await ctx.authenticateAs({
      subjectId: 'sub-ali',
      phoneNumber: '+201011112222',
      fullName: 'Ali',
    });
    const execution = await ctx.execution({ subjectId: 'sub-ali' });
    const result = await ctx.tools.dispatch(
      'get_patient_profile',
      {},
      { execution },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(JSON.parse(result.message).patientId).toBe(patientId);
    }
  });

  it('ignores forged patientId on book and uses actor', async () => {
    const { patientId } = await ctx.authenticateAs({
      subjectId: 'sub-book',
      phoneNumber: '+201022223333',
      fullName: 'Booker',
    });
    const seed = await ctx.world.seed();
    const execution = await ctx.execution({ subjectId: 'sub-book' });
    const result = await ctx.tools.dispatch(
      'book_appointment',
      {
        patientId: 'forged-victim',
        doctorId: seed.drSara.id,
        start: '2026-08-25T10:00:00.000Z',
        end: '2026-08-25T10:30:00.000Z',
      },
      { execution },
    );
    expect(result.ok).toBe(true);
    const appts = await ctx.world.appointments.findMany({});
    expect(appts).toHaveLength(1);
    expect(appts[0]?.patientId).toBe(patientId);
  });

  it('allows anonymous search_doctors', async () => {
    await ctx.world.seed();
    const execution = await ctx.execution();
    const result = await ctx.tools.dispatch(
      'search_doctors',
      { query: 'cardiology' },
      { execution },
    );
    expect(result.ok).toBe(true);
  });
});

describe('stripUntrustedIdentityArgs', () => {
  it('strips spoof fields', () => {
    expect(
      stripUntrustedIdentityArgs({
        doctorId: 'doc_1',
        patientId: 'victim',
        userId: 'victim',
        subjectId: 'victim',
        sessionId: 'victim-session',
        conversationId: 'victim-convo',
        authenticatedPatientId: 'victim',
        principalId: 'victim',
        actor: { patientId: 'victim' },
      }),
    ).toEqual({ doctorId: 'doc_1' });
  });
});

describe('createTrustedExecutionContext immutability', () => {
  it('freezes actor and principal', () => {
    const ctx = createTrustedExecutionContext({
      conversationId: 'c1',
      principal: { subjectId: 's1' },
      actor: { patientId: 'p1' },
    });
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(Object.isFrozen(ctx.actor)).toBe(true);
    expect(Object.isFrozen(ctx.principal)).toBe(true);
  });
});
