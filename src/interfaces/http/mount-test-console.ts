import express, { type Express } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_CONSOLE_DIR = path.join(
  fileURLToPath(new URL('../../../test-console', import.meta.url)),
);

/** Static manual test UI — see docs/TEST_SCENARIOS.md */
export function mountTestConsole(app: Express): void {
  app.use(
    '/test-console',
    express.static(TEST_CONSOLE_DIR, {
      index: 'index.html',
      maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    }),
  );
}
