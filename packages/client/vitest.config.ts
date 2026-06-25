import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Vitest config for Management Client foundation tests.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts', 'src/tests/**/*.test.tsx'],
    name: 'client',
  },
  resolve: {
    alias: {
      'server-only': fileURLToPath(
        new URL('./src/tests/stubs/server-only.ts', import.meta.url).href
      ),
    },
  },
});
