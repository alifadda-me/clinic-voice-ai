/**
 * Trace attribute hygiene — provider-neutral, no Opik types.
 * Used by agent (safe wrapper) and observability adapters.
 */

const FORBIDDEN_KEY =
  /^(message|content|phone|phonenumber|fullname|authorization|authorizationheader|demosubject|patientid|subjectid|jwt|token|password|transcript|reply|prompt|input|output|body|text|utterance)$/i;

export function isForbiddenTraceAttributeKey(key: string): boolean {
  return FORBIDDEN_KEY.test(key.trim());
}

/** Drop forbidden keys; coerce remaining values to attribute primitives. */
export function sanitizeTraceAttributes(
  attributes: Record<string, unknown> | undefined,
): Record<string, string | number | boolean> {
  if (!attributes) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (isForbiddenTraceAttributeKey(key)) continue;
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      out[key] = value;
    }
  }
  return out;
}
