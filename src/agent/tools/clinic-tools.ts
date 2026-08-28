import { z } from 'zod';
import type { RegisterPatient } from '../../application/patient/register-patient.js';
import type { GetPatientProfile } from '../../application/patient/get-patient-profile.js';
import type { GetPatientContext } from '../../application/patient/get-patient-context.js';
import type { SavePatientPreference } from '../../application/patient/save-patient-preference.js';
import type { SearchDoctors } from '../../application/doctor/search-doctors.js';
import type { SuggestDoctorsFromPeerAffinity } from '../../application/doctor/suggest-doctors-from-peer-affinity.js';
import type { SearchSpecialties } from '../../application/specialty/search-specialties.js';
import type { GetAvailableAppointments } from '../../application/appointment/get-available-appointments.js';
import type { BookAppointment } from '../../application/appointment/book-appointment.js';
import type { CancelAppointment } from '../../application/appointment/cancel-appointment.js';
import type { RescheduleAppointment } from '../../application/appointment/reschedule-appointment.js';
import type { ClinicTool } from './types.js';
import { formatToolError } from './format-error.js';

export type ClinicToolUseCases = {
  registerPatient: RegisterPatient;
  getPatientProfile: GetPatientProfile;
  getPatientContext: GetPatientContext;
  savePatientPreference: SavePatientPreference;
  searchDoctors: SearchDoctors;
  /** Optional — only when KnowledgeGraph is wired. */
  suggestDoctorsFromPeerAffinity?: SuggestDoctorsFromPeerAffinity;
  searchSpecialties: SearchSpecialties;
  getAvailableAppointments: GetAvailableAppointments;
  bookAppointment: BookAppointment;
  cancelAppointment: CancelAppointment;
  rescheduleAppointment: RescheduleAppointment;
};

const preferenceKindSchema = z.enum([
  'specialty',
  'doctor',
  'time_of_day',
  'language',
]);

export function createClinicTools(
  useCases: ClinicToolUseCases,
): ClinicTool[] {
  const tools: ClinicTool[] = [
    {
      definition: {
        name: 'register_patient',
        description:
          'Register or look up a clinic patient by phone number. Does not authenticate or grant session authority.',
        parameters: {
          type: 'object',
          properties: {
            phoneNumber: { type: 'string' },
            fullName: { type: 'string' },
          },
          required: ['phoneNumber'],
        },
      },
      async execute(args) {
        try {
          const input = z
            .object({
              phoneNumber: z.string().min(5),
              fullName: z.string().min(1).optional(),
            })
            .parse(args);
          const result = await useCases.registerPatient.execute({
            phoneNumber: input.phoneNumber,
            ...(input.fullName ? { fullName: input.fullName } : {}),
          });
          return {
            ok: true,
            message: JSON.stringify({
              created: result.created,
              patientId: result.patient.id,
              fullName: result.patient.fullName ?? null,
              authenticated: false,
              note: 'Registration does not authenticate. Patient authority requires a linked authenticated principal.',
            }),
          };
        } catch (error) {
          return formatToolError(error);
        }
      },
    },
    {
      definition: {
        name: 'get_patient_profile',
        description: 'Get the authenticated patient profile.',
        parameters: { type: 'object', properties: {} },
      },
      requiresPatient: true,
      async execute(_args, ctx) {
        try {
          const profile = await useCases.getPatientProfile.execute({
            patientId: ctx.execution.actor!.patientId,
          });
          return {
            ok: true,
            message: JSON.stringify({
              patientId: profile.id,
              fullName: profile.fullName ?? null,
              phoneNumber: profile.phoneNumber.value,
            }),
          };
        } catch (error) {
          return formatToolError(error);
        }
      },
    },
    {
      definition: {
        name: 'get_patient_context',
        description:
          'Get durable patient context: preferences and upcoming appointments.',
        parameters: { type: 'object', properties: {} },
      },
      requiresPatient: true,
      async execute(_args, ctx) {
        try {
          const context = await useCases.getPatientContext.execute({
            patientId: ctx.execution.actor!.patientId,
          });
          return {
            ok: true,
            message: JSON.stringify({
              patientId: context.patient.id,
              preferences: context.preferences.map((p) => ({
                kind: p.kind,
                value: p.value,
              })),
              upcomingAppointments: context.upcomingAppointments.map((a) => ({
                appointmentId: a.id,
                doctorId: a.doctorId,
                start: a.slot.start.toISOString(),
                end: a.slot.end.toISOString(),
                status: a.status,
              })),
            }),
          };
        } catch (error) {
          return formatToolError(error);
        }
      },
    },
    {
      definition: {
        name: 'save_patient_preference',
        description: 'Save a preference for the identified patient.',
        parameters: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              enum: ['specialty', 'doctor', 'time_of_day', 'language'],
            },
            value: { type: 'string' },
            specialtyId: { type: 'string' },
            doctorId: { type: 'string' },
          },
          required: ['kind', 'value'],
        },
      },
      requiresPatient: true,
      async execute(args, ctx) {
        try {
          const input = z
            .object({
              kind: preferenceKindSchema,
              value: z.string().min(1),
              specialtyId: z.string().optional(),
              doctorId: z.string().optional(),
            })
            .parse(args);
          const saved = await useCases.savePatientPreference.execute({
            patientId: ctx.execution.actor!.patientId,
            kind: input.kind,
            value: input.value,
            ...(input.specialtyId ? { specialtyId: input.specialtyId } : {}),
            ...(input.doctorId ? { doctorId: input.doctorId } : {}),
          });
          return {
            ok: true,
            message: JSON.stringify({
              preferenceId: saved.id,
              kind: saved.kind,
              value: saved.value,
            }),
          };
        } catch (error) {
          return formatToolError(error);
        }
      },
    },
    {
      definition: {
        name: 'search_doctors',
        description:
          'Search doctors by natural-language description. Optional specialty filter. Does not require patient registration.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            specialtyId: { type: 'string' },
            limit: { type: 'number' },
          },
          required: ['query'],
        },
      },
      async execute(args) {
        try {
          const input = z
            .object({
              query: z.string().min(1),
              specialtyId: z.string().optional(),
              limit: z.number().int().positive().max(20).optional(),
            })
            .parse(args);
          const result = await useCases.searchDoctors.execute({
            query: input.query,
            ...(input.specialtyId ? { specialtyId: input.specialtyId } : {}),
            ...(input.limit !== undefined ? { limit: input.limit } : {}),
          });
          return {
            ok: true,
            message: JSON.stringify({
              doctors: result.doctors.map((d) => ({
                doctorId: d.id,
                fullName: d.fullName,
                specialtyIds: d.specialtyIds,
                score: result.scores[d.id] ?? null,
              })),
            }),
          };
        } catch (error) {
          return formatToolError(error);
        }
      },
    },
  ];

  if (useCases.suggestDoctorsFromPeerAffinity) {
    const suggest = useCases.suggestDoctorsFromPeerAffinity;
    tools.push({
      definition: {
        name: 'suggest_doctors_from_peer_affinity',
        description:
          'Suggest doctors based on peers who share specialty preferences and completed visits. Requires an authenticated patient. Returns structured doctor candidates with affinity scores.',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number' },
          },
        },
      },
      requiresPatient: true,
      async execute(args, ctx) {
        try {
          const input = z
            .object({
              limit: z.number().int().positive().max(20).optional(),
            })
            .parse(args);
          const result = await suggest.execute({
            patientId: ctx.execution.actor!.patientId,
            ...(input.limit !== undefined ? { limit: input.limit } : {}),
          });
          return {
            ok: true,
            message: JSON.stringify({
              doctors: result.doctors.map((d) => ({
                doctorId: d.id,
                fullName: d.fullName,
                specialtyIds: d.specialtyIds,
                score: result.scores[d.id] ?? null,
              })),
            }),
          };
        } catch (error) {
          return formatToolError(error);
        }
      },
    });
  }

  tools.push(
    {
      definition: {
        name: 'search_specialties',
        description:
          'Search specialties by natural-language description. Does not require patient registration.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: { type: 'number' },
          },
          required: ['query'],
        },
      },
      async execute(args) {
        try {
          const input = z
            .object({
              query: z.string().min(1),
              limit: z.number().int().positive().max(20).optional(),
            })
            .parse(args);
          const specialties = await useCases.searchSpecialties.execute({
            query: input.query,
            ...(input.limit !== undefined ? { limit: input.limit } : {}),
          });
          return {
            ok: true,
            message: JSON.stringify({
              specialties: specialties.map((s) => ({
                specialtyId: s.id,
                name: s.name,
                description: s.description ?? null,
              })),
            }),
          };
        } catch (error) {
          return formatToolError(error);
        }
      },
    },
    {
      definition: {
        name: 'get_available_appointments',
        description:
          'List available appointment slots for a doctor in a time range. Does not require patient registration.',
        parameters: {
          type: 'object',
          properties: {
            doctorId: { type: 'string' },
            from: { type: 'string', description: 'ISO datetime' },
            to: { type: 'string', description: 'ISO datetime' },
            slotDurationMinutes: { type: 'number' },
            maxSlots: { type: 'number' },
          },
          required: ['doctorId', 'from', 'to'],
        },
      },
      async execute(args) {
        try {
          const input = z
            .object({
              doctorId: z.string().min(1),
              from: z.string().min(1),
              to: z.string().min(1),
              slotDurationMinutes: z.number().int().positive().optional(),
              maxSlots: z.number().int().positive().optional(),
            })
            .parse(args);
          const slots = await useCases.getAvailableAppointments.execute({
            doctorId: input.doctorId,
            from: input.from,
            to: input.to,
            ...(input.slotDurationMinutes !== undefined
              ? { slotDurationMinutes: input.slotDurationMinutes }
              : {}),
            ...(input.maxSlots !== undefined ? { maxSlots: input.maxSlots } : {}),
          });
          return {
            ok: true,
            message: JSON.stringify({
              slots: slots.map((s) => ({
                start: s.start,
                end: s.end,
              })),
            }),
          };
        } catch (error) {
          return formatToolError(error);
        }
      },
    },
    {
      definition: {
        name: 'book_appointment',
        description: 'Book an appointment for the identified patient.',
        parameters: {
          type: 'object',
          properties: {
            doctorId: { type: 'string' },
            start: { type: 'string' },
            end: { type: 'string' },
            reason: { type: 'string' },
            idempotencyKey: { type: 'string' },
          },
          required: ['doctorId', 'start', 'end'],
        },
      },
      requiresPatient: true,
      async execute(args, ctx) {
        try {
          const input = z
            .object({
              doctorId: z.string().min(1),
              start: z.string().min(1),
              end: z.string().min(1),
              reason: z.string().optional(),
              idempotencyKey: z.string().optional(),
            })
            .parse(args);
          const appt = await useCases.bookAppointment.execute({
            patientId: ctx.execution.actor!.patientId,
            doctorId: input.doctorId,
            start: input.start,
            end: input.end,
            ...(input.reason ? { reason: input.reason } : {}),
            ...(input.idempotencyKey
              ? { idempotencyKey: input.idempotencyKey }
              : {}),
          });
          return {
            ok: true,
            message: JSON.stringify({
              appointmentId: appt.id,
              doctorId: appt.doctorId,
              start: appt.slot.start.toISOString(),
              end: appt.slot.end.toISOString(),
              status: appt.status,
            }),
          };
        } catch (error) {
          return formatToolError(error);
        }
      },
    },
    {
      definition: {
        name: 'cancel_appointment',
        description: 'Cancel an appointment owned by the identified patient.',
        parameters: {
          type: 'object',
          properties: {
            appointmentId: { type: 'string' },
          },
          required: ['appointmentId'],
        },
      },
      requiresPatient: true,
      async execute(args, ctx) {
        try {
          const input = z
            .object({
              appointmentId: z.string().min(1),
            })
            .parse(args);
          const appt = await useCases.cancelAppointment.execute({
            appointmentId: input.appointmentId,
            patientId: ctx.execution.actor!.patientId,
          });
          return {
            ok: true,
            message: JSON.stringify({
              appointmentId: appt.id,
              status: appt.status,
            }),
          };
        } catch (error) {
          return formatToolError(error);
        }
      },
    },
    {
      definition: {
        name: 'reschedule_appointment',
        description: 'Reschedule an appointment owned by the identified patient.',
        parameters: {
          type: 'object',
          properties: {
            appointmentId: { type: 'string' },
            start: { type: 'string' },
            end: { type: 'string' },
          },
          required: ['appointmentId', 'start', 'end'],
        },
      },
      requiresPatient: true,
      async execute(args, ctx) {
        try {
          const input = z
            .object({
              appointmentId: z.string().min(1),
              start: z.string().min(1),
              end: z.string().min(1),
            })
            .parse(args);
          const appt = await useCases.rescheduleAppointment.execute({
            appointmentId: input.appointmentId,
            patientId: ctx.execution.actor!.patientId,
            start: input.start,
            end: input.end,
          });
          return {
            ok: true,
            message: JSON.stringify({
              appointmentId: appt.id,
              start: appt.slot.start.toISOString(),
              end: appt.slot.end.toISOString(),
              status: appt.status,
            }),
          };
        } catch (error) {
          return formatToolError(error);
        }
      },
    },
  );

  return tools;
}
