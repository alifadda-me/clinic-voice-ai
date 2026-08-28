import {
  createClinicTools,
  createToolRegistry,
  type ClinicToolUseCases,
  type ToolRegistry,
} from '../../agent/index.js';
import { VoiceClinicSession } from './voice-clinic-session.js';
import type { AuthGateway } from '../../ports/platform/auth.js';
import type { LiveVoiceProvider } from '../../ports/platform/live-voice-provider.js';
import type { WorkingMemory } from '../../ports/platform/working-memory.js';
import type { ObservabilityPort } from '../../ports/platform/observability.js';
import type { PrincipalPatientDirectory } from '../../ports/clinic/principal-patient.js';
import { ResolveClinicActor } from '../../application/identity/resolve-clinic-actor.js';
import { NoopObservability } from '../../infrastructure/observability/index.js';

export type VoiceStack = {
  voiceSession: VoiceClinicSession;
  tools: ToolRegistry;
  authGateway: AuthGateway;
  resolveClinicActor: ResolveClinicActor;
  workingMemory: WorkingMemory;
  observability: ObservabilityPort;
  voiceProvider: LiveVoiceProvider;
};

/**
 * Production voice stack — refuses demo auth; requires production LiveVoiceProvider.
 */
export function createProductionVoiceStack(deps: {
  mode: 'production';
  authGateway: AuthGateway;
  voiceProvider: LiveVoiceProvider;
  useCases: ClinicToolUseCases;
  principalPatients: PrincipalPatientDirectory;
  workingMemory: WorkingMemory;
  observability?: ObservabilityPort;
}): VoiceStack {
  if (deps.mode !== 'production') {
    throw new Error('createProductionVoiceStack requires mode: "production"');
  }
  if (deps.authGateway.kind !== 'production') {
    throw new Error(
      'Production voice stack cannot use demo auth. Provide AuthGateway with kind: "production".',
    );
  }

  const observability = deps.observability ?? new NoopObservability();
  const resolveClinicActor = new ResolveClinicActor(deps.principalPatients);
  const tools = createToolRegistry(createClinicTools(deps.useCases));
  const voiceSession = new VoiceClinicSession({
    voiceProvider: deps.voiceProvider,
    authGateway: deps.authGateway,
    resolveClinicActor,
    tools,
    workingMemory: deps.workingMemory,
    observability,
  });

  return {
    voiceSession,
    tools,
    authGateway: deps.authGateway,
    resolveClinicActor,
    workingMemory: deps.workingMemory,
    observability,
    voiceProvider: deps.voiceProvider,
  };
}
