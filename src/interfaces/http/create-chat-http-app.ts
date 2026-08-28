import express from 'express';
import type { ClinicAgent } from '../../agent/tool-loop-agent.js';
import type { ConversationRegistry } from '../../agent/conversation-registry.js';
import type { AuthGateway } from '../../ports/platform/auth.js';
import type { ResolveClinicActor } from '../../application/identity/resolve-clinic-actor.js';
import type { EnrollAuthenticatedPatient } from '../../application/identity/enroll-authenticated-patient.js';
import type { LinkPrincipalToPatient } from '../../application/identity/link-principal-to-patient.js';
import { createChatRouter } from './chat-router.js';
import { errorMiddleware } from './map-error.js';

export function createChatHttpApp(deps: {
  agent: ClinicAgent;
  conversations: ConversationRegistry;
  authGateway: AuthGateway;
  resolveClinicActor: ResolveClinicActor;
  identityMode: 'demo' | 'production';
  enrollAuthenticatedPatient?: EnrollAuthenticatedPatient | undefined;
  linkPrincipalToPatient?: LinkPrincipalToPatient | undefined;
}) {
  const app = express();
  app.use(express.json({ limit: '64kb' }));
  app.use(
    '/v1',
    createChatRouter({
      agent: deps.agent,
      conversations: deps.conversations,
      authGateway: deps.authGateway,
      resolveClinicActor: deps.resolveClinicActor,
      identityMode: deps.identityMode,
      ...(deps.enrollAuthenticatedPatient
        ? { enrollAuthenticatedPatient: deps.enrollAuthenticatedPatient }
        : {}),
      ...(deps.linkPrincipalToPatient
        ? { linkPrincipalToPatient: deps.linkPrincipalToPatient }
        : {}),
    }),
  );
  app.use(errorMiddleware);
  return app;
}
