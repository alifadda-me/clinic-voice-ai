import type { AppointmentId, DoctorId, PatientId } from '../shared/ids.js';
import {
  AppointmentNotSchedulableError,
  InvalidAppointmentTransitionError,
} from '../shared/errors.js';
import { TimeSlot } from '../shared/time-slot.js';
import {
  AppointmentStatuses,
  type AppointmentStatus,
  canCancel,
  canComplete,
  canReschedule,
} from './appointment-status.js';

export type AppointmentProps = {
  id: AppointmentId;
  patientId: PatientId;
  doctorId: DoctorId;
  slot: TimeSlot;
  status: AppointmentStatus;
  reason?: string | undefined;
  /**
   * Opaque correlation to an external calendar reservation.
   * Domain never interprets provider IDs — adapters own the meaning.
   */
  externalCalendarRef?: string | undefined;
  /** Optional client idempotency key for safe retries of create. */
  idempotencyKey?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
};

export type ScheduleAppointmentParams = {
  id: AppointmentId;
  patientId: PatientId;
  doctorId: DoctorId;
  slot: TimeSlot;
  now: Date;
  reason?: string | undefined;
  externalCalendarRef?: string | undefined;
  idempotencyKey?: string | undefined;
};

/**
 * Appointment aggregate root.
 *
 * Owns: lifecycle status transitions, slot validity relative to `now`,
 * patient/doctor identity references, opaque calendar correlation.
 *
 * Does NOT own: authorization (who may act), peer conflict detection under
 * concurrency, or external calendar availability.
 */
export class Appointment {
  readonly id: AppointmentId;
  readonly patientId: PatientId;
  readonly doctorId: DoctorId;
  readonly slot: TimeSlot;
  readonly status: AppointmentStatus;
  readonly reason: string | undefined;
  readonly externalCalendarRef: string | undefined;
  readonly idempotencyKey: string | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: AppointmentProps) {
    this.id = props.id;
    this.patientId = props.patientId;
    this.doctorId = props.doctorId;
    this.slot = props.slot;
    this.status = props.status;
    this.reason = props.reason;
    this.externalCalendarRef = props.externalCalendarRef;
    this.idempotencyKey = props.idempotencyKey;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static schedule(params: ScheduleAppointmentParams): Appointment {
    if (params.slot.isInPast(params.now)) {
      throw new AppointmentNotSchedulableError(
        'Cannot schedule an appointment in the past',
      );
    }

    return new Appointment({
      id: params.id,
      patientId: params.patientId,
      doctorId: params.doctorId,
      slot: params.slot,
      status: AppointmentStatuses.Scheduled,
      reason: params.reason?.trim() || undefined,
      externalCalendarRef: params.externalCalendarRef,
      idempotencyKey: params.idempotencyKey,
      createdAt: params.now,
      updatedAt: params.now,
    });
  }

  static rehydrate(props: AppointmentProps): Appointment {
    return new Appointment(props);
  }

  isOwnedBy(patientId: PatientId): boolean {
    return this.patientId === patientId;
  }

  cancel(now: Date): Appointment {
    if (!canCancel(this.status)) {
      throw new InvalidAppointmentTransitionError(
        this.status,
        AppointmentStatuses.Cancelled,
      );
    }
    return this.withStatus(AppointmentStatuses.Cancelled, now);
  }

  complete(now: Date): Appointment {
    if (!canComplete(this.status)) {
      throw new InvalidAppointmentTransitionError(
        this.status,
        AppointmentStatuses.Completed,
      );
    }
    return this.withStatus(AppointmentStatuses.Completed, now);
  }

  reschedule(newSlot: TimeSlot, now: Date): Appointment {
    if (!canReschedule(this.status)) {
      throw new InvalidAppointmentTransitionError(
        this.status,
        AppointmentStatuses.Scheduled,
      );
    }
    if (newSlot.isInPast(now)) {
      throw new AppointmentNotSchedulableError(
        'Cannot reschedule an appointment into the past',
      );
    }
    if (newSlot.equals(this.slot)) {
      throw new AppointmentNotSchedulableError(
        'New time slot must differ from the current slot',
      );
    }

    return new Appointment({
      id: this.id,
      patientId: this.patientId,
      doctorId: this.doctorId,
      slot: newSlot,
      status: AppointmentStatuses.Scheduled,
      reason: this.reason,
      externalCalendarRef: this.externalCalendarRef,
      idempotencyKey: this.idempotencyKey,
      createdAt: this.createdAt,
      updatedAt: now,
    });
  }

  withExternalCalendarRef(ref: string, now: Date): Appointment {
    return new Appointment({
      id: this.id,
      patientId: this.patientId,
      doctorId: this.doctorId,
      slot: this.slot,
      status: this.status,
      reason: this.reason,
      externalCalendarRef: ref,
      idempotencyKey: this.idempotencyKey,
      createdAt: this.createdAt,
      updatedAt: now,
    });
  }

  isActive(): boolean {
    return this.status === AppointmentStatuses.Scheduled;
  }

  private withStatus(status: AppointmentStatus, now: Date): Appointment {
    return new Appointment({
      id: this.id,
      patientId: this.patientId,
      doctorId: this.doctorId,
      slot: this.slot,
      status,
      reason: this.reason,
      externalCalendarRef: this.externalCalendarRef,
      idempotencyKey: this.idempotencyKey,
      createdAt: this.createdAt,
      updatedAt: now,
    });
  }
}
