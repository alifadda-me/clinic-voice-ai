import type { AuthenticatedPrincipal } from '../../ports/platform/auth.js';
import type { PrincipalPatientDirectory } from '../../ports/clinic/principal-patient.js';

export type ClinicActor = {
  patientId: string;
};

export type ResolveClinicActorInput = {
  principal: AuthenticatedPrincipal | null;
};

export type ResolveClinicActorResult = {
  actor: ClinicActor | null;
};

/**
 * Resolves clinic patient authority from a trusted principal.
 * Anonymous principal → no actor. Linked principal → ClinicActor.
 * Does not authenticate; AuthGateway already did.
 */
export class ResolveClinicActor {
  constructor(private readonly directory: PrincipalPatientDirectory) {}

  async execute(
    input: ResolveClinicActorInput,
  ): Promise<ResolveClinicActorResult> {
    if (!input.principal) {
      return { actor: null };
    }
    const patientId = await this.directory.findPatientId(
      input.principal.subjectId,
    );
    if (!patientId) {
      return { actor: null };
    }
    return { actor: { patientId } };
  }
}
