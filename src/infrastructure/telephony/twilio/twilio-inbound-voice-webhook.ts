import type { ObservabilityPort } from '../../../ports/platform/observability.js';
import { NoopObservability } from '../../observability/noop-observability.js';
import {
  TwilioSignatureInvalidError,
  validateTwilioRequestSignature,
} from './twilio-signature.js';
import { buildMediaStreamConnectTwiml } from './twilio-twiml.js';

export type TwilioInboundVoiceRequest = {
  signature: string | undefined;
  /** Absolute URL Twilio used (for signature). */
  requestUrl: string;
  /** Form body from Twilio voice webhook. */
  params: Record<string, string>;
};

export type TwilioInboundVoiceResult = {
  twiml: string;
  callSid: string;
  /** Spoofable ANI — metadata only, NEVER authentication. */
  callerIdClaim: string | null;
};

/**
 * Handles Twilio PSTN inbound voice webhooks.
 * Validates signature (fail closed). Does not authenticate callers.
 */
export class TwilioInboundVoiceWebhook {
  private readonly observability: ObservabilityPort;

  constructor(
    private readonly deps: {
      authToken: string;
      mediaStreamWsUrl: string;
      observability?: ObservabilityPort | undefined;
    },
  ) {
    this.observability = deps.observability ?? new NoopObservability();
  }

  handle(input: TwilioInboundVoiceRequest): TwilioInboundVoiceResult {
    const span = this.observability.startTrace('twilio.voice.webhook', {
      channel: 'twilio_voice',
    });

    try {
      const valid = validateTwilioRequestSignature({
        authToken: this.deps.authToken,
        signature: input.signature,
        requestUrl: input.requestUrl,
        params: input.params,
      });
      if (!valid) {
        span.setAttribute('status', 'rejected');
        span.setAttribute('error_code', 'TWILIO_SIGNATURE_INVALID');
        span.end();
        throw new TwilioSignatureInvalidError();
      }

      const callSid = (input.params.CallSid ?? '').trim();
      if (!callSid) {
        span.setAttribute('status', 'error');
        span.setAttribute('error_code', 'MISSING_CALL_SID');
        span.end();
        throw new TwilioSignatureInvalidError('CallSid is required');
      }

      const callerIdClaim = normalizeCallerIdClaim(input.params.From);

      const twiml = buildMediaStreamConnectTwiml({
        mediaStreamWsUrl: this.deps.mediaStreamWsUrl,
        parameters: {
          callSid,
          ...(callerIdClaim ? { callerIdClaim } : {}),
        },
      });

      span.setAttribute('status', 'ok');
      span.setAttribute('has_caller_id_claim', Boolean(callerIdClaim));
      span.end();

      return {
        twiml,
        callSid,
        callerIdClaim,
      };
    } catch (error) {
      if (error instanceof TwilioSignatureInvalidError) throw error;
      span.setAttribute('status', 'error');
      span.end();
      throw error;
    }
  }
}

function normalizeCallerIdClaim(from: string | undefined): string | null {
  const raw = from?.trim();
  if (!raw) return null;
  return raw;
}
