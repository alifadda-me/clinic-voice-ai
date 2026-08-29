import { describe, expect, it } from 'vitest';
import { loadOpikObservabilityConfig } from '../../src/config/opik.js';
import { createObservabilityFromEnv } from '../../src/infrastructure/observability/create-observability-from-env.js';
import { NoopObservability } from '../../src/infrastructure/observability/noop-observability.js';

describe('loadOpikObservabilityConfig', () => {
  it('disables Opik when api key is set without workspace', () => {
    const config = loadOpikObservabilityConfig({
      OPIK_API_KEY: 'test-key',
      OPIK_PROJECT_NAME: 'clinic-voice-ai',
    });
    expect(config.enabled).toBe(false);
  });

  it('enables Opik when api key and workspace are set', () => {
    const config = loadOpikObservabilityConfig({
      OPIK_API_KEY: 'test-key',
      OPIK_WORKSPACE: 'my-workspace',
      OPIK_PROJECT_NAME: 'clinic-voice-ai',
    });
    expect(config.enabled).toBe(true);
  });
});

describe('createObservabilityFromEnv', () => {
  it('returns noop when Opik config is incomplete', () => {
    const port = createObservabilityFromEnv({
      OPIK_API_KEY: 'test-key',
    });
    expect(port).toBeInstanceOf(NoopObservability);
  });
});
