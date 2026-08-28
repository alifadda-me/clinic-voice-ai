import type { ClinicId } from '../../domain/index.js';
import type {
  DoctorRepository,
  SpecialtyRepository,
} from '../../ports/clinic/repositories.js';
import { buildDemoClinicCatalog } from './demo-clinic-catalog.js';

export type SeedDemoClinicInput = {
  clinicId: ClinicId;
  /** When true, skip seeding if any doctor already exists in Postgres. */
  ifEmpty?: boolean;
  /** Shared Google Calendar id for all demo doctors (GOOGLE_CALENDAR_ID). */
  calendarResourceId?: string;
};

export type SeedDemoClinicResult = {
  clinicId: ClinicId;
  skipped: boolean;
  specialtyCount: number;
  doctorCount: number;
};

export class SeedDemoClinic {
  constructor(
    private readonly specialties: SpecialtyRepository,
    private readonly doctors: DoctorRepository,
  ) {}

  async execute(input: SeedDemoClinicInput): Promise<SeedDemoClinicResult> {
    if (input.ifEmpty) {
      const existing = await this.doctors.listAll();
      if (existing.length > 0) {
        return {
          clinicId: input.clinicId,
          skipped: true,
          specialtyCount: 0,
          doctorCount: 0,
        };
      }
    }

    const catalog = buildDemoClinicCatalog(input.clinicId, {
      ...(input.calendarResourceId
        ? { calendarResourceId: input.calendarResourceId }
        : {}),
    });

    for (const specialty of catalog.specialties) {
      await this.specialties.save(specialty);
    }
    for (const doctor of catalog.doctors) {
      await this.doctors.save(doctor);
    }

    return {
      clinicId: input.clinicId,
      skipped: false,
      specialtyCount: catalog.specialties.length,
      doctorCount: catalog.doctors.length,
    };
  }
}
