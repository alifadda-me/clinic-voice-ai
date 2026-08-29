/**
 * Opt-in structured trace logs for local debugging (stdout JSON lines).
 * Enable with LOG_TRACE=true or granular LOG_HTTP / LOG_TOOLS / LOG_AGENT.
 */

export type TraceLoggingConfig = {
  http: boolean;
  tools: boolean;
  agent: boolean;
};

function isEnabled(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

export function loadTraceLoggingConfig(
  env: NodeJS.ProcessEnv = process.env,
): TraceLoggingConfig {
  const all = isEnabled(env.LOG_TRACE);
  return {
    http: all || isEnabled(env.LOG_HTTP),
    tools: all || isEnabled(env.LOG_TOOLS),
    agent: all || isEnabled(env.LOG_AGENT),
  };
}

export function logTraceEvent(payload: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
}
