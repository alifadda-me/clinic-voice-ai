const REDACTED_KEY_PATTERN =
  /password|private[_-]?key|secret|token|authorization|jwt/i;

/**
 * Redact secrets; truncate long chat messages. For trace logs only.
 */
export function sanitizeRequestBodyForLog(body: unknown): unknown {
  if (body === null || body === undefined) {
    return undefined;
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    return body;
  }

  const record = body as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (REDACTED_KEY_PATTERN.test(key)) {
      out[key] = '[redacted]';
      continue;
    }
    if (key === 'message' && typeof value === 'string' && value.length > 500) {
      out[key] = `${value.slice(0, 500)}…`;
      continue;
    }
    out[key] = value;
  }

  return out;
}
