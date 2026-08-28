import { describe, expect, it } from 'vitest';
import {
  isForbiddenTraceAttributeKey,
  sanitizeTraceAttributes,
} from '../../src/ports/platform/trace-attributes.js';

describe('trace attribute sanitization', () => {
  it('flags PII and conversation keys as forbidden', () => {
    expect(isForbiddenTraceAttributeKey('message')).toBe(true);
    expect(isForbiddenTraceAttributeKey('phoneNumber')).toBe(true);
    expect(isForbiddenTraceAttributeKey('patientId')).toBe(true);
    expect(isForbiddenTraceAttributeKey('subjectId')).toBe(true);
    expect(isForbiddenTraceAttributeKey('authorization')).toBe(true);
    expect(isForbiddenTraceAttributeKey('content')).toBe(true);
  });

  it('allows metric and correlation keys', () => {
    expect(isForbiddenTraceAttributeKey('latency_ms')).toBe(false);
    expect(isForbiddenTraceAttributeKey('tool_name')).toBe(false);
    expect(isForbiddenTraceAttributeKey('conversation_id')).toBe(false);
    expect(isForbiddenTraceAttributeKey('prompt_tokens')).toBe(false);
  });

  it('strips forbidden keys from attribute maps', () => {
    const cleaned = sanitizeTraceAttributes({
      tool_name: 'book_appointment',
      message: 'I need a cardiologist for Ali +20101111',
      phoneNumber: '+20101111',
      latency_ms: 12,
      patientId: 'pat_1',
    });
    expect(cleaned).toEqual({
      tool_name: 'book_appointment',
      latency_ms: 12,
    });
  });
});
