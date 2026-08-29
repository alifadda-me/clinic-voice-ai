import { describe, expect, it, beforeAll } from 'vitest';
import {
  JwtBearerAuthGateway,
} from '../../src/infrastructure/auth/jwt-bearer-auth-gateway.js';
import { InvalidAuthCredentialsError } from '../../src/ports/platform/auth.js';
import {
  createTestJwtFixture,
  TEST_AUTH_AUDIENCE,
  TEST_AUTH_ISSUER,
  type TestJwtFixture,
} from '../helpers/jwt-fixture.js';

describe('JwtBearerAuthGateway', () => {
  let fixture: TestJwtFixture;

  beforeAll(async () => {
    fixture = await createTestJwtFixture();
  });

  it('has kind production', () => {
    expect(fixture.gateway.kind).toBe('production');
  });

  it('returns null (anonymous) when Authorization is absent', async () => {
    await expect(fixture.gateway.resolve({})).resolves.toBeNull();
    await expect(
      fixture.gateway.resolve({ demoSubject: 'ignored' }),
    ).resolves.toBeNull();
  });

  it('ignores demoSubject even when present', async () => {
    await expect(
      fixture.gateway.resolve({ demoSubject: 'demo-user' }),
    ).resolves.toBeNull();
  });

  it('resolves subject from a valid Bearer JWT', async () => {
    const token = await fixture.signAccessToken({ subject: 'sub-alice' });
    const principal = await fixture.gateway.resolve({
      authorizationHeader: `Bearer ${token}`,
      demoSubject: 'should-be-ignored',
    });
    expect(principal).toEqual({ subjectId: 'sub-alice' });
  });

  it('throws InvalidAuthCredentialsError for malformed Bearer', async () => {
    await expect(
      fixture.gateway.resolve({ authorizationHeader: 'Bearer not-a-jwt' }),
    ).rejects.toBeInstanceOf(InvalidAuthCredentialsError);

    await expect(
      fixture.gateway.resolve({ authorizationHeader: 'Token abc' }),
    ).rejects.toBeInstanceOf(InvalidAuthCredentialsError);

    await expect(
      fixture.gateway.resolve({ authorizationHeader: 'Bearer' }),
    ).rejects.toBeInstanceOf(InvalidAuthCredentialsError);
  });

  it('rejects wrong audience', async () => {
    const token = await fixture.signAccessToken({
      subject: 'sub-x',
      audience: 'other-api',
    });
    await expect(
      fixture.gateway.resolve({ authorizationHeader: `Bearer ${token}` }),
    ).rejects.toBeInstanceOf(InvalidAuthCredentialsError);
  });

  it('rejects wrong issuer', async () => {
    const token = await fixture.signAccessToken({
      subject: 'sub-x',
      issuer: 'https://evil.example/',
    });
    await expect(
      fixture.gateway.resolve({ authorizationHeader: `Bearer ${token}` }),
    ).rejects.toBeInstanceOf(InvalidAuthCredentialsError);
  });

  it('rejects expired token', async () => {
    const token = await fixture.signAccessToken({
      subject: 'sub-x',
      expiresIn: '0s',
    });
    await new Promise((r) => setTimeout(r, 50));
    await expect(
      fixture.gateway.resolve({ authorizationHeader: `Bearer ${token}` }),
    ).rejects.toBeInstanceOf(InvalidAuthCredentialsError);
  });

  it('accepts issuer claim with trailing slash when config omits it', async () => {
    const token = await fixture.signAccessToken({
      subject: 'sub-trailing-iss',
      issuer: `${TEST_AUTH_ISSUER}/`,
    });
    const principal = await fixture.gateway.resolve({
      authorizationHeader: `Bearer ${token}`,
    });
    expect(principal).toEqual({ subjectId: 'sub-trailing-iss' });
  });

  it('fromConfig builds remote JWKS gateway without throwing', () => {
    const gateway = JwtBearerAuthGateway.fromConfig({
      issuer: TEST_AUTH_ISSUER,
      audience: TEST_AUTH_AUDIENCE,
      jwksUrl: 'https://auth.test.clinic-voice-ai.local/.well-known/jwks.json',
    });
    expect(gateway.kind).toBe('production');
  });
});
