import type { ObservabilityPort } from '../../ports/platform/observability.js';
import { loadOpikObservabilityConfig } from '../../config/opik.js';
import { createOpikObservability } from './opik/create-opik-observability.js';
import { NoopObservability } from './noop-observability.js';

/**
 * Opik when enabled, otherwise noop (fail-open default).
 */
export function createObservabilityFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ObservabilityPort {
  const config = loadOpikObservabilityConfig(env);
  if (!config.enabled) {
    return new NoopObservability();
  }
  return createOpikObservability(config);
}
