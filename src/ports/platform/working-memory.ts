/**
 * Platform working memory — short-lived conversational session state.
 *
 * Capability-oriented: no Redis commands, no clinic entity names.
 *
 * NOT a source of truth for patients, appointments, preferences, or doctors.
 * Patient identity binding belongs to the interface/session layer — do not
 * treat WorkingMemory metadata as trusted authorization.
 *
 * Failure: adapters may throw WorkingMemoryUnavailableError /
 * WorkingMemorySessionNotFoundError / WorkingMemoryCorruptedError.
 * Durable clinic operations must not require WorkingMemory to succeed.
 */

export type MemoryRole = 'user' | 'assistant' | 'system';

export type MemoryTurn = {
  role: MemoryRole;
  content: string;
  at: Date;
};

export type SessionMemory = {
  sessionId: string;
  turns: MemoryTurn[];
  /** Opaque session metadata only — never durable clinic facts. */
  metadata: Record<string, string>;
};

export class WorkingMemorySessionNotFoundError extends Error {
  readonly code = 'WORKING_MEMORY_SESSION_NOT_FOUND';

  constructor(sessionId: string) {
    super(`Working memory session '${sessionId}' was not found`);
    this.name = 'WorkingMemorySessionNotFoundError';
  }
}

export class WorkingMemoryUnavailableError extends Error {
  readonly code = 'WORKING_MEMORY_UNAVAILABLE';

  constructor(message = 'Working memory is temporarily unavailable') {
    super(message);
    this.name = 'WorkingMemoryUnavailableError';
  }
}

export class WorkingMemoryCorruptedError extends Error {
  readonly code = 'WORKING_MEMORY_CORRUPTED';

  constructor(sessionId: string, detail?: string) {
    super(
      `Working memory session '${sessionId}' contains unreadable data${
        detail ? `: ${detail}` : ''
      }`,
    );
    this.name = 'WorkingMemoryCorruptedError';
  }
}

export interface WorkingMemory {
  createSession(
    sessionId: string,
    metadata?: Record<string, string>,
  ): Promise<void>;

  /** Returns null if the session does not exist or has expired. */
  getSession(sessionId: string): Promise<SessionMemory | null>;

  /**
   * Recent turns in chronological order (oldest → newest within the window).
   * Empty array if the session is missing/expired.
   */
  getRecentTurns(sessionId: string, limit: number): Promise<MemoryTurn[]>;

  /**
   * Append a turn. Ordering: appends are sequential per session;
   * concurrent appends must not silently drop turns.
   * Throws WorkingMemorySessionNotFoundError if session missing.
   */
  appendTurn(sessionId: string, turn: MemoryTurn): Promise<void>;

  /** Merge opaque metadata keys (does not delete unspecified keys). */
  mergeMetadata(
    sessionId: string,
    metadata: Record<string, string>,
  ): Promise<void>;

  clearSession(sessionId: string): Promise<void>;
}
