import { google, type calendar_v3 } from 'googleapis';
import {
  CalendarConfigurationError,
  CalendarOperationFailedError,
  CalendarUnavailableError,
} from '../../../ports/platform/calendar-gateway.js';
import type {
  GoogleBusyPeriod,
  GoogleCalendarApiClient,
  GoogleCalendarEvent,
  GoogleCalendarEventInput,
} from './google-calendar-api.js';

export type GoogleCalendarCredentials = {
  serviceAccountEmail: string;
  privateKey: string;
};

const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const IDEMPOTENCY_PROP = 'clinicIdempotencyKey';

/**
 * Real googleapis client. All googleapis types stay in this file.
 */
export class GoogleApisCalendarClient implements GoogleCalendarApiClient {
  private client: calendar_v3.Calendar | null = null;

  constructor(private readonly credentials: GoogleCalendarCredentials) {
    if (!credentials.serviceAccountEmail.trim()) {
      throw new CalendarConfigurationError(
        'Google Calendar service account email is required',
      );
    }
    if (!credentials.privateKey.trim()) {
      throw new CalendarConfigurationError(
        'Google Calendar service account private key is required',
      );
    }
  }

  private calendar(): calendar_v3.Calendar {
    if (!this.client) {
      const auth = new google.auth.JWT({
        email: this.credentials.serviceAccountEmail,
        key: this.credentials.privateKey.replace(/\\n/g, '\n'),
        scopes: SCOPES,
      });
      this.client = google.calendar({ version: 'v3', auth });
    }
    return this.client;
  }

  async queryFreeBusy(params: {
    calendarId: string;
    timeMin: Date;
    timeMax: Date;
    timeZone: string;
  }): Promise<GoogleBusyPeriod[]> {
    try {
      const response = await this.calendar().freebusy.query({
        requestBody: {
          timeMin: params.timeMin.toISOString(),
          timeMax: params.timeMax.toISOString(),
          timeZone: params.timeZone,
          items: [{ id: params.calendarId }],
        },
      });
      const busy =
        response.data.calendars?.[params.calendarId]?.busy ?? [];
      return busy
        .filter((b): b is { start: string; end: string } =>
          Boolean(b.start && b.end),
        )
        .map((b) => ({
          start: new Date(b.start),
          end: new Date(b.end),
        }));
    } catch (error) {
      throw translateGoogleError(error);
    }
  }

  async insertEvent(
    input: GoogleCalendarEventInput,
  ): Promise<GoogleCalendarEvent> {
    try {
      const privateProps: Record<string, string> = {
        ...(input.metadata ?? {}),
      };
      if (input.idempotencyKey) {
        privateProps[IDEMPOTENCY_PROP] = input.idempotencyKey;
      }

      const response = await this.calendar().events.insert({
        calendarId: input.calendarId,
        requestBody: {
          summary: input.title,
          description: input.description ?? null,
          start: {
            dateTime: input.slotStart.toISOString(),
            timeZone: input.timeZone,
          },
          end: {
            dateTime: input.slotEnd.toISOString(),
            timeZone: input.timeZone,
          },
          extendedProperties: {
            private: privateProps,
          },
        },
      });

      const id = response.data.id;
      if (!id) {
        throw new CalendarOperationFailedError(
          'Google Calendar insert returned no event id',
        );
      }

      return {
        id,
        calendarId: input.calendarId,
        title: input.title,
        slotStart: input.slotStart,
        slotEnd: input.slotEnd,
        idempotencyKey: input.idempotencyKey,
      };
    } catch (error) {
      throw translateGoogleError(error);
    }
  }

  async getEvent(params: {
    calendarId: string;
    eventId: string;
  }): Promise<GoogleCalendarEvent | null> {
    try {
      const response = await this.calendar().events.get({
        calendarId: params.calendarId,
        eventId: params.eventId,
      });
      return mapEvent(params.calendarId, response.data);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw translateGoogleError(error);
    }
  }

  async deleteEvent(params: {
    calendarId: string;
    eventId: string;
  }): Promise<void> {
    try {
      await this.calendar().events.delete({
        calendarId: params.calendarId,
        eventId: params.eventId,
      });
    } catch (error) {
      if (isNotFound(error)) return;
      throw translateGoogleError(error);
    }
  }

  async patchEvent(params: {
    calendarId: string;
    eventId: string;
    slotStart: Date;
    slotEnd: Date;
    timeZone: string;
  }): Promise<GoogleCalendarEvent> {
    try {
      const response = await this.calendar().events.patch({
        calendarId: params.calendarId,
        eventId: params.eventId,
        requestBody: {
          start: {
            dateTime: params.slotStart.toISOString(),
            timeZone: params.timeZone,
          },
          end: {
            dateTime: params.slotEnd.toISOString(),
            timeZone: params.timeZone,
          },
        },
      });
      const mapped = mapEvent(params.calendarId, response.data);
      if (!mapped) {
        throw new CalendarOperationFailedError(
          'Google Calendar patch returned an incomplete event',
        );
      }
      return mapped;
    } catch (error) {
      throw translateGoogleError(error);
    }
  }

  async findEventByIdempotencyKey(params: {
    calendarId: string;
    idempotencyKey: string;
    timeMin: Date;
    timeMax: Date;
  }): Promise<GoogleCalendarEvent | null> {
    try {
      const response = await this.calendar().events.list({
        calendarId: params.calendarId,
        privateExtendedProperty: [
          `${IDEMPOTENCY_PROP}=${params.idempotencyKey}`,
        ],
        timeMin: params.timeMin.toISOString(),
        timeMax: params.timeMax.toISOString(),
        singleEvents: true,
        maxResults: 5,
      });
      const item = response.data.items?.[0];
      if (!item) return null;
      return mapEvent(params.calendarId, item);
    } catch (error) {
      throw translateGoogleError(error);
    }
  }
}

function mapEvent(
  calendarId: string,
  data: calendar_v3.Schema$Event,
): GoogleCalendarEvent | null {
  if (!data.id || !data.start?.dateTime || !data.end?.dateTime) {
    return null;
  }
  return {
    id: data.id,
    calendarId,
    title: data.summary ?? '',
    slotStart: new Date(data.start.dateTime),
    slotEnd: new Date(data.end.dateTime),
    idempotencyKey:
      data.extendedProperties?.private?.[IDEMPOTENCY_PROP] ?? undefined,
  };
}

function isNotFound(error: unknown): boolean {
  const status = (error as { code?: number | string })?.code;
  return status === 404 || status === '404';
}

function translateGoogleError(error: unknown): Error {
  const status = (error as { code?: number | string })?.code;
  const message =
    error instanceof Error ? error.message : 'Google Calendar request failed';

  // Never embed raw Google messages in port errors — they can leak to tools/HTTP.
  if (status === 401 || status === 403 || status === '401' || status === '403') {
    return new CalendarConfigurationError(
      'Calendar provider authorization failed',
    );
  }
  if (
    status === 429 ||
    status === 500 ||
    status === 503 ||
    status === '429' ||
    status === '500' ||
    status === '503'
  ) {
    return new CalendarUnavailableError('Calendar provider temporarily unavailable');
  }
  if (
    typeof message === 'string' &&
    (message.includes('ECONNREFUSED') ||
      message.includes('ETIMEDOUT') ||
      message.includes('ENOTFOUND') ||
      message.includes('network'))
  ) {
    return new CalendarUnavailableError('Calendar provider network failure');
  }
  return new CalendarOperationFailedError('Calendar provider operation failed');
}

export { IDEMPOTENCY_PROP };
