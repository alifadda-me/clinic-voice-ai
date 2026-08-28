import { z } from 'zod';

const authEnvSchema = z.object({
  AUTH_ISSUER: z.string().url(),
  AUTH_AUDIENCE: z.string().min(1),
  AUTH_JWKS_URL: z.string().url(),
});

export type JwtBearerAuthConfig = {
  issuer: string;
  audience: string;
  jwksUrl: string;
};

/**
 * Load production JWT/JWKS auth config. Composition only — never in domain/application.
 * IdP-agnostic: point these env vars at any OIDC-compliant issuer.
 */
export function loadJwtBearerAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
): JwtBearerAuthConfig {
  const parsed = authEnvSchema.parse({
    AUTH_ISSUER: env.AUTH_ISSUER,
    AUTH_AUDIENCE: env.AUTH_AUDIENCE,
    AUTH_JWKS_URL: env.AUTH_JWKS_URL,
  });

  return {
    issuer: parsed.AUTH_ISSUER.replace(/\/$/, ''),
    audience: parsed.AUTH_AUDIENCE,
    jwksUrl: parsed.AUTH_JWKS_URL,
  };
}
