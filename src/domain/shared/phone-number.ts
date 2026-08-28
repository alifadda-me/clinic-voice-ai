import { InvalidPhoneNumberError } from './errors.js';

/**
 * E.164-ish phone value object. Accepts digits with optional leading +.
 * Keeps validation in the domain without depending on any phone library.
 */
export class PhoneNumber {
  readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static create(raw: string): PhoneNumber {
    const normalized = raw.trim().replace(/[\s()-]/g, '');
    if (!/^\+?[0-9]{8,15}$/.test(normalized)) {
      throw new InvalidPhoneNumberError(raw);
    }
    return new PhoneNumber(normalized);
  }

  equals(other: PhoneNumber): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
