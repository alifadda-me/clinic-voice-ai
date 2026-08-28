import { z } from 'zod';

const openRouterEnvSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_MODEL: z.string().min(1).default('openai/gpt-4o-mini'),
  OPENROUTER_BASE_URL: z
    .string()
    .url()
    .default('https://openrouter.ai/api/v1'),
  OPENROUTER_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  OPENROUTER_HTTP_REFERER: z.string().optional(),
  OPENROUTER_APP_TITLE: z.string().optional(),
});

export type OpenRouterChatConfig = {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  httpReferer?: string | undefined;
  appTitle?: string | undefined;
};

export function loadOpenRouterChatConfig(
  env: NodeJS.ProcessEnv = process.env,
): OpenRouterChatConfig {
  const parsed = openRouterEnvSchema.parse({
    OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
    OPENROUTER_MODEL: env.OPENROUTER_MODEL,
    OPENROUTER_BASE_URL: env.OPENROUTER_BASE_URL,
    OPENROUTER_TIMEOUT_MS: env.OPENROUTER_TIMEOUT_MS,
    OPENROUTER_HTTP_REFERER: env.OPENROUTER_HTTP_REFERER,
    OPENROUTER_APP_TITLE: env.OPENROUTER_APP_TITLE,
  });

  return {
    apiKey: parsed.OPENROUTER_API_KEY,
    model: parsed.OPENROUTER_MODEL,
    baseUrl: parsed.OPENROUTER_BASE_URL.replace(/\/$/, ''),
    timeoutMs: parsed.OPENROUTER_TIMEOUT_MS,
    ...(parsed.OPENROUTER_HTTP_REFERER
      ? { httpReferer: parsed.OPENROUTER_HTTP_REFERER }
      : {}),
    ...(parsed.OPENROUTER_APP_TITLE
      ? { appTitle: parsed.OPENROUTER_APP_TITLE }
      : {}),
  };
}
