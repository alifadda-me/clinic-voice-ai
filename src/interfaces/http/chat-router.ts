import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { ClinicAgent } from '../../agent/tool-loop-agent.js';
import type { ConversationRegistry } from '../../agent/conversation-registry.js';
import { createTrustedExecutionContext } from '../../agent/execution-context.js';
import type { AuthGateway } from '../../ports/platform/auth.js';
import { InvalidAuthCredentialsError } from '../../ports/platform/auth.js';
import type { ResolveClinicActor } from '../../application/identity/resolve-clinic-actor.js';
import type { EnrollAuthenticatedPatient } from '../../application/identity/enroll-authenticated-patient.js';
import type { LinkPrincipalToPatient } from '../../application/identity/link-principal-to-patient.js';
import {
  ConflictError,
  PatientNotFoundError,
  ValidationError,
} from '../../application/shared/errors.js';
import { HttpError } from './map-error.js';

const chatBodySchema = z.object({
  message: z.string().min(1).max(4000),
});

const enrollBodySchema = z.object({
  phoneNumber: z.string().min(5),
  fullName: z.string().min(1).optional(),
});

const linkBodySchema = z.object({
  /** Domain patient id (UUID in Postgres; sequential ids in tests). */
  patientId: z.string().min(1),
});

/**
 * Thin HTTP routes — auth resolve, conversation correlation, agent call.
 * No clinic business rules here.
 */
export function createChatRouter(deps: {
  agent: ClinicAgent;
  conversations: ConversationRegistry;
  authGateway: AuthGateway;
  resolveClinicActor: ResolveClinicActor;
  /** Explicit identity mode label returned to clients. */
  identityMode: 'demo' | 'production';
  /** Trusted enrollment (auto-link). Required for production; optional for demo. */
  enrollAuthenticatedPatient?: EnrollAuthenticatedPatient | undefined;
  /** Explicit link for existing patients — never an agent tool. */
  linkPrincipalToPatient?: LinkPrincipalToPatient | undefined;
}): Router {
  const router = Router();

  router.post('/conversations', async (_req, res, next) => {
    try {
      const conversationId = randomUUID();
      await deps.conversations.ensure(conversationId);
      res.status(201).json({
        conversationId,
        /** @deprecated Alias — conversation correlation only, not auth. */
        sessionId: conversationId,
        identityMode: deps.identityMode,
      });
    } catch (error) {
      next(error);
    }
  });

  /** Backward-compatible alias for conversation creation. */
  router.post('/sessions', async (_req, res, next) => {
    try {
      const conversationId = randomUUID();
      await deps.conversations.ensure(conversationId);
      res.status(201).json({
        conversationId,
        sessionId: conversationId,
        identityMode: deps.identityMode,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Trusted enrollment: requires valid principal (401 if missing/invalid).
   * Auto-links only for newly created patients when principal has no link.
   */
  router.post('/enroll', async (req, res, next) => {
    try {
      if (!deps.enrollAuthenticatedPatient) {
        throw new HttpError(
          501,
          'ENROLL_UNAVAILABLE',
          'Enrollment endpoint is not configured',
        );
      }

      const principal = await resolveRequiredPrincipal(deps.authGateway, req);
      const body = enrollBodySchema.parse(req.body);
      const result = await deps.enrollAuthenticatedPatient.execute({
        principal,
        phoneNumber: body.phoneNumber,
        ...(body.fullName ? { fullName: body.fullName } : {}),
      });

      res.status(result.created ? 201 : 200).json({
        patientId: result.patientId,
        created: result.created,
        linked: result.linked,
        authenticated: true,
      });
    } catch (error) {
      next(mapIdentityHttpError(error));
    }
  });

  /**
   * Explicit principal→existing patient link (ops/onboarding).
   * Not available to the LLM tool loop.
   */
  router.post('/identity/link', async (req, res, next) => {
    try {
      if (!deps.linkPrincipalToPatient) {
        throw new HttpError(
          501,
          'LINK_UNAVAILABLE',
          'Identity link endpoint is not configured',
        );
      }

      const principal = await resolveRequiredPrincipal(deps.authGateway, req);
      const body = linkBodySchema.parse(req.body);
      await deps.linkPrincipalToPatient.execute({
        principal,
        patientId: body.patientId,
      });
      res.status(204).send();
    } catch (error) {
      next(mapIdentityHttpError(error));
    }
  });

  router.post('/chat', async (req, res, next) => {
    try {
      const conversationId = readConversationId(req);
      if (!conversationId) {
        throw new HttpError(
          400,
          'CONVERSATION_REQUIRED',
          'Header x-conversation-id (or x-session-id) is required',
        );
      }
      if (!(await deps.conversations.exists(conversationId))) {
        throw new HttpError(404, 'CONVERSATION_NOT_FOUND', 'Unknown conversation');
      }

      const principal = await resolveOptionalPrincipal(deps.authGateway, req);

      const { actor } = await deps.resolveClinicActor.execute({ principal });
      const execution = createTrustedExecutionContext({
        conversationId,
        principal,
        actor,
        channel: 'http_chat',
        requestCorrelationId:
          req.header('x-request-id')?.trim() || randomUUID(),
      });

      const body = chatBodySchema.parse(req.body);
      const result = await deps.agent.handle({
        message: body.message,
        execution,
      });
      res.status(200).json({
        reply: result.reply,
        toolsInvoked: result.toolNamesInvoked,
        authenticated: Boolean(actor),
      });
    } catch (error) {
      next(mapIdentityHttpError(error));
    }
  });

  return router;
}

async function resolveOptionalPrincipal(
  authGateway: AuthGateway,
  req: { header(name: string): string | undefined },
) {
  try {
    return await authGateway.resolve({
      authorizationHeader: req.header('authorization') ?? undefined,
      demoSubject:
        authGateway.kind === 'demo'
          ? req.header('x-demo-subject') ?? undefined
          : undefined,
    });
  } catch (error) {
    if (error instanceof InvalidAuthCredentialsError) {
      throw new HttpError(401, error.code, error.message);
    }
    throw error;
  }
}

/** Routes that require authentication — missing or invalid → 401. */
async function resolveRequiredPrincipal(
  authGateway: AuthGateway,
  req: { header(name: string): string | undefined },
) {
  const authorizationHeader = req.header('authorization') ?? undefined;
  const demoSubject =
    authGateway.kind === 'demo'
      ? req.header('x-demo-subject') ?? undefined
      : undefined;

  if (authGateway.kind === 'production' && !authorizationHeader?.trim()) {
    throw new HttpError(
      401,
      'AUTH_REQUIRED',
      'Authorization Bearer token is required',
    );
  }
  if (authGateway.kind === 'demo' && !demoSubject?.trim()) {
    throw new HttpError(
      401,
      'AUTH_REQUIRED',
      'x-demo-subject is required for this operation',
    );
  }

  try {
    const principal = await authGateway.resolve({
      authorizationHeader,
      demoSubject,
    });
    if (!principal) {
      throw new HttpError(
        401,
        'AUTH_REQUIRED',
        'Authentication is required',
      );
    }
    return principal;
  } catch (error) {
    if (error instanceof InvalidAuthCredentialsError) {
      throw new HttpError(401, error.code, error.message);
    }
    throw error;
  }
}

function mapIdentityHttpError(error: unknown): unknown {
  if (error instanceof HttpError) return error;
  if (error instanceof InvalidAuthCredentialsError) {
    return new HttpError(401, error.code, error.message);
  }
  if (error instanceof z.ZodError) {
    return new HttpError(
      400,
      'INVALID_BODY',
      error.issues[0]?.message ?? 'Invalid request body',
    );
  }
  if (error instanceof ValidationError) {
    return new HttpError(400, error.code, error.message);
  }
  if (error instanceof ConflictError) {
    return new HttpError(409, error.code, error.message);
  }
  if (error instanceof PatientNotFoundError) {
    return new HttpError(404, error.code, error.message);
  }
  return error;
}

function readConversationId(req: {
  header(name: string): string | undefined;
}): string | null {
  const raw =
    req.header('x-conversation-id')?.trim() ||
    req.header('x-session-id')?.trim();
  return raw || null;
}
