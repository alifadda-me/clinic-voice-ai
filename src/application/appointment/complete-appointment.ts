import {
  asAppointmentId,
  type Appointment,
} from '../../domain/index.js';
import type { AppointmentRepository } from '../../ports/clinic/repositories.js';
import type { Clock } from '../../ports/platform/time.js';
import { AppointmentNotFoundError } from '../shared/errors.js';

export type CompleteAppointmentInput = {
  appointmentId: string;
};

export class CompleteAppointment {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: CompleteAppointmentInput): Promise<Appointment> {
    const appointment = await this.appointments.findById(
      asAppointmentId(input.appointmentId),
    );
    if (!appointment) {
      throw new AppointmentNotFoundError(input.appointmentId);
    }

    const completed = appointment.complete(this.clock.now());
    return this.appointments.save(completed);
  }
}
