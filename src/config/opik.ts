import { z } from 'zod';

const opikEnvSchema = z.object({
  OPIK_API_KEY: z.string().optional(),
  OPIK_URL_OVERRIDE: z.string().url().optional(),
  OPIK_PROJECT_NAME: z.string().min(1).default('clinic-voice-ai'),
  OPIK_WORKSPACE: z.string().optional(),
});

export type OpikObservabilityConfig = {
  apiKey?: string | undefined;
  apiUrl?: string | undefined;
  projectName: string;
  workspaceName?: string | undefined;
  /** When false/absent apiKey, bootstrap should use NoopObservability. */
  enabled: boolean;
};

/**
 * Load Opik adapter config. Composition only — never in domain/application.
 */
export function loadOpikObservabilityConfig(
  env: NodeJS.ProcessEnv = process.env,
): OpikObservabilityConfig {
  const parsed = opikEnvSchema.parse({
    OPIK_API_KEY: env.OPIK_API_KEY,
    OPIK_URL_OVERRIDE: env.OPIK_URL_OVERRIDE,
    OPIK_PROJECT_NAME: env.OPIK_PROJECT_NAME,
    OPIK_WORKSPACE: env.OPIK_WORKSPACE,
  });

  const apiKey = parsed.OPIK_API_KEY?.trim() || undefined;

  return {
    ...(apiKey ? { apiKey } : {}),
    ...(parsed.OPIK_URL_OVERRIDE
      ? { apiUrl: parsed.OPIK_URL_OVERRIDE.replace(/\/$/, '') }
      : {}),
    projectName: parsed.OPIK_PROJECT_NAME,
    ...(parsed.OPIK_WORKSPACE
      ? { workspaceName: parsed.OPIK_WORKSPACE }
      : {}),
    enabled: Boolean(apiKey),
  };
}
