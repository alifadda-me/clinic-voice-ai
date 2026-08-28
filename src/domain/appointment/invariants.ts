/**
 * Pure domain invariants vs application vs infrastructure.
 *
 * Pure domain (Appointment / TimeSlot / Doctor entity):
 * - TimeSlot end > start
 * - cancelled/completed are terminal (no re-cancel / no reschedule)
 * - cannot schedule/reschedule into the past (relative to Clock.now())
 * - reschedule must change the slot
 * - inactive doctor cannot be booked (Doctor.assertActive)
 *
 * Domain policy over a loaded peer set (still domain logic, orchestrated by app):
 * - overlapping active appointments for same doctor/patient are conflicts
 *
 * Application / use-case:
 * - acting patient owns the appointment (authorization)
 * - patient/doctor/specialty must exist
 * - calendar slot must be reserved successfully before treating booking as durable
 * - idempotent retry semantics for book/cancel/reschedule
 *
 * Infrastructure consistency (NOT one ACID transaction):
 * - calendar reservation exists iff appointment.externalCalendarRef is set
 * - createIfNoConflict / reserveSlot must be concurrency-safe in real adapters
 * - failure modes require compensation (release reservation) or retry of release
 */

export {};
