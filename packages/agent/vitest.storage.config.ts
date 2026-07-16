import { fileURLToPath } from 'node:url';

import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

/**
 * Agent Durable Object SQLiteの統合テスト設定です。
 *
 * @remarks
 * 通常のAgent unit testはNode環境を維持し、この設定だけをWorkers runtimeで実行します。
 * これにより、Cloudflareが提供する実SQLite、Durable Object eviction、RPC dispatchを
 * source文字列やrepository mockではなく同じruntime境界で検証できます。
 */
export default defineConfig({
  resolve: {
    alias: {
      '@cf-tamac/agent-rpc': fileURLToPath(new URL('./src/generated/rpc', import.meta.url).href),
    },
  },
  plugins: [
    cloudflareTest({
      main: './src/index.ts',
      miniflare: {
        bindings: {
          AGENT_AUDIT_HASH_PEPPER: 'agent-receipt-test-audit-pepper',
          AGENT_CONTROL_PLANE_TRUST: '{}',
          AGENT_INTEGRATION_SIGNATURE_KEYS: '{}',
          AGENT_MODEL_PROVIDER_SECRET_REFS: '{}',
        },
        compatibilityDate: '2026-06-18',
        compatibilityFlags: ['nodejs_compat'],
        durableObjects: { AI_AGENT: { className: 'AIAgent', useSQLite: true } },
        r2Buckets: ['AGENT_BLOBS'],
      },
    }),
  ],
  test: {
    include: ['src/tests/initialization-receipt-storage.test.ts'],
  },
});
