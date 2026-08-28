import {
  closePostgresDatabase,
  createPostgresDatabase,
  type PostgresConnectionConfig,
  type PostgresDatabase,
  type PostgresPool,
} from './client.js';
import {
  PostgresAppointmentRepository,
  PostgresDoctorRepository,
  PostgresPatientRepository,
  PostgresPreferenceRepository,
  PostgresSpecialtyRepository,
} from './repositories.js';
import { PostgresPrincipalPatientDirectory } from './principal-patient-directory.js';
import { UuidIdGenerator } from './uuid-id-generator.js';
import { SystemClock } from '../../memory/platform/clock-and-ids.js';
import type {
  AppointmentRepository,
  DoctorRepository,
  PatientRepository,
  PreferenceRepository,
  SpecialtyRepository,
} from '../../../ports/clinic/repositories.js';
import type { PrincipalPatientDirectory } from '../../../ports/clinic/principal-patient.js';
import type { Clock, IdGenerator } from '../../../ports/platform/time.js';

export type PostgresRepositories = {
  patients: PatientRepository;
  doctors: DoctorRepository;
  specialties: SpecialtyRepository;
  appointments: AppointmentRepository;
  preferences: PreferenceRepository;
  principalPatients: PrincipalPatientDirectory;
};

export type PostgresInfrastructure = {
  pool: PostgresPool;
  db: PostgresDatabase;
  repositories: PostgresRepositories;
  clock: Clock;
  ids: IdGenerator;
  close: () => Promise<void>;
};

/**
 * Composition helper for PostgreSQL adapters.
 * Receives connection config — does not read process.env.
 */
export function createPostgresInfrastructure(
  config: PostgresConnectionConfig,
  options?: {
    clock?: Clock;
    ids?: IdGenerator;
  },
): PostgresInfrastructure {
  const { pool, db } = createPostgresDatabase(config);
  const repositories: PostgresRepositories = {
    patients: new PostgresPatientRepository(db),
    doctors: new PostgresDoctorRepository(db),
    specialties: new PostgresSpecialtyRepository(db),
    appointments: new PostgresAppointmentRepository(db),
    preferences: new PostgresPreferenceRepository(db),
    principalPatients: new PostgresPrincipalPatientDirectory(db),
  };

  return {
    pool,
    db,
    repositories,
    clock: options?.clock ?? new SystemClock(),
    ids: options?.ids ?? new UuidIdGenerator(),
    close: () => closePostgresDatabase(pool),
  };
}

// Do not star-export Drizzle schema from this barrel — import schema.js directly
// from infrastructure tests/migrations to keep Drizzle types out of accidental
// application/runtime imports.
export {
  PostgresAppointmentRepository,
  PostgresDoctorRepository,
  PostgresPatientRepository,
  PostgresPreferenceRepository,
  PostgresSpecialtyRepository,
} from './repositories.js';
export { PostgresPrincipalPatientDirectory } from './principal-patient-directory.js';
export { UuidIdGenerator } from './uuid-id-generator.js';
export {
  closePostgresDatabase,
  createPostgresDatabase,
  type PostgresConnectionConfig,
  type PostgresDatabase,
  type PostgresPool,
} from './client.js';
export * from './errors.js';
