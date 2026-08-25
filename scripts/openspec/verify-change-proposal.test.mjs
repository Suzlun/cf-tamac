import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

import { runGuardInFixture } from '#openspec/guard-test-fixture';

const guardScriptPath = fileURLToPath(new URL('./verify-change-proposal.mjs', import.meta.url));

/**
 * 条件分岐の検査に使う、完全な提案の基準内容を生成する。
 *
 * @param {{ uxMode?: string; uxDetails?: string }} [options] - 差し替える UX モードと証跡。
 * @returns {string} proposal.md として有効な内容。
 */
function createResolvedProposal({
  uxMode = 'NONE',
  uxDetails = '利用者に見える画面または操作は変化しない。',
} = {}) {
  return `UX-Mode: ${uxMode}

## Outcome

利用者が一貫した仕様に基づく成果を得られる。

## Why

活動中の仕様差分を含めなければ、実装前の不整合を検出できないため。

## Confirmed Change Boundary

- 活動中の仕様差分を検査対象に含める。

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

## Observable Success

- 活動中の差分にあるシナリオが検査される。

`;
}

// 必須の提案構造が揃っていれば受理されることを確認する。
void test('完全な提案を許可する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/changes/example/proposal.md': createResolvedProposal(),
  });

  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
});

// プライマリエージェントが確認済みRequestだけを先に保存できることを確認する。
void test('proposal.md 作成前の request.md だけを許可する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/changes/example/request.md':
      'Request-Status: CONFIRMED\n\n## Request\n\n確認済み要求。\n',
  });

  assert.equal(result.status, 0);
});

// 提案を経ずに仕様差分だけを作成する経路が拒否されることを確認する。
void test('proposal.md がない後続成果物を拒否する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/changes/example/request.md': 'Request-Status: CONFIRMED\n',
    'openspec/changes/example/specs/account/spec.md': '## Purpose\n\nアカウントを扱う。\n',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /proposal\.md が必要/u);
});

// 規定外の提案構造が拒否されることを確認する。
void test('[WORKSPACE-GOVERNANCE-S025] 指定外の提案見出しを拒否する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/changes/example/proposal.md': createResolvedProposal().replace(
      '## Confirmed Change Boundary',
      '## Scope'
    ),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Confirmed Change Boundary/u);
});

// 解決済み提案に未確定の仮記述を残せないことを確認する。
void test('解決済み提案に残る placeholder を拒否する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/changes/example/proposal.md': `${createResolvedProposal()}\n<!-- TODO: 未解決 -->\n`,
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /TODO または TBD/u);
});

// 成功条件が空の提案を形式だけで受理しないことを確認する。
void test('提案の空の成功条件を拒否する', () => {
  const result = runGuardInFixture(guardScriptPath, {
    'openspec/changes/example/proposal.md': createResolvedProposal().replace(
      '- 活動中の差分にあるシナリオが検査される。',
      '-'
    ),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Observable Success に内容がありません/u);
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
