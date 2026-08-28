import {
  AppointmentPolicy,
  asAppointmentId,
  asPatientId,
  TimeSlot,
  type Appointment,
} from '../../domain/index.js';
import type {
  AppointmentRepository,
  DoctorRepository,
} from '../../ports/clinic/repositories.js';
import type { CalendarGateway } from '../../ports/platform/calendar-gateway.js';
import type { Clock } from '../../ports/platform/time.js';
import {
  AppointmentNotFoundError,
  DoctorNotFoundError,
} from '../shared/errors.js';
import { mapCalendarError } from '../shared/calendar-errors.js';
import {
  assertAppointmentOwnedBy,
  parseIsoDate,
} from '../shared/guards.js';

/**
 * Reschedule boundary:
 * 1. Authorize ownership + domain transition (in memory)
 * 2. Fail-fast conflict policy
 * 3. updateSlotIfNoConflict (authoritative local concurrency)
 * 4. rescheduleReservation on calendar
 * 5. If calendar fails after DB update — compensation is deferred
 *    (appointment points at old external ref / needs reconciliation)
 *
 * Ideal future: outbox or saga. Not implemented yet.
 */
export type RescheduleAppointmentInput = {
  appointmentId: string;
  patientId: string;
  start: string;
  end: string;
};

export class RescheduleAppointment {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly doctors: DoctorRepository,
    private readonly calendar: CalendarGateway,
    private readonly clock: Clock,
  ) {}

  async execute(input: RescheduleAppointmentInput): Promise<Appointment> {
    const appointment = await this.appointments.findById(
      asAppointmentId(input.appointmentId),
    );
    if (!appointment) {
      throw new AppointmentNotFoundError(input.appointmentId);
    }

    const patientId = asPatientId(input.patientId);
    assertAppointmentOwnedBy(appointment, patientId);

    const newSlot = TimeSlot.create(
      parseIsoDate(input.start, 'start'),
      parseIsoDate(input.end, 'end'),
    );
    const now = this.clock.now();
    const rescheduled = appointment.reschedule(newSlot, now);

    const doctor = await this.doctors.findById(appointment.doctorId);
    if (!doctor) {
      throw new DoctorNotFoundError(appointment.doctorId);
    }
    AppointmentPolicy.assertDoctorCanBeBooked(doctor);

    const [doctorAppts, patientAppts] = await Promise.all([
      this.appointments.findMany({
        doctorId: appointment.doctorId,
        activeOnly: true,
      }),
      this.appointments.findMany({
        patientId: appointment.patientId,
        activeOnly: true,
      }),
    ]);
    AppointmentPolicy.assertNoDoctorConflict(
      doctorAppts,
      newSlot,
      appointment.id,
    );
    AppointmentPolicy.assertNoPatientConflict(
      patientAppts,
      newSlot,
      appointment.id,
    );

    const persisted = await this.appointments.updateSlotIfNoConflict(rescheduled);

    if (!appointment.externalCalendarRef) {
      return persisted;
    }

    try {
      const updated = await this.calendar.rescheduleReservation(
        appointment.externalCalendarRef,
        newSlot,
      );
      return this.appointments.save(
        persisted.withExternalCalendarRef(updated.reservationId, now),
      );
    } catch (error) {
      // Local DB already moved — surface calendar failure; reconciliation needed.
      mapCalendarError(error);
    }
  }
}
