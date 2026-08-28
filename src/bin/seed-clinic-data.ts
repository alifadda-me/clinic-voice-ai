/**
 * Ops CLI: seed demo clinic catalog into PostgreSQL.
 *
 *   npm run db:seed
 *   npm run db:seed -- --if-empty
 *   railway run npm run db:seed
 *   railway run npm run db:seed:full   # seed + Qdrant/Neo4j rebuild
 *
 * Requires DATABASE_URL only. Does not read AUTH_* or touch Redis.
 * After seeding, run `npm run rebuild:derived` (or db:seed:full) so doctor
 * search works in production — SearchDoctors reads from Qdrant, not Postgres alone.
 */

import { SeedDemoClinic } from '../application/clinic/seed-demo-clinic.js';
import {
  DEMO_CLINIC_ID,
  DEMO_CLINIC_NAME,
  DEMO_CLINIC_TIMEZONE,
} from '../application/clinic/demo-clinic-catalog.js';
import { asClinicId } from '../domain/index.js';
import { createPostgresInfrastructure } from '../infrastructure/database/postgres/index.js';
import { clinics } from '../infrastructure/database/postgres/schema.js';

function parseArgs(argv: string[]): { ifEmpty: boolean } {
  return {
    ifEmpty: argv.includes('--if-empty') || process.env.SEED_IF_EMPTY === 'true',
  };
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const clinicId = asClinicId(process.env.SEED_CLINIC_ID?.trim() || DEMO_CLINIC_ID);
  const { ifEmpty } = parseArgs(process.argv.slice(2));

  const infra = createPostgresInfrastructure({ databaseUrl });

  try {
    await infra.db
      .insert(clinics)
      .values({
        id: clinicId,
        name: process.env.SEED_CLINIC_NAME?.trim() || DEMO_CLINIC_NAME,
        timezone: process.env.SEED_CLINIC_TIMEZONE?.trim() || DEMO_CLINIC_TIMEZONE,
      })
      .onConflictDoUpdate({
        target: clinics.id,
        set: {
          name: process.env.SEED_CLINIC_NAME?.trim() || DEMO_CLINIC_NAME,
          timezone: process.env.SEED_CLINIC_TIMEZONE?.trim() || DEMO_CLINIC_TIMEZONE,
        },
      });

    const seed = new SeedDemoClinic(
      infra.repositories.specialties,
      infra.repositories.doctors,
    );
    const result = await seed.execute({ clinicId, ifEmpty });

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        event: result.skipped ? 'seed_skipped' : 'seed_ok',
        clinicId: result.clinicId,
        specialtyCount: result.specialtyCount,
        doctorCount: result.doctorCount,
        ifEmpty,
        nextStep:
          'Run npm run rebuild:derived (or npm run db:seed:full) to index doctors in Qdrant for search.',
      }),
    );
  } finally {
    await infra.close();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      event: 'seed_failed',
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
});
