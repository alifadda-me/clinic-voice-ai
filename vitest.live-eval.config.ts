import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Opt-in live LLM evaluation. Never used by `npm test`.
 * Run: npm run eval:live
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/evaluation/live/**/*.live.test.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30 * 60_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@domain': path.resolve(__dirname, 'src/domain'),
      '@application': path.resolve(__dirname, 'src/application'),
      '@ports': path.resolve(__dirname, 'src/ports'),
      '@infrastructure': path.resolve(__dirname, 'src/infrastructure'),
    },
  },
});
