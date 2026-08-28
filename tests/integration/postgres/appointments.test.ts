import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  Appointment,
  Doctor,
  Patient,
  PhoneNumber,
  Specialty,
  TimeSlot,
  SchedulingConflictError,
  asAppointmentId,
  asClinicId,
  asDoctorId,
  asPatientId,
  asSpecialtyId,
  AppointmentStatuses,
} from '../../../src/domain/index.js';
import { createPostgresInfrastructure } from '../../../src/infrastructure/database/postgres/index.js';
import { clinics } from '../../../src/infrastructure/database/postgres/schema.js';
import { FixedClock } from '../../../src/infrastructure/memory/platform/clock-and-ids.js';
import type { PostgresInfrastructure } from '../../../src/infrastructure/database/postgres/index.js';

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://clinic:clinic@localhost:54329/clinic_voice_ai';

describe('PostgreSQL appointment repository', () => {
  let infra: PostgresInfrastructure;
  const clock = new FixedClock(new Date('2026-08-24T09:00:00.000Z'));

  beforeAll(async () => {
    infra = createPostgresInfrastructure(
      { databaseUrl: DATABASE_URL },
      { clock },
    );
    // Sanity: can connect
    await infra.db.execute(sql`select 1`);
  });

  afterAll(async () => {
    await infra.close();
  });

  beforeEach(async () => {
    await infra.db.execute(sql`
      truncate table principal_patient_links, patient_preferences, appointments, doctor_specialties,
        doctors, specialties, patients, clinics restart identity cascade
    `);
  });

  async function seedDoctor() {
    const clinicId = asClinicId(randomUUID());
    await infra.db.insert(clinics).values({
      id: clinicId,
      name: 'Demo Clinic',
      timezone: 'Africa/Cairo',
    });

    const specialty = Specialty.create({
      id: asSpecialtyId(randomUUID()),
      name: `Cardiology-${randomUUID().slice(0, 8)}`,
    });
    await infra.repositories.specialties.save(specialty);

    const doctor = Doctor.create({
      id: asDoctorId(randomUUID()),
      clinicId,
      fullName: 'Dr Sara',
      specialtyIds: [specialty.id],
      calendarResourceId: 'cal_sara',
    });
    await infra.repositories.doctors.save(doctor);

    const patient = Patient.create({
      id: asPatientId(randomUUID()),
      phoneNumber: PhoneNumber.create(
        `+2010${randomUUID().replace(/\D/g, '').slice(0, 8).padEnd(8, '0')}`,
      ),
      fullName: 'Ali',
      createdAt: clock.now(),
    });
    await infra.repositories.patients.save(patient);

    return { doctor, patient, specialty, clinicId };
  }

  function slot(startHour: number, endHour: number) {
    return TimeSlot.create(
      new Date(`2026-08-25T${String(startHour).padStart(2, '0')}:00:00.000Z`),
      new Date(`2026-08-25T${String(endHour).padStart(2, '0')}:00:00.000Z`),
    );
  }

  it('round-trips patient, specialty, doctor, preference, appointment', async () => {
    const { doctor, patient, specialty } = await seedDoctor();

    const loadedDoctor = await infra.repositories.doctors.findById(doctor.id);
    expect(loadedDoctor?.specialtyIds).toEqual([specialty.id]);
    expect(loadedDoctor?.clinicId).toBe(doctor.clinicId);

    const appt = Appointment.schedule({
      id: asAppointmentId(randomUUID()),
      patientId: patient.id,
      doctorId: doctor.id,
      slot: slot(10, 11),
      now: clock.now(),
      reason: 'Checkup',
    });
    const saved = await infra.repositories.appointments.createIfNoConflict(appt);
    const loaded = await infra.repositories.appointments.findById(saved.id);
    expect(loaded?.status).toBe(AppointmentStatuses.Scheduled);
    expect(loaded?.slot.start.toISOString()).toBe(appt.slot.start.toISOString());
  });

  it('enforces unique idempotency key under concurrency', async () => {
    const { doctor, patient } = await seedDoctor();
    const key = `idem-${randomUUID()}`;

    const make = () =>
      Appointment.schedule({
        id: asAppointmentId(randomUUID()),
        patientId: patient.id,
        doctorId: doctor.id,
        slot: slot(10, 11),
        now: clock.now(),
        idempotencyKey: key,
      });

    const results = await Promise.all([
      infra.repositories.appointments.createIfNoConflict(make()),
      infra.repositories.appointments.createIfNoConflict(make()),
    ]);

    expect(results[0]!.id).toBe(results[1]!.id);
    const all = await infra.repositories.appointments.findMany({
      doctorId: doctor.id,
      activeOnly: true,
    });
    expect(all).toHaveLength(1);
  });

  it('prevents concurrent doctor double-booking via exclusion constraint', async () => {
    const { doctor, patient } = await seedDoctor();
    const other = Patient.create({
      id: asPatientId(randomUUID()),
      phoneNumber: PhoneNumber.create(
        `+2011${randomUUID().replace(/\D/g, '').slice(0, 8).padEnd(8, '0')}`,
      ),
      fullName: 'Other',
      createdAt: clock.now(),
    });
    await infra.repositories.patients.save(other);

    const overlapping = slot(10, 11);
    const a = Appointment.schedule({
      id: asAppointmentId(randomUUID()),
      patientId: patient.id,
      doctorId: doctor.id,
      slot: overlapping,
      now: clock.now(),
    });
    const b = Appointment.schedule({
      id: asAppointmentId(randomUUID()),
      patientId: other.id,
      doctorId: doctor.id,
      slot: TimeSlot.create(
        new Date('2026-08-25T10:30:00.000Z'),
        new Date('2026-08-25T11:30:00.000Z'),
      ),
      now: clock.now(),
    });

    const results = await Promise.allSettled([
      infra.repositories.appointments.createIfNoConflict(a),
      infra.repositories.appointments.createIfNoConflict(b),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      SchedulingConflictError,
    );

    const active = await infra.repositories.appointments.findMany({
      doctorId: doctor.id,
      activeOnly: true,
    });
    expect(active).toHaveLength(1);
  });

  it('prevents concurrent patient double-booking via exclusion constraint', async () => {
    const { doctor, patient, clinicId } = await seedDoctor();
    const specialty = Specialty.create({
      id: asSpecialtyId(randomUUID()),
      name: `Derm-${randomUUID().slice(0, 8)}`,
    });
    await infra.repositories.specialties.save(specialty);
    const doctor2 = Doctor.create({
      id: asDoctorId(randomUUID()),
      clinicId,
      fullName: 'Dr Omar',
      specialtyIds: [specialty.id],
    });
    await infra.repositories.doctors.save(doctor2);

    const overlapping = slot(14, 15);
    const a = Appointment.schedule({
      id: asAppointmentId(randomUUID()),
      patientId: patient.id,
      doctorId: doctor.id,
      slot: overlapping,
      now: clock.now(),
    });
    const b = Appointment.schedule({
      id: asAppointmentId(randomUUID()),
      patientId: patient.id,
      doctorId: doctor2.id,
      slot: TimeSlot.create(
        new Date('2026-08-25T14:15:00.000Z'),
        new Date('2026-08-25T15:15:00.000Z'),
      ),
      now: clock.now(),
    });

    const results = await Promise.allSettled([
      infra.repositories.appointments.createIfNoConflict(a),
      infra.repositories.appointments.createIfNoConflict(b),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      SchedulingConflictError,
    );
  });

  it('allows back-to-back slots for the same doctor', async () => {
    const { doctor, patient } = await seedDoctor();
    const other = Patient.create({
      id: asPatientId(randomUUID()),
      phoneNumber: PhoneNumber.create(
        `+2012${randomUUID().replace(/\D/g, '').slice(0, 8).padEnd(8, '0')}`,
      ),
      createdAt: clock.now(),
    });
    await infra.repositories.patients.save(other);

    await infra.repositories.appointments.createIfNoConflict(
      Appointment.schedule({
        id: asAppointmentId(randomUUID()),
        patientId: patient.id,
        doctorId: doctor.id,
        slot: slot(10, 11),
        now: clock.now(),
      }),
    );
    await infra.repositories.appointments.createIfNoConflict(
      Appointment.schedule({
        id: asAppointmentId(randomUUID()),
        patientId: other.id,
        doctorId: doctor.id,
        slot: slot(11, 12),
        now: clock.now(),
      }),
    );

    const active = await infra.repositories.appointments.findMany({
      doctorId: doctor.id,
      activeOnly: true,
    });
    expect(active).toHaveLength(2);
  });

  it('does not conflict cancelled appointments', async () => {
    const { doctor, patient } = await seedDoctor();
    const first = await infra.repositories.appointments.createIfNoConflict(
      Appointment.schedule({
        id: asAppointmentId(randomUUID()),
        patientId: patient.id,
        doctorId: doctor.id,
        slot: slot(10, 11),
        now: clock.now(),
      }),
    );
    await infra.repositories.appointments.save(first.cancel(clock.now()));

    const other = Patient.create({
      id: asPatientId(randomUUID()),
      phoneNumber: PhoneNumber.create(
        `+2013${randomUUID().replace(/\D/g, '').slice(0, 8).padEnd(8, '0')}`,
      ),
      createdAt: clock.now(),
    });
    await infra.repositories.patients.save(other);

    await infra.repositories.appointments.createIfNoConflict(
      Appointment.schedule({
        id: asAppointmentId(randomUUID()),
        patientId: other.id,
        doctorId: doctor.id,
        slot: slot(10, 11),
        now: clock.now(),
      }),
    );
  });
});
