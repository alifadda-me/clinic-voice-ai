/**
 * Platform observability — no Opik types.
 *
 * Fail-open contract: adapters MUST NOT throw into callers.
 * Prefer ids / metrics / error codes — never raw conversation or PII.
 */

export type TraceAttributes = Record<string, string | number | boolean>;

export type ObservationScore = {
  name: string;
  value: number;
  reason?: string | undefined;
};

export interface ObservabilitySpan {
  setAttribute(key: string, value: string | number | boolean): void;
  /** Nested span (e.g. llm.generate, tool.dispatch). */
  startChild(name: string, attributes?: TraceAttributes): ObservabilitySpan;
  end(): void;
}

export interface ObservabilityPort {
  startTrace(name: string, attributes?: TraceAttributes): ObservabilitySpan;
  recordScore(
    traceName: string,
    score: ObservationScore,
  ): Promise<void>;
  recordEvent(
    name: string,
    attributes?: TraceAttributes,
  ): Promise<void>;
}
