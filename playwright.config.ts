import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E テスト設定
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* テストを並列実行 */
  fullyParallel: true,
  /* CI環境でのリトライ設定 */
  retries: process.env.CI !== undefined ? 2 : 0,
  /* Next dev/Turbopack の chunk 再生成競合を避けるため、ローカルと CI の両方で 1 worker に固定する */
  workers: 1,
  /* レポーター設定 */
  reporter: 'html',
  /* 共通設定 */
  use: {
    /* ベースURL */
    baseURL: 'http://localhost:3000',
    /* 失敗時のスクリーンショット */
    screenshot: 'only-on-failure',
    /* 失敗時のビデオ */
    video: 'retain-on-failure',
    /* トレース設定 */
    trace: 'on-first-retry',
  },

  /* テスト前にサーバーを起動 */
  webServer: [
    {
      command: 'E2E_FAKE_AGENT_RPC=1 pnpm dev:client',
      url: 'http://localhost:3000',
      reuseExistingServer: process.env.CI === undefined,
      timeout: 120 * 1000,
    },
  ],

  /* ブラウザ設定 */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* モバイルブラウザテスト（オプション） */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },
  ],
});
