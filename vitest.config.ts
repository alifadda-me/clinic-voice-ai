import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/integration/**', 'tests/evaluation/live/**', 'node_modules/**'],
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
