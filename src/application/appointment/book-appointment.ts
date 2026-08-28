import {
  Appointment,
  AppointmentPolicy,
  asAppointmentId,
  asDoctorId,
  asPatientId,
  TimeSlot,
  SchedulingConflictError,
} from '../../domain/index.js';
import type {
  AppointmentRepository,
  DoctorRepository,
  PatientRepository,
} from '../../ports/clinic/repositories.js';
import type { CalendarGateway } from '../../ports/platform/calendar-gateway.js';
import type { Clock, IdGenerator } from '../../ports/platform/time.js';
import {
  DoctorNotFoundError,
  PatientNotFoundError,
  ValidationError,
} from '../shared/errors.js';
import { mapCalendarError } from '../shared/calendar-errors.js';
import { parseIsoDate } from '../shared/guards.js';

/**
 * BookAppointment transaction boundary (NOT a single ACID tx):
 *
 * 1. Validate patient/doctor + fail-fast conflict policy
 * 2. Atomic calendar reserveSlot
 * 3. Atomic createIfNoConflict persistence
 * 4. On persist failure → compensate with releaseReservation
 *
 * Failure modes:
 * - calendar ok, DB conflict/fail → release reservation
 * - calendar fail → nothing persisted
 * - crash after calendar, before DB → orphaned reservation (needs reconciliation later)
 * - crash after DB → durable appointment; calendar already reserved
 *
 * Idempotency: pass idempotencyKey so retries return the first successful booking.
 */
export type BookAppointmentInput = {
  patientId: string;
  doctorId: string;
  start: string;
  end: string;
  reason?: string;
  idempotencyKey?: string;
};

export class BookAppointment {
  constructor(
    private readonly patients: PatientRepository,
    private readonly doctors: DoctorRepository,
    private readonly appointments: AppointmentRepository,
    private readonly calendar: CalendarGateway,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: BookAppointmentInput): Promise<Appointment> {
    if (input.idempotencyKey) {
      const existing = await this.appointments.findByIdempotencyKey(
        input.idempotencyKey,
      );
      if (existing) return existing;
    }

    const patientId = asPatientId(input.patientId);
    const doctorId = asDoctorId(input.doctorId);

    const patient = await this.patients.findById(patientId);
    if (!patient) throw new PatientNotFoundError(input.patientId);

    const doctor = await this.doctors.findById(doctorId);
    if (!doctor) throw new DoctorNotFoundError(input.doctorId);

    AppointmentPolicy.assertDoctorCanBeBooked(doctor);

    const slot = TimeSlot.create(
      parseIsoDate(input.start, 'start'),
      parseIsoDate(input.end, 'end'),
    );
    const now = this.clock.now();

    const [doctorAppts, patientAppts] = await Promise.all([
      this.appointments.findMany({ doctorId, activeOnly: true }),
      this.appointments.findMany({ patientId, activeOnly: true }),
    ]);
    AppointmentPolicy.assertNoDoctorConflict(doctorAppts, slot);
    AppointmentPolicy.assertNoPatientConflict(patientAppts, slot);

    let reservation;
    try {
      reservation = await this.calendar.reserveSlot({
        resourceId: doctor.schedulingResourceId(),
        slot,
        title: `Appointment: ${patient.fullName ?? patient.id} / ${doctor.fullName}`,
        metadata: {
          patientId: patient.id,
          doctorId: doctor.id,
        },
        idempotencyKey: input.idempotencyKey,
      });
    } catch (error) {
      mapCalendarError(error);
    }

    try {
      const appointment = Appointment.schedule({
        id: asAppointmentId(this.ids.generate('appt')),
        patientId,
        doctorId,
        slot,
        now,
        reason: input.reason,
        externalCalendarRef: reservation.reservationId,
        idempotencyKey: input.idempotencyKey,
      });

      return await this.appointments.createIfNoConflict(appointment);
    } catch (error) {
      await this.calendar.releaseReservation(reservation.reservationId);
      if (error instanceof SchedulingConflictError) {
        throw error;
      }
      if (error instanceof ValidationError) {
        throw error;
      }
      throw error;
    }
  }
}
