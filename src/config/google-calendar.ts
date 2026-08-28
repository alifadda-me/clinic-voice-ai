import { z } from 'zod';

/**
 * Validated Google Calendar env — bootstrap/config only.
 * Does not import googleapis or infrastructure modules.
 */

const googleCalendarEnvSchema = z.object({
  GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL: z.string().min(1),
  GOOGLE_CALENDAR_PRIVATE_KEY: z.string().min(1),
  GOOGLE_CALENDAR_ID: z.string().min(1).default('primary'),
  GOOGLE_CALENDAR_TIMEZONE: z.string().min(1).default('UTC'),
});

export type GoogleCalendarEnvConfig = {
  serviceAccountEmail: string;
  privateKey: string;
  defaultCalendarId: string;
  timeZone: string;
};

export function loadGoogleCalendarConfig(
  env: NodeJS.ProcessEnv = process.env,
): GoogleCalendarEnvConfig {
  const parsed = googleCalendarEnvSchema.parse({
    GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL:
      env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL,
    GOOGLE_CALENDAR_PRIVATE_KEY: env.GOOGLE_CALENDAR_PRIVATE_KEY,
    GOOGLE_CALENDAR_ID: env.GOOGLE_CALENDAR_ID,
    GOOGLE_CALENDAR_TIMEZONE: env.GOOGLE_CALENDAR_TIMEZONE,
  });

  return {
    serviceAccountEmail: parsed.GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL,
    privateKey: parsed.GOOGLE_CALENDAR_PRIVATE_KEY,
    defaultCalendarId: parsed.GOOGLE_CALENDAR_ID,
    timeZone: parsed.GOOGLE_CALENDAR_TIMEZONE,
  };
}
