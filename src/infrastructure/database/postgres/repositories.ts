import { and, eq, gt, lt, ne, or, sql } from 'drizzle-orm';
import {
  SchedulingConflictError,
  type Appointment,
  type AppointmentId,
  type DoctorId,
  type Patient,
  type PatientId,
  type PatientPreference,
  type Specialty,
  type SpecialtyId,
  type Doctor,
  type TimeSlot,
} from '../../../domain/index.js';
import type {
  AppointmentQuery,
  AppointmentRepository,
  DoctorRepository,
  PatientRepository,
  PreferenceRepository,
  SpecialtyRepository,
} from '../../../ports/clinic/repositories.js';
import type { PostgresDatabase } from './client.js';
import {
  appointments,
  doctorSpecialties,
  doctors,
  patientPreferences,
  patients,
  specialties,
} from './schema.js';
import {
  fromAppointment,
  fromDoctor,
  fromPatient,
  fromPreference,
  fromSpecialty,
  toAppointment,
  toDoctor,
  toPatient,
  toPreference,
  toSpecialty,
} from './mappers.js';
import {
  isExclusionViolation,
  isUniqueViolation,
  translatePostgresError,
} from './errors.js';

export class PostgresPatientRepository implements PatientRepository {
  constructor(private readonly db: PostgresDatabase) {}

  async findById(id: PatientId): Promise<Patient | null> {
    const rows = await this.db
      .select()
      .from(patients)
      .where(eq(patients.id, id))
      .limit(1);
    const row = rows[0];
    return row ? toPatient(row) : null;
  }

  async findByPhoneNumber(phoneNumber: string): Promise<Patient | null> {
    const rows = await this.db
      .select()
      .from(patients)
      .where(eq(patients.phoneNumber, phoneNumber))
      .limit(1);
    const row = rows[0];
    return row ? toPatient(row) : null;
  }

  async save(patient: Patient): Promise<Patient> {
    try {
      await this.db
        .insert(patients)
        .values(fromPatient(patient))
        .onConflictDoUpdate({
          target: patients.id,
          set: {
            phoneNumber: patient.phoneNumber.value,
            fullName: patient.fullName ?? null,
          },
        });
      return patient;
    } catch (error) {
      translatePostgresError(error);
    }
  }
}

export class PostgresSpecialtyRepository implements SpecialtyRepository {
  constructor(private readonly db: PostgresDatabase) {}

  async findById(id: SpecialtyId): Promise<Specialty | null> {
    const rows = await this.db
      .select()
      .from(specialties)
      .where(eq(specialties.id, id))
      .limit(1);
    const row = rows[0];
    return row ? toSpecialty(row) : null;
  }

  async listAll(): Promise<Specialty[]> {
    const rows = await this.db.select().from(specialties);
    return rows.map(toSpecialty);
  }

  async findByNameQuery(query: string): Promise<Specialty[]> {
    const q = `%${query.trim().toLowerCase()}%`;
    const rows = await this.db
      .select()
      .from(specialties)
      .where(
        or(
          sql`lower(${specialties.name}) like ${q}`,
          sql`lower(coalesce(${specialties.description}, '')) like ${q}`,
        ),
      );
    return rows.map(toSpecialty);
  }

  async save(specialty: Specialty): Promise<Specialty> {
    try {
      await this.db
        .insert(specialties)
        .values(fromSpecialty(specialty))
        .onConflictDoUpdate({
          target: specialties.id,
          set: {
            name: specialty.name,
            description: specialty.description ?? null,
          },
        });
      return specialty;
    } catch (error) {
      translatePostgresError(error);
    }
  }
}

export class PostgresDoctorRepository implements DoctorRepository {
  constructor(private readonly db: PostgresDatabase) {}

  async findById(id: DoctorId): Promise<Doctor | null> {
    const rows = await this.db
      .select()
      .from(doctors)
      .where(eq(doctors.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    const specialtyIds = await this.loadSpecialtyIds(id);
    return toDoctor(row, specialtyIds);
  }

  async listAll(): Promise<Doctor[]> {
    const rows = await this.db.select().from(doctors);
    return Promise.all(
      rows.map(async (row) =>
        toDoctor(row, await this.loadSpecialtyIds(row.id as DoctorId)),
      ),
    );
  }

  async findBySpecialty(specialtyId: SpecialtyId): Promise<Doctor[]> {
    const links = await this.db
      .select()
      .from(doctorSpecialties)
      .where(eq(doctorSpecialties.specialtyId, specialtyId));
    const result: Doctor[] = [];
    for (const link of links) {
      const doctor = await this.findById(link.doctorId as DoctorId);
      if (doctor) result.push(doctor);
    }
    return result;
  }

  async save(doctor: Doctor): Promise<Doctor> {
    try {
      await this.db.transaction(async (tx) => {
        await tx
          .insert(doctors)
          .values(fromDoctor(doctor))
          .onConflictDoUpdate({
            target: doctors.id,
            set: {
              clinicId: doctor.clinicId,
              fullName: doctor.fullName,
              bio: doctor.bio ?? null,
              active: doctor.active,
              calendarResourceId: doctor.calendarResourceId ?? null,
            },
          });

        await tx
          .delete(doctorSpecialties)
          .where(eq(doctorSpecialties.doctorId, doctor.id));

        if (doctor.specialtyIds.length > 0) {
          await tx.insert(doctorSpecialties).values(
            doctor.specialtyIds.map((specialtyId) => ({
              doctorId: doctor.id,
              specialtyId,
            })),
          );
        }
      });
      return doctor;
    } catch (error) {
      translatePostgresError(error);
    }
  }

  private async loadSpecialtyIds(doctorId: DoctorId): Promise<string[]> {
    const rows = await this.db
      .select()
      .from(doctorSpecialties)
      .where(eq(doctorSpecialties.doctorId, doctorId));
    return rows.map((r) => r.specialtyId);
  }
}

export class PostgresPreferenceRepository implements PreferenceRepository {
  constructor(private readonly db: PostgresDatabase) {}

  async listByPatient(patientId: PatientId): Promise<PatientPreference[]> {
    const rows = await this.db
      .select()
      .from(patientPreferences)
      .where(eq(patientPreferences.patientId, patientId));
    return rows.map(toPreference);
  }

  async listAll(): Promise<PatientPreference[]> {
    const rows = await this.db.select().from(patientPreferences);
    return rows.map(toPreference);
  }

  async save(preference: PatientPreference): Promise<PatientPreference> {
    try {
      await this.db.insert(patientPreferences).values(fromPreference(preference));
      return preference;
    } catch (error) {
      translatePostgresError(error);
    }
  }
}

export class PostgresAppointmentRepository implements AppointmentRepository {
  constructor(private readonly db: PostgresDatabase) {}

  async findById(id: AppointmentId): Promise<Appointment | null> {
    const rows = await this.db
      .select()
      .from(appointments)
      .where(eq(appointments.id, id))
      .limit(1);
    const row = rows[0];
    return row ? toAppointment(row) : null;
  }

  async findByIdempotencyKey(key: string): Promise<Appointment | null> {
    const rows = await this.db
      .select()
      .from(appointments)
      .where(eq(appointments.idempotencyKey, key))
      .limit(1);
    const row = rows[0];
    return row ? toAppointment(row) : null;
  }

  async findMany(query: AppointmentQuery): Promise<Appointment[]> {
    const conditions = [];
    if (query.patientId) {
      conditions.push(eq(appointments.patientId, query.patientId));
    }
    if (query.doctorId) {
      conditions.push(eq(appointments.doctorId, query.doctorId));
    }
    if (query.activeOnly) {
      conditions.push(eq(appointments.status, 'scheduled'));
    }

    const rows =
      conditions.length === 0
        ? await this.db.select().from(appointments)
        : await this.db
            .select()
            .from(appointments)
            .where(and(...conditions));

    return rows.map(toAppointment);
  }

  async findOverlapping(params: {
    doctorId?: DoctorId | undefined;
    patientId?: PatientId | undefined;
    slot: TimeSlot;
    excludeAppointmentId?: AppointmentId | undefined;
  }): Promise<Appointment[]> {
    const conditions = [
      eq(appointments.status, 'scheduled'),
      lt(appointments.startsAt, params.slot.end),
      gt(appointments.endsAt, params.slot.start),
    ];
    if (params.doctorId) {
      conditions.push(eq(appointments.doctorId, params.doctorId));
    }
    if (params.patientId) {
      conditions.push(eq(appointments.patientId, params.patientId));
    }
    if (params.excludeAppointmentId) {
      conditions.push(ne(appointments.id, params.excludeAppointmentId));
    }

    const rows = await this.db
      .select()
      .from(appointments)
      .where(and(...conditions));
    return rows.map(toAppointment);
  }

  async save(appointment: Appointment): Promise<Appointment> {
    try {
      await this.db
        .insert(appointments)
        .values(fromAppointment(appointment))
        .onConflictDoUpdate({
          target: appointments.id,
          set: {
            startsAt: appointment.slot.start,
            endsAt: appointment.slot.end,
            status: appointment.status,
            reason: appointment.reason ?? null,
            externalCalendarRef: appointment.externalCalendarRef ?? null,
            idempotencyKey: appointment.idempotencyKey ?? null,
            updatedAt: appointment.updatedAt,
          },
        });
      return appointment;
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new SchedulingConflictError(
          'Appointment overlaps an existing scheduled appointment',
        );
      }
      translatePostgresError(error);
    }
  }

  /**
   * Relies on PostgreSQL EXCLUDE constraints (doctor + patient ranges)
   * and UNIQUE(idempotency_key) for concurrent safety.
   */
  async createIfNoConflict(appointment: Appointment): Promise<Appointment> {
    if (appointment.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(appointment.idempotencyKey);
      if (existing) return existing;
    }

    try {
      await this.db.insert(appointments).values(fromAppointment(appointment));
      return appointment;
    } catch (error) {
      if (
        appointment.idempotencyKey &&
        isUniqueViolation(error, 'idempotency')
      ) {
        const existing = await this.findByIdempotencyKey(
          appointment.idempotencyKey,
        );
        if (existing) return existing;
      }
      if (isExclusionViolation(error)) {
        throw new SchedulingConflictError(
          'Appointment overlaps an existing scheduled appointment',
        );
      }
      translatePostgresError(error);
    }
  }

  async updateSlotIfNoConflict(appointment: Appointment): Promise<Appointment> {
    try {
      await this.db
        .update(appointments)
        .set({
          startsAt: appointment.slot.start,
          endsAt: appointment.slot.end,
          status: appointment.status,
          reason: appointment.reason ?? null,
          externalCalendarRef: appointment.externalCalendarRef ?? null,
          updatedAt: appointment.updatedAt,
        })
        .where(eq(appointments.id, appointment.id));
      return appointment;
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new SchedulingConflictError(
          'Appointment overlaps an existing scheduled appointment',
        );
      }
      translatePostgresError(error);
    }
  }
}
