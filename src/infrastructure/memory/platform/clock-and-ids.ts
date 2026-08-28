import type { Clock, IdGenerator } from '../../../ports/platform/time.js';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current.getTime());
  }

  advanceMs(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }

  set(date: Date): void {
    this.current = new Date(date.getTime());
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;

  constructor(private readonly separator = '_') {}

  generate(prefix = 'id'): string {
    this.counter += 1;
    return `${prefix}${this.separator}${String(this.counter).padStart(4, '0')}`;
  }
}
