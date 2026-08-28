import type {
  AuthenticatedPrincipal,
} from '../../ports/platform/auth.js';
import type { PrincipalPatientDirectory } from '../../ports/clinic/principal-patient.js';
import type { RegisterPatient } from '../patient/register-patient.js';
import { LinkPrincipalToPatient } from './link-principal-to-patient.js';
import { ConflictError, ValidationError } from '../shared/errors.js';

export type EnrollAuthenticatedPatientInput = {
  /** Must already be trusted — never from LLM tool args. */
  principal: AuthenticatedPrincipal;
  phoneNumber: string;
  fullName?: string | undefined;
};

export type EnrollAuthenticatedPatientResult = {
  patientId: string;
  created: boolean;
  /** True when this call established principal→patient for the first time. */
  linked: boolean;
};

/**
 * Trusted enrollment path (HTTP / ops) — NOT an agent tool.
 *
 * - RegisterPatient creates/finds clinic patient (enrollment, not auth).
 * - Auto-links only when principal has no link AND a new patient was created.
 * - Never links solely because an existing phone number matched (prevents
 *   phone-knowledge impersonation; critical for future telephony).
 * - Does not authenticate — principal must already come from AuthGateway.
 */
export class EnrollAuthenticatedPatient {
  constructor(
    private readonly registerPatient: RegisterPatient,
    private readonly linkPrincipalToPatient: LinkPrincipalToPatient,
    private readonly directory: PrincipalPatientDirectory,
  ) {}

  async execute(
    input: EnrollAuthenticatedPatientInput,
  ): Promise<EnrollAuthenticatedPatientResult> {
    if (!input.principal?.subjectId?.trim()) {
      throw new ValidationError(
        'Authenticated principal is required to enroll',
      );
    }

    const existingLink = await this.directory.findPatientId(
      input.principal.subjectId,
    );

    const registered = await this.registerPatient.execute({
      phoneNumber: input.phoneNumber,
      ...(input.fullName ? { fullName: input.fullName } : {}),
    });

    if (existingLink) {
      if (existingLink !== registered.patient.id) {
        // Principal already bound — enrollment must not rebind via phone.
        return {
          patientId: existingLink,
          created: false,
          linked: false,
        };
      }
      return {
        patientId: existingLink,
        created: registered.created,
        linked: false,
      };
    }

    if (!registered.created) {
      // Existing patient looked up by phone — do NOT auto-link.
      throw new ConflictError(
        'A patient with this phone number already exists. Linking requires an explicit trusted link, not phone match alone.',
      );
    }

    await this.linkPrincipalToPatient.execute({
      principal: input.principal,
      patientId: registered.patient.id,
    });

    return {
      patientId: registered.patient.id,
      created: true,
      linked: true,
    };
  }
}
