import { z } from 'zod';

/**
 * Validated configuration — process.env is read ONLY here (bootstrap/config).
 * Domain and application must never import this module's env parsing internals
 * as a global; they receive Clock/repos via DI.
 */

const postgresEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
});

export type PostgresConfig = {
  databaseUrl: string;
};

export function loadPostgresConfig(
  env: NodeJS.ProcessEnv = process.env,
): PostgresConfig {
  const parsed = postgresEnvSchema.parse({
    DATABASE_URL: env.DATABASE_URL,
  });
  return { databaseUrl: parsed.DATABASE_URL };
}
