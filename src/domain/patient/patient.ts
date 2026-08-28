import type { PatientId } from '../shared/ids.js';
import { PhoneNumber } from '../shared/phone-number.js';

export type PatientProps = {
  id: PatientId;
  phoneNumber: PhoneNumber;
  fullName?: string | undefined;
  createdAt: Date;
};

export class Patient {
  readonly id: PatientId;
  readonly phoneNumber: PhoneNumber;
  readonly fullName: string | undefined;
  readonly createdAt: Date;

  private constructor(props: PatientProps) {
    this.id = props.id;
    this.phoneNumber = props.phoneNumber;
    this.fullName = props.fullName;
    this.createdAt = props.createdAt;
  }

  static create(props: PatientProps): Patient {
    return new Patient({
      id: props.id,
      phoneNumber: props.phoneNumber,
      fullName: props.fullName?.trim() || undefined,
      createdAt: props.createdAt,
    });
  }

  withName(fullName: string): Patient {
    const trimmed = fullName.trim();
    if (!trimmed) {
      throw new Error('Patient name cannot be empty');
    }
    return new Patient({
      id: this.id,
      phoneNumber: this.phoneNumber,
      fullName: trimmed,
      createdAt: this.createdAt,
    });
  }

  isOnboarded(): boolean {
    return Boolean(this.fullName);
  }
}
