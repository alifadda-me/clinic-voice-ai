export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export class InvalidPhoneNumberError extends DomainError {
  constructor(value: string) {
    super('INVALID_PHONE_NUMBER', `Invalid phone number: ${value}`);
    this.name = 'InvalidPhoneNumberError';
  }
}

export class InvalidTimeSlotError extends DomainError {
  constructor(message: string) {
    super('INVALID_TIME_SLOT', message);
    this.name = 'InvalidTimeSlotError';
  }
}

export class InvalidAppointmentTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super(
      'INVALID_APPOINTMENT_TRANSITION',
      `Cannot transition appointment from '${from}' to '${to}'`,
    );
    this.name = 'InvalidAppointmentTransitionError';
  }
}

export class AppointmentNotSchedulableError extends DomainError {
  constructor(message: string) {
    super('APPOINTMENT_NOT_SCHEDULABLE', message);
    this.name = 'AppointmentNotSchedulableError';
  }
}

export class DoctorInactiveError extends DomainError {
  constructor(doctorId: string) {
    super('DOCTOR_INACTIVE', `Doctor '${doctorId}' is not active`);
    this.name = 'DoctorInactiveError';
  }
}

export class SchedulingConflictError extends DomainError {
  constructor(message: string) {
    super('SCHEDULING_CONFLICT', message);
    this.name = 'SchedulingConflictError';
  }
}

export class DuplicateEntityError extends DomainError {
  constructor(message: string) {
    super('DUPLICATE_ENTITY', message);
    this.name = 'DuplicateEntityError';
  }
}

/** @deprecated Use SchedulingConflictError */
export const ConflictingAppointmentError = SchedulingConflictError;
