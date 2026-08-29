import { describe, expect, it } from 'vitest';
import { normalizeToolArgs } from '../../src/agent/tools/normalize-tool-args.js';
import { createToolRegistry } from '../../src/agent/tools/registry.js';
import { createClinicTools } from '../../src/agent/tools/clinic-tools.js';
import { createAgentTestWorld } from '../helpers/agent-world.js';

describe('normalizeToolArgs', () => {
  it('maps description to query for search_specialties', () => {
    expect(
      normalizeToolArgs('search_specialties', {
        description: 'جلدية',
      }),
    ).toEqual({ query: 'جلدية' });
  });

  it('maps description to query for search_doctors', () => {
    expect(
      normalizeToolArgs('search_doctors', {
        description: 'دكتور جلدية',
      }),
    ).toEqual({ query: 'دكتور جلدية' });
  });
});

describe('tool registry normalize', () => {
  it('executes search_specialties when model sends description', async () => {
    const ctx = createAgentTestWorld();
    await ctx.world.seed();
    const registry = createToolRegistry(createClinicTools(ctx.useCases));
    const result = await registry.dispatch(
      'search_specialties',
      { description: 'dermatology' },
      { execution: await ctx.execution({ conversationId: 'voice-test' }) },
    );
    expect(result.ok).toBe(true);
  });
});
