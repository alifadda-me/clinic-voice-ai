import type { AuthenticatedPrincipal } from '../ports/platform/auth.js';
import type { ClinicActor } from '../application/identity/resolve-clinic-actor.js';

/**
 * Interface / channel that produced this turn.
 * Metrics and future adapters only — never grants authority.
 */
export type ExecutionChannel =
  | 'http_chat'
  | 'voice'
  | 'twilio_voice'
  | 'unknown';

/**
 * Immutable trusted context for one agent turn.
 * Built at the interface boundary — never mutated by tools or the model.
 */
export type TrustedExecutionContext = {
  readonly conversationId: string;
  readonly principal: AuthenticatedPrincipal | null;
  readonly actor: ClinicActor | null;
  /** Channel label for observability / routing — not identity. */
  readonly channel: ExecutionChannel;
  /** Opaque correlation id for traces (Opik later) — not identity. */
  readonly requestCorrelationId: string | null;
};

export function createTrustedExecutionContext(input: {
  conversationId: string;
  principal: AuthenticatedPrincipal | null;
  actor: ClinicActor | null;
  channel?: ExecutionChannel | undefined;
  requestCorrelationId?: string | null | undefined;
}): TrustedExecutionContext {
  const ctx: TrustedExecutionContext = {
    conversationId: input.conversationId,
    principal: input.principal
      ? Object.freeze({ subjectId: input.principal.subjectId })
      : null,
    actor: input.actor
      ? Object.freeze({ patientId: input.actor.patientId })
      : null,
    channel: input.channel ?? 'unknown',
    requestCorrelationId: input.requestCorrelationId ?? null,
  };
  return Object.freeze(ctx);
}
