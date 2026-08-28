import { describe, expect, it } from 'vitest';
import { OpikObservability } from '../../src/infrastructure/observability/opik/opik-observability.js';
import type {
  OpikClientLike,
  OpikSpanHandle,
  OpikTraceHandle,
} from '../../src/infrastructure/observability/opik/opik-client-like.js';
import { createSafeObservability } from '../../src/agent/safe-observability.js';

function createRecordingClient(options?: { failOnTrace?: boolean }) {
  const traces: Array<{
    name: string;
    metadata?: Record<string, unknown> | undefined;
    spans: Array<{
      name: string;
      metadata?: Record<string, unknown> | undefined;
    }>;
    ended: boolean;
  }> = [];

  const client: OpikClientLike = {
    trace(params) {
      if (options?.failOnTrace) {
        throw new Error('opik unavailable');
      }
      const record: (typeof traces)[number] = {
        name: params.name,
        spans: [],
        ended: false,
        ...(params.metadata ? { metadata: params.metadata } : {}),
      };
      traces.push(record);

      const spanHandle = (spanParams: {
        name: string;
        metadata?: Record<string, unknown>;
      }): OpikSpanHandle => {
        const spanRec: (typeof record.spans)[number] = {
          name: spanParams.name,
          ...(spanParams.metadata ? { metadata: spanParams.metadata } : {}),
        };
        record.spans.push(spanRec);
        return {
          end() {},
          update(data) {
            spanRec.metadata = {
              ...(spanRec.metadata ?? {}),
              ...(data.metadata ?? {}),
            };
          },
        };
      };

      const traceHandle: OpikTraceHandle = {
        span(spanParams) {
          return spanHandle(spanParams);
        },
        end() {
          record.ended = true;
        },
        update(data) {
          record.metadata = {
            ...(record.metadata ?? {}),
            ...(data.metadata ?? {}),
          };
        },
      };
      return traceHandle;
    },
  };

  return { client, traces };
}

describe('OpikObservability fail-open', () => {
  it('records traces and nested llm/tool spans without PII keys', () => {
    const { client, traces } = createRecordingClient();
    const obs = new OpikObservability(client);

    const turn = obs.startTrace('agent.turn', {
      conversation_id: 'c1',
      message: 'should be stripped',
      patientId: 'pat_x',
    });
    const llm = turn.startChild('llm.generate', { step: 0 });
    llm.setAttribute('prompt_tokens', 10);
    llm.setAttribute('message', 'nope');
    llm.end();
    const tool = turn.startChild('tool.dispatch', {
      tool_name: 'search_doctors',
    });
    tool.setAttribute('tool_ok', true);
    tool.end();
    turn.setAttribute('status', 'ok');
    turn.end();

    expect(traces).toHaveLength(1);
    expect(traces[0]!.name).toBe('agent.turn');
    expect(traces[0]!.metadata).not.toHaveProperty('message');
    expect(traces[0]!.metadata).not.toHaveProperty('patientId');
    expect(traces[0]!.metadata).toMatchObject({ conversation_id: 'c1' });
    expect(traces[0]!.spans.map((s) => s.name)).toEqual([
      'llm.generate',
      'tool.dispatch',
    ]);
    expect(traces[0]!.ended).toBe(true);
  });

  it('never throws when the Opik client fails', async () => {
    const { client } = createRecordingClient({ failOnTrace: true });
    const obs = new OpikObservability(client);

    expect(() => {
      const span = obs.startTrace('agent.turn');
      span.setAttribute('status', 'ok');
      const child = span.startChild('llm.generate');
      child.end();
      span.end();
    }).not.toThrow();

    await expect(
      obs.recordEvent('llm.error', { error_code: 'CHAT_MODEL_UNAVAILABLE' }),
    ).resolves.toBeUndefined();
  });

  it('safe wrapper swallows throwing ObservabilityPort implementations', async () => {
    const throwing = {
      startTrace(): never {
        throw new Error('boom');
      },
      async recordScore(): Promise<never> {
        throw new Error('boom');
      },
      async recordEvent(): Promise<never> {
        throw new Error('boom');
      },
    };

    const safe = createSafeObservability(throwing);
    const span = safe.startTrace('agent.turn', { message: 'secret' });
    expect(() => span.setAttribute('latency_ms', 1)).not.toThrow();
    expect(() => span.startChild('llm.generate').end()).not.toThrow();
    expect(() => span.end()).not.toThrow();
    await expect(
      safe.recordEvent('x', { phoneNumber: '+2010' }),
    ).resolves.toBeUndefined();
  });
});
