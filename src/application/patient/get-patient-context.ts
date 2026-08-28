import type { Patient, PatientPreference, Appointment } from '../../domain/index.js';
import { asPatientId } from '../../domain/index.js';
import type {
  AppointmentRepository,
  PatientRepository,
  PreferenceRepository,
} from '../../ports/clinic/repositories.js';
import { PatientNotFoundError } from '../shared/errors.js';

export type GetPatientContextInput = {
  patientId: string;
};

/**
 * Durable conversational context for clinic flows.
 * Assembled from PostgreSQL-backed repositories only.
 * Does not include WorkingMemory, graph edges, or search hits.
 */
export type PatientContext = {
  patient: Patient;
  preferences: PatientPreference[];
  upcomingAppointments: Appointment[];
};

export class GetPatientContext {
  constructor(
    private readonly patients: PatientRepository,
    private readonly preferences: PreferenceRepository,
    private readonly appointments: AppointmentRepository,
  ) {}

  async execute(input: GetPatientContextInput): Promise<PatientContext> {
    const patientId = asPatientId(input.patientId);
    const patient = await this.patients.findById(patientId);
    if (!patient) {
      throw new PatientNotFoundError(input.patientId);
    }

    const [preferences, upcomingAppointments] = await Promise.all([
      this.preferences.listByPatient(patientId),
      this.appointments.findMany({ patientId, activeOnly: true }),
    ]);

    return {
      patient,
      preferences,
      upcomingAppointments,
    };
  }
}
