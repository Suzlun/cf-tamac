import { defineConfig } from 'vitest/config';

/**
 * Vitest config for Management Client foundation tests.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts', 'src/tests/**/*.test.tsx'],
    name: 'management-client',
  },
});
