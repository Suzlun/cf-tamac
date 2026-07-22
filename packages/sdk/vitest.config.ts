import { defineConfig } from 'vitest/config';

/**
 * @cf-tamac/sdk 専用の Vitest 設定です。
 *
 * @remarks
 * SDK package root から test script を実行しても workspace root の Agent/Client project 設定を誤って
 * 解決しないよう、SDK scenario test だけを Node server-side runtime で実行します。
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
  },
});
