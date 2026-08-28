import {
  SchedulingConflictError,
  type Appointment,
  type Doctor,
  type Patient,
  type PatientPreference,
  type Specialty,
  type AppointmentId,
  type DoctorId,
  type PatientId,
  type SpecialtyId,
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

export class InMemoryPatientRepository implements PatientRepository {
  private readonly byId = new Map<string, Patient>();

  async findById(id: PatientId): Promise<Patient | null> {
    return this.byId.get(id) ?? null;
  }

  async findByPhoneNumber(phoneNumber: string): Promise<Patient | null> {
    for (const patient of this.byId.values()) {
      if (patient.phoneNumber.value === phoneNumber) return patient;
    }
    return null;
  }

  async save(patient: Patient): Promise<Patient> {
    this.byId.set(patient.id, patient);
    return patient;
  }
}

export class InMemoryDoctorRepository implements DoctorRepository {
  private readonly byId = new Map<string, Doctor>();

  async findById(id: DoctorId): Promise<Doctor | null> {
    return this.byId.get(id) ?? null;
  }

  async listAll(): Promise<Doctor[]> {
    return [...this.byId.values()];
  }

  async findBySpecialty(specialtyId: SpecialtyId): Promise<Doctor[]> {
    return [...this.byId.values()].filter((d) => d.hasSpecialty(specialtyId));
  }

  async save(doctor: Doctor): Promise<Doctor> {
    this.byId.set(doctor.id, doctor);
    return doctor;
  }
}

export class InMemorySpecialtyRepository implements SpecialtyRepository {
  private readonly byId = new Map<string, Specialty>();

  async findById(id: SpecialtyId): Promise<Specialty | null> {
    return this.byId.get(id) ?? null;
  }

  async listAll(): Promise<Specialty[]> {
    return [...this.byId.values()];
  }

  async findByNameQuery(query: string): Promise<Specialty[]> {
    const q = query.trim().toLowerCase();
    return [...this.byId.values()].filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description?.toLowerCase().includes(q) ?? false),
    );
  }

  async save(specialty: Specialty): Promise<Specialty> {
    this.byId.set(specialty.id, specialty);
    return specialty;
  }
}

export class InMemoryPreferenceRepository implements PreferenceRepository {
  private readonly items: PatientPreference[] = [];

  async listByPatient(patientId: PatientId): Promise<PatientPreference[]> {
    return this.items.filter((p) => p.patientId === patientId);
  }

  async listAll(): Promise<PatientPreference[]> {
    return [...this.items];
  }

  async save(preference: PatientPreference): Promise<PatientPreference> {
    this.items.push(preference);
    return preference;
  }
}

/**
 * LIMITATION: createIfNoConflict / updateSlotIfNoConflict are only safe under
 * single-threaded execution. Real adapters must enforce exclusion with DB
 * constraints or transactional locks — do not assume this fake's behavior
 * equals production concurrency guarantees.
 */
export class InMemoryAppointmentRepository implements AppointmentRepository {
  private readonly byId = new Map<string, Appointment>();
  private readonly byIdempotencyKey = new Map<string, AppointmentId>();

  async findById(id: AppointmentId): Promise<Appointment | null> {
    return this.byId.get(id) ?? null;
  }

  async findByIdempotencyKey(key: string): Promise<Appointment | null> {
    const id = this.byIdempotencyKey.get(key);
    if (!id) return null;
    return this.byId.get(id) ?? null;
  }

  async findMany(query: AppointmentQuery): Promise<Appointment[]> {
    let results = [...this.byId.values()];
    if (query.patientId) {
      results = results.filter((a) => a.patientId === query.patientId);
    }
    if (query.doctorId) {
      results = results.filter((a) => a.doctorId === query.doctorId);
    }
    if (query.activeOnly) {
      results = results.filter((a) => a.isActive());
    }
    return results;
  }

  async findOverlapping(params: {
    doctorId?: DoctorId | undefined;
    patientId?: PatientId | undefined;
    slot: TimeSlot;
    excludeAppointmentId?: AppointmentId | undefined;
  }): Promise<Appointment[]> {
    return (
      await this.findMany({
        doctorId: params.doctorId,
        patientId: params.patientId,
        activeOnly: true,
      })
    ).filter((a) => {
      if (
        params.excludeAppointmentId &&
        a.id === params.excludeAppointmentId
      ) {
        return false;
      }
      return a.slot.overlaps(params.slot);
    });
  }

  async save(appointment: Appointment): Promise<Appointment> {
    this.byId.set(appointment.id, appointment);
    if (appointment.idempotencyKey) {
      this.byIdempotencyKey.set(appointment.idempotencyKey, appointment.id);
    }
    return appointment;
  }

  async createIfNoConflict(appointment: Appointment): Promise<Appointment> {
    if (appointment.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(appointment.idempotencyKey);
      if (existing) return existing;
    }

    await this.assertNoConflict(appointment);
    return this.save(appointment);
  }

  async updateSlotIfNoConflict(appointment: Appointment): Promise<Appointment> {
    await this.assertNoConflict(appointment, appointment.id);
    return this.save(appointment);
  }

  private async assertNoConflict(
    appointment: Appointment,
    excludeId?: AppointmentId,
  ): Promise<void> {
    const doctorHits = await this.findOverlapping({
      doctorId: appointment.doctorId,
      slot: appointment.slot,
      excludeAppointmentId: excludeId,
    });
    if (doctorHits.length > 0) {
      throw new SchedulingConflictError(
        `Doctor already has an appointment overlapping ${appointment.slot.start.toISOString()}`,
      );
    }

    const patientHits = await this.findOverlapping({
      patientId: appointment.patientId,
      slot: appointment.slot,
      excludeAppointmentId: excludeId,
    });
    if (patientHits.length > 0) {
      throw new SchedulingConflictError(
        `Patient already has an appointment overlapping ${appointment.slot.start.toISOString()}`,
      );
    }
  }
}
