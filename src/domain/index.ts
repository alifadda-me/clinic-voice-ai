export { Clinic } from './clinic/clinic.js';
export { Specialty } from './specialty/specialty.js';
export { Doctor } from './doctor/doctor.js';
export { Patient } from './patient/patient.js';
export { Appointment } from './appointment/appointment.js';
export {
  AppointmentStatuses,
  type AppointmentStatus,
  canCancel,
  canComplete,
  canReschedule,
  isTerminalStatus,
} from './appointment/appointment-status.js';
export { AppointmentPolicy } from './appointment/appointment-policy.js';
export {
  PatientPreference,
  InvalidPreferenceError,
  type PreferenceKind,
  type TimeOfDay,
} from './preference/patient-preference.js';
export * from './shared/index.js';
