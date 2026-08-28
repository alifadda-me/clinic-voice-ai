# Twilio phone authentication boundary

Twilio PSTN is a transport channel only.

## Implemented

- Signature-validated inbound webhook → TwiML media stream
- Media events → the same voice clinic session path (`channel: twilio_voice`)
- Callers are anonymous by default

## Not implemented (do not weaken trust)

- OTP / SMS challenge to prove ownership of a phone number
- Auto-linking Twilio `From` to `patients.phone_number`
- Treating Caller ID as authentication

## When phone authentication is added later

1. Issue `AuthGateway`-compatible credentials (for example a short-lived Bearer) after an explicit challenge outside the Twilio webhook path.
2. Pass those credentials into the call bridge — never use `From=` as identity.
3. Keep `ResolveClinicActor` and `TrustedExecutionContext` unchanged.
