import {
  asDoctorId,
  TimeSlot,
  type Doctor,
} from '../../domain/index.js';
import type { DoctorRepository } from '../../ports/clinic/repositories.js';
import type { CalendarGateway } from '../../ports/platform/calendar-gateway.js';
import type { Clock } from '../../ports/platform/time.js';
import {
  DoctorNotFoundError,
  ValidationError,
} from '../shared/errors.js';
import { parseIsoDate } from '../shared/guards.js';

/**
 * Timezone ownership (not fully implemented yet):
 * - Clinic.timezone is the scheduling authority for "clinic local day"
 * - Appointment TimeSlots are stored as absolute instants (UTC Date)
 * - Patient timezone is display-only until we add notification formatting
 * - Adapters converting to Google Calendar must use clinic timezone for
 *   civil-time slot generation; domain compares instants via Clock
 */
export type GetAvailableAppointmentsInput = {
  doctorId: string;
  from: string;
  to: string;
  slotDurationMinutes?: number;
  maxSlots?: number;
};

export type AvailableSlotDto = {
  start: string;
  end: string;
  durationMinutes: number;
};

export class GetAvailableAppointments {
  constructor(
    private readonly doctors: DoctorRepository,
    private readonly calendar: CalendarGateway,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: GetAvailableAppointmentsInput,
  ): Promise<AvailableSlotDto[]> {
    const doctor = await this.requireActiveDoctor(input.doctorId);

    const rangeStart = parseIsoDate(input.from, 'from');
    const rangeEnd = parseIsoDate(input.to, 'to');
    if (rangeEnd <= rangeStart) {
      throw new ValidationError('to must be after from');
    }

    const duration = input.slotDurationMinutes ?? 30;
    if (duration <= 0) {
      throw new ValidationError('slotDurationMinutes must be positive');
    }

    const now = this.clock.now();
    const effectiveStart = rangeStart < now ? now : rangeStart;

    // LLM often passes stale/past windows — avoid invalid calendar queries (start >= end).
    if (rangeEnd <= now || effectiveStart >= rangeEnd) {
      return [];
    }

    const slots = await this.calendar.findAvailableSlots({
      resourceId: doctor.schedulingResourceId(),
      range: { start: effectiveStart, end: rangeEnd },
      slotDurationMinutes: duration,
      maxSlots: input.maxSlots ?? 20,
    });

    return slots.map((slot) => ({
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      durationMinutes: slot.durationMinutes,
    }));
  }

  private async requireActiveDoctor(doctorId: string): Promise<Doctor> {
    const doctor = await this.doctors.findById(asDoctorId(doctorId));
    if (!doctor) throw new DoctorNotFoundError(doctorId);
    doctor.assertActive();
    return doctor;
  }
}

export { TimeSlot };
