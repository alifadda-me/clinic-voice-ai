import type {
  GoogleBusyPeriod,
  GoogleCalendarApiClient,
  GoogleCalendarEvent,
  GoogleCalendarEventInput,
} from '../../src/infrastructure/calendar/google/google-calendar-api.js';

/**
 * In-process fake of the Google API surface for adapter unit/contract tests.
 * No network. No googleapis.
 */
export class FakeGoogleCalendarApiClient implements GoogleCalendarApiClient {
  readonly events = new Map<string, GoogleCalendarEvent>();
  busy: GoogleBusyPeriod[] = [];
  failNext?: Error | undefined;
  lastInsertTimeZone?: string | undefined;
  lastFreeBusyTimeZone?: string | undefined;

  private key(calendarId: string, eventId: string): string {
    return `${calendarId}::${eventId}`;
  }

  private maybeFail(): void {
    if (this.failNext) {
      const err = this.failNext;
      this.failNext = undefined;
      throw err;
    }
  }

  async queryFreeBusy(params: {
    calendarId: string;
    timeMin: Date;
    timeMax: Date;
    timeZone: string;
  }): Promise<GoogleBusyPeriod[]> {
    this.maybeFail();
    this.lastFreeBusyTimeZone = params.timeZone;
    return this.busy.filter(
      (b) => b.start < params.timeMax && params.timeMin < b.end,
    );
  }

  async insertEvent(
    input: GoogleCalendarEventInput,
  ): Promise<GoogleCalendarEvent> {
    this.maybeFail();
    this.lastInsertTimeZone = input.timeZone;
    const id = `evt_${this.events.size + 1}`;
    const event: GoogleCalendarEvent = {
      id,
      calendarId: input.calendarId,
      title: input.title,
      slotStart: input.slotStart,
      slotEnd: input.slotEnd,
      idempotencyKey: input.idempotencyKey,
    };
    this.events.set(this.key(input.calendarId, id), event);
    this.busy.push({ start: input.slotStart, end: input.slotEnd });
    return event;
  }

  async getEvent(params: {
    calendarId: string;
    eventId: string;
  }): Promise<GoogleCalendarEvent | null> {
    this.maybeFail();
    return this.events.get(this.key(params.calendarId, params.eventId)) ?? null;
  }

  async deleteEvent(params: {
    calendarId: string;
    eventId: string;
  }): Promise<void> {
    this.maybeFail();
    const existing = this.events.get(
      this.key(params.calendarId, params.eventId),
    );
    if (!existing) return;
    this.events.delete(this.key(params.calendarId, params.eventId));
    this.busy = this.busy.filter(
      (b) =>
        !(
          b.start.getTime() === existing.slotStart.getTime() &&
          b.end.getTime() === existing.slotEnd.getTime()
        ),
    );
  }

  async patchEvent(params: {
    calendarId: string;
    eventId: string;
    slotStart: Date;
    slotEnd: Date;
    timeZone: string;
  }): Promise<GoogleCalendarEvent> {
    this.maybeFail();
    this.lastInsertTimeZone = params.timeZone;
    const key = this.key(params.calendarId, params.eventId);
    const existing = this.events.get(key);
    if (!existing) {
      throw new Error('404');
    }
    this.busy = this.busy.filter(
      (b) =>
        !(
          b.start.getTime() === existing.slotStart.getTime() &&
          b.end.getTime() === existing.slotEnd.getTime()
        ),
    );
    const updated: GoogleCalendarEvent = {
      ...existing,
      slotStart: params.slotStart,
      slotEnd: params.slotEnd,
    };
    this.events.set(key, updated);
    this.busy.push({ start: params.slotStart, end: params.slotEnd });
    return updated;
  }

  async findEventByIdempotencyKey(params: {
    calendarId: string;
    idempotencyKey: string;
    timeMin: Date;
    timeMax: Date;
  }): Promise<GoogleCalendarEvent | null> {
    this.maybeFail();
    for (const event of this.events.values()) {
      if (
        event.calendarId === params.calendarId &&
        event.idempotencyKey === params.idempotencyKey
      ) {
        return event;
      }
    }
    return null;
  }
}
