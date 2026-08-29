import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

/**
 * Load project-root `.env` for CLI / server bootstrap.
 * Overrides existing shell vars so local `.env` is the source of truth.
 */
export function loadEnvFile(): void {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..',
  );
  loadDotenv({ path: path.join(root, '.env'), override: true });
}
