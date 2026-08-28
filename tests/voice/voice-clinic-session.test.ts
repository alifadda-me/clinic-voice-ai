import { beforeEach, describe, expect, it } from 'vitest';
import { VoiceClinicSession } from '../../src/interfaces/voice/voice-clinic-session.js';
import { ScriptedLiveVoiceProvider } from '../../src/infrastructure/voice/scripted/scripted-live-voice-provider.js';
import { createAgentTestWorld, type AgentTestWorld } from '../helpers/agent-world.js';
import { InMemoryObservability } from '../../src/infrastructure/memory/index.js';
import { createToolRegistry, createClinicTools } from '../../src/agent/index.js';
import { AppointmentStatuses } from '../../src/domain/index.js';
import { LiveVoiceUnavailableError } from '../../src/ports/platform/live-voice-provider.js';
import { DemoAuthGateway } from '../../src/infrastructure/auth/index.js';
import type { ObservabilityPort, ObservabilitySpan } from '../../src/ports/platform/observability.js';

describe('VoiceClinicSession', () => {
  let ctx: AgentTestWorld;
  let voice: ScriptedLiveVoiceProvider;
  let obs: InMemoryObservability;

  beforeEach(async () => {
    ctx = createAgentTestWorld();
    await ctx.world.seed();
    voice = new ScriptedLiveVoiceProvider();
    obs = new InMemoryObservability();
  });

  function session() {
    return new VoiceClinicSession({
      voiceProvider: voice,
      authGateway: ctx.authGateway,
      resolveClinicActor: ctx.resolveClinicActor,
      tools: createToolRegistry(createClinicTools(ctx.useCases)),
      workingMemory: ctx.workingMemory,
      observability: obs,
    });
  }

  it('allows anonymous discovery via voice tool calls', async () => {
    voice.enqueue({
      type: 'toolCall',
      call: {
        id: '1',
        name: 'search_doctors',
        arguments: { query: 'cardio' },
      },
    });

    const started = await session().start({
      conversationId: 'voice-anon',
      credentials: {},
    });

    expect(started.execution.channel).toBe('voice');
    expect(started.execution.actor).toBeNull();
    await new Promise((r) => setTimeout(r, 30));

    const toolSpan = obs.traces[0]?.children.find(
      (c) => c.name === 'voice.tool.dispatch',
    );
    expect(toolSpan?.attributes.tool_name).toBe('search_doctors');
    expect(toolSpan?.attributes.tool_ok).toBe(true);
  });

  it('rejects patient-scoped tools for anonymous voice sessions', async () => {
    voice.enqueue({
      type: 'toolCall',
      call: { id: '1', name: 'get_patient_profile', arguments: {} },
    });

    await session().start({ conversationId: 'voice-priv', credentials: {} });
    await new Promise((r) => setTimeout(r, 30));

    const toolSpan = obs.traces[0]?.children.find(
      (c) => c.name === 'voice.tool.dispatch',
    );
    expect(toolSpan?.attributes.tool_ok).toBe(false);
    expect(toolSpan?.attributes.error_code).toBe('PATIENT_NOT_IDENTIFIED');
  });

  it('uses linked principal as actor for authenticated voice', async () => {
    const { patientId } = await ctx.authenticateAs({
      subjectId: 'voice-user',
      phoneNumber: '+201011116001',
      fullName: 'Voice User',
    });

    voice.enqueue({
      type: 'toolCall',
      call: { id: '1', name: 'get_patient_profile', arguments: {} },
    });

    const started = await session().start({
      conversationId: 'voice-auth',
      credentials: { demoSubject: 'voice-user' },
    });

    expect(started.execution.actor?.patientId).toBe(patientId);
    await new Promise((r) => setTimeout(r, 30));
    const toolSpan = obs.traces[0]?.children.find(
      (c) => c.name === 'voice.tool.dispatch',
    );
    expect(toolSpan?.attributes.tool_ok).toBe(true);
  });

  it('ignores spoofed patientId in voice tool arguments', async () => {
    const { patientId } = await ctx.authenticateAs({
      subjectId: 'voice-trusted',
      phoneNumber: '+201011116002',
      fullName: 'Trusted',
    });

    voice.enqueue({
      type: 'toolCall',
      call: {
        id: '1',
        name: 'get_patient_profile',
        arguments: { patientId: 'victim-forged' },
      },
    });

    const started = await session().start({
      conversationId: 'voice-spoof',
      credentials: { demoSubject: 'voice-trusted' },
    });
    expect(started.execution.actor?.patientId).toBe(patientId);
    await new Promise((r) => setTimeout(r, 30));
    expect(
      obs.traces[0]?.children.find((c) => c.name === 'voice.tool.dispatch')
        ?.attributes.tool_ok,
    ).toBe(true);
  });

  it('keeps the same frozen actor across multiple voice tool calls', async () => {
    const { patientId } = await ctx.authenticateAs({
      subjectId: 'voice-stable',
      phoneNumber: '+201011116003',
      fullName: 'Stable',
    });

    const seen: string[] = [];
    const tools = createToolRegistry([
      {
        definition: {
          name: 'note_actor',
          description: 'note',
          parameters: { type: 'object', properties: {} },
        },
        requiresPatient: true,
        async execute(_args, toolCtx) {
          seen.push(toolCtx.execution.actor!.patientId);
          return { ok: true, message: 'ok' };
        },
      },
    ]);

    voice.enqueue(
      {
        type: 'toolCall',
        call: { id: '1', name: 'note_actor', arguments: { patientId: 'a' } },
      },
      {
        type: 'toolCall',
        call: { id: '2', name: 'note_actor', arguments: { patientId: 'b' } },
      },
    );

    const voiceSession = new VoiceClinicSession({
      voiceProvider: voice,
      authGateway: new DemoAuthGateway(),
      resolveClinicActor: ctx.resolveClinicActor,
      tools,
      workingMemory: ctx.workingMemory,
      observability: obs,
    });

    const started = await voiceSession.start({
      conversationId: 'voice-stable',
      credentials: { demoSubject: 'voice-stable' },
    });
    await new Promise((r) => setTimeout(r, 40));
    expect(seen).toEqual([patientId, patientId]);
    expect(started.execution.actor?.patientId).toBe(patientId);
  });

  it('denies cancel of another patient appointment over voice', async () => {
    const seed = await ctx.world.seed();
    await ctx.authenticateAs({
      subjectId: 'voice-a',
      phoneNumber: '+201011116004',
      fullName: 'A',
    });
    const other = await ctx.useCases.registerPatient.execute({
      phoneNumber: '+201011116005',
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

    await session().start({
      conversationId: 'voice-own',
      credentials: { demoSubject: 'voice-a' },
    });
    await new Promise((r) => setTimeout(r, 30));

    const still = await ctx.world.appointments.findById(appt.id);
    expect(still?.status).toBe(AppointmentStatuses.Scheduled);
    expect(
      obs.traces[0]?.children.find((c) => c.name === 'voice.tool.dispatch')
        ?.attributes.tool_ok,
    ).toBe(false);
  });

  it('conversationId alone does not authenticate', async () => {
    await ctx.authenticateAs({
      subjectId: 'linked-elsewhere',
      phoneNumber: '+201011116006',
      fullName: 'Linked',
    });

    voice.enqueue({
      type: 'toolCall',
      call: { id: '1', name: 'get_patient_profile', arguments: {} },
    });

    const started = await session().start({
      conversationId: 'same-convo-as-http-maybe',
      credentials: {},
    });
    expect(started.execution.actor).toBeNull();
    await new Promise((r) => setTimeout(r, 30));
    expect(
      obs.traces[0]?.children.find((c) => c.name === 'voice.tool.dispatch')
        ?.attributes.error_code,
    ).toBe('PATIENT_NOT_IDENTIFIED');
  });

  it('provider start failure does not corrupt clinic data', async () => {
    const before = await ctx.world.patients.findByPhoneNumber('+201011116099');
    expect(before).toBeNull();

    voice.setUnavailable(true);
    await expect(
      session().start({ conversationId: 'voice-fail', credentials: {} }),
    ).rejects.toBeInstanceOf(LiveVoiceUnavailableError);

    const after = await ctx.world.patients.findByPhoneNumber('+201011116099');
    expect(after).toBeNull();
  });

  it('appends transcripts to WorkingMemory without storing as auth', async () => {
    voice.enqueue(
      { type: 'transcript', role: 'user', text: 'hello clinic' },
      { type: 'transcript', role: 'assistant', text: 'welcome' },
    );

    await session().start({ conversationId: 'voice-wm', credentials: {} });
    await new Promise((r) => setTimeout(r, 30));

    const turns = await ctx.workingMemory.getRecentTurns('voice-wm', 10);
    expect(turns.map((t) => t.content)).toEqual(['hello clinic', 'welcome']);
  });

  it('observability failures remain fail-open for voice', async () => {
    voice.enqueue({
      type: 'toolCall',
      call: {
        id: '1',
        name: 'search_doctors',
        arguments: { query: 'derm' },
      },
    });

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

    const voiceSession = new VoiceClinicSession({
      voiceProvider: voice,
      authGateway: ctx.authGateway,
      resolveClinicActor: ctx.resolveClinicActor,
      tools: createToolRegistry(createClinicTools(ctx.useCases)),
      workingMemory: ctx.workingMemory,
      observability: exploding,
    });

    await expect(
      voiceSession.start({ conversationId: 'voice-obs', credentials: {} }),
    ).resolves.toMatchObject({
      execution: { channel: 'voice' },
    });
  });
});
