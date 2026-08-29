import { config as loadDotenv } from 'dotenv';

loadDotenv();

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/infrastructure/database/postgres/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://clinic:clinic@localhost:54329/clinic_voice_ai',
  },
  strict: true,
  verbose: true,
});
