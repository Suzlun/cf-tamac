import { defineConfig } from 'vitest/config';

/**
 * Vitest monorepo projects.
 *
 * Run all tests: `pnpm test:run`
 * Run a single project: `vitest run --project backend-http`
 */
export default defineConfig({
  test: {
    projects: [
      {
        extends: './packages/frontend/app/vitest.config.ts',
        root: './packages/frontend/app',
        test: {
          name: 'frontend-app',
        },
      },
      {
        extends: './packages/backend/http/vitest.config.ts',
        root: './packages/backend/http',
        test: {
          name: 'backend-http',
        },
      },
      {
        extends: './packages/frontend/ui/vitest.config.ts',
        root: './packages/frontend/ui',
        test: {
          name: 'frontend-ui',
        },
      },
    ],
  },
});
