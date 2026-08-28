import {
  PatientPreference,
  asPatientId,
  asPreferenceId,
  asSpecialtyId,
  asDoctorId,
  type PreferenceKind,
} from '../../domain/index.js';
import type {
  PatientRepository,
  PreferenceRepository,
  SpecialtyRepository,
  DoctorRepository,
} from '../../ports/clinic/repositories.js';
import type { Clock, IdGenerator } from '../../ports/platform/time.js';
import {
  DoctorNotFoundError,
  PatientNotFoundError,
  SpecialtyNotFoundError,
  ValidationError,
} from '../shared/errors.js';

export type SavePatientPreferenceInput = {
  patientId: string;
  kind: PreferenceKind;
  value: string;
  specialtyId?: string;
  doctorId?: string;
};

/**
 * Persists preferences to PreferenceRepository (authoritative).
 * No Neo4j dual-write — graph enrichment is deferred until a concrete need.
 */
export class SavePatientPreference {
  constructor(
    private readonly patients: PatientRepository,
    private readonly preferences: PreferenceRepository,
    private readonly specialties: SpecialtyRepository,
    private readonly doctors: DoctorRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: SavePatientPreferenceInput): Promise<PatientPreference> {
    const patientId = asPatientId(input.patientId);
    const patient = await this.patients.findById(patientId);
    if (!patient) {
      throw new PatientNotFoundError(input.patientId);
    }

    let specialtyId = input.specialtyId
      ? asSpecialtyId(input.specialtyId)
      : undefined;
    let doctorId = input.doctorId ? asDoctorId(input.doctorId) : undefined;

    if (input.kind === 'specialty') {
      if (!specialtyId) {
        throw new ValidationError('specialtyId is required for specialty preference');
      }
      const specialty = await this.specialties.findById(specialtyId);
      if (!specialty) {
        throw new SpecialtyNotFoundError(specialtyId);
      }
    }

    if (input.kind === 'doctor') {
      if (!doctorId) {
        throw new ValidationError('doctorId is required for doctor preference');
      }
      const doctor = await this.doctors.findById(doctorId);
      if (!doctor) {
        throw new DoctorNotFoundError(doctorId);
      }
    }

    const preference = PatientPreference.create({
      id: asPreferenceId(this.ids.generate('pref')),
      patientId,
      kind: input.kind,
      value: input.value,
      specialtyId,
      doctorId,
      createdAt: this.clock.now(),
    });

    return this.preferences.save(preference);
  }
}
