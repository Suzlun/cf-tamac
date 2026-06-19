import { env as testEnv } from 'cloudflare:workers';
import { beforeAll, beforeEach } from 'vitest';

import type { Bindings } from '@cfreact-template-backend/types';

const env = testEnv as unknown as Bindings;

// テスト前に D1 データベースのスキーマを初期化
beforeAll(async () => {
  // users テーブルを作成
  await env.DB.prepare(
    `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `
  ).run();
});

// 各テストの前にデータをクリーンアップ
beforeEach(async () => {
  await env.DB.prepare('DELETE FROM users').run();
});
