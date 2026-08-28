import { describe, expect, it, beforeEach } from 'vitest';
import { createToolRegistry, createTrustedExecutionContext } from '../../src/agent/index.js';
import type { ClinicTool } from '../../src/agent/tools/types.js';
import { createAgentTestWorld, type AgentTestWorld } from '../helpers/agent-world.js';
import { AppointmentStatuses } from '../../src/domain/index.js';
import { createProductionChatStack } from '../../src/interfaces/http/create-chat-stack.js';
import { DemoAuthGateway } from '../../src/infrastructure/auth/index.js';
import type { AuthGateway, AuthenticatedPrincipal } from '../../src/ports/platform/auth.js';
import { ScriptedChatModel } from '../helpers/scripted-chat-model.js';
import { InMemoryWorkingMemory } from '../../src/infrastructure/memory/index.js';

describe('Identity adversarial tests', () => {
  let ctx: AgentTestWorld;

  beforeEach(async () => {
    ctx = createAgentTestWorld();
    await ctx.world.seed();
  });

  describe('identity spoofing', () => {
    const spoofPayloads = [
      { patientId: 'victim' },
      { userId: 'victim' },
      { subjectId: 'victim' },
      { sessionId: 'victim-session' },
      { conversationId: 'victim-convo' },
      { authenticatedPatientId: 'victim' },
      { principalId: 'victim' },
      { actor: { patientId: 'victim' } },
    ];

    it.each(spoofPayloads)(
      'does not let spoof fields change the actor: %j',
      async (spoof) => {
        const { patientId: trustedId } = await ctx.authenticateAs({
          subjectId: 'trusted-sub',
          phoneNumber: '+201011110001',
          fullName: 'Trusted',
        });
        let seenActor: string | undefined;
        const probe: ClinicTool = {
          definition: {
            name: 'probe_actor',
            description: 'probe',
            parameters: { type: 'object', properties: {} },
          },
          requiresPatient: true,
          async execute(args, toolCtx) {
            seenActor = toolCtx.execution.actor?.patientId;
            expect(args).not.toHaveProperty('patientId');
            expect(args).not.toHaveProperty('subjectId');
            expect(args).not.toHaveProperty('actor');
            return { ok: true, message: 'ok' };
          },
        };
        const registry = createToolRegistry([probe]);
        const execution = await ctx.execution({ subjectId: 'trusted-sub' });
        await registry.dispatch('probe_actor', { ...spoof, doctorId: 'x' }, {
          execution,
        });
        expect(seenActor).toBe(trustedId);
      },
    );
  });

  describe('cross-patient authorization', () => {
    it('denies cancel/reschedule of another patient appointment', async () => {
      const seed = await ctx.world.seed();
      const a = await ctx.authenticateAs({
        subjectId: 'patient-a',
        phoneNumber: '+201011110002',
        fullName: 'A',
      });
      const b = await ctx.useCases.registerPatient.execute({
        phoneNumber: '+201011110003',
        fullName: 'B',
      });
      const appt = await ctx.useCases.bookAppointment.execute({
        patientId: b.patient.id,
        doctorId: seed.drSara.id,
        start: '2026-08-25T10:00:00.000Z',
        end: '2026-08-25T10:30:00.000Z',
      });

      const execution = await ctx.execution({ subjectId: 'patient-a' });
      const cancel = await ctx.tools.dispatch(
        'cancel_appointment',
        { appointmentId: appt.id },
        { execution },
      );
      expect(cancel.ok).toBe(false);

      const reschedule = await ctx.tools.dispatch(
        'reschedule_appointment',
        {
          appointmentId: appt.id,
          start: '2026-08-25T11:00:00.000Z',
          end: '2026-08-25T11:30:00.000Z',
        },
        { execution },
      );
      expect(reschedule.ok).toBe(false);

      const still = await ctx.world.appointments.findById(appt.id);
      expect(still?.status).toBe(AppointmentStatuses.Scheduled);
      expect(still?.patientId).toBe(b.patient.id);
      expect(a.patientId).not.toBe(b.patient.id);
    });

    it('denies get_patient_context for unlinked/anonymous when seeking private state', async () => {
      const execution = await ctx.execution();
      const result = await ctx.tools.dispatch(
        'get_patient_context',
        {},
        { execution },
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('PATIENT_NOT_IDENTIFIED');
    });
  });

  describe('registration escalation', () => {
    it('register_patient does not authenticate the patient', async () => {
      const before = await ctx.execution({ subjectId: 'escalator' });
      expect(before.actor).toBeNull();

      const result = await ctx.tools.dispatch(
        'register_patient',
        { phoneNumber: '+201011110004', fullName: 'Esc' },
        { execution: before },
      );
      expect(result.ok).toBe(true);

      const after = await ctx.execution({ subjectId: 'escalator' });
      expect(after.actor).toBeNull();

      const profile = await ctx.tools.dispatch(
        'get_patient_profile',
        {},
        { execution: after },
      );
      expect(profile.ok).toBe(false);
    });

    it('trusted enroll auto-links; agent register_patient still does not', async () => {
      const { EnrollAuthenticatedPatient } = await import(
        '../../src/application/identity/enroll-authenticated-patient.js'
      );
      const enroll = new EnrollAuthenticatedPatient(
        ctx.useCases.registerPatient,
        ctx.linkPrincipalToPatient,
        ctx.principalPatients,
      );
      const result = await enroll.execute({
        principal: { subjectId: 'enroll-tool-gap' },
        phoneNumber: '+201011110014',
        fullName: 'Enrolled',
      });
      expect(result.linked).toBe(true);

      const linked = await ctx.execution({ subjectId: 'enroll-tool-gap' });
      expect(linked.actor?.patientId).toBe(result.patientId);

      const anon = await ctx.execution({ subjectId: 'tool-only' });
      await ctx.tools.dispatch(
        'register_patient',
        { phoneNumber: '+201011110015', fullName: 'Tool' },
        { execution: anon },
      );
      const stillAnon = await ctx.execution({ subjectId: 'tool-only' });
      expect(stillAnon.actor).toBeNull();
    });
  });

  describe('tool-loop actor stability', () => {
    it('uses the same frozen actor for every tool in a turn', async () => {
      const { patientId } = await ctx.authenticateAs({
        subjectId: 'loop-sub',
        phoneNumber: '+201011110005',
        fullName: 'Loop',
      });
      const actors: string[] = [];
      const tool: ClinicTool = {
        definition: {
          name: 'note_actor',
          description: 'note',
          parameters: { type: 'object', properties: {} },
        },
        requiresPatient: true,
        async execute(_args, toolCtx) {
          actors.push(toolCtx.execution.actor!.patientId);
          return { ok: true, message: 'ok' };
        },
      };
      const registry = createToolRegistry([tool, tool]);
      // Two tools same name - registry uses Map so last wins. Use two names:
      const t1: ClinicTool = { ...tool, definition: { ...tool.definition, name: 'note_a' } };
      const t2: ClinicTool = { ...tool, definition: { ...tool.definition, name: 'note_b' } };
      const reg = createToolRegistry([t1, t2]);
      const execution = createTrustedExecutionContext({
        conversationId: 'c',
        principal: { subjectId: 'loop-sub' },
        actor: { patientId },
      });
      await reg.dispatch('note_a', { patientId: 'forged' }, { execution });
      await reg.dispatch('note_b', { patientId: 'forged2' }, { execution });
      expect(actors).toEqual([patientId, patientId]);
    });
  });

  describe('production chat stack guard', () => {
    it('refuses DemoAuthGateway in production stack', () => {
      const chat = new ScriptedChatModel();
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

    it('accepts a production-kind AuthGateway stub', () => {
      const productionAuth: AuthGateway = {
        kind: 'production',
        async resolve(): Promise<AuthenticatedPrincipal | null> {
          return null;
        },
      };
      const stack = createProductionChatStack({
        mode: 'production',
        authGateway: productionAuth,
        useCases: ctx.useCases,
        chatModel: new ScriptedChatModel(),
        patients: ctx.world.patients,
        principalPatients: ctx.principalPatients,
        workingMemory: new InMemoryWorkingMemory(),
      });
      expect(stack.identityMode).toBe('production');
    });
  });
});
