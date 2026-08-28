import type {
  AuthCredentials,
  AuthGateway,
  AuthenticatedPrincipal,
} from '../../ports/platform/auth.js';

/**
 * Local / evaluation auth only.
 * Production runtime must reject gateways with kind === 'demo'.
 *
 * Credentials: demoSubject (e.g. HTTP x-demo-subject).
 * Authorization header is ignored — no token parsing here.
 */
export class DemoAuthGateway implements AuthGateway {
  readonly kind = 'demo' as const;

  async resolve(
    credentials: AuthCredentials,
  ): Promise<AuthenticatedPrincipal | null> {
    const subject = credentials.demoSubject?.trim();
    if (!subject) return null;
    return { subjectId: subject };
  }
}
