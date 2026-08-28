import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  validateTwilioRequestSignature,
  TwilioSignatureInvalidError,
} from '../../src/infrastructure/telephony/twilio/twilio-signature.js';
import { TwilioInboundVoiceWebhook } from '../../src/infrastructure/telephony/twilio/twilio-inbound-voice-webhook.js';
import { buildMediaStreamConnectTwiml } from '../../src/infrastructure/telephony/twilio/twilio-twiml.js';

const AUTH_TOKEN = 'test_twilio_auth_token_secret';
const WEBHOOK_URL = 'https://clinic.example.com/v1/twilio/voice';

function sign(params: Record<string, string>, url = WEBHOOK_URL): string {
  const paramString = Object.keys(params)
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join('');
  return createHmac('sha1', AUTH_TOKEN)
    .update(`${url}${paramString}`)
    .digest('base64');
}

describe('Twilio signature validation', () => {
  it('accepts a valid signature', () => {
    const params = { CallSid: 'CA123', From: '+15551212', To: '+15550000' };
    expect(
      validateTwilioRequestSignature({
        authToken: AUTH_TOKEN,
        signature: sign(params),
        requestUrl: WEBHOOK_URL,
        params,
      }),
    ).toBe(true);
  });

  it('rejects missing signature', () => {
    expect(
      validateTwilioRequestSignature({
        authToken: AUTH_TOKEN,
        signature: undefined,
        requestUrl: WEBHOOK_URL,
        params: { CallSid: 'CA123' },
      }),
    ).toBe(false);
  });

  it('rejects invalid signature', () => {
    expect(
      validateTwilioRequestSignature({
        authToken: AUTH_TOKEN,
        signature: 'not-valid',
        requestUrl: WEBHOOK_URL,
        params: { CallSid: 'CA123' },
      }),
    ).toBe(false);
  });

  it('rejects empty auth token', () => {
    const params = { CallSid: 'CA123' };
    expect(
      validateTwilioRequestSignature({
        authToken: '',
        signature: sign(params),
        requestUrl: WEBHOOK_URL,
        params,
      }),
    ).toBe(false);
  });
});

describe('TwilioInboundVoiceWebhook', () => {
  const webhook = new TwilioInboundVoiceWebhook({
    authToken: AUTH_TOKEN,
    mediaStreamWsUrl: 'wss://clinic.example.com/v1/twilio/media',
  });

  it('returns TwiML Connect/Stream on valid signature', () => {
    const params = { CallSid: 'CA999', From: '+15551111' };
    const result = webhook.handle({
      signature: sign(params),
      requestUrl: WEBHOOK_URL,
      params,
    });
    expect(result.callSid).toBe('CA999');
    expect(result.callerIdClaim).toBe('+15551111');
    expect(result.twiml).toContain('<Stream');
    expect(result.twiml).toContain('wss://clinic.example.com/v1/twilio/media');
    expect(result.twiml).toContain('callerIdClaim');
  });

  it('fails closed on bad signature', () => {
    expect(() =>
      webhook.handle({
        signature: 'bad',
        requestUrl: WEBHOOK_URL,
        params: { CallSid: 'CA1' },
      }),
    ).toThrow(TwilioSignatureInvalidError);
  });

  it('fails closed on missing signature', () => {
    expect(() =>
      webhook.handle({
        signature: undefined,
        requestUrl: WEBHOOK_URL,
        params: { CallSid: 'CA1' },
      }),
    ).toThrow(TwilioSignatureInvalidError);
  });
});

describe('TwiML builder', () => {
  it('escapes XML in stream parameters', () => {
    const xml = buildMediaStreamConnectTwiml({
      mediaStreamWsUrl: 'wss://x.example/media',
      parameters: { note: 'a<b>&"c"' },
    });
    expect(xml).toContain('&lt;');
    expect(xml).toContain('&amp;');
    expect(xml).not.toContain('a<b>');
  });
});
