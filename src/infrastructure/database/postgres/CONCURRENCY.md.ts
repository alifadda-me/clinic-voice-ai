/**
 * PostgreSQL concurrency guarantees for appointments
 * ==================================================
 *
 * Extension: btree_gist (equality + range in one EXCLUDE index)
 *
 * Constraints (WHERE status = 'scheduled'):
 * - appointments_doctor_no_overlap_excl
 *     EXCLUDE (doctor_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
 * - appointments_patient_no_overlap_excl
 *     EXCLUDE (patient_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
 *
 * Semantics:
 * - Half-open ranges [start, end) so back-to-back slots do not conflict
 * - Cancelled/completed rows are excluded from the index predicate
 * - Concurrent INSERT/UPDATE that would overlap raise SQLSTATE 23P01
 *   which adapters map to SchedulingConflictError
 *
 * Idempotency:
 * - UNIQUE INDEX on idempotency_key WHERE NOT NULL
 * - Concurrent inserts with the same key: one wins, other gets 23505;
 *   createIfNoConflict reloads and returns the winner
 *
 * What this does NOT guarantee:
 * - CalendarGateway consistency (separate system)
 * - Cross-database distributed transactions
 */

export {};
