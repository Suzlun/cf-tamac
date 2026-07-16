import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

const guardScriptPath = fileURLToPath(new URL('./verify-change-task-scope.mjs', import.meta.url));

/**
 * 一時的な OpenSpec Change を作成して scope guard の標準出力と終了コードを検証する。
 *
 * @param {Record<string, string>} files - 一時リポジトリへ配置する相対パスと内容。
 * @returns {{ status: number | null; stderr: string }} guard 実行結果。
 */
function runGuardInFixture(files) {
  const fixtureDirectory = mkdtempSync(path.join(tmpdir(), 'openspec-change-task-scope-'));

  try {
    for (const [relativePath, content] of Object.entries(files)) {
      const absolutePath = path.join(fixtureDirectory, relativePath);
      mkdirSync(path.dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, content, 'utf8');
    }

    const result = spawnSync(process.execPath, [guardScriptPath], {
      cwd: fixtureDirectory,
      encoding: 'utf8',
    });

    return { status: result.status, stderr: result.stderr };
  } finally {
    rmSync(fixtureDirectory, { force: true, recursive: true });
  }
}

test('repository-local な task と merge 検証を許可する', () => {
  const result = runGuardInFixture({
    'openspec/changes/example/tasks.md':
      '## 1. 実装\n\n- [ ] 1.1 `packages/frontend` に機能を実装し、`pnpm test:frontend` を実行する。\n',
    'openspec/changes/example/design.md':
      '## Merge Verification\n\n- `pnpm lint`、`pnpm test:run`、`pnpm build` が成功する。\n',
  });

  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
});

const prohibitedTaskCases = [
  ['リリースの実行', 'リリースを実行する。', 'リリースまたはデプロイの実行'],
  [
    '外部環境のプロビジョニング',
    'production 環境のリソースを作成する。',
    '外部環境のプロビジョニング',
  ],
  ['認証情報の確認', '認証情報を取得して確認する。', '認証情報の取得・確認・検証'],
  ['外部承認の依頼', '運用担当へ承認を依頼する。', '外部承認または運用担当者への依頼'],
  ['staging の検証', 'staging で接続を検証する。', 'staging または production の検証'],
  ['production bookmark', 'production bookmark を追加する。', 'production bookmark'],
];

for (const [name, taskText, label] of prohibitedTaskCases) {
  test(`${name}を含む task を拒否する`, () => {
    const result = runGuardInFixture({
      'openspec/changes/example/tasks.md': `## 1. 禁止された作業\n\n- [ ] 1.1 ${taskText}\n`,
    });

    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(label));
  });
}

test('Release Procedure section を拒否する', () => {
  const result = runGuardInFixture({
    'openspec/changes/example/design.md': '## Release Procedure\n\n- 外部環境で実行する。\n',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Release Procedure/u);
});
