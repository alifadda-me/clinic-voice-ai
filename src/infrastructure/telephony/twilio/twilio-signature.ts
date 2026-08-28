import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Twilio webhook signature validation (X-Twilio-Signature).
 * Fail closed: missing signature or token → invalid.
 *
 * Spec: HMAC-SHA1(authToken, url + sorted(key+value) form params) base64.
 * @see https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export function validateTwilioRequestSignature(input: {
  authToken: string;
  signature: string | undefined;
  /** Full webhook URL as Twilio called it (scheme + host + path; query stripped). */
  requestUrl: string;
  /** Application/x-www-form-urlencoded body fields. */
  params: Record<string, string>;
}): boolean {
  const token = input.authToken.trim();
  const signature = input.signature?.trim();
  if (!token || !signature) {
    return false;
  }

  let url: URL;
  try {
    url = new URL(input.requestUrl);
  } catch {
    return false;
  }
  url.search = '';

  const paramString = Object.keys(input.params)
    .sort()
    .map((key) => `${key}${input.params[key] ?? ''}`)
    .join('');

  const expected = createHmac('sha1', token)
    .update(`${url.href}${paramString}`)
    .digest('base64');

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export class TwilioSignatureInvalidError extends Error {
  readonly code = 'TWILIO_SIGNATURE_INVALID';

  constructor(message = 'Twilio webhook signature is invalid or missing') {
    super(message);
    this.name = 'TwilioSignatureInvalidError';
  }
}
