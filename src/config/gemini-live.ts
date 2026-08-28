import { z } from 'zod';

const geminiLiveEnvSchema = z.object({
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_LIVE_MODEL: z
    .string()
    .min(1)
    .default('gemini-2.5-flash-preview-native-audio-dialog'),
});

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
    model: parsed.GEMINI_LIVE_MODEL,
    enabled: Boolean(apiKey),
  };
}
