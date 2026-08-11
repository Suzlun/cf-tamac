import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

import { runGuardInFixture } from '#openspec/guard-test-fixture';

const guardScriptPath = fileURLToPath(new URL('./verify-change-proposal.mjs', import.meta.url));

/**
 * 条件分岐の検査に使う、解決済み提案の完全な基準内容を生成する。
 *
 * @param {{ resolution?: string; uxMode?: string; uxDetails?: string }} [options] - 差し替える意図解決値と UX 証跡。
 * @returns {string} proposal.md として有効な内容。
 */
function createResolvedProposal({
  resolution = 'REQUEST_SUFFICIENT',
  uxMode = 'NONE',
  uxDetails = '利用者に見える画面または操作は変化しない。',
} = {}) {
  return `Intent-Resolution: ${resolution}
UX-Mode: ${uxMode}

## Outcome

利用者が一貫した仕様に基づく成果を得られる。

## Why

活動中の仕様差分を含めなければ、実装前の不整合を検出できないため。

## Scope

### In Scope

- 活動中の仕様差分を検査対象に含める。

### Out of Scope

- 外部環境での運用は対象外とする。

## Request Classification

| Request Statement | Classification | Resolution |
| --- | --- | --- |
| 仕様差分を検査する | Desired Outcome | 活動中の差分を含む実効仕様を検査する。 |
| 標準ライブラリを使う | Required Means | 実装上の制約として扱う。 |

## Spec Units

### New Spec Units

- \`spec-governance\`: 仕様検査の契約を扱う。

### Modified Spec Units

- なし。既存の仕様単位は変更しない。

## UI / UX Impact

${uxDetails}

## Material Constraints

- 外部依存を追加しない。

## Repository Evidence

| Source | Observation | Relevance |
| --- | --- | --- |
| \`scripts/openspec\` | 検査処理が存在する。 | 共通処理を再利用できる。 |

## Assumptions and Decisions

- Assumptions: なし。対象範囲は依頼で明示されている。
- Decisions: 依頼で指定された成果を採用する。

## Observable Success

- 活動中の差分にあるシナリオが検査される。

## Confirmation Evidence

- 依頼文が成果、範囲、制約を明示している。
`;
}

// 依頼だけで意図が確定した提案は、確認待ちに戻さず後続成果物へ進めることを確認する。
void test('REQUEST_SUFFICIENT の完全な提案を許可する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/changes/example/proposal.md': createResolvedProposal(),
  });

  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
});

// 意図確認中の提案は、後続成果物がなければ安全に保存できることを確認する。
void test('後続成果物のない DRAFT 提案を許可する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/changes/example/proposal.md':
      'Intent-Resolution: DRAFT\nUX-Mode: NONE\n\n<!-- TODO: 意図を確認する。 -->\n',
  });

  assert.equal(result.status, 0);
});

// 提案を経ずに仕様差分だけを作成する経路が拒否されることを確認する。
void test('proposal.md がない後続成果物を拒否する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/changes/example/specs/account/spec.md': '## Purpose\n\nアカウントを扱う。\n',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /proposal\.md が必要/u);
});

// 未確定の意図を設計や作業台帳へ固定する経路が拒否されることを確認する。
void test('[WORKSPACE-GOVERNANCE-S025] DRAFT 提案の後続成果物を拒否する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/changes/example/proposal.md': 'Intent-Resolution: DRAFT\nUX-Mode: NONE\n',
    'openspec/changes/example/tasks.md': '## Work Packages\n',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /DRAFT の間/u);
});

// 解決済み提案に未確定の仮記述を残せないことを確認する。
void test('解決済み提案に残る placeholder を拒否する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/changes/example/proposal.md': `${createResolvedProposal()}\n<!-- TODO: 未解決 -->\n`,
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /TODO または TBD/u);
});

// 意図解決の根拠が空の提案を、形式だけで受理しないことを確認する。
void test('解決済み提案の空の確認証跡を拒否する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/changes/example/proposal.md': createResolvedProposal().replace(
      '- 依頼文が成果、範囲、制約を明示している。',
      '-'
    ),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Confirmation Evidence に内容がありません/u);
});

// 成果と手段を分離する分類語彙以外が提案へ混入しないことを確認する。
void test('指定外の分類を拒否する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/changes/example/proposal.md': createResolvedProposal().replace(
      'Desired Outcome',
      'Implementation'
    ),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Implementation.*許可されていません/u);
});

// 既存体験を維持する判断には、維持対象を特定する根拠が必要なことを確認する。
void test('CONTINUITY に既存体験の根拠を要求する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/changes/example/proposal.md': createResolvedProposal({ uxMode: 'CONTINUITY' }),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Continuity Source/u);
});

// 体験を形成する変更には、中心作業と体験方向の両方が必要なことを確認する。
void test('SHAPE に中心作業と体験方向を要求する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/changes/example/proposal.md': createResolvedProposal({
      resolution: 'OWNER_CONFIRMED',
      uxMode: 'SHAPE',
      uxDetails: '### Primary User Task\n\n利用者が仕様を確認する。',
    }),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /UX Direction/u);
});

// UX判断の証跡が専用区間の外へ分散し、提案の読み取りを曖昧にしないことを確認する。
void test('UX 固有見出しを UI / UX Impact の外へ置くことを拒否する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/changes/example/proposal.md': createResolvedProposal({
      uxMode: 'CONTINUITY',
      uxDetails: '既存の画面構成を維持する。',
    }).replace(
      '## Material Constraints',
      '## Material Constraints\n\n### Continuity Source\n\n`packages/client` の既存画面。'
    ),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /UI \/ UX Impact 内/u);
});

// 過去の契約形式を保持したアーカイブが、現在の提案契約を阻害しないことを確認する。
void test('archive 配下の履歴は検査しない', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/changes/archive/example/tasks.md': '不完全な履歴',
  });

  assert.equal(result.status, 0);
});
