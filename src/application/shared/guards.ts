import type { Appointment, PatientId } from '../../domain/index.js';
import {
  AppointmentNotOwnedError,
  ValidationError,
} from '../shared/errors.js';

/** Authorization: never trust the agent/LLM for ownership. */
export function assertAppointmentOwnedBy(
  appointment: Appointment,
  actingPatientId: PatientId,
): void {
  if (!appointment.isOwnedBy(actingPatientId)) {
    throw new AppointmentNotOwnedError();
  }
}

/** Parses external ISO input. Not a substitute for Clock.now(). */
export function parseIsoDate(value: string, label: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`${label} must be a valid ISO datetime`);
  }
  return date;
}
