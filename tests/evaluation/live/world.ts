import {
  createClinicTools,
  createToolRegistry,
  ToolLoopAgent,
  createTrustedExecutionContext,
  type ClinicAgent,
  type ClinicToolUseCases,
  type TrustedExecutionContext,
} from '../../../src/agent/index.js';
import type { ChatModel } from '../../../src/ports/platform/chat-model.js';
import type { WorkingMemory } from '../../../src/ports/platform/working-memory.js';
import { InMemoryWorkingMemory } from '../../../src/infrastructure/memory/index.js';
import { InMemoryPrincipalPatientDirectory } from '../../../src/infrastructure/memory/clinic/principal-patient-directory.js';
import { DemoAuthGateway } from '../../../src/infrastructure/auth/index.js';
import { ResolveClinicActor } from '../../../src/application/identity/resolve-clinic-actor.js';
import { LinkPrincipalToPatient } from '../../../src/application/identity/link-principal-to-patient.js';
import type { PrincipalPatientDirectory } from '../../../src/ports/clinic/principal-patient.js';
import { createTestWorld, type TestWorld } from '../../helpers/test-world.js';
import { RecordingChatModel } from './recording-chat-model.js';

export const LIVE_AGENT_MAX_STEPS = 8;
export const LIVE_SCENARIO_TIMEOUT_MS = 90_000;

/**
 * Isolated live-eval stack: in-memory clinic + DemoAuthGateway + real ChatModel.
 * Demo auth is evaluation-only — NOT production authentication.
 */
export type LiveEvalWorld = {
  world: TestWorld;
  seed: Awaited<ReturnType<TestWorld['seed']>>;
  workingMemory: WorkingMemory;
  chat: RecordingChatModel;
  agent: ClinicAgent;
  useCases: ClinicToolUseCases;
  authGateway: DemoAuthGateway;
  principalPatients: PrincipalPatientDirectory;
  resolveClinicActor: ResolveClinicActor;
  linkPrincipalToPatient: LinkPrincipalToPatient;
  execution: (opts: {
    conversationId: string;
    subjectId?: string;
  }) => Promise<TrustedExecutionContext>;
  authenticateAs: (opts: {
    subjectId: string;
    phoneNumber: string;
    fullName?: string;
  }) => Promise<{ patientId: string }>;
};

export async function createLiveEvalWorld(
  chatModel: ChatModel,
): Promise<LiveEvalWorld> {
  const world = createTestWorld();
  const seed = await world.seed();
  const workingMemory = new InMemoryWorkingMemory();
  const chat = new RecordingChatModel(chatModel);
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
    maxSteps: LIVE_AGENT_MAX_STEPS,
  });

  return {
    world,
    seed,
    workingMemory,
    chat,
    agent,
    useCases,
    authGateway,
    principalPatients,
    resolveClinicActor,
    linkPrincipalToPatient,
    async execution({ conversationId, subjectId }) {
      const principal =
        typeof subjectId === 'string'
          ? await authGateway.resolve({ demoSubject: subjectId })
          : null;
      const { actor } = await resolveClinicActor.execute({ principal });
      return createTrustedExecutionContext({
        conversationId,
        principal,
        actor,
      });
    },
    async authenticateAs({ subjectId, phoneNumber, fullName }) {
      const result = await useCases.registerPatient.execute({
        phoneNumber,
        ...(fullName ? { fullName } : {}),
      });
      await linkPrincipalToPatient.execute({
        principal: { subjectId },
        patientId: result.patient.id,
      });
      return { patientId: result.patient.id };
    },
  };
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              `Scenario timeout after ${timeoutMs}ms (${label}). Possible unclear provider state — inspect application repos before retrying mutations.`,
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
