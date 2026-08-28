import { TimeSlot } from '../../../domain/shared/time-slot.js';
import {
  CalendarSlotUnavailableError,
  CalendarReservationNotFoundError,
  type CalendarGateway,
  type CalendarReservation,
  type FindAvailableSlotsParams,
  type ReserveSlotParams,
} from '../../../ports/platform/calendar-gateway.js';

type BusyBlock = {
  reservationId: string;
  resourceId: string;
  slot: TimeSlot;
  title: string;
  idempotencyKey?: string | undefined;
};

/**
 * In-memory calendar fake.
 *
 * LIMITATION: JavaScript is single-threaded; "atomic" reserveSlot is only
 * check-then-set within one event-loop turn. It does NOT prove multi-process
 * concurrency safety. Real adapters must use provider-native atomic claims
 * or conditional writes.
 */
export class InMemoryCalendarGateway implements CalendarGateway {
  private readonly busy: BusyBlock[] = [];
  private seq = 0;

  async findAvailableSlots(
    params: FindAvailableSlotsParams,
  ): Promise<TimeSlot[]> {
    const available: TimeSlot[] = [];
    const durationMs = params.slotDurationMinutes * 60_000;
    let cursor = params.range.start.getTime();
    const end = params.range.end.getTime();
    const max = params.maxSlots ?? 50;

    while (cursor + durationMs <= end && available.length < max) {
      const slot = TimeSlot.create(
        new Date(cursor),
        new Date(cursor + durationMs),
      );
      if (this.isFree(params.resourceId, slot)) {
        available.push(slot);
      }
      cursor += durationMs;
    }

    return available;
  }

  async reserveSlot(params: ReserveSlotParams): Promise<CalendarReservation> {
    if (params.idempotencyKey) {
      const prior = this.busy.find(
        (b) => b.idempotencyKey === params.idempotencyKey,
      );
      if (prior) {
        if (
          prior.resourceId !== params.resourceId ||
          !prior.slot.equals(params.slot)
        ) {
          throw new CalendarSlotUnavailableError(
            'Idempotency key already used for a different reservation',
          );
        }
        return {
          reservationId: prior.reservationId,
          resourceId: prior.resourceId,
          slot: prior.slot,
          title: prior.title,
        };
      }
    }

    if (!this.isFree(params.resourceId, params.slot)) {
      throw new CalendarSlotUnavailableError(
        'Calendar slot is no longer available',
      );
    }

    this.seq += 1;
    const reservationId = `cal_${this.seq}`;
    this.busy.push({
      reservationId,
      resourceId: params.resourceId,
      slot: params.slot,
      title: params.title,
      idempotencyKey: params.idempotencyKey,
    });

    return {
      reservationId,
      resourceId: params.resourceId,
      slot: params.slot,
      title: params.title,
    };
  }

  async releaseReservation(reservationId: string): Promise<void> {
    const idx = this.busy.findIndex((b) => b.reservationId === reservationId);
    if (idx >= 0) this.busy.splice(idx, 1);
  }

  async rescheduleReservation(
    reservationId: string,
    slot: TimeSlot,
  ): Promise<CalendarReservation> {
    const existing = this.busy.find((b) => b.reservationId === reservationId);
    if (!existing) {
      throw new CalendarReservationNotFoundError(reservationId);
    }

    const conflict = this.busy.some(
      (b) =>
        b.reservationId !== reservationId &&
        b.resourceId === existing.resourceId &&
        b.slot.overlaps(slot),
    );
    if (conflict) {
      throw new CalendarSlotUnavailableError(
        'Cannot reschedule reservation: new slot conflicts',
      );
    }

    existing.slot = slot;
    return {
      reservationId: existing.reservationId,
      resourceId: existing.resourceId,
      slot: existing.slot,
      title: existing.title,
    };
  }

  listBusy(resourceId?: string): BusyBlock[] {
    return resourceId
      ? this.busy.filter((b) => b.resourceId === resourceId)
      : [...this.busy];
  }

  private isFree(resourceId: string, slot: TimeSlot): boolean {
    return !this.busy.some(
      (b) => b.resourceId === resourceId && b.slot.overlaps(slot),
    );
  }
}
