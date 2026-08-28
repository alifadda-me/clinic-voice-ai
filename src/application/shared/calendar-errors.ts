import {
  CalendarConfigurationError,
  CalendarOperationFailedError,
  CalendarReservationNotFoundError,
  CalendarSlotUnavailableError,
  CalendarUnavailableError,
} from '../../ports/platform/calendar-gateway.js';
import {
  ExternalCalendarError,
  TimeSlotUnavailableError,
} from './errors.js';

/**
 * Map provider-neutral calendar port errors into application failures.
 * Uses stable, sanitized messages — never forwards raw provider text.
 */
export function mapCalendarError(error: unknown): never {
  if (error instanceof CalendarSlotUnavailableError) {
    throw new TimeSlotUnavailableError('Requested time slot is unavailable');
  }
  if (error instanceof CalendarReservationNotFoundError) {
    throw new ExternalCalendarError(
      'CALENDAR_RESERVATION_NOT_FOUND',
      'Calendar reservation was not found',
    );
  }
  if (error instanceof CalendarConfigurationError) {
    throw new ExternalCalendarError(
      'CALENDAR_CONFIGURATION',
      'Calendar is misconfigured',
    );
  }
  if (error instanceof CalendarUnavailableError) {
    throw new ExternalCalendarError(
      'CALENDAR_UNAVAILABLE',
      'Calendar is temporarily unavailable',
    );
  }
  if (error instanceof CalendarOperationFailedError) {
    throw new ExternalCalendarError(
      'CALENDAR_OPERATION_FAILED',
      'Calendar operation failed',
    );
  }
  throw error;
}
