import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type PostgresConnectionConfig = {
  databaseUrl: string;
};

export type PostgresDatabase = ReturnType<typeof createPostgresDatabase>['db'];
export type PostgresPool = pg.Pool;

export function createPostgresDatabase(config: PostgresConnectionConfig) {
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  const db = drizzle(pool, { schema });
  return { pool, db };
}

export async function closePostgresDatabase(pool: PostgresPool): Promise<void> {
  await pool.end();
}
