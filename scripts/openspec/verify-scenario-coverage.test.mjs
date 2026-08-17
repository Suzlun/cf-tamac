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
 * @param {{ kind?: string; requirement?: string; scenarioId?: string }} [options] - 差分操作とScenarioの内容。
 * @returns {string} OpenSpec 差分仕様の内容。
 */
function createDeltaSpec({
  kind = 'ADDED',
  requirement = 'アカウント作成',
  scenarioId = 'ACCOUNT-S002',
} = {}) {
  return `## Purpose

利用者のアカウント操作を保証する。

## ${kind} Requirements

### Requirement: ${requirement}

システムは要求された結果を返さなければならない。

#### Scenario: 要求された結果を返す (${scenarioId})

- **WHEN** 利用者が操作する
- **THEN** 要求された結果が表示される
`;
}

// 主仕様と全活動中差分を重ねたScenarioをPlaywright E2E試験題名から検査できることを確認する。
void test('[WORKSPACE-GOVERNANCE-S005] 全活動中差分とPlaywright E2E試験を検査する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/specs/account/spec.md': createMainSpec(),
    'openspec/changes/add-account/specs/account/spec.md': createDeltaSpec(),
    'tests/e2e/account.spec.ts': `test('${scenarioReference('ACCOUNT-S001')} display', () => {});\ntest('${scenarioReference('ACCOUNT-S002')} create', () => {});\n`,
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /validation: OK/u);
});

// ScenarioからPlaywright E2E試験への参照を要求しないことを確認する。
void test('ScenarioにPlaywright E2E試験参照を要求しない', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/specs/account/spec.md': createMainSpec(),
    'openspec/changes/add-account/specs/account/spec.md': createDeltaSpec(),
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /validation: OK/u);
});

// 廃止した試験参照必須オプションを受け付けないことを確認する。
void test('廃止した試験参照必須オプションを拒否する', () => {
  const result = runGuardInFixture(
    guardScriptPath,
    {
      'openspec/specs/account/spec.md': createMainSpec(),
      'openspec/changes/add-account/specs/account/spec.md': createDeltaSpec(),
    },
    ['--change', 'add-account', '--require-test-references']
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage:/u);
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
      'tests/e2e/account.spec.ts': `test('${scenarioReference('ACCOUNT-S001')} main', () => {});\ntest('${scenarioReference('ACCOUNT-S010')} selected overlay', () => {});\n`,
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
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Duplicate Scenario ID 'ACCOUNT-S002'/u);
});

// Scenario参照がなくても仕様構造の検査を通過することを確認する。
void test('Scenario参照がなくても仕様検査を通過する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/specs/account/spec.md': createMainSpec(),
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /validation: OK/u);
});

// 実効仕様にないPlaywright E2E試験参照を検出することを確認する。
void test('実効仕様にないPlaywright E2E試験参照を拒否する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'tests/e2e/account.spec.ts': "test('[ACCOUNT-S999] orphan', () => {});\n",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Orphan Playwright E2E reference 'ACCOUNT-S999'/u);
});

// @playwright/testの名前付き別名を読み取って孤立参照を検出することを確認する。
void test('別名で読み込んだPlaywright testのScenario IDを検査する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'tests/e2e/account.spec.ts':
      "import { test as e2e } from '@playwright/test';\ne2e('[ACCOUNT-S999] orphan', () => {});\n",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Orphan Playwright E2E reference 'ACCOUNT-S999'/u);
});

// @playwright/testの名前空間とonly修飾子を読み取ることを確認する。
void test('Playwright名前空間の修飾testにあるScenario IDを検査する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'tests/e2e/account.spec.ts':
      "import * as playwright from '@playwright/test';\nplaywright.test.only('[ACCOUNT-S999] orphan', () => {});\n",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Orphan Playwright E2E reference 'ACCOUNT-S999'/u);
});

// Playwright以外の別名・名前空間とdescribe、コメント、文字列例を追跡しないことを確認する。
void test('Playwright以外から読み込んだtest別名と名前空間を追跡対象にしない', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'tests/e2e/account.spec.ts':
      "import { test as helperTest } from './helper';\nimport * as helper from './helper';\nhelperTest('[ACCOUNT-S999] alias', () => {});\nhelper.test('[ACCOUNT-S998] namespace', () => {});\n",
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /validation: OK/u);
});

void test('単体試験とE2E試験題名以外のScenario IDを追跡対象にしない', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'packages/account/account.test.ts': "test('[ACCOUNT-S998] unit', () => {});\n",
    'tests/e2e/account.spec.ts':
      "// test('[ACCOUNT-S999] note', () => {});\nconst example = \"test('[ACCOUNT-S997] string')\";\ntest.describe('[ACCOUNT-S996] group', () => {});\ntest('scenario reference is absent', () => {});\n",
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /validation: OK/u);
});

// 活動中差分のScenarioを全体検査の参照先として認識することを確認する。
void test('全体検査は活動中差分のScenarioをE2E参照先として認識する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/specs/account/spec.md': createMainSpec(),
    'openspec/changes/change-account/specs/account/spec.md': createDeltaSpec({
      kind: 'MODIFIED',
      requirement: 'アカウント表示',
      scenarioId: 'ACCOUNT-S010',
    }),
    'tests/e2e/account.spec.ts': "test('[ACCOUNT-S010] current', () => {});\n",
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /validation: OK/u);
});

// 仕様単位の目的を欠く差分が意味不明なまま受理されないことを確認する。
void test('差分仕様に Purpose を要求する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/changes/add-account/specs/account/spec.md': createDeltaSpec().replace(
      '## Purpose',
      '## Context'
    ),
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
