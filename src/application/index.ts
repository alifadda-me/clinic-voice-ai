export { RegisterPatient } from './patient/register-patient.js';
export { GetPatientProfile } from './patient/get-patient-profile.js';
export { SavePatientPreference } from './patient/save-patient-preference.js';
export { GetPatientContext } from './patient/get-patient-context.js';
export type { PatientContext } from './patient/get-patient-context.js';
export { FindDoctors } from './doctor/find-doctors.js';
export { SearchDoctors, DOCTOR_SEARCH_INDEX } from './doctor/search-doctors.js';
export { RebuildDoctorSearchIndex } from './doctor/rebuild-doctor-search-index.js';
export { SuggestDoctorsFromPeerAffinity } from './doctor/suggest-doctors-from-peer-affinity.js';
export type {
  SuggestDoctorsFromPeerAffinityInput,
  SuggestDoctorsFromPeerAffinityResult,
} from './doctor/suggest-doctors-from-peer-affinity.js';
export {
  SearchSpecialties,
  SPECIALTY_SEARCH_INDEX,
} from './specialty/search-specialties.js';
export { RebuildSpecialtySearchIndex } from './specialty/rebuild-specialty-search-index.js';
export {
  RebuildPatientAffinityGraph,
} from './graph/rebuild-patient-affinity-graph.js';
export type { RebuildPatientAffinityGraphResult } from './graph/rebuild-patient-affinity-graph.js';
export { PREFERS, VISITED } from './graph/relation-types.js';
export { GetAvailableAppointments } from './appointment/get-available-appointments.js';
export { BookAppointment } from './appointment/book-appointment.js';
export { CancelAppointment } from './appointment/cancel-appointment.js';
export { RescheduleAppointment } from './appointment/reschedule-appointment.js';
export { CompleteAppointment } from './appointment/complete-appointment.js';
export { ResolveClinicActor } from './identity/resolve-clinic-actor.js';
export type {
  ClinicActor,
  ResolveClinicActorInput,
  ResolveClinicActorResult,
} from './identity/resolve-clinic-actor.js';
export { LinkPrincipalToPatient } from './identity/link-principal-to-patient.js';
export type { LinkPrincipalToPatientInput } from './identity/link-principal-to-patient.js';
export { EnrollAuthenticatedPatient } from './identity/enroll-authenticated-patient.js';
export type {
  EnrollAuthenticatedPatientInput,
  EnrollAuthenticatedPatientResult,
} from './identity/enroll-authenticated-patient.js';
export * from './shared/errors.js';
export { assertAppointmentOwnedBy, parseIsoDate } from './shared/guards.js';
export type { DoctorSearchCriteria } from './doctor/search-doctors.js';
export type { SpecialtySearchCriteria } from './specialty/search-specialties.js';
