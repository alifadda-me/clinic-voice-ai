import { describe, expect, it } from 'vitest';
import { createToolRegistry, stripUntrustedIdentityArgs } from '../../src/agent/tools/registry.js';
import { formatToolError } from '../../src/agent/tools/format-error.js';
import { ExternalCalendarError } from '../../src/application/shared/errors.js';
import { mapCalendarError } from '../../src/application/shared/calendar-errors.js';
import {
  CalendarUnavailableError,
  CalendarConfigurationError,
} from '../../src/ports/platform/calendar-gateway.js';
import type { ClinicTool } from '../../src/agent/tools/types.js';
import { createTrustedExecutionContext } from '../../src/agent/execution-context.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('architecture regression — trust & error boundaries', () => {
  it('strips untrusted identity fields from tool args', () => {
    const stripped = stripUntrustedIdentityArgs({
      doctorId: 'doc_1',
      patientId: 'forged',
      subjectId: 'x',
      userId: 'y',
      sessionId: 'z',
      conversationId: 'c',
      authenticatedPatientId: 'a',
      principalId: 'p',
      actor: { patientId: 'x' },
    });
    expect(stripped).toEqual({ doctorId: 'doc_1' });
  });

  it('registry ignores model patientId even when actor is bound', async () => {
    let seenPatientId: string | undefined;
    const tool: ClinicTool = {
      definition: {
        name: 'probe',
        description: 'probe',
        parameters: { type: 'object', properties: {} },
      },
      requiresPatient: true,
      async execute(args, ctx) {
        seenPatientId = ctx.execution.actor?.patientId;
        expect(args.patientId).toBeUndefined();
        return { ok: true, message: 'ok' };
      },
    };
    const registry = createToolRegistry([tool]);
    const execution = createTrustedExecutionContext({
      conversationId: 's1',
      principal: { subjectId: 'sub' },
      actor: { patientId: 'trusted-patient' },
    });
    const result = await registry.dispatch(
      'probe',
      { patientId: 'forged-from-model' },
      { execution },
    );
    expect(result.ok).toBe(true);
    expect(seenPatientId).toBe('trusted-patient');
  });

  it('sanitizes calendar provider errors at the application boundary', () => {
    expect(() => mapCalendarError(new CalendarUnavailableError('ECONNREFUSED secret-host'))).toThrow(
      ExternalCalendarError,
    );
    try {
      mapCalendarError(new CalendarConfigurationError('Google token xyz leaked'));
    } catch (error) {
      expect(error).toBeInstanceOf(ExternalCalendarError);
      expect((error as ExternalCalendarError).message).toBe(
        'Calendar is misconfigured',
      );
      expect((error as ExternalCalendarError).message).not.toContain('token');
      expect((error as ExternalCalendarError).message).not.toContain('Google');
    }
  });

  it('does not forward raw calendar ApplicationError messages to tools', () => {
    const result = formatToolError(
      new ExternalCalendarError(
        'CALENDAR_UNAVAILABLE',
        'upstream body with secrets',
      ),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('Calendar is temporarily unavailable');
    }
  });

  it('documents that session identity is not authentication', () => {
    const trust = fs.readFileSync(
      path.join(root, 'src/agent/session/TRUST_BOUNDARY.md.ts'),
      'utf8',
    );
    expect(trust).toMatch(/conversationId does NOT grant patient authority/i);
    expect(trust).toMatch(/DemoAuthGateway is local\/evaluation only/);
    expect(trust).toMatch(/invalid Bearer → 401/i);
  });

  it('session-bind patient authority remains permanently disabled', async () => {
    const { InMemorySessionIdentityStore } = await import(
      '../../src/agent/session/session-identity.js'
    );
    const store = new InMemorySessionIdentityStore();
    await store.ensure('s1');
    await expect(store.bindPatient('s1', 'pat_x')).rejects.toThrow(
      /permanently removed/i,
    );
  });

  it('agent sources do not import infrastructure auth adapters', () => {
    const agentDir = path.join(root, 'src/agent');
    const files = walkTs(agentDir).filter(
      (f) => !f.endsWith('.md.ts') && !f.includes('TRUST_BOUNDARY'),
    );
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      expect(src).not.toMatch(/infrastructure\/auth/);
      expect(src).not.toMatch(/from ['"].*DemoAuthGateway/);
      expect(src).not.toMatch(/req\.header\(/);
      expect(src).not.toMatch(/authorizationHeader/);
    }
  });
});

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTs(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}
