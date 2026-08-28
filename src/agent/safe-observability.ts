import type {
  ObservabilityPort,
  ObservabilitySpan,
  TraceAttributes,
} from '../ports/platform/observability.js';
import { sanitizeTraceAttributes } from '../ports/platform/trace-attributes.js';

/**
 * Fail-open wrapper: any observability failure is swallowed.
 * Also sanitizes attributes at the agent boundary (defense in depth).
 * Does not import infrastructure — uses an inline noop when undefined.
 */
export function createSafeObservability(
  inner: ObservabilityPort | undefined,
): ObservabilityPort {
  const port = inner ?? INLINE_NOOP;

  return {
    startTrace(name, attributes) {
      try {
        const span = port.startTrace(
          name,
          sanitizeTraceAttributes(attributes),
        );
        return wrapSpan(span);
      } catch {
        return noopSpan();
      }
    },
    async recordScore(traceName, score) {
      try {
        await port.recordScore(traceName, {
          name: score.name,
          value: score.value,
          ...(score.reason && !looksLikePiiReason(score.reason)
            ? { reason: score.reason }
            : {}),
        });
      } catch {
        /* fail-open */
      }
    },
    async recordEvent(name, attributes) {
      try {
        await port.recordEvent(name, sanitizeTraceAttributes(attributes));
      } catch {
        /* fail-open */
      }
    },
  };
}

function wrapSpan(span: ObservabilitySpan): ObservabilitySpan {
  return {
    setAttribute(key, value) {
      try {
        if (sanitizeTraceAttributes({ [key]: value })[key] === undefined) {
          return;
        }
        span.setAttribute(key, value);
      } catch {
        /* fail-open */
      }
    },
    startChild(name, attributes) {
      try {
        return wrapSpan(
          span.startChild(name, sanitizeTraceAttributes(attributes)),
        );
      } catch {
        return noopSpan();
      }
    },
    end() {
      try {
        span.end();
      } catch {
        /* fail-open */
      }
    },
  };
}

function noopSpan(): ObservabilitySpan {
  return {
    setAttribute() {},
    startChild() {
      return noopSpan();
    },
    end() {},
  };
}

const INLINE_NOOP: ObservabilityPort = {
  startTrace() {
    return noopSpan();
  },
  async recordScore() {},
  async recordEvent() {},
};

function looksLikePiiReason(reason: string): boolean {
  return reason.length > 120 || /\+?\d{8,}/.test(reason);
}

export type { TraceAttributes };
