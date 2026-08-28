import {
  boolean,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Drizzle schema — infrastructure only.
 * Never import this from domain or application.
 *
 * Timestamps: timestamptz stores absolute instants (UTC).
 * Domain TimeSlot maps 1:1 to starts_at/ends_at.
 * Clinic timezone is clinic metadata for future civil-time display/rules only.
 */

export const appointmentStatusEnum = pgEnum('appointment_status', [
  'scheduled',
  'cancelled',
  'completed',
]);

export const preferenceKindEnum = pgEnum('preference_kind', [
  'specialty',
  'doctor',
  'time_of_day',
  'language',
]);

export const clinics = pgTable('clinics', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const patients = pgTable(
  'patients',
  {
    id: uuid('id').primaryKey(),
    phoneNumber: text('phone_number').notNull(),
    fullName: text('full_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex('patients_phone_number_uidx').on(t.phoneNumber)],
);

export const specialties = pgTable(
  'specialties',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('specialties_name_uidx').on(t.name)],
);

export const doctors = pgTable(
  'doctors',
  {
    id: uuid('id').primaryKey(),
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'restrict' }),
    fullName: text('full_name').notNull(),
    bio: text('bio'),
    active: boolean('active').notNull().default(true),
    calendarResourceId: text('calendar_resource_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('doctors_clinic_id_idx').on(t.clinicId)],
);

export const doctorSpecialties = pgTable(
  'doctor_specialties',
  {
    doctorId: uuid('doctor_id')
      .notNull()
      .references(() => doctors.id, { onDelete: 'cascade' }),
    specialtyId: uuid('specialty_id')
      .notNull()
      .references(() => specialties.id, { onDelete: 'restrict' }),
  },
  (t) => [primaryKey({ columns: [t.doctorId, t.specialtyId] })],
);

export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').primaryKey(),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'restrict' }),
    doctorId: uuid('doctor_id')
      .notNull()
      .references(() => doctors.id, { onDelete: 'restrict' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    status: appointmentStatusEnum('status').notNull(),
    reason: text('reason'),
    externalCalendarRef: text('external_calendar_ref'),
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('appointments_doctor_id_idx').on(t.doctorId),
    index('appointments_patient_id_idx').on(t.patientId),
    index('appointments_status_idx').on(t.status),
    uniqueIndex('appointments_idempotency_key_uidx').on(t.idempotencyKey),
  ],
);

export const patientPreferences = pgTable(
  'patient_preferences',
  {
    id: uuid('id').primaryKey(),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    kind: preferenceKindEnum('kind').notNull(),
    value: text('value').notNull(),
    specialtyId: uuid('specialty_id').references(() => specialties.id, {
      onDelete: 'set null',
    }),
    doctorId: uuid('doctor_id').references(() => doctors.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('patient_preferences_patient_id_idx').on(t.patientId)],
);

/**
 * Durable principal (IdP subject) ↔ patient mapping.
 * Identity adjacency in Postgres — not Redis. Clinic patients remain SoT.
 */
export const principalPatientLinks = pgTable(
  'principal_patient_links',
  {
    subjectId: text('subject_id').primaryKey(),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'restrict' }),
    linkedAt: timestamp('linked_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex('principal_patient_links_patient_id_uidx').on(t.patientId)],
);

export type PatientRow = typeof patients.$inferSelect;
export type DoctorRow = typeof doctors.$inferSelect;
export type SpecialtyRow = typeof specialties.$inferSelect;
export type AppointmentRow = typeof appointments.$inferSelect;
export type PreferenceRow = typeof patientPreferences.$inferSelect;
export type ClinicRow = typeof clinics.$inferSelect;
export type PrincipalPatientLinkRow = typeof principalPatientLinks.$inferSelect;
