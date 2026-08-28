import express, { type Router } from 'express';
import type { ClinicAgent } from '../../agent/tool-loop-agent.js';
import type { ConversationRegistry } from '../../agent/conversation-registry.js';
import type { AuthGateway } from '../../ports/platform/auth.js';
import type { ResolveClinicActor } from '../../application/identity/resolve-clinic-actor.js';
import type { EnrollAuthenticatedPatient } from '../../application/identity/enroll-authenticated-patient.js';
import type { LinkPrincipalToPatient } from '../../application/identity/link-principal-to-patient.js';
import { createChatRouter } from './chat-router.js';
import { createHealthRouter, type HealthProbes } from './health-router.js';
import { mountTestConsole } from './mount-test-console.js';
import { errorMiddleware } from './map-error.js';

/**
 * Production HTTP surface: health + chat (+ optional Twilio router).
 * Same chat trust path as createChatHttpApp; no demo shortcuts.
 */
export function createProductionHttpApp(deps: {
  agent: ClinicAgent;
  conversations: ConversationRegistry;
  authGateway: AuthGateway;
  resolveClinicActor: ResolveClinicActor;
  enrollAuthenticatedPatient: EnrollAuthenticatedPatient;
  linkPrincipalToPatient: LinkPrincipalToPatient;
  health: HealthProbes;
  /** Mounted under /v1 when provided (urlencoded body for Twilio). */
  twilioRouter?: Router | undefined;
}) {
  if (deps.authGateway.kind !== 'production') {
    throw new Error(
      'createProductionHttpApp refuses demo AuthGateway (kind must be "production")',
    );
  }

  const app = express();
  app.disable('x-powered-by');

  app.use(createHealthRouter(deps.health));
  mountTestConsole(app);

  if (deps.twilioRouter) {
    app.use(express.urlencoded({ extended: false }));
    app.use('/v1', deps.twilioRouter);
  }

  app.use(express.json({ limit: '64kb' }));
  app.use(
    '/v1',
    createChatRouter({
      agent: deps.agent,
      conversations: deps.conversations,
      authGateway: deps.authGateway,
      resolveClinicActor: deps.resolveClinicActor,
      identityMode: 'production',
      enrollAuthenticatedPatient: deps.enrollAuthenticatedPatient,
      linkPrincipalToPatient: deps.linkPrincipalToPatient,
    }),
  );
  app.use(errorMiddleware);
  return app;
}
