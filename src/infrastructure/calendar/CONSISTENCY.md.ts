/**
 * Calendar + PostgreSQL consistency model
 * =======================================
 *
 * NOT an ACID distributed transaction.
 *
 * BookAppointment:
 *   reserveSlot(calendar) → createIfNoConflict(postgres)
 *   on postgres failure → releaseReservation(calendar) compensation
 *
 * Failure windows:
 * - calendar fail → nothing durable
 * - calendar ok, postgres fail → compensated release (best effort)
 * - calendar ok, crash before postgres → orphaned calendar event (reconciler later)
 * - postgres ok → durable; calendar already reserved
 *
 * CancelAppointment:
 *   persist cancelled → best-effort releaseReservation
 *   release failure → cancelled row + busy calendar (retry release)
 *
 * RescheduleAppointment:
 *   updateSlotIfNoConflict(postgres) → rescheduleReservation(calendar)
 *   calendar fail after postgres → local/external skew (reconciler later)
 *
 * Google adapter limitations:
 * - freebusy + insert is not perfectly atomic (TOCTOU)
 * - Postgres exclusion constraints remain the clinic SoT backstop
 */

export {};
