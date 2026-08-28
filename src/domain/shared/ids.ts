/**
 * Branded identifiers — prevent mixing PatientId with DoctorId at compile time.
 */
declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type PatientId = Brand<string, 'PatientId'>;
export type DoctorId = Brand<string, 'DoctorId'>;
export type SpecialtyId = Brand<string, 'SpecialtyId'>;
export type ClinicId = Brand<string, 'ClinicId'>;
export type AppointmentId = Brand<string, 'AppointmentId'>;
export type PreferenceId = Brand<string, 'PreferenceId'>;

export function asPatientId(value: string): PatientId {
  assertNonEmpty(value, 'PatientId');
  return value as PatientId;
}

export function asDoctorId(value: string): DoctorId {
  assertNonEmpty(value, 'DoctorId');
  return value as DoctorId;
}

export function asSpecialtyId(value: string): SpecialtyId {
  assertNonEmpty(value, 'SpecialtyId');
  return value as SpecialtyId;
}

export function asClinicId(value: string): ClinicId {
  assertNonEmpty(value, 'ClinicId');
  return value as ClinicId;
}

export function asAppointmentId(value: string): AppointmentId {
  assertNonEmpty(value, 'AppointmentId');
  return value as AppointmentId;
}

export function asPreferenceId(value: string): PreferenceId {
  assertNonEmpty(value, 'PreferenceId');
  return value as PreferenceId;
}

function assertNonEmpty(value: string, label: string): void {
  if (!value || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}
