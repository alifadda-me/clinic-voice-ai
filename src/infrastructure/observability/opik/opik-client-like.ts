/**
 * Minimal Opik client surface used by the adapter.
 * Real `opik` SDK or fakes implement this — keeps unit tests offline.
 */

export type OpikSpanHandle = {
  end(): void;
  update?(data: {
    metadata?: Record<string, unknown>;
    output?: Record<string, unknown>;
  }): void;
};

export type OpikTraceHandle = {
  span(params: {
    name: string;
    type?: 'general' | 'tool' | 'llm' | 'guardrail';
    metadata?: Record<string, unknown>;
  }): OpikSpanHandle;
  end(): void;
  update?(data: {
    metadata?: Record<string, unknown>;
    output?: Record<string, unknown>;
  }): void;
};

export type OpikClientLike = {
  trace(params: {
    name: string;
    metadata?: Record<string, unknown>;
  }): OpikTraceHandle;
  flush?(): Promise<void>;
};
