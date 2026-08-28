/**
 * Platform scheduling port — business capabilities, not Google Calendar API.
 *
 * Concurrency contract:
 * `reserveSlot` MUST be atomic (check+claim). Callers must NOT rely on
 * separate isAvailable → reserve sequences; those race under concurrency.
 *
 * Idempotency contract:
 * When `idempotencyKey` is provided, repeated reserveSlot with the same key
 * for the same resource+slot should return the original reservation
 * (or a defined conflict if the key was used for a different slot).
 *
 * Consistency with PostgreSQL:
 * Calendar + DB is NOT one ACID transaction. Application orchestrates
 * compensation (e.g. releaseReservation after persist failure). See
 * application/appointment/SCHEDULING_CONTRACTS.ts.
 */

import type { TimeSlot } from '../../domain/shared/time-slot.js';
import type { DateRange } from '../../domain/shared/time-slot.js';

export type CalendarResourceId = string;

export type CalendarReservation = {
  /** Opaque provider reservation id — never interpret outside the adapter. */
  reservationId: string;
  resourceId: CalendarResourceId;
  slot: TimeSlot;
  title: string;
};

export type FindAvailableSlotsParams = {
  resourceId: CalendarResourceId;
  range: DateRange;
  slotDurationMinutes: number;
  maxSlots?: number | undefined;
};

export type ReserveSlotParams = {
  resourceId: CalendarResourceId;
  slot: TimeSlot;
  title: string;
  metadata?: Record<string, string> | undefined;
  /** Stable key from the caller to make retries safe. */
  idempotencyKey?: string | undefined;
};

/** Requested slot cannot be claimed (busy / conflict / idempotency mismatch). */
export class CalendarSlotUnavailableError extends Error {
  readonly code = 'CALENDAR_SLOT_UNAVAILABLE';

  constructor(message = 'Requested calendar slot is unavailable') {
    super(message);
    this.name = 'CalendarSlotUnavailableError';
  }
}

export class CalendarReservationNotFoundError extends Error {
  readonly code = 'CALENDAR_RESERVATION_NOT_FOUND';

  constructor(reservationId: string) {
    super(`Calendar reservation '${reservationId}' was not found`);
    this.name = 'CalendarReservationNotFoundError';
  }
}

/** Misconfiguration / auth — not a domain concept. */
export class CalendarConfigurationError extends Error {
  readonly code = 'CALENDAR_CONFIGURATION';

  constructor(message: string) {
    super(message);
    this.name = 'CalendarConfigurationError';
  }
}

/** Transient/network/provider outage. */
export class CalendarUnavailableError extends Error {
  readonly code = 'CALENDAR_UNAVAILABLE';

  constructor(message = 'External calendar is temporarily unavailable') {
    super(message);
    this.name = 'CalendarUnavailableError';
  }
}

/** Unexpected provider failure after a call was attempted. */
export class CalendarOperationFailedError extends Error {
  readonly code = 'CALENDAR_OPERATION_FAILED';

  constructor(message: string) {
    super(message);
    this.name = 'CalendarOperationFailedError';
  }
}

export interface CalendarGateway {
  findAvailableSlots(params: FindAvailableSlotsParams): Promise<TimeSlot[]>;

  /**
   * Atomically claim a slot. Succeeds with a reservation or throws
   * CalendarSlotUnavailableError. Must not require a prior availability check.
   */
  reserveSlot(params: ReserveSlotParams): Promise<CalendarReservation>;

  releaseReservation(reservationId: string): Promise<void>;

  /**
   * Atomically move an existing reservation to a new slot, or throw
   * CalendarSlotUnavailableError if the new slot cannot be claimed.
   */
  rescheduleReservation(
    reservationId: string,
    slot: TimeSlot,
  ): Promise<CalendarReservation>;
}
