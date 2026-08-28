import { describe, expect, it } from 'vitest';
import {
  Appointment,
  AppointmentStatuses,
  PhoneNumber,
  TimeSlot,
  asAppointmentId,
  asDoctorId,
  asPatientId,
  InvalidAppointmentTransitionError,
  AppointmentNotSchedulableError,
  InvalidPhoneNumberError,
  InvalidTimeSlotError,
} from '../../src/domain/index.js';

describe('PhoneNumber', () => {
  it('normalizes and accepts valid numbers', () => {
    expect(PhoneNumber.create('+20 101 234 5678').value).toBe('+201012345678');
  });

  it('rejects invalid numbers', () => {
    expect(() => PhoneNumber.create('abc')).toThrow(InvalidPhoneNumberError);
  });
});

describe('TimeSlot', () => {
  it('rejects end before or equal to start', () => {
    const t = new Date('2026-08-25T10:00:00.000Z');
    expect(() => TimeSlot.create(t, t)).toThrow(InvalidTimeSlotError);
  });

  it('detects overlap', () => {
    const a = TimeSlot.create(
      new Date('2026-08-25T10:00:00.000Z'),
      new Date('2026-08-25T10:30:00.000Z'),
    );
    const b = TimeSlot.create(
      new Date('2026-08-25T10:15:00.000Z'),
      new Date('2026-08-25T10:45:00.000Z'),
    );
    const c = TimeSlot.create(
      new Date('2026-08-25T10:30:00.000Z'),
      new Date('2026-08-25T11:00:00.000Z'),
    );
    expect(a.overlaps(b)).toBe(true);
    expect(a.overlaps(c)).toBe(false);
  });
});

describe('Appointment lifecycle', () => {
  const now = new Date('2026-08-24T09:00:00.000Z');
  const slot = TimeSlot.create(
    new Date('2026-08-25T10:00:00.000Z'),
    new Date('2026-08-25T10:30:00.000Z'),
  );

  function scheduled() {
    return Appointment.schedule({
      id: asAppointmentId('appt_1'),
      patientId: asPatientId('pat_1'),
      doctorId: asDoctorId('doc_1'),
      slot,
      now,
    });
  }

  it('creates scheduled appointments', () => {
    expect(scheduled().status).toBe(AppointmentStatuses.Scheduled);
  });

  it('rejects scheduling in the past', () => {
    const past = TimeSlot.create(
      new Date('2026-08-20T10:00:00.000Z'),
      new Date('2026-08-20T10:30:00.000Z'),
    );
    expect(() =>
      Appointment.schedule({
        id: asAppointmentId('appt_2'),
        patientId: asPatientId('pat_1'),
        doctorId: asDoctorId('doc_1'),
        slot: past,
        now,
      }),
    ).toThrow(AppointmentNotSchedulableError);
  });

  it('allows cancel from scheduled (ownership is application concern)', () => {
    expect(scheduled().cancel(now).status).toBe(AppointmentStatuses.Cancelled);
  });

  it('rejects cancel from cancelled', () => {
    const cancelled = scheduled().cancel(now);
    expect(() => cancelled.cancel(now)).toThrow(
      InvalidAppointmentTransitionError,
    );
  });

  it('allows complete from scheduled', () => {
    expect(scheduled().complete(now).status).toBe(
      AppointmentStatuses.Completed,
    );
  });

  it('rejects complete from cancelled', () => {
    const cancelled = scheduled().cancel(now);
    expect(() => cancelled.complete(now)).toThrow(
      InvalidAppointmentTransitionError,
    );
  });

  it('reschedules while remaining scheduled', () => {
    const next = TimeSlot.create(
      new Date('2026-08-26T11:00:00.000Z'),
      new Date('2026-08-26T11:30:00.000Z'),
    );
    const updated = scheduled().reschedule(next, now);
    expect(updated.status).toBe(AppointmentStatuses.Scheduled);
    expect(updated.slot.start.toISOString()).toBe(next.start.toISOString());
  });

  it('rejects reschedule of cancelled appointment', () => {
    const cancelled = scheduled().cancel(now);
    const next = TimeSlot.create(
      new Date('2026-08-26T11:00:00.000Z'),
      new Date('2026-08-26T11:30:00.000Z'),
    );
    expect(() => cancelled.reschedule(next, now)).toThrow(
      InvalidAppointmentTransitionError,
    );
  });

  it('reports ownership without enforcing authorization', () => {
    const appt = scheduled();
    expect(appt.isOwnedBy(asPatientId('pat_1'))).toBe(true);
    expect(appt.isOwnedBy(asPatientId('pat_other'))).toBe(false);
  });
});
