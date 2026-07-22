import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Vitest config for Agent Worker foundation tests.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@cf-tamac/agent-rpc': fileURLToPath(new URL('./src/generated/rpc', import.meta.url).href),
    },
  },
  test: {
    // Workers runtime専用の実SQLiteテストは別configで実行し、Node test runnerがcloudflare:* moduleを解決しないようにします。
    exclude: ['src/tests/initialization-receipt-storage.test.ts'],
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    name: 'agent',
  },
});
