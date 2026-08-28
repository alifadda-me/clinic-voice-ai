import { z } from 'zod';

const twilioEnvSchema = z.object({
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  TWILIO_VOICE_WEBHOOK_URL: z.string().url().optional(),
  TWILIO_MEDIA_STREAM_WS_URL: z.string().url().optional(),
});

export type TwilioTelephonyConfig = {
  authToken: string;
  /** Public HTTPS URL Twilio POSTs voice webhooks to (signature base). */
  voiceWebhookUrl: string;
  /** wss:// URL for <Stream> in TwiML. */
  mediaStreamWsUrl: string;
};

/**
 * Load Twilio PSTN config. Composition only.
 * Missing authToken → webhook validation cannot run (fail closed at handler).
 */
export function loadTwilioTelephonyConfig(
  env: NodeJS.ProcessEnv = process.env,
): TwilioTelephonyConfig | null {
  const parsed = twilioEnvSchema.parse({
    TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN,
    TWILIO_VOICE_WEBHOOK_URL: env.TWILIO_VOICE_WEBHOOK_URL,
    TWILIO_MEDIA_STREAM_WS_URL: env.TWILIO_MEDIA_STREAM_WS_URL,
  });

  const authToken = parsed.TWILIO_AUTH_TOKEN?.trim();
  if (
    !authToken ||
    !parsed.TWILIO_VOICE_WEBHOOK_URL ||
    !parsed.TWILIO_MEDIA_STREAM_WS_URL
  ) {
    return null;
  }

  return {
    authToken,
    voiceWebhookUrl: parsed.TWILIO_VOICE_WEBHOOK_URL.replace(/\/$/, ''),
    mediaStreamWsUrl: parsed.TWILIO_MEDIA_STREAM_WS_URL,
  };
}
