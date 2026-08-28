import {
  createClinicTools,
  createToolRegistry,
  ToolLoopAgent,
  createTrustedExecutionContext,
  type ClinicAgent,
  type ClinicToolUseCases,
  type ToolRegistry,
  type TrustedExecutionContext,
} from '../../src/agent/index.js';
import type { ChatModel } from '../../src/ports/platform/chat-model.js';
import type { WorkingMemory } from '../../src/ports/platform/working-memory.js';
import { InMemoryWorkingMemory } from '../../src/infrastructure/memory/index.js';
import { InMemoryPrincipalPatientDirectory } from '../../src/infrastructure/memory/clinic/principal-patient-directory.js';
import { DemoAuthGateway } from '../../src/infrastructure/auth/index.js';
import { ResolveClinicActor } from '../../src/application/identity/resolve-clinic-actor.js';
import { LinkPrincipalToPatient } from '../../src/application/identity/link-principal-to-patient.js';
import type { PrincipalPatientDirectory } from '../../src/ports/clinic/principal-patient.js';
import { createTestWorld, type TestWorld } from './test-world.js';
import { ScriptedChatModel } from './scripted-chat-model.js';

export type AgentTestWorld = {
  world: TestWorld;
  workingMemory: WorkingMemory;
  chat: ScriptedChatModel;
  tools: ToolRegistry;
  agent: ClinicAgent;
  useCases: ClinicToolUseCases;
  authGateway: DemoAuthGateway;
  principalPatients: PrincipalPatientDirectory;
  resolveClinicActor: ResolveClinicActor;
  linkPrincipalToPatient: LinkPrincipalToPatient;
  /** Build a frozen execution context for agent.handle / tool dispatch. */
  execution: (opts?: {
    conversationId?: string;
    subjectId?: string | null;
  }) => Promise<TrustedExecutionContext>;
  /** Register patient via use case and link demo principal (outside tool loop). */
  authenticateAs: (opts: {
    subjectId: string;
    phoneNumber: string;
    fullName?: string;
  }) => Promise<{ patientId: string; principal: { subjectId: string } }>;
};

export function createAgentTestWorld(
  chat: ChatModel = new ScriptedChatModel(),
  options: { maxSteps?: number } = {},
): AgentTestWorld {
  const world = createTestWorld();
  const workingMemory = new InMemoryWorkingMemory();
  const authGateway = new DemoAuthGateway();
  const principalPatients = new InMemoryPrincipalPatientDirectory();
  const resolveClinicActor = new ResolveClinicActor(principalPatients);
  const linkPrincipalToPatient = new LinkPrincipalToPatient(
    principalPatients,
    world.patients,
  );

  const useCases: ClinicToolUseCases = {
    registerPatient: world.useCases.registerPatient,
    getPatientProfile: world.useCases.getPatientProfile,
    getPatientContext: world.useCases.getPatientContext,
    savePatientPreference: world.useCases.savePatientPreference,
    searchDoctors: world.useCases.searchDoctors,
    suggestDoctorsFromPeerAffinity:
      world.useCases.suggestDoctorsFromPeerAffinity,
    searchSpecialties: world.useCases.searchSpecialties,
    getAvailableAppointments: world.useCases.getAvailableAppointments,
    bookAppointment: world.useCases.bookAppointment,
    cancelAppointment: world.useCases.cancelAppointment,
    rescheduleAppointment: world.useCases.rescheduleAppointment,
  };

  const tools = createToolRegistry(createClinicTools(useCases));
  const agent = new ToolLoopAgent(chat, tools, workingMemory, {
    ...(options.maxSteps !== undefined ? { maxSteps: options.maxSteps } : {}),
  });

  async function execution(opts?: {
    conversationId?: string;
    subjectId?: string | null;
  }): Promise<TrustedExecutionContext> {
    const conversationId = opts?.conversationId ?? 'test-conversation';
    const resolvedPrincipal =
      typeof opts?.subjectId === 'string'
        ? await authGateway.resolve({ demoSubject: opts.subjectId })
        : null;
    const { actor } = await resolveClinicActor.execute({
      principal: resolvedPrincipal,
    });
    return createTrustedExecutionContext({
      conversationId,
      principal: resolvedPrincipal,
      actor,
    });
  }

  return {
    world,
    workingMemory,
    chat: chat as ScriptedChatModel,
    tools,
    agent,
    useCases,
    authGateway,
    principalPatients,
    resolveClinicActor,
    linkPrincipalToPatient,
    execution,
    async authenticateAs({ subjectId, phoneNumber, fullName }) {
      const result = await useCases.registerPatient.execute({
        phoneNumber,
        ...(fullName ? { fullName } : {}),
      });
      const principal = { subjectId };
      await linkPrincipalToPatient.execute({
        principal,
        patientId: result.patient.id,
      });
      return { patientId: result.patient.id, principal };
    },
  };
}
