import { TimeSlot } from '../../../domain/shared/time-slot.js';
import {
  CalendarConfigurationError,
  CalendarReservationNotFoundError,
  CalendarSlotUnavailableError,
  type CalendarGateway,
  type CalendarReservation,
  type FindAvailableSlotsParams,
  type ReserveSlotParams,
} from '../../../ports/platform/calendar-gateway.js';
import type { GoogleCalendarApiClient } from './google-calendar-api.js';

export type GoogleCalendarGatewayConfig = {
  /**
   * IANA timezone passed to Google API timeZone fields only.
   * Domain TimeSlots remain absolute instants (UTC Date).
   */
  timeZone: string;
  /**
   * When resourceId is omitted semantics don't apply — callers always pass
   * resourceId. defaultCalendarId is used only if resourceId is empty.
   */
  defaultCalendarId?: string;
};

/**
 * Google Calendar adapter for CalendarGateway.
 *
 * Atomicity note: Google has no true conditional insert. reserveSlot:
 * 1) honors idempotencyKey lookup
 * 2) freebusy-checks the slot
 * 3) inserts the event
 * A TOCTOU race remains possible between freebusy and insert; Postgres
 * createIfNoConflict remains the durable conflict backstop for clinic state.
 *
 * reservationId is an opaque encoding of {calendarId, eventId}.
 */
export class GoogleCalendarGateway implements CalendarGateway {
  constructor(
    private readonly api: GoogleCalendarApiClient,
    private readonly config: GoogleCalendarGatewayConfig,
  ) {}

  async findAvailableSlots(
    params: FindAvailableSlotsParams,
  ): Promise<TimeSlot[]> {
    const calendarId = this.resolveCalendarId(params.resourceId);
    const busy = await this.api.queryFreeBusy({
      calendarId,
      timeMin: params.range.start,
      timeMax: params.range.end,
      timeZone: this.config.timeZone,
    });

    const durationMs = params.slotDurationMinutes * 60_000;
    const max = params.maxSlots ?? 50;
    const available: TimeSlot[] = [];
    let cursor = params.range.start.getTime();
    const end = params.range.end.getTime();

    while (cursor + durationMs <= end && available.length < max) {
      const slot = TimeSlot.create(
        new Date(cursor),
        new Date(cursor + durationMs),
      );
      if (!overlapsAnyBusy(slot, busy)) {
        available.push(slot);
      }
      cursor += durationMs;
    }

    return available;
  }

  async reserveSlot(params: ReserveSlotParams): Promise<CalendarReservation> {
    const calendarId = this.resolveCalendarId(params.resourceId);

    if (params.idempotencyKey) {
      const existing = await this.api.findEventByIdempotencyKey({
        calendarId,
        idempotencyKey: params.idempotencyKey,
        timeMin: new Date(params.slot.start.getTime() - 7 * 24 * 60 * 60_000),
        timeMax: new Date(params.slot.end.getTime() + 7 * 24 * 60 * 60_000),
      });
      if (existing) {
        const existingSlot = TimeSlot.create(
          existing.slotStart,
          existing.slotEnd,
        );
        if (!existingSlot.equals(params.slot)) {
          throw new CalendarSlotUnavailableError(
            'Idempotency key already used for a different reservation',
          );
        }
        return {
          reservationId: encodeReservationId(calendarId, existing.id),
          resourceId: calendarId,
          slot: existingSlot,
          title: existing.title || params.title,
        };
      }
    }

    const busy = await this.api.queryFreeBusy({
      calendarId,
      timeMin: params.slot.start,
      timeMax: params.slot.end,
      timeZone: this.config.timeZone,
    });
    if (overlapsAnyBusy(params.slot, busy)) {
      throw new CalendarSlotUnavailableError(
        'Calendar slot is no longer available',
      );
    }

    const event = await this.api.insertEvent({
      calendarId,
      title: params.title,
      description: formatMetadata(params.metadata),
      slotStart: params.slot.start,
      slotEnd: params.slot.end,
      timeZone: this.config.timeZone,
      idempotencyKey: params.idempotencyKey,
      metadata: params.metadata,
    });

    return {
      reservationId: encodeReservationId(calendarId, event.id),
      resourceId: calendarId,
      slot: params.slot,
      title: params.title,
    };
  }

  async releaseReservation(reservationId: string): Promise<void> {
    const { calendarId, eventId } = decodeReservationId(reservationId);
    await this.api.deleteEvent({ calendarId, eventId });
  }

  async rescheduleReservation(
    reservationId: string,
    slot: TimeSlot,
  ): Promise<CalendarReservation> {
    const { calendarId, eventId } = decodeReservationId(reservationId);
    const existing = await this.api.getEvent({ calendarId, eventId });
    if (!existing) {
      throw new CalendarReservationNotFoundError(reservationId);
    }

    const busy = await this.api.queryFreeBusy({
      calendarId,
      timeMin: slot.start,
      timeMax: slot.end,
      timeZone: this.config.timeZone,
    });
    // Ignore the event's own busy block if freebusy includes it.
    const foreignBusy = busy.filter(
      (b) =>
        !(
          b.start.getTime() === existing.slotStart.getTime() &&
          b.end.getTime() === existing.slotEnd.getTime()
        ),
    );
    if (overlapsAnyBusy(slot, foreignBusy)) {
      throw new CalendarSlotUnavailableError(
        'Cannot reschedule reservation: new slot conflicts',
      );
    }

    const updated = await this.api.patchEvent({
      calendarId,
      eventId,
      slotStart: slot.start,
      slotEnd: slot.end,
      timeZone: this.config.timeZone,
    });

    return {
      reservationId: encodeReservationId(calendarId, updated.id),
      resourceId: calendarId,
      slot,
      title: updated.title || existing.title,
    };
  }

  private resolveCalendarId(resourceId: string): string {
    const id = resourceId.trim() || this.config.defaultCalendarId || '';
    if (!id) {
      throw new CalendarConfigurationError(
        'Calendar resource id is required',
      );
    }
    return id;
  }
}

function overlapsAnyBusy(
  slot: TimeSlot,
  busy: ReadonlyArray<{ start: Date; end: Date }>,
): boolean {
  return busy.some(
    (b) => slot.start < b.end && b.start < slot.end,
  );
}

function formatMetadata(
  metadata?: Record<string, string>,
): string | undefined {
  if (!metadata || Object.keys(metadata).length === 0) return undefined;
  return Object.entries(metadata)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

export function encodeReservationId(
  calendarId: string,
  eventId: string,
): string {
  return Buffer.from(
    JSON.stringify({ c: calendarId, e: eventId }),
    'utf8',
  ).toString('base64url');
}

export function decodeReservationId(reservationId: string): {
  calendarId: string;
  eventId: string;
} {
  try {
    const parsed = JSON.parse(
      Buffer.from(reservationId, 'base64url').toString('utf8'),
    ) as { c?: string; e?: string };
    if (!parsed.c || !parsed.e) {
      throw new Error('incomplete');
    }
    return { calendarId: parsed.c, eventId: parsed.e };
  } catch {
    throw new CalendarReservationNotFoundError(reservationId);
  }
}
