import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'jose';
import type {
  AuthCredentials,
  AuthGateway,
  AuthenticatedPrincipal,
} from '../../ports/platform/auth.js';
import { InvalidAuthCredentialsError } from '../../ports/platform/auth.js';
import type { JwtBearerAuthConfig } from '../../config/auth.js';

export type JwtBearerAuthGatewayDeps = {
  issuer: string;
  audience: string;
  /**
   * jose key resolver — createRemoteJWKSet(url) in production,
   * createLocalJWKSet(jwks) in tests. Keeps fetch out of unit tests.
   */
  getKey: JWTVerifyGetKey;
};

/**
 * Production AuthGateway: OIDC JWT bearer + JWKS.
 * Provider-neutral — no Auth0/Clerk/Cognito SDK types.
 *
 * - No Authorization header → anonymous (null)
 * - Present but invalid/expired/wrong iss|aud → InvalidAuthCredentialsError
 * - Ignores demoSubject always
 */
export class JwtBearerAuthGateway implements AuthGateway {
  readonly kind = 'production' as const;

  private readonly issuer: string;
  private readonly audience: string;
  private readonly getKey: JWTVerifyGetKey;

  constructor(deps: JwtBearerAuthGatewayDeps) {
    this.issuer = deps.issuer;
    this.audience = deps.audience;
    this.getKey = deps.getKey;
  }

  static fromConfig(config: JwtBearerAuthConfig): JwtBearerAuthGateway {
    return new JwtBearerAuthGateway({
      issuer: config.issuer,
      audience: config.audience,
      getKey: createRemoteJWKSet(new URL(config.jwksUrl)),
    });
  }

  async resolve(
    credentials: AuthCredentials,
  ): Promise<AuthenticatedPrincipal | null> {
    const header = credentials.authorizationHeader?.trim();
    if (!header) {
      return null;
    }

    const token = extractBearerToken(header);
    if (!token) {
      throw new InvalidAuthCredentialsError(
        'Authorization header must use Bearer scheme',
      );
    }

    try {
      const { payload } = await jwtVerify(token, this.getKey, {
        issuer: this.issuer,
        audience: this.audience,
      });

      const subject =
        typeof payload.sub === 'string' ? payload.sub.trim() : '';
      if (!subject) {
        throw new InvalidAuthCredentialsError('Token subject is missing');
      }

      return { subjectId: subject };
    } catch (error) {
      if (error instanceof InvalidAuthCredentialsError) {
        throw error;
      }
      throw new InvalidAuthCredentialsError(
        'Bearer token could not be verified',
      );
    }
  }
}

function extractBearerToken(authorizationHeader: string): string | null {
  const match = /^Bearer\s+(\S+)/i.exec(authorizationHeader);
  return match?.[1] ?? null;
}

export type { JWTVerifyGetKey };
