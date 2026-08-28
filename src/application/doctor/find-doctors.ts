import type { Doctor, SpecialtyId } from '../../domain/index.js';
import { asSpecialtyId } from '../../domain/index.js';
import type { DoctorRepository } from '../../ports/clinic/repositories.js';

export type FindDoctorsInput = {
  specialtyId?: string;
  activeOnly?: boolean;
};

export class FindDoctors {
  constructor(private readonly doctors: DoctorRepository) {}

  async execute(input: FindDoctorsInput = {}): Promise<Doctor[]> {
    let doctors: Doctor[];

    if (input.specialtyId) {
      const specialtyId: SpecialtyId = asSpecialtyId(input.specialtyId);
      doctors = await this.doctors.findBySpecialty(specialtyId);
    } else {
      doctors = await this.doctors.listAll();
    }

    if (input.activeOnly === false) {
      return doctors;
    }
    return doctors.filter((d) => d.active);
  }
}
