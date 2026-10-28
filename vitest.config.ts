import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['services/**/tests/**/*.test.ts', 'apps/web/src/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/generated/**'],
    testTimeout: 30000,
    maxWorkers: 2,
  },
  esbuild: { jsx: 'automatic' },
});
