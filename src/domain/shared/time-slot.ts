import { InvalidTimeSlotError } from './errors.js';

export type DateRange = {
  readonly start: Date;
  readonly end: Date;
};

/**
 * Half-open-friendly appointment window: start inclusive, end exclusive in conflict checks.
 */
export class TimeSlot {
  readonly start: Date;
  readonly end: Date;

  private constructor(start: Date, end: Date) {
    this.start = start;
    this.end = end;
  }

  static create(start: Date, end: Date): TimeSlot {
    if (!(start instanceof Date) || Number.isNaN(start.getTime())) {
      throw new InvalidTimeSlotError('Start must be a valid Date');
    }
    if (!(end instanceof Date) || Number.isNaN(end.getTime())) {
      throw new InvalidTimeSlotError('End must be a valid Date');
    }
    if (end.getTime() <= start.getTime()) {
      throw new InvalidTimeSlotError('TimeSlot end must be after start');
    }
    return new TimeSlot(new Date(start.getTime()), new Date(end.getTime()));
  }

  get durationMinutes(): number {
    return Math.round((this.end.getTime() - this.start.getTime()) / 60_000);
  }

  overlaps(other: TimeSlot): boolean {
    return this.start < other.end && other.start < this.end;
  }

  equals(other: TimeSlot): boolean {
    return (
      this.start.getTime() === other.start.getTime() &&
      this.end.getTime() === other.end.getTime()
    );
  }

  isInPast(now: Date): boolean {
    return this.start.getTime() < now.getTime();
  }

  toJSON(): { start: string; end: string } {
    return {
      start: this.start.toISOString(),
      end: this.end.toISOString(),
    };
  }
}
