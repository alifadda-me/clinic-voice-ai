/**
 * Agent evaluation — deterministic golden scenarios (ScriptedChatModel).
 * patient authority from TrustedExecutionContext, not register_patient bind.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { createAgentTestWorld, type AgentTestWorld } from '../helpers/agent-world.js';
import type { TestWorld } from '../helpers/test-world.js';
import { ScriptedChatModel } from '../helpers/scripted-chat-model.js';
import { AppointmentStatuses, asPatientId } from '../../src/domain/index.js';

describe('Agent evaluation (deterministic golden set)', () => {
  let chat: ScriptedChatModel;
  let ctx: AgentTestWorld;
  let seed: Awaited<ReturnType<TestWorld['seed']>>;

  beforeEach(async () => {
    chat = new ScriptedChatModel();
    ctx = createAgentTestWorld(chat);
    seed = await ctx.world.seed();
  });

  async function handle(
    conversationId: string,
    message: string,
    subjectId?: string,
  ) {
    return ctx.agent.handle({
      message,
      execution: await ctx.execution({
        conversationId,
        ...(subjectId !== undefined ? { subjectId } : {}),
      }),
    });
  }

  describe('onboarding / identity', () => {
    it('1. register_patient creates profile but does not authenticate', async () => {
      chat.enqueue(
        {
          toolCalls: [
            {
              id: '1',
              name: 'register_patient',
              arguments: { phoneNumber: '+201011112222', fullName: 'Ali' },
            },
          ],
        },
        { content: 'Profile created; authentication is separate.' },
      );
      const result = await handle('e1', 'Register me +201011112222 Ali', 'sub-e1');
      expect(result.toolNamesInvoked).toEqual(['register_patient']);
      const stillAnon = await ctx.execution({ subjectId: 'sub-e1' });
      expect(stillAnon.actor).toBeNull();
    });

    it('2. authenticated patient can load context', async () => {
      await ctx.authenticateAs({
        subjectId: 'sub-e2',
        phoneNumber: '+201011112222',
        fullName: 'Ali',
      });
      chat.enqueue(
        {
          toolCalls: [{ id: '2', name: 'get_patient_context', arguments: {} }],
        },
        { content: 'Here is your context.' },
      );
      const result = await handle('e2', 'What do you know about me?', 'sub-e2');
      expect(result.toolNamesInvoked).toContain('get_patient_context');
    });

    it('3. patient-scoped tool without actor returns identification error path', async () => {
      chat.enqueue(
        {
          toolCalls: [{ id: '1', name: 'get_patient_profile', arguments: {} }],
        },
        { content: 'You need to authenticate first.' },
      );
      const result = await handle('e3', 'Show my profile');
      expect(result.toolNamesInvoked).toEqual(['get_patient_profile']);
      expect(result.reply.toLowerCase()).toMatch(/auth|authenticate|identified/);
    });
  });

  describe('discovery', () => {
    it('4. searches doctors by natural language (anonymous ok)', async () => {
      chat.enqueue(
        {
          toolCalls: [
            {
              id: '1',
              name: 'search_doctors',
              arguments: { query: 'cardiologist' },
            },
          ],
        },
        { content: 'Dr Sara is a cardiologist.' },
      );
      const result = await handle('e4', 'Find a cardiologist');
      expect(result.toolNamesInvoked).toEqual(['search_doctors']);
    });

    it('5. searches specialties', async () => {
      chat.enqueue(
        {
          toolCalls: [
            {
              id: '1',
              name: 'search_specialties',
              arguments: { query: 'skin' },
            },
          ],
        },
        { content: 'Dermatology.' },
      );
      const result = await handle('e5', 'Skin specialties?');
      expect(result.toolNamesInvoked).toEqual(['search_specialties']);
    });

    it('6. clarifying without booking', async () => {
      chat.enqueue({ content: 'Which specialty do you need?' });
      const result = await handle('e6', 'I need a doctor');
      expect(result.toolNamesInvoked).toEqual([]);
      expect(result.reply.toLowerCase()).toMatch(/specialty|which/);
    });

    it('7. inactive doctors not booked via hallucinated success', async () => {
      chat.enqueue(
        {
          toolCalls: [
            {
              id: '1',
              name: 'search_doctors',
              arguments: { query: 'cardiology' },
            },
          ],
        },
        { content: 'Active cardiologists only.' },
      );
      await handle('e7', 'Cardiology doctors');
      expect(await ctx.world.appointments.findMany({})).toHaveLength(0);
    });
  });

  describe('availability', () => {
    it('8. gets available appointments anonymously', async () => {
      chat.enqueue(
        {
          toolCalls: [
            {
              id: '1',
              name: 'get_available_appointments',
              arguments: {
                doctorId: seed.drSara.id,
                from: '2026-08-25T09:00:00.000Z',
                to: '2026-08-25T12:00:00.000Z',
              },
            },
          ],
        },
        { content: 'Here are open slots.' },
      );
      const result = await handle('e8', 'When is Sara free?');
      expect(result.toolNamesInvoked).toEqual(['get_available_appointments']);
    });

    it('9. dermatologist + morning decomposes to search then availability', async () => {
      chat.enqueue(
        {
          toolCalls: [
            {
              id: '1',
              name: 'search_doctors',
              arguments: {
                query: 'dermatologist',
                specialtyId: seed.dermatology.id,
              },
            },
          ],
        },
        {
          toolCalls: [
            {
              id: '2',
              name: 'get_available_appointments',
              arguments: {
                doctorId: seed.drOmar.id,
                from: '2026-08-25T07:00:00.000Z',
                to: '2026-08-25T12:00:00.000Z',
              },
            },
          ],
        },
        { content: 'Dr Omar has morning openings.' },
      );
      const result = await handle('e9', 'Dermatologist tomorrow morning');
      expect(result.toolNamesInvoked).toEqual([
        'search_doctors',
        'get_available_appointments',
      ]);
    });
  });

  describe('booking', () => {
    async function auth(subjectId: string) {
      return ctx.authenticateAs({
        subjectId,
        phoneNumber: '+201011112222',
        fullName: 'Ali',
      });
    }

    it('10. books an appointment through the tool when authenticated', async () => {
      await auth('sub-e10');
      chat.enqueue(
        {
          toolCalls: [
            {
              id: 'b',
              name: 'book_appointment',
              arguments: {
                doctorId: seed.drSara.id,
                start: '2026-08-25T10:00:00.000Z',
                end: '2026-08-25T10:30:00.000Z',
              },
            },
          ],
        },
        { content: 'Booked successfully.' },
      );
      const result = await handle('e10', 'Book Sara at 10:00', 'sub-e10');
      expect(result.toolNamesInvoked).toContain('book_appointment');
      const appts = await ctx.world.appointments.findMany({});
      expect(appts).toHaveLength(1);
      expect(appts[0]?.status).toBe(AppointmentStatuses.Scheduled);
    });

    it('11. conflicting booking surfaces application failure', async () => {
      await auth('sub-e11');
      chat.enqueue(
        {
          toolCalls: [
            {
              id: 'b1',
              name: 'book_appointment',
              arguments: {
                doctorId: seed.drSara.id,
                start: '2026-08-25T10:00:00.000Z',
                end: '2026-08-25T10:30:00.000Z',
              },
            },
          ],
        },
        { content: 'First booking done.' },
      );
      await handle('e11', 'Book first', 'sub-e11');

      await ctx.authenticateAs({
        subjectId: 'sub-e11b',
        phoneNumber: '+201033334444',
        fullName: 'Other',
      });
      chat.enqueue(
        {
          toolCalls: [
            {
              id: 'b2',
              name: 'book_appointment',
              arguments: {
                doctorId: seed.drSara.id,
                start: '2026-08-25T10:00:00.000Z',
                end: '2026-08-25T10:30:00.000Z',
              },
            },
          ],
        },
        { content: 'That slot is no longer available.' },
      );
      const result = await handle('e11b', 'Also book Sara at 10', 'sub-e11b');
      expect(result.toolNamesInvoked).toEqual(['book_appointment']);
      expect(result.reply.toLowerCase()).toMatch(/not available|conflict|slot/);
      const scheduled = (await ctx.world.appointments.findMany({})).filter(
        (a) => a.status === AppointmentStatuses.Scheduled,
      );
      expect(scheduled).toHaveLength(1);
    });

    it('12. booking without actor does not create appointments', async () => {
      chat.enqueue(
        {
          toolCalls: [
            {
              id: 'b',
              name: 'book_appointment',
              arguments: {
                doctorId: seed.drSara.id,
                start: '2026-08-25T10:00:00.000Z',
                end: '2026-08-25T10:30:00.000Z',
              },
            },
          ],
        },
        { content: 'Please authenticate first.' },
      );
      await handle('e12', 'Book Sara now');
      expect(await ctx.world.appointments.findMany({})).toHaveLength(0);
    });

    it('13. invalid slot is rejected by application', async () => {
      await auth('sub-e13');
      chat.enqueue(
        {
          toolCalls: [
            {
              id: 'b',
              name: 'book_appointment',
              arguments: {
                doctorId: seed.drSara.id,
                start: 'not-a-date',
                end: 'also-bad',
              },
            },
          ],
        },
        { content: 'Those times were invalid.' },
      );
      await handle('e13', 'Book nonsense times', 'sub-e13');
      expect(await ctx.world.appointments.findMany({})).toHaveLength(0);
    });

    it('14. cancels an owned appointment', async () => {
      await auth('sub-e14');
      chat.enqueue(
        {
          toolCalls: [
            {
              id: 'b',
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
      await handle('e14', 'Book', 'sub-e14');
      const appt = (await ctx.world.appointments.findMany({}))[0]!;
      chat.enqueue(
        {
          toolCalls: [
            {
              id: 'c',
              name: 'cancel_appointment',
              arguments: { appointmentId: appt.id },
            },
          ],
        },
        { content: 'Cancelled.' },
      );
      await handle('e14', 'Cancel it', 'sub-e14');
      const updated = await ctx.world.appointments.findById(appt.id);
      expect(updated?.status).toBe(AppointmentStatuses.Cancelled);
    });

    it('15. reschedules an owned appointment', async () => {
      await auth('sub-e15');
      chat.enqueue(
        {
          toolCalls: [
            {
              id: 'b',
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
      await handle('e15', 'Book', 'sub-e15');
      const appt = (await ctx.world.appointments.findMany({}))[0]!;
      chat.enqueue(
        {
          toolCalls: [
            {
              id: 'r',
              name: 'reschedule_appointment',
              arguments: {
                appointmentId: appt.id,
                start: '2026-08-25T11:00:00.000Z',
                end: '2026-08-25T11:30:00.000Z',
              },
            },
          ],
        },
        { content: 'Rescheduled to 11:00.' },
      );
      await handle('e15', 'Move to 11', 'sub-e15');
      const updated = await ctx.world.appointments.findById(appt.id);
      expect(updated?.slot.start.toISOString()).toBe(
        '2026-08-25T11:00:00.000Z',
      );
    });
  });

  describe('context', () => {
    it('16. preference saved then used via patient context later', async () => {
      await ctx.authenticateAs({
        subjectId: 'sub-e16',
        phoneNumber: '+201011112222',
        fullName: 'Ali',
      });
      chat.enqueue(
        {
          toolCalls: [
            {
              id: '2',
              name: 'save_patient_preference',
              arguments: {
                kind: 'specialty',
                value: seed.dermatology.name,
                specialtyId: seed.dermatology.id,
              },
            },
          ],
        },
        { content: 'Saved dermatology preference.' },
      );
      await handle('e16', 'Prefer dermatology', 'sub-e16');

      chat.enqueue(
        {
          toolCalls: [{ id: '3', name: 'get_patient_context', arguments: {} }],
        },
        {
          toolCalls: [
            {
              id: '4',
              name: 'search_doctors',
              arguments: {
                query: 'skin',
                specialtyId: seed.dermatology.id,
              },
            },
          ],
        },
        { content: 'Based on your dermatology preference, Dr Omar fits.' },
      );
      const result = await handle('e16', 'Find doctors for me', 'sub-e16');
      expect(result.toolNamesInvoked).toEqual([
        'get_patient_context',
        'search_doctors',
      ]);
      const linked = await ctx.execution({ subjectId: 'sub-e16' });
      const prefs = await ctx.world.preferences.listByPatient(
        asPatientId(linked.actor!.patientId),
      );
      expect(prefs.some((p) => p.kind === 'specialty')).toBe(true);
    });
  });

  describe('safety / scope', () => {
    it('17. diagnosis request does not call clinic mutating tools', async () => {
      chat.enqueue({
        content:
          'I cannot diagnose medical conditions. I can help you find a doctor or book an appointment.',
      });
      const before = await ctx.world.appointments.findMany({});
      const result = await handle('e17', 'Do I have diabetes?');
      expect(result.toolNamesInvoked).toEqual([]);
      expect(result.reply.toLowerCase()).toMatch(/cannot diagnose|doctor/);
      expect(await ctx.world.appointments.findMany({})).toHaveLength(
        before.length,
      );
    });

    it('18. medication request stays administrative-only', async () => {
      chat.enqueue({
        content:
          'I cannot recommend medications. Please consult a clinician. I can help schedule a visit.',
      });
      const result = await handle('e18', 'What antibiotic should I take?');
      expect(result.toolNamesInvoked).toEqual([]);
      expect(result.reply.toLowerCase()).toMatch(/cannot|medication|clinician/);
    });

    it('19. out-of-scope request is declined without tools', async () => {
      chat.enqueue({
        content: 'I only help with clinic appointments and doctor discovery.',
      });
      const result = await handle('e19', 'Write me a poem about cats');
      expect(result.toolNamesInvoked).toEqual([]);
    });
  });
});
