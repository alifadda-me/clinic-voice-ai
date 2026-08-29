import { z } from 'zod';

/** Recommended Live native-audio model (Mar 2026). */
export const DEFAULT_GEMINI_LIVE_MODEL = 'gemini-3.1-flash-live-preview';

const geminiLiveEnvSchema = z.object({
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_LIVE_MODEL: z.string().min(1).default(DEFAULT_GEMINI_LIVE_MODEL),
});

/** Retired Live model ids → current supported id. */
const DEPRECATED_LIVE_MODEL_ALIASES: Record<string, string> = {
  'gemini-2.5-flash-preview-native-audio-dialog':
    DEFAULT_GEMINI_LIVE_MODEL,
  'gemini-2.5-flash-native-audio-preview-12-2025':
    DEFAULT_GEMINI_LIVE_MODEL,
  'gemini-live-2.5-flash-preview': DEFAULT_GEMINI_LIVE_MODEL,
  'gemini-2.0-flash-live-001': DEFAULT_GEMINI_LIVE_MODEL,
};

function resolveLiveModel(model: string): string {
  return DEPRECATED_LIVE_MODEL_ALIASES[model] ?? model;
}

export type GeminiLiveVoiceConfig = {
  apiKey?: string | undefined;
  model: string;
  enabled: boolean;
};

/**
 * Load Gemini Live voice config. Composition only.
 */
export function loadGeminiLiveVoiceConfig(
  env: NodeJS.ProcessEnv = process.env,
): GeminiLiveVoiceConfig {
  const parsed = geminiLiveEnvSchema.parse({
    GEMINI_API_KEY: env.GEMINI_API_KEY,
    GEMINI_LIVE_MODEL: env.GEMINI_LIVE_MODEL,
  });
  const apiKey = parsed.GEMINI_API_KEY?.trim() || undefined;
  return {
    ...(apiKey ? { apiKey } : {}),
    model: resolveLiveModel(parsed.GEMINI_LIVE_MODEL),
    enabled: Boolean(apiKey),
  };
}
