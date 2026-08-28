import { asPatientId } from '../../domain/index.js';
import type { AuthenticatedPrincipal } from '../../ports/platform/auth.js';
import type { PrincipalPatientDirectory } from '../../ports/clinic/principal-patient.js';
import type { PatientRepository } from '../../ports/clinic/repositories.js';
import {
  ConflictError,
  PatientNotFoundError,
  ValidationError,
} from '../shared/errors.js';

export type LinkPrincipalToPatientInput = {
  /** Must already be trusted — never from LLM tool args. */
  principal: AuthenticatedPrincipal;
  patientId: string;
};

/**
 * Associates an authenticated principal with a clinic patient.
 * NOT exposed as an agent tool — authority cannot be gained via the LLM loop.
 *
 * Never links by phone number alone — caller must supply patientId from a
 * trusted path (enroll of newly created patient, or ops/admin).
 */
export class LinkPrincipalToPatient {
  constructor(
    private readonly directory: PrincipalPatientDirectory,
    private readonly patients: PatientRepository,
  ) {}

  async execute(input: LinkPrincipalToPatientInput): Promise<void> {
    if (!input.principal?.subjectId?.trim()) {
      throw new ValidationError('Authenticated principal is required to link');
    }
    const patientId = asPatientId(input.patientId);
    const patient = await this.patients.findById(patientId);
    if (!patient) {
      throw new PatientNotFoundError(input.patientId);
    }

    const existingForSubject = await this.directory.findPatientId(
      input.principal.subjectId,
    );
    if (existingForSubject && existingForSubject !== patient.id) {
      throw new ConflictError(
        'Principal is already linked to a different patient',
      );
    }
    if (existingForSubject === patient.id) {
      return;
    }

    const existingForPatient = await this.directory.findSubjectId(patient.id);
    if (
      existingForPatient &&
      existingForPatient !== input.principal.subjectId
    ) {
      throw new ConflictError(
        'Patient is already linked to a different principal',
      );
    }

    try {
      await this.directory.link(input.principal.subjectId, patient.id);
    } catch (error) {
      if (error instanceof Error && /already linked/i.test(error.message)) {
        throw new ConflictError(error.message);
      }
      throw error;
    }
  }
}
