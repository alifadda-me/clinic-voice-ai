/**
 * Clinic-domain persistence ports.
 *
 * Repositories persist/retrieve domain concepts. They do not decide booking
 * policy beyond concurrency-safe conflict constraints declared here.
 */

import type {
  Appointment,
  Doctor,
  Patient,
  PatientPreference,
  Specialty,
  AppointmentId,
  DoctorId,
  PatientId,
  SpecialtyId,
  TimeSlot,
} from '../../domain/index.js';

export interface PatientRepository {
  findById(id: PatientId): Promise<Patient | null>;
  findByPhoneNumber(phoneNumber: string): Promise<Patient | null>;
  save(patient: Patient): Promise<Patient>;
}

export interface DoctorRepository {
  findById(id: DoctorId): Promise<Doctor | null>;
  listAll(): Promise<Doctor[]>;
  findBySpecialty(specialtyId: SpecialtyId): Promise<Doctor[]>;
  save(doctor: Doctor): Promise<Doctor>;
}

export interface SpecialtyRepository {
  findById(id: SpecialtyId): Promise<Specialty | null>;
  listAll(): Promise<Specialty[]>;
  findByNameQuery(query: string): Promise<Specialty[]>;
  save(specialty: Specialty): Promise<Specialty>;
}

export type AppointmentQuery = {
  patientId?: PatientId | undefined;
  doctorId?: DoctorId | undefined;
  activeOnly?: boolean | undefined;
};

/**
 * Concurrency / idempotency contracts for appointment persistence.
 *
 * Real adapters must implement createIfNoConflict / updateSlotIfNoConflict
 * with database-level exclusion (constraints, locks, or serializable tx).
 * In-memory fakes approximate this only under single-threaded execution.
 */
export interface AppointmentRepository {
  findById(id: AppointmentId): Promise<Appointment | null>;
  findByIdempotencyKey(key: string): Promise<Appointment | null>;
  findMany(query: AppointmentQuery): Promise<Appointment[]>;
  findOverlapping(params: {
    doctorId?: DoctorId | undefined;
    patientId?: PatientId | undefined;
    slot: TimeSlot;
    excludeAppointmentId?: AppointmentId | undefined;
  }): Promise<Appointment[]>;

  /** Upsert by id — for status transitions (cancel/complete) after load. */
  save(appointment: Appointment): Promise<Appointment>;

  /**
   * Insert a new scheduled appointment only if no active doctor/patient
   * overlap exists. Throws SchedulingConflictError on conflict.
   * If appointment.idempotencyKey is set and an appointment with that key
   * already exists, return the existing appointment (idempotent create).
   */
  createIfNoConflict(appointment: Appointment): Promise<Appointment>;

  /**
   * Persist a rescheduled slot only if no active overlap remains for
   * doctor/patient (excluding this appointment id).
   */
  updateSlotIfNoConflict(appointment: Appointment): Promise<Appointment>;
}

/**
 * Preferences are intentionally NOT embedded in the Patient aggregate.
 *
 * Rationale: Patient invariants (identity, phone, name) do not require
 * loading or transactional consistency with preference history. Preferences
 * are a related collection with independent write rate and read patterns
 * (context assembly). Folding them into Patient would widen the aggregate
 * without protecting a real invariant.
 */
export interface PreferenceRepository {
  listByPatient(patientId: PatientId): Promise<PatientPreference[]>;
  /** Full preference set for disposable graph projection rebuilds. */
  listAll(): Promise<PatientPreference[]>;
  save(preference: PatientPreference): Promise<PatientPreference>;
}
