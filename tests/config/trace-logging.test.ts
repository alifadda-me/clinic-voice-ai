import { describe, expect, it } from 'vitest';
import { loadTraceLoggingConfig } from '../../src/config/trace-logging.js';

describe('loadTraceLoggingConfig', () => {
  it('enables all channels when LOG_TRACE is true', () => {
    const config = loadTraceLoggingConfig({ LOG_TRACE: 'true' });
    expect(config.http).toBe(true);
    expect(config.tools).toBe(true);
    expect(config.agent).toBe(true);
  });

  it('supports granular flags', () => {
    const config = loadTraceLoggingConfig({
      LOG_HTTP: '1',
      LOG_TOOLS: 'true',
    });
    expect(config.http).toBe(true);
    expect(config.tools).toBe(true);
    expect(config.agent).toBe(false);
  });
});
