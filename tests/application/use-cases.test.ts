import { describe, expect, it, beforeEach } from 'vitest';
import {
  AppointmentStatuses,
  SchedulingConflictError,
  DoctorInactiveError,
} from '../../src/domain/index.js';
import {
  ConflictError,
  PatientNotFoundError,
  AppointmentNotOwnedError,
  TimeSlotUnavailableError,
} from '../../src/application/index.js';
import { TimeSlot } from '../../src/domain/index.js';
import { createTestWorld, type TestWorld } from '../helpers/test-world.js';

describe('Application use cases (in-memory)', () => {
  let world: TestWorld;
  let seed: Awaited<ReturnType<TestWorld['seed']>>;

  beforeEach(async () => {
    world = createTestWorld();
    seed = await world.seed();
  });

  describe('patient', () => {
    it('registers a new patient', async () => {
      const result = await world.useCases.registerPatient.execute({
        phoneNumber: '+201011112222',
        fullName: 'Ali Fadda',
      });
      expect(result.created).toBe(true);
      expect(result.patient.fullName).toBe('Ali Fadda');
    });

    it('is idempotent for the same phone number', async () => {
      await world.useCases.registerPatient.execute({
        phoneNumber: '+201011112222',
        fullName: 'Ali Fadda',
      });
      const second = await world.useCases.registerPatient.execute({
        phoneNumber: '+201011112222',
        fullName: 'Ali Fadda',
      });
      expect(second.created).toBe(false);
    });

    it('rejects conflicting name for existing phone', async () => {
      await world.useCases.registerPatient.execute({
        phoneNumber: '+201011112222',
        fullName: 'Ali Fadda',
      });
      await expect(
        world.useCases.registerPatient.execute({
          phoneNumber: '+201011112222',
          fullName: 'Someone Else',
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('loads patient profile', async () => {
      const { patient } = await world.useCases.registerPatient.execute({
        phoneNumber: '+201011112222',
        fullName: 'Ali',
      });
      const profile = await world.useCases.getPatientProfile.execute({
        patientId: patient.id,
      });
      expect(profile.id).toBe(patient.id);
    });

    it('saves preferences and builds durable patient context from repositories', async () => {
      const { patient } = await world.useCases.registerPatient.execute({
        phoneNumber: '+201011112222',
        fullName: 'Ali',
      });

      await world.useCases.savePatientPreference.execute({
        patientId: patient.id,
        kind: 'specialty',
        value: seed.cardiology.name,
        specialtyId: seed.cardiology.id,
      });

      await world.useCases.savePatientPreference.execute({
        patientId: patient.id,
        kind: 'time_of_day',
        value: 'morning',
      });

      const booked = await world.useCases.bookAppointment.execute({
        patientId: patient.id,
        doctorId: seed.drSara.id,
        start: '2026-08-25T10:00:00.000Z',
        end: '2026-08-25T10:30:00.000Z',
      });

      const ctx = await world.useCases.getPatientContext.execute({
        patientId: patient.id,
      });
      expect(ctx.patient.id).toBe(patient.id);
      expect(ctx.preferences).toHaveLength(2);
      expect(ctx.preferences.map((p) => p.kind).sort()).toEqual([
        'specialty',
        'time_of_day',
      ]);
      expect(ctx.upcomingAppointments.map((a) => a.id)).toEqual([booked.id]);
      expect(ctx).not.toHaveProperty('graphRelations');
    });

    it('returns empty optional collections when patient has no prefs or appointments', async () => {
      const { patient } = await world.useCases.registerPatient.execute({
        phoneNumber: '+201011112233',
        fullName: 'Bare',
      });
      const ctx = await world.useCases.getPatientContext.execute({
        patientId: patient.id,
      });
      expect(ctx.preferences).toEqual([]);
      expect(ctx.upcomingAppointments).toEqual([]);
    });

    it('rejects context for unknown patient', async () => {
      await expect(
        world.useCases.getPatientContext.execute({ patientId: 'missing' }),
      ).rejects.toBeInstanceOf(PatientNotFoundError);
    });
  });

  describe('discovery', () => {
    it('finds active doctors by specialty and excludes inactive', async () => {
      const doctors = await world.useCases.findDoctors.execute({
        specialtyId: seed.cardiology.id,
      });
      expect(doctors.map((d) => d.id)).toEqual([seed.drSara.id]);
      expect(doctors.every((d) => d.active)).toBe(true);
    });

    it('searches doctors semantically and applies specialty eligibility in app', async () => {
      const result = await world.useCases.searchDoctors.execute({
        query: 'heart cardiologist',
        specialtyId: seed.cardiology.id,
      });
      expect(result.doctors.map((d) => d.id)).toEqual([seed.drSara.id]);
      expect(result.doctors[0]).toMatchObject({
        fullName: 'Dr Sara Hassan',
        active: true,
      });
      expect(Object.keys(result.scores)).toEqual([seed.drSara.id]);
    });

    it('excludes inactive doctors from semantic search results', async () => {
      const result = await world.useCases.searchDoctors.execute({
        query: 'inactive cardiology heart',
        specialtyId: seed.cardiology.id,
      });
      expect(result.doctors.map((d) => d.id)).not.toContain(seed.inactive.id);
    });

    it('filters semantic doctor hits by specialty eligibility after hydrate', async () => {
      const result = await world.useCases.searchDoctors.execute({
        query: 'skin dermatology',
        specialtyId: seed.cardiology.id,
      });
      expect(result.doctors.map((d) => d.id)).not.toContain(seed.drOmar.id);
    });

    it('searches specialties', async () => {
      const specialties = await world.useCases.searchSpecialties.execute({
        query: 'skin',
      });
      expect(specialties.some((s) => s.id === seed.dermatology.id)).toBe(true);
      expect(specialties[0]).toHaveProperty('name');
      expect(specialties[0]).not.toHaveProperty('payload');
    });
  });

  describe('appointments', () => {
    async function registerPatient(phone = '+201011112222', name = 'Ali Fadda') {
      const { patient } = await world.useCases.registerPatient.execute({
        phoneNumber: phone,
        fullName: name,
      });
      return patient;
    }

    it('lists available slots for an active doctor', async () => {
      const slots = await world.useCases.getAvailableAppointments.execute({
        doctorId: seed.drSara.id,
        from: '2026-08-25T09:00:00.000Z',
        to: '2026-08-25T12:00:00.000Z',
        slotDurationMinutes: 30,
      });
      expect(slots.length).toBeGreaterThan(0);
    });

    it('returns empty slots when the requested window is entirely in the past', async () => {
      const slots = await world.useCases.getAvailableAppointments.execute({
        doctorId: seed.drSara.id,
        from: '2020-01-01T09:00:00.000Z',
        to: '2020-01-01T12:00:00.000Z',
      });
      expect(slots).toEqual([]);
    });

    it('books an appointment when slot is free', async () => {
      const patient = await registerPatient();
      const appt = await world.useCases.bookAppointment.execute({
        patientId: patient.id,
        doctorId: seed.drSara.id,
        start: '2026-08-25T10:00:00.000Z',
        end: '2026-08-25T10:30:00.000Z',
        reason: 'Follow-up',
      });

      expect(appt.status).toBe(AppointmentStatuses.Scheduled);
      expect(appt.externalCalendarRef).toBeTruthy();
      expect(world.calendar.listBusy('cal_doc_sara')).toHaveLength(1);
    });

    it('returns the same appointment for idempotent retries', async () => {
      const patient = await registerPatient();
      const input = {
        patientId: patient.id,
        doctorId: seed.drSara.id,
        start: '2026-08-25T10:00:00.000Z',
        end: '2026-08-25T10:30:00.000Z',
        idempotencyKey: 'book-key-1',
      };
      const first = await world.useCases.bookAppointment.execute(input);
      const second = await world.useCases.bookAppointment.execute(input);
      expect(second.id).toBe(first.id);
      expect(world.calendar.listBusy('cal_doc_sara')).toHaveLength(1);
    });

    it('rejects booking inactive doctor', async () => {
      const patient = await registerPatient();
      await expect(
        world.useCases.bookAppointment.execute({
          patientId: patient.id,
          doctorId: seed.inactive.id,
          start: '2026-08-25T10:00:00.000Z',
          end: '2026-08-25T10:30:00.000Z',
        }),
      ).rejects.toBeInstanceOf(DoctorInactiveError);
    });

    it('rejects doctor double-booking via conflict policy', async () => {
      const patient = await registerPatient();
      const input = {
        patientId: patient.id,
        doctorId: seed.drSara.id,
        start: '2026-08-25T10:00:00.000Z',
        end: '2026-08-25T10:30:00.000Z',
      };
      await world.useCases.bookAppointment.execute(input);

      const other = await registerPatient('+201033334444', 'Other Patient');
      await expect(
        world.useCases.bookAppointment.execute({
          ...input,
          patientId: other.id,
        }),
      ).rejects.toBeInstanceOf(SchedulingConflictError);
    });

    it('rejects booking when calendar slot already reserved', async () => {
      const patient = await registerPatient();
      await world.calendar.reserveSlot({
        resourceId: 'cal_doc_sara',
        slot: TimeSlot.create(
          new Date('2026-08-25T10:00:00.000Z'),
          new Date('2026-08-25T10:30:00.000Z'),
        ),
        title: 'External hold',
      });

      await expect(
        world.useCases.bookAppointment.execute({
          patientId: patient.id,
          doctorId: seed.drSara.id,
          start: '2026-08-25T10:00:00.000Z',
          end: '2026-08-25T10:30:00.000Z',
        }),
      ).rejects.toBeInstanceOf(TimeSlotUnavailableError);
    });

    it('cancels an appointment and releases calendar', async () => {
      const patient = await registerPatient();
      const appt = await world.useCases.bookAppointment.execute({
        patientId: patient.id,
        doctorId: seed.drSara.id,
        start: '2026-08-25T10:00:00.000Z',
        end: '2026-08-25T10:30:00.000Z',
      });

      const cancelled = await world.useCases.cancelAppointment.execute({
        appointmentId: appt.id,
        patientId: patient.id,
      });
      expect(cancelled.status).toBe(AppointmentStatuses.Cancelled);
      expect(world.calendar.listBusy('cal_doc_sara')).toHaveLength(0);
    });

    it('rejects cancel by non-owner at application boundary', async () => {
      const patient = await registerPatient();
      const appt = await world.useCases.bookAppointment.execute({
        patientId: patient.id,
        doctorId: seed.drSara.id,
        start: '2026-08-25T10:00:00.000Z',
        end: '2026-08-25T10:30:00.000Z',
      });

      await expect(
        world.useCases.cancelAppointment.execute({
          appointmentId: appt.id,
          patientId: 'pat_intruder',
        }),
      ).rejects.toBeInstanceOf(AppointmentNotOwnedError);
    });

    it('reschedules to a free slot', async () => {
      const patient = await registerPatient();
      const appt = await world.useCases.bookAppointment.execute({
        patientId: patient.id,
        doctorId: seed.drSara.id,
        start: '2026-08-25T10:00:00.000Z',
        end: '2026-08-25T10:30:00.000Z',
      });

      const updated = await world.useCases.rescheduleAppointment.execute({
        appointmentId: appt.id,
        patientId: patient.id,
        start: '2026-08-25T11:00:00.000Z',
        end: '2026-08-25T11:30:00.000Z',
      });

      expect(updated.status).toBe(AppointmentStatuses.Scheduled);
      expect(updated.slot.start.toISOString()).toBe(
        '2026-08-25T11:00:00.000Z',
      );
    });

    it('completes a scheduled appointment', async () => {
      const patient = await registerPatient();
      const appt = await world.useCases.bookAppointment.execute({
        patientId: patient.id,
        doctorId: seed.drSara.id,
        start: '2026-08-25T10:00:00.000Z',
        end: '2026-08-25T10:30:00.000Z',
      });

      const completed = await world.useCases.completeAppointment.execute({
        appointmentId: appt.id,
      });
      expect(completed.status).toBe(AppointmentStatuses.Completed);
    });

    it('returns patient not found for unknown profile', async () => {
      await expect(
        world.useCases.getPatientProfile.execute({ patientId: 'missing' }),
      ).rejects.toBeInstanceOf(PatientNotFoundError);
    });
  });
});
