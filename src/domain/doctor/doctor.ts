import type { ClinicId, DoctorId, SpecialtyId } from '../shared/ids.js';
import { DoctorInactiveError } from '../shared/errors.js';

export type DoctorProps = {
  id: DoctorId;
  clinicId: ClinicId;
  fullName: string;
  specialtyIds: readonly SpecialtyId[];
  bio?: string | undefined;
  active?: boolean | undefined;
  /** Opaque calendar resource key used by CalendarGateway adapters. */
  calendarResourceId?: string | undefined;
};

export class Doctor {
  readonly id: DoctorId;
  readonly clinicId: ClinicId;
  readonly fullName: string;
  readonly specialtyIds: readonly SpecialtyId[];
  readonly bio: string | undefined;
  readonly active: boolean;
  readonly calendarResourceId: string | undefined;

  private constructor(props: {
    id: DoctorId;
    clinicId: ClinicId;
    fullName: string;
    specialtyIds: readonly SpecialtyId[];
    bio: string | undefined;
    active: boolean;
    calendarResourceId: string | undefined;
  }) {
    this.id = props.id;
    this.clinicId = props.clinicId;
    this.fullName = props.fullName;
    this.specialtyIds = props.specialtyIds;
    this.bio = props.bio;
    this.active = props.active;
    this.calendarResourceId = props.calendarResourceId;
  }

  static create(props: DoctorProps): Doctor {
    if (!props.fullName.trim()) {
      throw new Error('Doctor fullName is required');
    }
    if (props.specialtyIds.length === 0) {
      throw new Error('Doctor must have at least one specialty');
    }
    return new Doctor({
      id: props.id,
      clinicId: props.clinicId,
      fullName: props.fullName.trim(),
      specialtyIds: [...props.specialtyIds],
      bio: props.bio?.trim() || undefined,
      active: props.active ?? true,
      calendarResourceId: props.calendarResourceId,
    });
  }

  assertActive(): void {
    if (!this.active) {
      throw new DoctorInactiveError(this.id);
    }
  }

  hasSpecialty(specialtyId: SpecialtyId): boolean {
    return this.specialtyIds.includes(specialtyId);
  }

  schedulingResourceId(): string {
    return this.calendarResourceId ?? this.id;
  }
}
