import {
  createClinicTools,
  createToolRegistry,
  InMemoryConversationRegistry,
  ToolLoopAgent,
  type ClinicAgent,
  type ClinicToolUseCases,
  type ConversationRegistry,
} from '../../agent/index.js';
import { createChatHttpApp } from './create-chat-http-app.js';
import type { ChatModel } from '../../ports/platform/chat-model.js';
import type { WorkingMemory } from '../../ports/platform/working-memory.js';
import type { AuthGateway } from '../../ports/platform/auth.js';
import type { ObservabilityPort } from '../../ports/platform/observability.js';
import type { PrincipalPatientDirectory } from '../../ports/clinic/principal-patient.js';
import { ResolveClinicActor } from '../../application/identity/resolve-clinic-actor.js';
import { LinkPrincipalToPatient } from '../../application/identity/link-principal-to-patient.js';
import { EnrollAuthenticatedPatient } from '../../application/identity/enroll-authenticated-patient.js';
import type { PatientRepository } from '../../ports/clinic/repositories.js';
import { InMemoryWorkingMemory } from '../../infrastructure/memory/index.js';
import { InMemoryPrincipalPatientDirectory } from '../../infrastructure/memory/clinic/principal-patient-directory.js';
import { DemoAuthGateway } from '../../infrastructure/auth/index.js';
import { NoopObservability } from '../../infrastructure/observability/index.js';

export type DemoChatStack = {
  app: ReturnType<typeof createChatHttpApp>;
  agent: ClinicAgent;
  conversations: ConversationRegistry;
  authGateway: DemoAuthGateway;
  principalPatients: PrincipalPatientDirectory;
  resolveClinicActor: ResolveClinicActor;
  linkPrincipalToPatient: LinkPrincipalToPatient;
  enrollAuthenticatedPatient: EnrollAuthenticatedPatient;
  workingMemory: WorkingMemory;
  observability: ObservabilityPort;
  identityMode: 'demo';
};

/**
 * DEMO / local / evaluation chat stack.
 * Requires explicit mode: 'demo'. Uses DemoAuthGateway only.
 * Production must call createProductionChatStack instead.
 */
export function createDemoChatStack(deps: {
  mode: 'demo';
  useCases: ClinicToolUseCases;
  chatModel: ChatModel;
  patients: PatientRepository;
  workingMemory?: WorkingMemory;
  conversations?: ConversationRegistry;
  authGateway?: DemoAuthGateway;
  principalPatients?: PrincipalPatientDirectory;
  observability?: ObservabilityPort;
}): DemoChatStack {
  if (deps.mode !== 'demo') {
    throw new Error('createDemoChatStack requires mode: "demo"');
  }

  const authGateway = deps.authGateway ?? new DemoAuthGateway();
  if (authGateway.kind !== 'demo') {
    throw new Error('createDemoChatStack requires a demo AuthGateway');
  }

  const principalPatients =
    deps.principalPatients ?? new InMemoryPrincipalPatientDirectory();
  const conversations =
    deps.conversations ?? new InMemoryConversationRegistry();
  const workingMemory = deps.workingMemory ?? new InMemoryWorkingMemory();
  const observability = deps.observability ?? new NoopObservability();
  const resolveClinicActor = new ResolveClinicActor(principalPatients);
  const linkPrincipalToPatient = new LinkPrincipalToPatient(
    principalPatients,
    deps.patients,
  );
  const enrollAuthenticatedPatient = new EnrollAuthenticatedPatient(
    deps.useCases.registerPatient,
    linkPrincipalToPatient,
    principalPatients,
  );

  const tools = createToolRegistry(createClinicTools(deps.useCases));
  const agent = new ToolLoopAgent(deps.chatModel, tools, workingMemory, {
    observability,
  });
  const app = createChatHttpApp({
    agent,
    conversations,
    authGateway,
    resolveClinicActor,
    identityMode: 'demo',
    enrollAuthenticatedPatient,
    linkPrincipalToPatient,
  });

  return {
    app,
    agent,
    conversations,
    authGateway,
    principalPatients,
    resolveClinicActor,
    linkPrincipalToPatient,
    enrollAuthenticatedPatient,
    workingMemory,
    observability,
    identityMode: 'demo',
  };
}

export type ProductionChatStack = {
  app: ReturnType<typeof createChatHttpApp>;
  agent: ClinicAgent;
  conversations: ConversationRegistry;
  authGateway: AuthGateway;
  principalPatients: PrincipalPatientDirectory;
  resolveClinicActor: ResolveClinicActor;
  linkPrincipalToPatient: LinkPrincipalToPatient;
  enrollAuthenticatedPatient: EnrollAuthenticatedPatient;
  workingMemory: WorkingMemory;
  observability: ObservabilityPort;
  identityMode: 'production';
};

/**
 * Production chat stack — refuses demo auth.
 * Requires AuthGateway with kind: 'production' (e.g. JwtBearerAuthGateway)
 * and a durable PrincipalPatientDirectory (e.g. Postgres).
 * ObservabilityPort defaults to noop (Opik wired when configured).
 */
export function createProductionChatStack(deps: {
  mode: 'production';
  authGateway: AuthGateway;
  useCases: ClinicToolUseCases;
  chatModel: ChatModel;
  patients: PatientRepository;
  principalPatients: PrincipalPatientDirectory;
  workingMemory: WorkingMemory;
  conversations?: ConversationRegistry;
  observability?: ObservabilityPort;
}): ProductionChatStack {
  if (deps.mode !== 'production') {
    throw new Error('createProductionChatStack requires mode: "production"');
  }
  if (deps.authGateway.kind !== 'production') {
    throw new Error(
      'Production chat stack cannot use demo auth. Provide AuthGateway with kind: "production".',
    );
  }

  const conversations =
    deps.conversations ?? new InMemoryConversationRegistry();
  const observability = deps.observability ?? new NoopObservability();
  const resolveClinicActor = new ResolveClinicActor(deps.principalPatients);
  const linkPrincipalToPatient = new LinkPrincipalToPatient(
    deps.principalPatients,
    deps.patients,
  );
  const enrollAuthenticatedPatient = new EnrollAuthenticatedPatient(
    deps.useCases.registerPatient,
    linkPrincipalToPatient,
    deps.principalPatients,
  );

  const tools = createToolRegistry(createClinicTools(deps.useCases));
  const agent = new ToolLoopAgent(deps.chatModel, tools, deps.workingMemory, {
    observability,
  });
  const app = createChatHttpApp({
    agent,
    conversations,
    authGateway: deps.authGateway,
    resolveClinicActor,
    identityMode: 'production',
    enrollAuthenticatedPatient,
    linkPrincipalToPatient,
  });

  return {
    app,
    agent,
    conversations,
    authGateway: deps.authGateway,
    principalPatients: deps.principalPatients,
    resolveClinicActor,
    linkPrincipalToPatient,
    enrollAuthenticatedPatient,
    workingMemory: deps.workingMemory,
    observability,
    identityMode: 'production',
  };
}
