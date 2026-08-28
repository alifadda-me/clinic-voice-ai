import { describe, expect, it } from 'vitest';
import { TimeSlot } from '../../src/domain/shared/time-slot.js';
import {
  CalendarSlotUnavailableError,
  CalendarUnavailableError,
  CalendarConfigurationError,
  CalendarReservationNotFoundError,
} from '../../src/ports/platform/calendar-gateway.js';
import {
  GoogleCalendarGateway,
  decodeReservationId,
  encodeReservationId,
} from '../../src/infrastructure/calendar/google/google-calendar-gateway.js';
import { FakeGoogleCalendarApiClient } from '../helpers/fake-google-calendar-api.js';

describe('GoogleCalendarGateway adapter', () => {
  const resourceId = 'cal_doc_1';
  const slot = TimeSlot.create(
    new Date('2026-08-25T10:00:00.000Z'),
    new Date('2026-08-25T10:30:00.000Z'),
  );

  function create() {
    const api = new FakeGoogleCalendarApiClient();
    const gateway = new GoogleCalendarGateway(api, {
      timeZone: 'Africa/Cairo',
      defaultCalendarId: 'primary',
    });
    return { api, gateway };
  }

  it('passes timezone into freebusy and insert (adapter-local translation)', async () => {
    const { api, gateway } = create();
    await gateway.findAvailableSlots({
      resourceId,
      range: {
        start: new Date('2026-08-25T09:00:00.000Z'),
        end: new Date('2026-08-25T11:00:00.000Z'),
      },
      slotDurationMinutes: 30,
    });
    expect(api.lastFreeBusyTimeZone).toBe('Africa/Cairo');

    await gateway.reserveSlot({
      resourceId,
      slot,
      title: 'Visit',
    });
    expect(api.lastInsertTimeZone).toBe('Africa/Cairo');
  });

  it('maps busy freebusy to CalendarSlotUnavailableError', async () => {
    const { api, gateway } = create();
    api.busy = [{ start: slot.start, end: slot.end }];
    await expect(
      gateway.reserveSlot({ resourceId, slot, title: 'Visit' }),
    ).rejects.toBeInstanceOf(CalendarSlotUnavailableError);
  });

  it('maps provider/network failures to CalendarUnavailableError', async () => {
    const { api, gateway } = create();
    api.failNext = new CalendarUnavailableError('network down');
    await expect(
      gateway.findAvailableSlots({
        resourceId,
        range: {
          start: new Date('2026-08-25T09:00:00.000Z'),
          end: new Date('2026-08-25T10:00:00.000Z'),
        },
        slotDurationMinutes: 30,
      }),
    ).rejects.toBeInstanceOf(CalendarUnavailableError);
  });

  it('maps malformed reservation ids to CalendarReservationNotFoundError', async () => {
    const { gateway } = create();
    await expect(
      gateway.releaseReservation('not-a-valid-opaque-id'),
    ).rejects.toBeInstanceOf(CalendarReservationNotFoundError);
  });

  it('encodes opaque reservation ids without exposing Google shapes', () => {
    const opaque = encodeReservationId('cal_1', 'evt_9');
    expect(opaque).not.toContain('evt_9');
    const decoded = decodeReservationId(opaque);
    expect(decoded).toEqual({ calendarId: 'cal_1', eventId: 'evt_9' });
  });

  it('does not return googleapis types from public methods', async () => {
    const { gateway } = create();
    const reservation = await gateway.reserveSlot({
      resourceId,
      slot,
      title: 'Visit',
      metadata: { patientId: 'p1' },
    });
    expect(Object.keys(reservation).sort()).toEqual([
      'reservationId',
      'resourceId',
      'slot',
      'title',
    ]);
    expect(reservation.slot).toBeInstanceOf(TimeSlot);
  });

  it('maps demo cal_* resource ids to defaultCalendarId', async () => {
    const { api, gateway } = create();
    await gateway.findAvailableSlots({
      resourceId: 'cal_sara_hassan',
      range: {
        start: new Date('2026-08-25T09:00:00.000Z'),
        end: new Date('2026-08-25T11:00:00.000Z'),
      },
      slotDurationMinutes: 30,
    });
    expect(api.lastFreeBusyCalendarId).toBe('primary');
  });

  it('requires a calendar resource id when none configured', async () => {
    const api = new FakeGoogleCalendarApiClient();
    const gateway = new GoogleCalendarGateway(api, { timeZone: 'UTC' });
    await expect(
      gateway.reserveSlot({
        resourceId: '   ',
        slot,
        title: 'Visit',
      }),
    ).rejects.toBeInstanceOf(CalendarConfigurationError);
  });
});
