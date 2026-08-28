/**
 * Redis WorkingMemory semantics
 * =============================
 *
 * Data model (infrastructure only):
 *   {prefix}:{sessionId}:meta   HASH  — opaque metadata string fields
 *   {prefix}:{sessionId}:turns  LIST  — JSON-serialized MemoryTurn, RPUSH order
 *
 * Ordering:
 *   Appends use RPUSH (atomic). Concurrent appends do not drop turns.
 *   getRecentTurns returns chronological order within the requested window.
 *
 * Append / clear race:
 *   appendTurn uses a Lua script so "session exists → RPUSH → LTRIM → EXPIRE"
 *   is one Redis atomic unit. No distributed locks.
 *   clearSession deletes both keys; a concurrent append either fully lands
 *   (session still existed) or fully rejects (SessionNotFound). No orphan
 *   half-written turn from the check-then-act path.
 *
 * TTL:
 *   Both keys share the configured TTL. Writes refresh TTL (sliding window).
 *   Expired sessions surface as missing (null / empty / SessionNotFound).
 *
 * Failure:
 *   Redis/network errors → WorkingMemoryUnavailableError
 *   Corrupt turn JSON → WorkingMemoryCorruptedError
 *   Durable clinic ops must not require WorkingMemory availability.
 *
 * NOT stored:
 *   patient profiles, appointments, preferences, doctor catalog
 */

export {};
