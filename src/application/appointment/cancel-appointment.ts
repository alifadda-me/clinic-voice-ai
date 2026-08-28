import {
  asAppointmentId,
  asPatientId,
  type Appointment,
} from '../../domain/index.js';
import type { AppointmentRepository } from '../../ports/clinic/repositories.js';
import type { CalendarGateway } from '../../ports/platform/calendar-gateway.js';
import type { Clock } from '../../ports/platform/time.js';
import { AppointmentNotFoundError } from '../shared/errors.js';
import { assertAppointmentOwnedBy } from '../shared/guards.js';

/**
 * Cancel boundary:
 * 1. Load + authorize ownership (application)
 * 2. Domain transition to cancelled
 * 3. Persist cancellation
 * 4. Best-effort releaseReservation (retryable if this step fails)
 *
 * Prefer persist-before-release so a failed release leaves a cancelled
 * appointment (reconcile calendar) rather than an active appointment with
 * a freed slot.
 *
 * Idempotency: cancelling an already-cancelled appointment fails with
 * InvalidAppointmentTransitionError — callers may treat that as success
 * for the same actor once a dedicated idempotent cancel is added.
 */
export type CancelAppointmentInput = {
  appointmentId: string;
  patientId: string;
};

export class CancelAppointment {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly calendar: CalendarGateway,
    private readonly clock: Clock,
  ) {}

  async execute(input: CancelAppointmentInput): Promise<Appointment> {
    const appointment = await this.appointments.findById(
      asAppointmentId(input.appointmentId),
    );
    if (!appointment) {
      throw new AppointmentNotFoundError(input.appointmentId);
    }

    assertAppointmentOwnedBy(appointment, asPatientId(input.patientId));

    const cancelled = appointment.cancel(this.clock.now());
    const saved = await this.appointments.save(cancelled);

    if (appointment.externalCalendarRef) {
      try {
        await this.calendar.releaseReservation(appointment.externalCalendarRef);
      } catch {
        // Persist-before-release: appointment is already cancelled.
        // Calendar orphan must be reconciled/retried out of band.
      }
    }

    return saved;
  }
}
