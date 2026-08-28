import {
  Appointment,
  Clinic,
  Doctor,
  Patient,
  PatientPreference,
  PhoneNumber,
  Specialty,
  TimeSlot,
  asAppointmentId,
  asClinicId,
  asDoctorId,
  asPatientId,
  asPreferenceId,
  asSpecialtyId,
  type AppointmentStatus,
  type PreferenceKind,
} from '../../../domain/index.js';
import type {
  AppointmentRow,
  ClinicRow,
  DoctorRow,
  PatientRow,
  PreferenceRow,
  SpecialtyRow,
} from './schema.js';

export function toPatient(row: PatientRow): Patient {
  return Patient.create({
    id: asPatientId(row.id),
    phoneNumber: PhoneNumber.create(row.phoneNumber),
    fullName: row.fullName ?? undefined,
    createdAt: row.createdAt,
  });
}

export function toSpecialty(row: SpecialtyRow): Specialty {
  return Specialty.create({
    id: asSpecialtyId(row.id),
    name: row.name,
    description: row.description ?? undefined,
  });
}

export function toClinic(row: ClinicRow): Clinic {
  return Clinic.create({
    id: asClinicId(row.id),
    name: row.name,
    timezone: row.timezone,
  });
}

export function toDoctor(
  row: DoctorRow,
  specialtyIds: string[],
): Doctor {
  return Doctor.create({
    id: asDoctorId(row.id),
    clinicId: asClinicId(row.clinicId),
    fullName: row.fullName,
    specialtyIds: specialtyIds.map(asSpecialtyId),
    bio: row.bio ?? undefined,
    active: row.active,
    calendarResourceId: row.calendarResourceId ?? undefined,
  });
}

export function toAppointment(row: AppointmentRow): Appointment {
  return Appointment.rehydrate({
    id: asAppointmentId(row.id),
    patientId: asPatientId(row.patientId),
    doctorId: asDoctorId(row.doctorId),
    slot: TimeSlot.create(row.startsAt, row.endsAt),
    status: row.status as AppointmentStatus,
    reason: row.reason ?? undefined,
    externalCalendarRef: row.externalCalendarRef ?? undefined,
    idempotencyKey: row.idempotencyKey ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function toPreference(row: PreferenceRow): PatientPreference {
  return PatientPreference.create({
    id: asPreferenceId(row.id),
    patientId: asPatientId(row.patientId),
    kind: row.kind as PreferenceKind,
    value: row.value,
    specialtyId: row.specialtyId
      ? asSpecialtyId(row.specialtyId)
      : undefined,
    doctorId: row.doctorId ? asDoctorId(row.doctorId) : undefined,
    createdAt: row.createdAt,
  });
}

export function fromPatient(patient: Patient) {
  return {
    id: patient.id,
    phoneNumber: patient.phoneNumber.value,
    fullName: patient.fullName ?? null,
    createdAt: patient.createdAt,
  };
}

export function fromSpecialty(specialty: Specialty) {
  return {
    id: specialty.id,
    name: specialty.name,
    description: specialty.description ?? null,
  };
}

export function fromDoctor(doctor: Doctor) {
  return {
    id: doctor.id,
    clinicId: doctor.clinicId,
    fullName: doctor.fullName,
    bio: doctor.bio ?? null,
    active: doctor.active,
    calendarResourceId: doctor.calendarResourceId ?? null,
  };
}

export function fromAppointment(appointment: Appointment) {
  return {
    id: appointment.id,
    patientId: appointment.patientId,
    doctorId: appointment.doctorId,
    startsAt: appointment.slot.start,
    endsAt: appointment.slot.end,
    status: appointment.status,
    reason: appointment.reason ?? null,
    externalCalendarRef: appointment.externalCalendarRef ?? null,
    idempotencyKey: appointment.idempotencyKey ?? null,
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt,
  };
}

export function fromPreference(preference: PatientPreference) {
  return {
    id: preference.id,
    patientId: preference.patientId,
    kind: preference.kind,
    value: preference.value,
    specialtyId: preference.specialtyId ?? null,
    doctorId: preference.doctorId ?? null,
    createdAt: preference.createdAt,
  };
}
