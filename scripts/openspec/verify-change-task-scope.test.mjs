import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

import { runGuardInFixture } from '#openspec/guard-test-fixture';

const guardScriptPath = fileURLToPath(new URL('./verify-change-task-scope.mjs', import.meta.url));
const validTask = `## Work Packages

- [ ] WP1: 利用者がアカウントを安全に管理できる成果を完成する
  - Covers: ACCOUNT-S001 とアカウント管理の承認済み範囲
  - Completion Evidence: \`pnpm test:run\` と \`pnpm lint\` が成功する
`;
const validDesign = `## Material Decisions

- 仕様境界に沿って責務を分離する。

## Boundaries

- 依存方向を内向きに保つ。

## Data

- データ所有権を一箇所に限定する。

## Security

- 入力を信頼境界で検証する。

## Migration

- リポジトリ内の生成処理で移行する。

## Rollback

- 互換性のない状態を残さず切り戻す。

## Failure Modes

- 不正入力を安全に拒否する。

## Risks

- 整合性不良を自動検査で検出する。

## Verification

- 承認済み Scenario の結果を確認する。

## Revisit Triggers

- 外部契約が変化した場合に判断を再検討する。
`;

// 成果単位の作業台帳と物質的判断だけを持つ設計が受理されることを確認する。
void test('粗い Work Package 台帳と物質的設計を許可する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/changes/example/tasks.md': validTask,
    'openspec/changes/example/design.md': validDesign,
  });

  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
});

// 作業台帳を旧来の細分化した番号形式へ戻す変更が拒否されることを確認する。
void test('Work Package 形式でないチェック項目を拒否する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/changes/example/tasks.md': validTask.replace('WP1:', '1.1'),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /WP<number>/u);
});

// 完了判定の証拠を持たない作業単位が受理されないことを確認する。
void test('Completion Evidence がない Work Package を拒否する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/changes/example/tasks.md': validTask.replace(
      /\n {2}- Completion Evidence:.*\n/u,
      '\n'
    ),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Completion Evidence/u);
});

// 実装時に決めるファイル一覧を永続的な作業台帳へ固定しないことを確認する。
void test('[WORKSPACE-GOVERNANCE-S026] ファイル単位の計画を拒否する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/changes/example/tasks.md': validTask.replace(
      'アカウント管理の承認済み範囲',
      '`src/account.ts` の変更'
    ),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /ファイル単位/u);
});

// 補助処理の追加を成果と取り違えた作業単位が拒否されることを確認する。
void test('補助処理単位の計画を拒否する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/changes/example/tasks.md': validTask.replace(
      '利用者がアカウントを安全に管理できる成果',
      '検証ヘルパーを追加する作業'
    ),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /コード要素単位/u);
});

// 試験階層そのものを利用者成果として扱う作業単位が拒否されることを確認する。
void test('試験階層単位の計画を拒否する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/changes/example/tasks.md': validTask.replace(
      '利用者がアカウントを安全に管理できる成果',
      '単体試験を追加する作業'
    ),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /試験階層単位/u);
});

// 外部環境の変更をリポジトリ内作業の完了条件へ含めないことを確認する。
void test('デプロイ実行を完了条件に含む計画を拒否する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/changes/example/tasks.md': validTask.replace(
      '`pnpm test:run` と `pnpm lint` が成功する',
      'デプロイを実行して確認する'
    ),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /リリースまたはデプロイ/u);
});

// 設計判断と詳細な実装計画が同じ成果物へ混在しないことを確認する。
void test('設計へ詳細計画の見出しを追加することを拒否する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/changes/example/design.md': `${validDesign}\n## Directory Tree\n\n詳細なファイル一覧。\n`,
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /design\.md の見出し/u);
});

// 現在の作業台帳契約を過去のアーカイブへ遡及適用しないことを確認する。
void test('archive 配下の履歴は検査しない', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/changes/archive/example/tasks.md': '- [ ] 1.1 古い形式',
  });

  assert.equal(result.status, 0);
});
