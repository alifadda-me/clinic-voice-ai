/**
 * Infrastructure-only Google Calendar HTTP surface.
 * Used so unit tests never need real credentials or googleapis mocks.
 * Must not be imported by domain/application.
 */

export type GoogleBusyPeriod = {
  start: Date;
  end: Date;
};

export type GoogleCalendarEventInput = {
  calendarId: string;
  title: string;
  description?: string | undefined;
  slotStart: Date;
  slotEnd: Date;
  /** IANA timezone string for Google API timeZone fields only. */
  timeZone: string;
  idempotencyKey?: string | undefined;
  metadata?: Record<string, string> | undefined;
};

export type GoogleCalendarEvent = {
  id: string;
  calendarId: string;
  title: string;
  slotStart: Date;
  slotEnd: Date;
  idempotencyKey?: string | undefined;
};

export interface GoogleCalendarApiClient {
  queryFreeBusy(params: {
    calendarId: string;
    timeMin: Date;
    timeMax: Date;
    timeZone: string;
  }): Promise<GoogleBusyPeriod[]>;

  insertEvent(input: GoogleCalendarEventInput): Promise<GoogleCalendarEvent>;

  getEvent(params: {
    calendarId: string;
    eventId: string;
  }): Promise<GoogleCalendarEvent | null>;

  deleteEvent(params: {
    calendarId: string;
    eventId: string;
  }): Promise<void>;

  patchEvent(params: {
    calendarId: string;
    eventId: string;
    slotStart: Date;
    slotEnd: Date;
    timeZone: string;
  }): Promise<GoogleCalendarEvent>;

  findEventByIdempotencyKey(params: {
    calendarId: string;
    idempotencyKey: string;
    timeMin: Date;
    timeMax: Date;
  }): Promise<GoogleCalendarEvent | null>;
}
