/**
 * Minimal TwiML builders — string templates only, no Twilio SDK types.
 */

export function buildMediaStreamConnectTwiml(input: {
  mediaStreamWsUrl: string;
  /** Opaque custom parameters (never used as patient identity). */
  parameters?: Record<string, string> | undefined;
}): string {
  const paramsXml = Object.entries(input.parameters ?? {})
    .map(
      ([name, value]) =>
        `<Parameter name="${escapeXml(name)}" value="${escapeXml(value)}" />`,
    )
    .join('');

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>` +
    `<Connect>` +
    `<Stream url="${escapeXml(input.mediaStreamWsUrl)}">` +
    paramsXml +
    `</Stream>` +
    `</Connect>` +
    `</Response>`
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
