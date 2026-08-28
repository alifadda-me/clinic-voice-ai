/**
 * Scheduling contracts — concurrency, transactions, idempotency.
 *
 * ## Double-booking (A/B race)
 *
 * Forbidden pattern:
 *   isAvailable() → available
 *   isAvailable() → available
 *   reserve() / save()
 *
 * Required pattern:
 *   CalendarGateway.reserveSlot()     — atomic claim or CalendarSlotUnavailableError
 *   AppointmentRepository.createIfNoConflict() — atomic local exclusion or SchedulingConflictError
 *
 * BookAppointment order:
 *   validate → fail-fast policy → reserveSlot → createIfNoConflict
 *   on persist failure → releaseReservation (compensation)
 *
 * ## Not one ACID transaction
 *
 * Calendar + DB cannot be a single distributed ACID tx.
 * Documented failure modes (deferred solutions: outbox / saga / reconciler):
 * - calendar ok, DB fail → releaseReservation
 * - calendar ok, crash before DB → orphaned reservation
 * - DB ok, calendar release fail on cancel → cancelled row + busy calendar
 * - DB reschedule ok, calendar reschedule fail → local/external slot skew
 *
 * ## Idempotency
 *
 * BookAppointmentInput.idempotencyKey:
 * - findByIdempotencyKey returns prior appointment
 * - reserveSlot with same key returns prior reservation
 * Cancel/reschedule: future work may add keys; today transitions fail closed
 * on illegal status (callers may map duplicate cancel to success later).
 *
 * ## Google Calendar adapter limitations
 *
 * freebusy + insert is not perfectly atomic (TOCTOU race window).
 * Postgres createIfNoConflict / EXCLUDE constraints remain the durable
 * clinic-side backstop. See infrastructure/calendar/CONSISTENCY.md.ts.
 */

export {};
