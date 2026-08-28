/**
 * Provider-neutral authentication contracts.
 * No JWT / Clerk / Auth0 / Express types — adapters map credentials here.
 *
 * Channel-agnostic: HTTP Bearer is one credential shape. Future channels
 * (voice session start, telephony) may supply the same AuthCredentials fields
 * or ignore unused ones — gateways must not assume Express.
 */

export type AuthenticatedPrincipal = {
  /** Stable subject identifier from the auth provider (opaque to domain). */
  subjectId: string;
};

export type AuthCredentials = {
  /**
   * Raw Authorization header value (e.g. "Bearer <token>"), if present.
   * Production JWT gateway: missing → anonymous; present but invalid → throw.
   */
  authorizationHeader?: string | undefined;
  /**
   * Demo-only subject hint (e.g. x-demo-subject).
   * Production gateways must ignore this field.
   */
  demoSubject?: string | undefined;
};

/**
 * Thrown when credentials were supplied but could not be verified.
 * Interfaces map this to HTTP 401. Distinct from anonymous (null principal).
 */
export class InvalidAuthCredentialsError extends Error {
  readonly code = 'INVALID_AUTH_CREDENTIALS';

  constructor(message = 'Authentication credentials are invalid') {
    super(message);
    this.name = 'InvalidAuthCredentialsError';
  }
}

/**
 * Resolves request credentials to a principal or anonymous (null).
 * `kind` prevents accidental demo auth in production runtime.
 */
export interface AuthGateway {
  readonly kind: 'demo' | 'production';
  resolve(credentials: AuthCredentials): Promise<AuthenticatedPrincipal | null>;
}
