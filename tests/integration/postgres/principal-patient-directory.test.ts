import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  Patient,
  PhoneNumber,
  asPatientId,
} from '../../../src/domain/index.js';
import { createPostgresInfrastructure } from '../../../src/infrastructure/database/postgres/index.js';
import { FixedClock } from '../../../src/infrastructure/memory/platform/clock-and-ids.js';
import type { PostgresInfrastructure } from '../../../src/infrastructure/database/postgres/index.js';
import { LinkPrincipalToPatient } from '../../../src/application/identity/link-principal-to-patient.js';
import { ResolveClinicActor } from '../../../src/application/identity/resolve-clinic-actor.js';

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://clinic:clinic@localhost:54329/clinic_voice_ai';

describe('PostgreSQL PrincipalPatientDirectory', () => {
  let infra: PostgresInfrastructure;
  const clock = new FixedClock(new Date('2026-08-24T09:00:00.000Z'));

  beforeAll(async () => {
    infra = createPostgresInfrastructure(
      { databaseUrl: DATABASE_URL },
      { clock },
    );
    await infra.db.execute(sql`select 1`);
  });

  afterAll(async () => {
    await infra.close();
  });

  beforeEach(async () => {
    await infra.db.execute(sql`
      truncate table principal_patient_links, patient_preferences, appointments,
        doctor_specialties, doctors, specialties, patients, clinics
        restart identity cascade
    `);
  });

  it('persists principal→patient across directory instances (multi-instance)', async () => {
    const patient = Patient.create({
      id: asPatientId(randomUUID()),
      phoneNumber: PhoneNumber.create('+201011117001'),
      fullName: 'Durable',
      createdAt: clock.now(),
    });
    await infra.repositories.patients.save(patient);

    const link = new LinkPrincipalToPatient(
      infra.repositories.principalPatients,
      infra.repositories.patients,
    );
    await link.execute({
      principal: { subjectId: 'durable-sub' },
      patientId: patient.id,
    });

    // New adapter instance sharing the same DB (simulates another app process)
    const other = createPostgresInfrastructure(
      { databaseUrl: DATABASE_URL },
      { clock },
    );
    try {
      const found = await other.repositories.principalPatients.findPatientId(
        'durable-sub',
      );
      expect(found).toBe(patient.id);

      const resolve = new ResolveClinicActor(
        other.repositories.principalPatients,
      );
      const { actor } = await resolve.execute({
        principal: { subjectId: 'durable-sub' },
      });
      expect(actor?.patientId).toBe(patient.id);
    } finally {
      await other.close();
    }
  });

  it('survives reconnect (process restart simulation)', async () => {
    const patient = Patient.create({
      id: asPatientId(randomUUID()),
      phoneNumber: PhoneNumber.create('+201011117002'),
      createdAt: clock.now(),
    });
    await infra.repositories.patients.save(patient);
    await infra.repositories.principalPatients.link('restart-sub', patient.id);
    await infra.close();

    infra = createPostgresInfrastructure(
      { databaseUrl: DATABASE_URL },
      { clock },
    );
    expect(
      await infra.repositories.principalPatients.findPatientId('restart-sub'),
    ).toBe(patient.id);
  });
});
