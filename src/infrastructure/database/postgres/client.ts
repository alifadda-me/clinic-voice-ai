import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type PostgresConnectionConfig = {
  databaseUrl: string;
};

export type PostgresDatabase = ReturnType<typeof createPostgresDatabase>['db'];
export type PostgresPool = pg.Pool;

/** Railway and other hosted Postgres URLs often require TLS. */
export function createPostgresPoolConfig(databaseUrl: string): pg.PoolConfig {
  const config: pg.PoolConfig = { connectionString: databaseUrl };
  if (
    databaseUrl.includes('sslmode=require') ||
    databaseUrl.includes('ssl=true') ||
    databaseUrl.includes('railway.app') ||
    databaseUrl.includes('rlwy.net')
  ) {
    config.ssl = { rejectUnauthorized: false };
  }
  return config;
}

export function createPostgresDatabase(config: PostgresConnectionConfig) {
  const pool = new pg.Pool(createPostgresPoolConfig(config.databaseUrl));
  const db = drizzle(pool, { schema });
  return { pool, db };
}

export async function closePostgresDatabase(pool: PostgresPool): Promise<void> {
  await pool.end();
}
