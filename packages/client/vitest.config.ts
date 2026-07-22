import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Vitest config for Management Client foundation tests.
 */
export default defineConfig({
  // tsconfig は Next.js の production build 用に JSX preserve を使うため、Vitest の runtime component test だけ JSX を変換する。
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts', 'src/tests/**/*.test.tsx'],
    name: 'client',
  },
  resolve: {
    alias: {
      '@cf-tamac/client/lib/utils': fileURLToPath(
        new URL('./src/lib/utils.ts', import.meta.url).href
      ),
      'server-only': fileURLToPath(
        new URL('./src/tests/stubs/server-only.ts', import.meta.url).href
      ),
    },
  },
});
