import { defineConfig } from 'vitest/config';

/**
 * Vitest monorepo projects.
 *
 * Run all tests: `pnpm test:run`
 * Run a single project: `vitest run --project agent`
 */
export default defineConfig({
  test: {
    projects: [
      {
        extends: './packages/agent/vitest.config.ts',
        root: './packages/agent',
        test: {
          name: 'agent',
        },
      },
      {
        extends: './packages/client/vitest.config.ts',
        root: './packages/client',
        test: {
          name: 'management-client',
        },
      },
      {
        test: {
          name: 'governance',
          environment: 'node',
          include: ['scripts/**/*.test.mjs'],
        },
      },
    ],
  },
});
