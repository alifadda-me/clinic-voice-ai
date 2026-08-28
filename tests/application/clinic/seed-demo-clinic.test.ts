import { describe, expect, it } from 'vitest';
import { SeedDemoClinic } from '../../../src/application/clinic/seed-demo-clinic.js';
import {
  DEMO_CATALOG_COUNTS,
  DEMO_CLINIC_ID,
  buildDemoClinicCatalog,
} from '../../../src/application/clinic/demo-clinic-catalog.js';
import {
  InMemoryDoctorRepository,
  InMemorySpecialtyRepository,
} from '../../../src/infrastructure/memory/clinic/repositories.js';

describe('SeedDemoClinic', () => {
  it('seeds all demo specialties and doctors', async () => {
    const specialties = new InMemorySpecialtyRepository();
    const doctors = new InMemoryDoctorRepository();
    const seed = new SeedDemoClinic(specialties, doctors);

    const result = await seed.execute({ clinicId: DEMO_CLINIC_ID });

    expect(result.skipped).toBe(false);
    expect(result.specialtyCount).toBe(DEMO_CATALOG_COUNTS.specialties);
    expect(result.doctorCount).toBe(DEMO_CATALOG_COUNTS.doctors);
    expect(await specialties.listAll()).toHaveLength(DEMO_CATALOG_COUNTS.specialties);
    expect(await doctors.listAll()).toHaveLength(DEMO_CATALOG_COUNTS.doctors);
  });

  it('skips when ifEmpty and doctors already exist', async () => {
    const specialties = new InMemorySpecialtyRepository();
    const doctors = new InMemoryDoctorRepository();
    const seed = new SeedDemoClinic(specialties, doctors);

    await seed.execute({ clinicId: DEMO_CLINIC_ID });
    const second = await seed.execute({ clinicId: DEMO_CLINIC_ID, ifEmpty: true });

    expect(second.skipped).toBe(true);
    expect(second.doctorCount).toBe(0);
  });

  it('is idempotent when re-run without ifEmpty (upsert by id)', async () => {
    const specialties = new InMemorySpecialtyRepository();
    const doctors = new InMemoryDoctorRepository();
    const seed = new SeedDemoClinic(specialties, doctors);

    await seed.execute({ clinicId: DEMO_CLINIC_ID });
    await seed.execute({ clinicId: DEMO_CLINIC_ID });

    expect(await doctors.listAll()).toHaveLength(DEMO_CATALOG_COUNTS.doctors);
  });
});

describe('buildDemoClinicCatalog', () => {
  it('includes Dr Sara Hassan under Cardiology', () => {
    const catalog = buildDemoClinicCatalog(DEMO_CLINIC_ID);
    const sara = catalog.doctors.find((d) => d.fullName === 'Dr Sara Hassan');
    const cardiology = catalog.specialties.find((s) => s.name === 'Cardiology');

    expect(sara).toBeDefined();
    expect(cardiology).toBeDefined();
    expect(sara!.hasSpecialty(cardiology!.id)).toBe(true);
  });
});
