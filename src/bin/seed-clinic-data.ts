/**
 * Ops CLI: seed demo clinic catalog into PostgreSQL.
 *
 *   npm run db:seed
 *   npm run db:seed -- --if-empty
 *   railway run npm run db:seed
 *   railway run npm run db:seed:full   # seed + Qdrant/Neo4j rebuild
 *
 * Runs pending Drizzle migrations first (unless --no-migrate).
 * Requires DATABASE_URL only. Does not read AUTH_* or touch Redis.
 * After seeding, run `npm run rebuild:derived` (or db:seed:full) so doctor
 * search works in production — SearchDoctors reads from Qdrant, not Postgres alone.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { SeedDemoClinic } from '../application/clinic/seed-demo-clinic.js';
import {
  DEMO_CLINIC_ID,
  DEMO_CLINIC_NAME,
  DEMO_CLINIC_TIMEZONE,
} from '../application/clinic/demo-clinic-catalog.js';
import { asClinicId } from '../domain/index.js';
import { createPostgresInfrastructure } from '../infrastructure/database/postgres/index.js';
import { clinics } from '../infrastructure/database/postgres/schema.js';

const MIGRATIONS_FOLDER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../drizzle',
);

type SeedCliOptions = {
  ifEmpty: boolean;
  skipMigrate: boolean;
};

function parseArgs(argv: string[]): SeedCliOptions {
  return {
    ifEmpty: argv.includes('--if-empty') || process.env.SEED_IF_EMPTY === 'true',
    skipMigrate:
      argv.includes('--no-migrate') || process.env.SEED_SKIP_MIGRATE === 'true',
  };
}

function formatSeedError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current instanceof Error) {
      parts.push(current.message);
      const pg = current as Error & { code?: string; detail?: string; hint?: string };
      if (pg.code) parts.push(`code=${pg.code}`);
      if (pg.detail) parts.push(`detail=${pg.detail}`);
      if (pg.hint) parts.push(`hint=${pg.hint}`);
      current = pg.cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return parts.join(' | ');
}

async function runMigrations(
  db: ReturnType<typeof createPostgresInfrastructure>['db'],
): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const clinicId = asClinicId(process.env.SEED_CLINIC_ID?.trim() || DEMO_CLINIC_ID);
  const { ifEmpty, skipMigrate } = parseArgs(process.argv.slice(2));

  const infra = createPostgresInfrastructure({ databaseUrl });

  try {
    if (!skipMigrate) {
      await runMigrations(infra.db);
    }

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
        migrationsRun: !skipMigrate,
        nextStep:
          'Run npm run rebuild:derived (or npm run db:seed:full) to index doctors in Qdrant for search.',
      }),
    );
  } finally {
    await infra.close();
  }
}

main().catch((error) => {
  const message = formatSeedError(error);
  const hint =
    message.includes('does not exist') || message.includes('42P01')
      ? 'Schema missing — run npm run db:migrate or npm run db:seed without --no-migrate'
      : undefined;

  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      event: 'seed_failed',
      message,
      ...(hint ? { hint } : {}),
    }),
  );
  process.exit(1);
});
