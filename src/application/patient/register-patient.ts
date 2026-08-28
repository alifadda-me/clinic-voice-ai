import {
  Patient,
  PhoneNumber,
  asPatientId,
} from '../../domain/index.js';
import type { PatientRepository } from '../../ports/clinic/repositories.js';
import type { Clock, IdGenerator } from '../../ports/platform/time.js';
import { ConflictError } from '../shared/errors.js';

export type RegisterPatientInput = {
  phoneNumber: string;
  fullName?: string;
};

export type RegisterPatientResult = {
  patient: Patient;
  created: boolean;
};

/**
 * Registers patients in PatientRepository (authoritative).
 * No Neo4j dual-write — graph enrichment is deferred.
 */
export class RegisterPatient {
  constructor(
    private readonly patients: PatientRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: RegisterPatientInput): Promise<RegisterPatientResult> {
    const phone = PhoneNumber.create(input.phoneNumber);
    const existing = await this.patients.findByPhoneNumber(phone.value);

    if (existing) {
      if (input.fullName && !existing.fullName) {
        const updated = await this.patients.save(existing.withName(input.fullName));
        return { patient: updated, created: false };
      }
      if (
        input.fullName &&
        existing.fullName &&
        existing.fullName !== input.fullName.trim()
      ) {
        throw new ConflictError(
          'A patient with this phone number already exists with a different name',
        );
      }
      return { patient: existing, created: false };
    }

    const patient = Patient.create({
      id: asPatientId(this.ids.generate('pat')),
      phoneNumber: phone,
      fullName: input.fullName,
      createdAt: this.clock.now(),
    });

    const saved = await this.patients.save(patient);
    return { patient: saved, created: true };
  }
}
