import type { Patient } from '../../domain/index.js';
import { asPatientId } from '../../domain/index.js';
import type { PatientRepository } from '../../ports/clinic/repositories.js';
import { PatientNotFoundError } from '../shared/errors.js';

export type GetPatientProfileInput = {
  patientId: string;
};

export class GetPatientProfile {
  constructor(private readonly patients: PatientRepository) {}

  async execute(input: GetPatientProfileInput): Promise<Patient> {
    const patient = await this.patients.findById(asPatientId(input.patientId));
    if (!patient) {
      throw new PatientNotFoundError(input.patientId);
    }
    return patient;
  }
}
