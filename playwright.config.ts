import { defineConfig, devices } from '@playwright/test';

// E2E 専用に決定論的な 32-byte AES key を生成し、local D1 に残る暗号化済み signing key を再実行時にも復号可能にする。
// production secret ではなく test-only seed から shell 実行時に導出し、実運用の秘密値は repository に保存しない。
const e2eClientCredentialEncryptionKeyCommand =
  "node -e \"console.log(require('node:crypto').createHash('sha256').update('cf-tamac-e2e-client-credential-encryption-key').digest('base64'))\"";
// 開発用の標準 port 3000 は別 session の Client 起動が使用し得るため、E2E 一時 server 専用の固定 port を使う。
// webServer URL と Browser baseURL を同じ origin に固定し、Next の自動 port fallback による起動待機 timeout を防ぐ。
const e2eClientPort = 3100;
const e2eClientOrigin = `http://localhost:${e2eClientPort}`;
// Client の local D1 migration を先に適用してから Next dev server を起動し、E2E fake Agent RPC で外部 Agent Worker 依存を避ける。
// Playwright の長い multi-browser run では Turbopack HMR chunk 再生成が WebKit 終盤の chunk load error になり得るため、E2E 専用に webpack dev server を使う。
const e2eClientWebServerCommand = `CLIENT_CREDENTIAL_ENCRYPTION_KEY="$(${e2eClientCredentialEncryptionKeyCommand})" E2E_FAKE_AGENT_RPC=1 sh -c 'pnpm --filter @cf-tamac/client db:migrate:local && pnpm --filter @cf-tamac/client exec next dev --webpack --port ${e2eClientPort}'`;

/**
 * Playwright E2E テスト設定
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Next dev + Cloudflare local D1 + 3 browser project の逐次実行では WebKit 終盤に 30 秒を超えるため、実運用 smoke の完走余裕を持たせる。 */
  timeout: 60_000,
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
    baseURL: e2eClientOrigin,
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
      command: e2eClientWebServerCommand,
      url: e2eClientOrigin,
      // 既存 server を再利用すると fake RPC・migration・webpack 条件を満たさない未知環境を検証するため、常に test-owned process を要求する。
      reuseExistingServer: false,
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
