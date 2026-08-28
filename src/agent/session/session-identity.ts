/**
 * Session identity store — permanently non-authoritative.
 *
 * Use ConversationRegistry for conversation correlation and
 * TrustedExecutionContext for patient authority.
 *
 * bindPatient always throws so voice/Twilio cannot revive session-bind authority.
 */

export type TrustedSession = {
  sessionId: string;
  /** Never use as auth — see TrustedExecutionContext.actor */
  patientId?: string | undefined;
};

export interface SessionIdentityStore {
  ensure(sessionId: string): Promise<void>;
  get(sessionId: string): Promise<TrustedSession | null>;
  bindPatient(sessionId: string, patientId: string): Promise<void>;
}

/** bindPatient always throws — use LinkPrincipalToPatient / EnrollAuthenticatedPatient. */
export class InMemorySessionIdentityStore implements SessionIdentityStore {
  private readonly sessions = new Map<string, TrustedSession>();

  async ensure(sessionId: string): Promise<void> {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, { sessionId });
    }
  }

  async get(sessionId: string): Promise<TrustedSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async bindPatient(_sessionId: string, _patientId: string): Promise<never> {
    throw new Error(
      'SessionIdentityStore.bindPatient is permanently removed. ' +
        'Use LinkPrincipalToPatient / EnrollAuthenticatedPatient outside the agent tool loop. ' +
        'conversationId and sessionId never grant patient authority.',
    );
  }
}
