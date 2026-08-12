import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

import { runGuardInFixture } from '#openspec/guard-test-fixture';

const guardScriptPath = fileURLToPath(new URL('./verify-scenario-coverage.mjs', import.meta.url));

/**
 * 試験 fixture 内だけで Scenario ID 参照記法を組み立て、実リポジトリの参照検査と分離する。
 *
 * @param {string} id - fixture で参照する Scenario ID。
 * @returns {string} 角括弧で囲んだ試験題名用参照。
 */
function scenarioReference(id) {
  return `[${id}]`;
}

/**
 * 主仕様の一要件を作成し、差分適用試験の共通基準として使用する。
 *
 * @param {string} scenarioId - 主仕様へ記載する Scenario ID。
 * @returns {string} OpenSpec 主仕様の内容。
 */
function createMainSpec(scenarioId = 'ACCOUNT-S001') {
  return `## Purpose

利用者のアカウント操作を保証する。

## Requirements

### Requirement: アカウント表示

システムはアカウントを表示しなければならない。

#### Scenario: アカウントを表示する (${scenarioId})

- **WHEN** 利用者がアカウントを開く
- **THEN** アカウントが表示される
`;
}

/**
 * 一要件を含む差分仕様を作成する。
 *
 * @param {{ kind?: string; requirement?: string; scenarioId?: string; manual?: boolean }} [options] - 差分操作と Scenario の内容。
 * @returns {string} OpenSpec 差分仕様の内容。
 */
function createDeltaSpec({
  kind = 'ADDED',
  requirement = 'アカウント作成',
  scenarioId = 'ACCOUNT-S002',
  manual = false,
} = {}) {
  return `## Purpose

利用者のアカウント操作を保証する。

## ${kind} Requirements

### Requirement: ${requirement}

システムは要求された結果を返さなければならない。

#### Scenario: 要求された結果を返す (${scenarioId})

${manual ? 'Tags: manual\n\n' : ''}- **WHEN** 利用者が操作する
- **THEN** 要求された結果が表示される
`;
}

// 主仕様と全活動中差分を重ねたScenarioが試験題名から追跡できることを確認する。
void test('[WORKSPACE-GOVERNANCE-S005] 全活動中差分とスクリプト試験を検査する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/specs/account/spec.md': createMainSpec(),
    'openspec/changes/add-account/specs/account/spec.md': createDeltaSpec(),
    'scripts/account.test.mjs': `test('${scenarioReference('ACCOUNT-S001')} display', () => {});\ntest('${scenarioReference('ACCOUNT-S002')} create', () => {});\n`,
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /coverage: OK/u);
});

// 提案工程では活動中差分の構造を検査し、未実装の試験参照までは要求しないことを確認する。
void test('計画時は活動中差分の試験参照を要求しない', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/specs/account/spec.md': createMainSpec(),
    'openspec/changes/add-account/specs/account/spec.md': createDeltaSpec(),
    'tests/account.test.ts': `test('${scenarioReference('ACCOUNT-S001')} display', () => {});\n`,
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /coverage: OK/u);
});

// 実装完了工程では選択Changeの自動化対象Scenarioへ試験参照を必須化することを確認する。
void test('実装完了時は選択した差分の試験参照を要求する', () => {
  const result = runGuardInFixture(
    guardScriptPath,
    {
      'openspec/specs/account/spec.md': createMainSpec(),
      'openspec/changes/add-account/specs/account/spec.md': createDeltaSpec(),
      'tests/account.test.ts': `test('${scenarioReference('ACCOUNT-S001')} display', () => {});\n`,
    },
    ['--change', 'add-account', '--require-test-references']
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing test reference 'ACCOUNT-S002'/u);
});

// 一つのChangeを指定した検査では、他の活動中差分を混在させないことを確認する。
void test('--change は選択した差分だけを主仕様へ重ねる', () => {
  const result = runGuardInFixture(
    guardScriptPath,
    {
      'openspec/specs/account/spec.md': createMainSpec(),
      'openspec/changes/change-a/specs/account/spec.md': createDeltaSpec({
        kind: 'MODIFIED',
        requirement: 'アカウント表示',
        scenarioId: 'ACCOUNT-S010',
      }),
      'openspec/changes/change-b/specs/account/spec.md': createDeltaSpec({
        kind: 'MODIFIED',
        requirement: 'アカウント表示',
        scenarioId: 'ACCOUNT-S020',
      }),
      'tests/account.test.ts': `test('${scenarioReference('ACCOUNT-S001')} main', () => {});\ntest('${scenarioReference('ACCOUNT-S010')} selected overlay', () => {});\n`,
    },
    ['--change', 'change-a']
  );

  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stderr, /ACTIVE_SPEC_CONFLICT/u);
});

// 同じ要件を競合する形で変更する複数の活動中Changeが拒否されることを確認する。
void test('異なる活動中 Change の物質的に異なる操作を拒否する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/specs/account/spec.md': createMainSpec(),
    'openspec/changes/change-a/specs/account/spec.md': createDeltaSpec({
      kind: 'MODIFIED',
      requirement: 'アカウント表示',
      scenarioId: 'ACCOUNT-S010',
    }),
    'openspec/changes/change-b/specs/account/spec.md': createDeltaSpec({
      kind: 'MODIFIED',
      requirement: 'アカウント表示',
      scenarioId: 'ACCOUNT-S020',
    }),
    'tests/account.test.ts': `test('${scenarioReference('ACCOUNT-S020')} latest overlay', () => {});\n`,
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /ACTIVE_SPEC_CONFLICT/u);
});

// 実効仕様で同じScenario IDが異なる振る舞いへ割り当てられないことを確認する。
void test('実効仕様内で重複する Scenario ID を拒否する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/changes/add-account/specs/account/spec.md': `${createDeltaSpec()}
### Requirement: アカウント削除

#### Scenario: アカウントを削除する (ACCOUNT-S002)

- **WHEN** 利用者が削除する
- **THEN** アカウントが削除される
`,
    'tests/account.test.ts': `test('${scenarioReference('ACCOUNT-S002')} account operation', () => {});\n`,
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Duplicate Scenario ID 'ACCOUNT-S002'/u);
});

// 自動化できない理由を明示したScenarioだけが試験参照の対象外になることを確認する。
void test('[WORKSPACE-GOVERNANCE-S012] Tags: manual は試験参照を要求しない', () => {
  const result = runGuardInFixture(
    guardScriptPath,
    {
      'openspec/changes/add-account/specs/account/spec.md': createDeltaSpec({ manual: true }),
    },
    ['--change', 'add-account', '--require-test-references']
  );

  assert.equal(result.status, 0);
});

// 自動化対象Scenarioに対応する試験題名がない状態を検出することを確認する。
void test('自動化対象 Scenario の参照欠落を拒否する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/specs/account/spec.md': createMainSpec(),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing test reference 'ACCOUNT-S001'/u);
});

// 仕様から削除されたScenarioを試験題名が参照し続ける状態を検出することを確認する。
void test('実効仕様にない試験参照を拒否する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'tests/account.test.ts': `test('${scenarioReference('ACCOUNT-S999')} orphan', () => {});\n`,
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Orphan test reference 'ACCOUNT-S999'/u);
});

// MODIFIED操作が旧Scenarioを残さず新しいScenarioへ置き換えることを確認する。
void test('実装完了時の MODIFIED は旧 Scenario 参照を孤立として拒否する', () => {
  const result = runGuardInFixture(
    guardScriptPath,
    {
      'openspec/specs/account/spec.md': createMainSpec(),
      'openspec/changes/change-account/specs/account/spec.md': createDeltaSpec({
        kind: 'MODIFIED',
        requirement: 'アカウント表示',
        scenarioId: 'ACCOUNT-S010',
      }),
      'tests/account.test.ts': `test('${scenarioReference('ACCOUNT-S001')} obsolete', () => {});\ntest('${scenarioReference('ACCOUNT-S010')} current', () => {});\n`,
    },
    ['--change', 'change-account', '--require-test-references']
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Orphan test reference 'ACCOUNT-S001'/u);
});

// 全体相互作用検査が置換済みの旧Scenario参照を再要求しないことを確認する。
void test('全体検査は MODIFIED 実装後に旧 Scenario 参照を要求しない', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/specs/account/spec.md': createMainSpec(),
    'openspec/changes/change-account/specs/account/spec.md': createDeltaSpec({
      kind: 'MODIFIED',
      requirement: 'アカウント表示',
      scenarioId: 'ACCOUNT-S010',
    }),
    'tests/account.test.ts': `test('${scenarioReference('ACCOUNT-S010')} current', () => {});\n`,
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /coverage: OK/u);
});

// 仕様単位の目的を欠く差分が意味不明なまま受理されないことを確認する。
void test('差分仕様に Purpose を要求する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/changes/add-account/specs/account/spec.md': createDeltaSpec().replace(
      '## Purpose',
      '## Context'
    ),
    'tests/account.test.ts': `test('${scenarioReference('ACCOUNT-S002')} create', () => {});\n`,
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /## Purpose が必要/u);
});

// 入力誤りで存在しないChangeを指定した場合に明示的に失敗することを確認する。
void test('存在しない --change の指定を拒否する', () => {
  const result = runGuardInFixture(guardScriptPath, {}, ['--change', 'missing-change']);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /存在しません/u);
});
