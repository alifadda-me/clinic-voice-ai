import { describe, expect, it } from 'vitest';
import { createGeminiLiveVoiceProviderFromEnv } from '../../src/infrastructure/voice/gemini-live/create-gemini-live-voice-provider.js';

describe('createGeminiLiveVoiceProviderFromEnv', () => {
  it('requires GEMINI_API_KEY', () => {
    expect(() =>
      createGeminiLiveVoiceProviderFromEnv({ GEMINI_API_KEY: '' }),
    ).toThrow(/GEMINI_API_KEY/);
  });

  it('creates provider when key is set', () => {
    const provider = createGeminiLiveVoiceProviderFromEnv({
      GEMINI_API_KEY: 'test-gemini-key',
    });
    expect(provider).toBeDefined();
    expect(typeof provider.startSession).toBe('function');
  });
});
