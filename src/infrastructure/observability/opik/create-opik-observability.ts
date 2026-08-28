import { Opik } from 'opik';
import type { OpikObservabilityConfig } from '../../../config/opik.js';
import type { OpikClientLike } from './opik-client-like.js';
import { OpikObservability } from './opik-observability.js';

/**
 * Build a real Opik SDK client wrapped as OpikClientLike.
 * Only called from bootstrap when config.enabled.
 */
export function createSdkOpikClient(
  config: OpikObservabilityConfig,
): OpikClientLike {
  const client = new Opik({
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    ...(config.apiUrl ? { apiUrl: config.apiUrl } : {}),
    projectName: config.projectName,
    ...(config.workspaceName ? { workspaceName: config.workspaceName } : {}),
  });

  return {
    trace(params) {
      return client.trace({
        name: params.name,
        ...(params.metadata ? { metadata: params.metadata } : {}),
      });
    },
    async flush() {
      await client.flush();
    },
  };
}

export function createOpikObservability(
  config: OpikObservabilityConfig,
  client: OpikClientLike = createSdkOpikClient(config),
): OpikObservability {
  return new OpikObservability(client);
}
