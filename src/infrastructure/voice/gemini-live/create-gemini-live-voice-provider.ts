import { loadGeminiLiveVoiceConfig } from '../../../config/gemini-live.js';
import type { LiveVoiceProvider } from '../../../ports/platform/live-voice-provider.js';
import { GeminiLiveVoiceProvider } from './gemini-live-voice-provider.js';
import { createSdkGeminiLiveTransport } from './create-sdk-gemini-live-transport.js';

/**
 * Production voice bootstrap from GEMINI_* env. Composition only.
 */
export function createGeminiLiveVoiceProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): LiveVoiceProvider {
  const config = loadGeminiLiveVoiceConfig(env);
  if (!config.apiKey) {
    throw new Error(
      'GEMINI_API_KEY is required when ENABLE_VOICE or ENABLE_TWILIO is true',
    );
  }
  return new GeminiLiveVoiceProvider(createSdkGeminiLiveTransport(config));
}
