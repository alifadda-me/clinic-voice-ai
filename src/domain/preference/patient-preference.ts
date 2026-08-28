import type {
  DoctorId,
  PatientId,
  PreferenceId,
  SpecialtyId,
} from '../shared/ids.js';
import { DomainError } from '../shared/errors.js';

/**
 * Administrative preferences only — never clinical advice.
 * Kept outside the Patient aggregate: no Patient invariant requires
 * transactional consistency with preference history.
 */
export type PreferenceKind =
  | 'specialty'
  | 'doctor'
  | 'time_of_day'
  | 'language';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

const TIME_OF_DAY_VALUES: readonly TimeOfDay[] = [
  'morning',
  'afternoon',
  'evening',
];

export class InvalidPreferenceError extends DomainError {
  constructor(message: string) {
    super('INVALID_PREFERENCE', message);
    this.name = 'InvalidPreferenceError';
  }
}

export type PatientPreferenceProps = {
  id: PreferenceId;
  patientId: PatientId;
  kind: PreferenceKind;
  /** Display/search value; typed refs live in specialtyId/doctorId when applicable. */
  value: string;
  specialtyId?: SpecialtyId | undefined;
  doctorId?: DoctorId | undefined;
  createdAt: Date;
};

export class PatientPreference {
  readonly id: PreferenceId;
  readonly patientId: PatientId;
  readonly kind: PreferenceKind;
  readonly value: string;
  readonly specialtyId: SpecialtyId | undefined;
  readonly doctorId: DoctorId | undefined;
  readonly createdAt: Date;

  private constructor(props: PatientPreferenceProps) {
    this.id = props.id;
    this.patientId = props.patientId;
    this.kind = props.kind;
    this.value = props.value;
    this.specialtyId = props.specialtyId;
    this.doctorId = props.doctorId;
    this.createdAt = props.createdAt;
  }

  static create(props: PatientPreferenceProps): PatientPreference {
    if (!props.value.trim()) {
      throw new InvalidPreferenceError('Preference value is required');
    }

    if (props.kind === 'specialty' && !props.specialtyId) {
      throw new InvalidPreferenceError(
        'specialty preference requires specialtyId',
      );
    }
    if (props.kind === 'doctor' && !props.doctorId) {
      throw new InvalidPreferenceError('doctor preference requires doctorId');
    }
    if (props.kind === 'time_of_day') {
      if (!TIME_OF_DAY_VALUES.includes(props.value as TimeOfDay)) {
        throw new InvalidPreferenceError(
          `time_of_day must be one of: ${TIME_OF_DAY_VALUES.join(', ')}`,
        );
      }
    }

    return new PatientPreference({
      id: props.id,
      patientId: props.patientId,
      kind: props.kind,
      value: props.value.trim(),
      specialtyId: props.specialtyId,
      doctorId: props.doctorId,
      createdAt: props.createdAt,
    });
  }
}
