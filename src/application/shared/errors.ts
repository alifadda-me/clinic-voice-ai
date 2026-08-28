export class ApplicationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApplicationError';
    this.code = code;
  }
}

export class PatientNotFoundError extends ApplicationError {
  constructor(id: string) {
    super('PATIENT_NOT_FOUND', `Patient '${id}' was not found`);
    this.name = 'PatientNotFoundError';
  }
}

export class DoctorNotFoundError extends ApplicationError {
  constructor(id: string) {
    super('DOCTOR_NOT_FOUND', `Doctor '${id}' was not found`);
    this.name = 'DoctorNotFoundError';
  }
}

export class AppointmentNotFoundError extends ApplicationError {
  constructor(id: string) {
    super('APPOINTMENT_NOT_FOUND', `Appointment '${id}' was not found`);
    this.name = 'AppointmentNotFoundError';
  }
}

export class SpecialtyNotFoundError extends ApplicationError {
  constructor(id: string) {
    super('SPECIALTY_NOT_FOUND', `Specialty '${id}' was not found`);
    this.name = 'SpecialtyNotFoundError';
  }
}

/** @deprecated Prefer specific *NotFoundError types */
export class NotFoundError extends ApplicationError {
  constructor(entity: string, id: string) {
    super('NOT_FOUND', `${entity} '${id}' was not found`);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends ApplicationError {
  constructor(message: string) {
    super('CONFLICT', message);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends ApplicationError {
  constructor(message: string) {
    super('VALIDATION', message);
    this.name = 'ValidationError';
  }
}

export class AppointmentNotOwnedError extends ApplicationError {
  constructor() {
    super(
      'APPOINTMENT_NOT_OWNED',
      'Acting patient does not own this appointment',
    );
    this.name = 'AppointmentNotOwnedError';
  }
}

export class TimeSlotUnavailableError extends ApplicationError {
  constructor(message = 'Requested time slot is unavailable') {
    super('TIME_SLOT_UNAVAILABLE', message);
    this.name = 'TimeSlotUnavailableError';
  }
}

/** External calendar misconfiguration, outage, or unexpected provider failure. */
export class ExternalCalendarError extends ApplicationError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'ExternalCalendarError';
  }
}
