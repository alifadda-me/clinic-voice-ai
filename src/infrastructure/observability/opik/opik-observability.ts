import type {
  ObservabilityPort,
  ObservabilitySpan,
  ObservationScore,
  TraceAttributes,
} from '../../../ports/platform/observability.js';
import {
  isForbiddenTraceAttributeKey,
  sanitizeTraceAttributes,
} from '../../../ports/platform/trace-attributes.js';
import type {
  OpikClientLike,
  OpikSpanHandle,
  OpikTraceHandle,
} from './opik-client-like.js';

/**
 * Fail-open Opik adapter behind ObservabilityPort.
 * Never throws. Never writes clinic data. Never sends raw conversation/PII.
 *
 * Note: sanitize is also applied in the agent; this is defense in depth
 * for any non-agent caller of the port.
 */
export class OpikObservability implements ObservabilityPort {
  constructor(private readonly client: OpikClientLike) {}

  startTrace(name: string, attributes?: TraceAttributes): ObservabilitySpan {
    try {
      const metadata = sanitizeTraceAttributes(attributes);
      const trace = this.client.trace({ name, metadata });
      return createOpikSpan(trace, metadata, 'trace');
    } catch {
      return silentSpan();
    }
  }

  async recordScore(
    traceName: string,
    score: ObservationScore,
  ): Promise<void> {
    try {
      const trace = this.client.trace({
        name: `score:${traceName}`,
        metadata: {
          score_name: score.name,
          score_value: score.value,
          ...(score.reason && !isForbiddenTraceAttributeKey('reason')
            ? { score_reason_present: true }
            : {}),
        },
      });
      trace.end();
    } catch {
      /* fail-open */
    }
  }

  async recordEvent(
    name: string,
    attributes?: TraceAttributes,
  ): Promise<void> {
    try {
      const trace = this.client.trace({
        name: `event:${name}`,
        metadata: sanitizeTraceAttributes(attributes),
      });
      trace.end();
    } catch {
      /* fail-open */
    }
  }
}

function createOpikSpan(
  handle: OpikTraceHandle | OpikSpanHandle,
  attrs: TraceAttributes,
  kind: 'trace' | 'span',
): ObservabilitySpan {
  return {
    setAttribute(key, value) {
      try {
        if (isForbiddenTraceAttributeKey(key)) return;
        attrs[key] = value;
        handle.update?.({ metadata: { ...attrs } });
      } catch {
        /* fail-open */
      }
    },
    startChild(name, attributes) {
      try {
        if (!('span' in handle) || typeof handle.span !== 'function') {
          return silentSpan();
        }
        const childAttrs = sanitizeTraceAttributes(attributes);
        const type = name.startsWith('llm.')
          ? 'llm'
          : name.startsWith('tool.')
            ? 'tool'
            : 'general';
        const child = handle.span({
          name,
          type,
          metadata: childAttrs,
        });
        return createOpikSpan(child, childAttrs, 'span');
      } catch {
        return silentSpan();
      }
    },
    end() {
      try {
        if (kind === 'trace' && 'update' in handle) {
          handle.update?.({
            metadata: { ...attrs },
            output: { status: attrs.status ?? 'unknown' },
          });
        }
        handle.end();
      } catch {
        /* fail-open */
      }
    },
  };
}

function silentSpan(): ObservabilitySpan {
  return {
    setAttribute() {},
    startChild() {
      return silentSpan();
    },
    end() {},
  };
}
