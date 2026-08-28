import type { Doctor } from '../doctor/doctor.js';
import type { TimeSlot } from '../shared/time-slot.js';
import { SchedulingConflictError } from '../shared/errors.js';
import type { Appointment } from './appointment.js';
import type { AppointmentId } from '../shared/ids.js';

/**
 * Domain scheduling rules over already-loaded aggregates.
 * Does not know about calendars, databases, or concurrency primitives.
 *
 * Authoritative conflict prevention under concurrency is the repository
 * contract `createIfNoConflict` / `updateSlotIfNoConflict` — adapters must
 * enforce that atomically. This policy is for fail-fast validation.
 */
export const AppointmentPolicy = {
  assertDoctorCanBeBooked(doctor: Doctor): void {
    doctor.assertActive();
  },

  assertNoDoctorConflict(
    doctorAppointments: readonly Appointment[],
    slot: TimeSlot,
    excludeAppointmentId?: AppointmentId,
  ): void {
    for (const existing of doctorAppointments) {
      if (!existing.isActive()) continue;
      if (excludeAppointmentId && existing.id === excludeAppointmentId) continue;
      if (existing.slot.overlaps(slot)) {
        throw new SchedulingConflictError(
          `Doctor already has an appointment overlapping ${slot.start.toISOString()}`,
        );
      }
    }
  },

  assertNoPatientConflict(
    patientAppointments: readonly Appointment[],
    slot: TimeSlot,
    excludeAppointmentId?: AppointmentId,
  ): void {
    for (const existing of patientAppointments) {
      if (!existing.isActive()) continue;
      if (excludeAppointmentId && existing.id === excludeAppointmentId) continue;
      if (existing.slot.overlaps(slot)) {
        throw new SchedulingConflictError(
          `Patient already has an appointment overlapping ${slot.start.toISOString()}`,
        );
      }
    }
  },
} as const;
