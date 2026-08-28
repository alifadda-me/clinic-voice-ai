import {
  SignJWT,
  exportJWK,
  generateKeyPair,
  createLocalJWKSet,
  type JWTVerifyGetKey,
} from 'jose';
import { JwtBearerAuthGateway } from '../../src/infrastructure/auth/jwt-bearer-auth-gateway.js';

export const TEST_AUTH_ISSUER = 'https://auth.test.clinic-voice-ai.local';
export const TEST_AUTH_AUDIENCE = 'clinic-voice-ai-test';

type GeneratedPrivateKey = Awaited<
  ReturnType<typeof generateKeyPair>
>['privateKey'];

export type TestJwtFixture = {
  gateway: JwtBearerAuthGateway;
  getKey: JWTVerifyGetKey;
  privateKey: GeneratedPrivateKey;
  signAccessToken: (opts: {
    subject: string;
    audience?: string;
    issuer?: string;
    expiresIn?: string;
  }) => Promise<string>;
};

/**
 * Deterministic local JWKS + JwtBearerAuthGateway for unit/HTTP tests.
 * No live IdP or network.
 */
export async function createTestJwtFixture(): Promise<TestJwtFixture> {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-jwt-key';
  jwk.alg = 'RS256';
  jwk.use = 'sig';

  const getKey = createLocalJWKSet({ keys: [jwk] });
  const gateway = new JwtBearerAuthGateway({
    issuer: TEST_AUTH_ISSUER,
    audience: TEST_AUTH_AUDIENCE,
    getKey,
  });

  return {
    gateway,
    getKey,
    privateKey,
    async signAccessToken({
      subject,
      audience = TEST_AUTH_AUDIENCE,
      issuer = TEST_AUTH_ISSUER,
      expiresIn = '2h',
    }) {
      return new SignJWT({})
        .setProtectedHeader({ alg: 'RS256', kid: 'test-jwt-key' })
        .setSubject(subject)
        .setIssuer(issuer)
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime(expiresIn)
        .sign(privateKey);
    },
  };
}
