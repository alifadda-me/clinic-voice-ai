/**
 * Appointment lifecycle (v1 — administrative clinic booking)
 *
 * Decision: omit `requested`.
 *
 * BookAppointment confirms a concrete slot against availability and calendar,
 * so the durable state after a successful book is `scheduled`. A separate
 * `requested` state would imply staff approval or async confirmation, which
 * we do not have a use case for yet.
 *
 * Transitions:
 *   scheduled ──cancel──► cancelled   (terminal)
 *   scheduled ──complete─► completed  (terminal)
 *   scheduled ──reschedule─► scheduled (same status, new TimeSlot)
 */
export const AppointmentStatuses = {
  Scheduled: 'scheduled',
  Cancelled: 'cancelled',
  Completed: 'completed',
} as const;

export type AppointmentStatus =
  (typeof AppointmentStatuses)[keyof typeof AppointmentStatuses];

const TERMINAL: ReadonlySet<AppointmentStatus> = new Set([
  AppointmentStatuses.Cancelled,
  AppointmentStatuses.Completed,
]);

export function isTerminalStatus(status: AppointmentStatus): boolean {
  return TERMINAL.has(status);
}

export function canCancel(status: AppointmentStatus): boolean {
  return status === AppointmentStatuses.Scheduled;
}

export function canComplete(status: AppointmentStatus): boolean {
  return status === AppointmentStatuses.Scheduled;
}

export function canReschedule(status: AppointmentStatus): boolean {
  return status === AppointmentStatuses.Scheduled;
}
