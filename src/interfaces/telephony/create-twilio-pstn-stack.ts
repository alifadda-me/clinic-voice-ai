import {
  createClinicTools,
  createToolRegistry,
  type ClinicToolUseCases,
} from '../../agent/index.js';
import { VoiceClinicSession } from '../voice/voice-clinic-session.js';
import { TwilioPstnCallBridge } from './twilio-pstn-call-bridge.js';
import { TwilioInboundVoiceWebhook } from '../../infrastructure/telephony/twilio/index.js';
import { createTwilioVoiceRouter } from '../http/twilio-voice-router.js';
import type { AuthGateway } from '../../ports/platform/auth.js';
import type { LiveVoiceProvider } from '../../ports/platform/live-voice-provider.js';
import type { WorkingMemory } from '../../ports/platform/working-memory.js';
import type { ObservabilityPort } from '../../ports/platform/observability.js';
import type { PrincipalPatientDirectory } from '../../ports/clinic/principal-patient.js';
import { ResolveClinicActor } from '../../application/identity/resolve-clinic-actor.js';
import { NoopObservability } from '../../infrastructure/observability/index.js';
import type { TwilioTelephonyConfig } from '../../config/twilio.js';

export type TwilioPstnStack = {
  inboundWebhook: TwilioInboundVoiceWebhook;
  callBridge: TwilioPstnCallBridge;
  voiceSession: VoiceClinicSession;
  /** Mount under an HTTP app that already has urlencoded + error middleware. */
  twilioRouter: ReturnType<typeof createTwilioVoiceRouter>;
};

/**
 * Compose Twilio PSTN transport onto the existing voice trust path.
 * Callers are anonymous unless AuthGateway credentials are supplied
 * explicitly to the call bridge — never from Caller ID.
 *
 * For production, prefer createProductionTwilioPstnStack (rejects demo auth).
 */
export function createTwilioPstnStack(deps: {
  config: TwilioTelephonyConfig;
  authGateway: AuthGateway;
  voiceProvider: LiveVoiceProvider;
  useCases: ClinicToolUseCases;
  principalPatients: PrincipalPatientDirectory;
  workingMemory: WorkingMemory;
  observability?: ObservabilityPort;
}): TwilioPstnStack {
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

  const inboundWebhook = new TwilioInboundVoiceWebhook({
    authToken: deps.config.authToken,
    mediaStreamWsUrl: deps.config.mediaStreamWsUrl,
    observability,
  });

  const callBridge = new TwilioPstnCallBridge({
    voiceClinicSession: voiceSession,
    observability,
  });

  const twilioRouter = createTwilioVoiceRouter({
    authToken: deps.config.authToken,
    mediaStreamWsUrl: deps.config.mediaStreamWsUrl,
    voiceWebhookUrl: deps.config.voiceWebhookUrl,
    observability,
  });

  return {
    inboundWebhook,
    callBridge,
    voiceSession,
    twilioRouter,
  };
}

/**
 * Production Twilio PSTN stack — refuses demo AuthGateway.
 * Same trust path as createTwilioPstnStack; channel remains transport-only.
 */
export function createProductionTwilioPstnStack(deps: {
  mode: 'production';
  config: TwilioTelephonyConfig;
  authGateway: AuthGateway;
  voiceProvider: LiveVoiceProvider;
  useCases: ClinicToolUseCases;
  principalPatients: PrincipalPatientDirectory;
  workingMemory: WorkingMemory;
  observability?: ObservabilityPort;
}): TwilioPstnStack {
  if (deps.mode !== 'production') {
    throw new Error(
      'createProductionTwilioPstnStack requires mode: "production"',
    );
  }
  if (deps.authGateway.kind !== 'production') {
    throw new Error(
      'Production Twilio stack cannot use demo auth. Provide AuthGateway with kind: "production".',
    );
  }
  return createTwilioPstnStack(deps);
}
