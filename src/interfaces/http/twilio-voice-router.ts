import { Router } from 'express';
import type { ObservabilityPort } from '../../ports/platform/observability.js';
import {
  TwilioInboundVoiceWebhook,
  TwilioSignatureInvalidError,
} from '../../infrastructure/telephony/twilio/index.js';
import { HttpError } from './map-error.js';

/**
 * Thin HTTP routes for Twilio PSTN voice webhooks.
 * Signature validation + TwiML only — no clinic business rules.
 */
export function createTwilioVoiceRouter(deps: {
  authToken: string;
  mediaStreamWsUrl: string;
  /** Absolute public URL used for signature validation. */
  voiceWebhookUrl: string;
  observability?: ObservabilityPort | undefined;
}): Router {
  const router = Router();
  const webhook = new TwilioInboundVoiceWebhook({
    authToken: deps.authToken,
    mediaStreamWsUrl: deps.mediaStreamWsUrl,
    ...(deps.observability ? { observability: deps.observability } : {}),
  });

  router.post('/twilio/voice', (req, res, next) => {
    try {
      const params = flattenFormParams(req.body);
      const result = webhook.handle({
        signature: req.header('x-twilio-signature') ?? undefined,
        requestUrl: resolveRequestUrl(req, deps.voiceWebhookUrl),
        params,
      });
      res.status(200).type('text/xml').send(result.twiml);
    } catch (error) {
      if (error instanceof TwilioSignatureInvalidError) {
        next(new HttpError(403, error.code, error.message));
        return;
      }
      next(error);
    }
  });

  return router;
}

function flattenFormParams(body: unknown): Record<string, string> {
  if (!body || typeof body !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (typeof value === 'string') out[key] = value;
    else if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = String(value);
    }
  }
  return out;
}

function resolveRequestUrl(
  req: { protocol?: string; get?(name: string): string | undefined; originalUrl?: string },
  configuredWebhookUrl: string,
): string {
  // Prefer configured public URL (behind proxies Twilio sees the public host).
  if (configuredWebhookUrl) return configuredWebhookUrl;
  const host = req.get?.('host') ?? 'localhost';
  const proto = req.protocol ?? 'https';
  return `${proto}://${host}${req.originalUrl ?? '/v1/twilio/voice'}`;
}
