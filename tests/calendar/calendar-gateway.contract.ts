import { describe, expect, it } from 'vitest';
import { TimeSlot } from '../../src/domain/shared/time-slot.js';
import {
  CalendarSlotUnavailableError,
  type CalendarGateway,
} from '../../src/ports/platform/calendar-gateway.js';

/**
 * Behavioral contract shared by InMemoryCalendarGateway and GoogleCalendarGateway.
 * Adapters under test must not leak provider types into assertions.
 */
export function defineCalendarGatewayContract(
  name: string,
  createGateway: () => CalendarGateway,
): void {
  describe(`CalendarGateway contract: ${name}`, () => {
    const resourceId = 'calendar-resource-1';
    const slot = TimeSlot.create(
      new Date('2026-08-25T10:00:00.000Z'),
      new Date('2026-08-25T10:30:00.000Z'),
    );

    it('finds available slots in a free range', async () => {
      const gateway = createGateway();
      const slots = await gateway.findAvailableSlots({
        resourceId,
        range: {
          start: new Date('2026-08-25T09:00:00.000Z'),
          end: new Date('2026-08-25T12:00:00.000Z'),
        },
        slotDurationMinutes: 30,
        maxSlots: 10,
      });
      expect(slots.length).toBeGreaterThan(0);
      expect(slots[0]).toBeInstanceOf(TimeSlot);
    });

    it('reserves, releases, and frees the slot', async () => {
      const gateway = createGateway();
      const reservation = await gateway.reserveSlot({
        resourceId,
        slot,
        title: 'Visit',
      });
      expect(typeof reservation.reservationId).toBe('string');
      expect(reservation.slot.equals(slot)).toBe(true);

      await expect(
        gateway.reserveSlot({
          resourceId,
          slot,
          title: 'Other',
        }),
      ).rejects.toBeInstanceOf(CalendarSlotUnavailableError);

      await gateway.releaseReservation(reservation.reservationId);

      const again = await gateway.reserveSlot({
        resourceId,
        slot,
        title: 'Visit again',
      });
      expect(again.slot.equals(slot)).toBe(true);
    });

    it('honors idempotency keys', async () => {
      const gateway = createGateway();
      const first = await gateway.reserveSlot({
        resourceId,
        slot,
        title: 'Visit',
        idempotencyKey: 'idem-1',
      });
      const second = await gateway.reserveSlot({
        resourceId,
        slot,
        title: 'Visit',
        idempotencyKey: 'idem-1',
      });
      expect(second.reservationId).toBe(first.reservationId);
    });

    it('reschedules a reservation to a free slot', async () => {
      const gateway = createGateway();
      const reserved = await gateway.reserveSlot({
        resourceId,
        slot,
        title: 'Visit',
      });
      const next = TimeSlot.create(
        new Date('2026-08-25T11:00:00.000Z'),
        new Date('2026-08-25T11:30:00.000Z'),
      );
      const moved = await gateway.rescheduleReservation(
        reserved.reservationId,
        next,
      );
      expect(moved.slot.equals(next)).toBe(true);

      // Original slot free again
      const rebook = await gateway.reserveSlot({
        resourceId,
        slot,
        title: 'Someone else',
      });
      expect(rebook.slot.equals(slot)).toBe(true);
    });
  });
}
