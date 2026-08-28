import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  BookAppointment,
  RegisterPatient,
} from '../../../src/application/index.js';
import {
  Doctor,
  Specialty,
  SchedulingConflictError,
  asClinicId,
  asDoctorId,
  asSpecialtyId,
} from '../../../src/domain/index.js';
import { createPostgresInfrastructure } from '../../../src/infrastructure/database/postgres/index.js';
import { clinics } from '../../../src/infrastructure/database/postgres/schema.js';
import {
  FixedClock,
  InMemoryCalendarGateway,
} from '../../../src/infrastructure/memory/index.js';
import type { PostgresInfrastructure } from '../../../src/infrastructure/database/postgres/index.js';

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://clinic:clinic@localhost:54329/clinic_voice_ai';

describe('BookAppointment against PostgreSQL', () => {
  let infra: PostgresInfrastructure;
  let calendar: InMemoryCalendarGateway;
  const clock = new FixedClock(new Date('2026-08-24T09:00:00.000Z'));

  beforeAll(async () => {
    infra = createPostgresInfrastructure(
      { databaseUrl: DATABASE_URL },
      { clock },
    );
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
    calendar = new InMemoryCalendarGateway();
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
      name: `Cardio-${randomUUID().slice(0, 8)}`,
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
    return doctor;
  }

  it('books through use case with postgres repos', async () => {
    const doctor = await seedDoctor();
    const register = new RegisterPatient(
      infra.repositories.patients,
      infra.ids,
      clock,
    );
    const book = new BookAppointment(
      infra.repositories.patients,
      infra.repositories.doctors,
      infra.repositories.appointments,
      calendar,
      infra.ids,
      clock,
    );

    const { patient } = await register.execute({
      phoneNumber: '+201055556666',
      fullName: 'Ali',
    });

    const appt = await book.execute({
      patientId: patient.id,
      doctorId: doctor.id,
      start: '2026-08-25T10:00:00.000Z',
      end: '2026-08-25T10:30:00.000Z',
      idempotencyKey: 'book-pg-1',
    });

    expect(appt.externalCalendarRef).toBeTruthy();
    const again = await book.execute({
      patientId: patient.id,
      doctorId: doctor.id,
      start: '2026-08-25T10:00:00.000Z',
      end: '2026-08-25T10:30:00.000Z',
      idempotencyKey: 'book-pg-1',
    });
    expect(again.id).toBe(appt.id);
  });

  it('rejects overlapping books at the database boundary', async () => {
    const doctor = await seedDoctor();
    const register = new RegisterPatient(
      infra.repositories.patients,
      infra.ids,
      clock,
    );
    const book = new BookAppointment(
      infra.repositories.patients,
      infra.repositories.doctors,
      infra.repositories.appointments,
      calendar,
      infra.ids,
      clock,
    );

    const a = await register.execute({
      phoneNumber: '+201077778888',
      fullName: 'A',
    });
    const b = await register.execute({
      phoneNumber: '+201099990000',
      fullName: 'B',
    });

    await book.execute({
      patientId: a.patient.id,
      doctorId: doctor.id,
      start: '2026-08-25T10:00:00.000Z',
      end: '2026-08-25T10:30:00.000Z',
    });

    await expect(
      book.execute({
        patientId: b.patient.id,
        doctorId: doctor.id,
        start: '2026-08-25T10:00:00.000Z',
        end: '2026-08-25T10:30:00.000Z',
      }),
    ).rejects.toBeInstanceOf(SchedulingConflictError);
  });
});
