import type {
  ObservabilityPort,
  ObservabilitySpan,
  ObservationScore,
  TraceAttributes,
} from '../../ports/platform/observability.js';

/**
 * Fail-open noop — never throws; never blocks clinic traffic.
 */
export class NoopObservability implements ObservabilityPort {
  startTrace(_name: string, _attributes?: TraceAttributes): ObservabilitySpan {
    return noopSpan();
  }

  async recordScore(
    _traceName: string,
    _score: ObservationScore,
  ): Promise<void> {
    /* noop */
  }

  async recordEvent(
    _name: string,
    _attributes?: TraceAttributes,
  ): Promise<void> {
    /* noop */
  }
}

function noopSpan(): ObservabilitySpan {
  return {
    setAttribute() {
      /* noop */
    },
    startChild() {
      return noopSpan();
    },
    end() {
      /* noop */
    },
  };
}
