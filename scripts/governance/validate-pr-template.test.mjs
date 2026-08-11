import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';

import { it } from 'vitest';

const workflowSource = readFileSync('.github/workflows/validate-pr-template.yml', 'utf8');
const validatorSource = /node <<'NODE'\n(?<source>[\s\S]*?)\n\s+NODE\s*$/u.exec(workflowSource)
  ?.groups?.source;

assert.ok(validatorSource, 'PR本文の検査処理をワークフローから取得できる必要があります。');

/**
 * プルリクエストのひな形を全必須項目が入力済みの本文へ変換します。
 *
 * @param {Record<string, string>} fields - 既定値を上書きする項目名と値。
 * @returns {string} インライン検査器へ渡せるプルリクエスト本文。
 */
function createPullRequestBody(fields = {}) {
  const defaults = {
    目的: '変更運用の検査',
    主な変更: 'プルリクエスト本文の検査契約を更新',
    利用者: '保守担当者',
    改善される体験: '変更の分類を一意に確認できる',
    変更内容: '検査項目を追加',
    'Operation Lane': 'DIRECT',
    'UX Mode': 'NONE',
    'Review Depth': 'STANDARD',
    Issue: 'なし（理由: 関連Issueがないため）',
    'OpenSpec Change': 'なし（理由: 観測可能な振る舞いを変更しないため）',
    'Scenario IDs': 'なし（理由: OpenSpec Changeが不要なため）',
    'UI / UX変更': 'なし',
    'UI / UX変更の説明': 'なし（理由: 表示を変更しないため）',
    影響範囲: 'リポジトリ統治のみ',
    デスクトップ確認: 'なし（理由: UI変更がないため）',
    モバイル確認: 'なし（理由: UI変更がないため）',
    アクセシビリティ確認: 'なし（理由: UI変更がないため）',
    プロダクトデザイナー確認: 'なし（理由: UI変更がないため）',
    DB変更: 'なし（理由: DBを変更しないため）',
    マイグレーション: 'なし（理由: DBを変更しないため）',
    データ影響: 'なし（理由: データを変更しないため）',
    実行した確認: '統治試験',
    未実行の確認と理由: 'なし（理由: 必要な確認を実行したため）',
    重点確認箇所: '変更運用の入力検査',
    環境変数: 'なし（理由: 追加しないため）',
    設定変更: 'プルリクエスト検査のみ',
    運用影響: 'なし（理由: 外部運用を変更しないため）',
    ...fields,
  };

  // ひな形の空欄だけを決定済み値へ置換し、実際の見出しとチェック項目をそのまま検査します。
  let body = readFileSync('.github/pull_request_template.md', 'utf8').replaceAll('- [ ]', '- [x]');
  for (const [label, value] of Object.entries(defaults)) {
    body = body.replace(`- ${label}:`, `- ${label}: ${value}`);
  }
  return body;
}

/**
 * ワークフローに埋め込まれた Node.js 検査器を合成本文に対して実行します。
 *
 * @param {string} body - 検査対象のプルリクエスト本文。
 * @returns {{ status: number | null; stderr: string; stdout: string }} 子処理の終了状態と出力。
 */
function runValidator(body) {
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', validatorSource], {
    encoding: 'utf8',
    env: { ...process.env, PR_BODY: body },
  });
  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
}

// 振る舞いと構造を変えない変更では、理由付きの非該当値が有効な記録になることを確認します。
it('[WORKSPACE-GOVERNANCE-S023] DIRECTの理由付き非該当値を受理する', () => {
  const result = runValidator(createPullRequestBody());
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /検証に成功/u);
});

// 契約または構造を変える運用区分が、対応するChangeとScenarioを省略できないことを確認します。
it('[WORKSPACE-GOVERNANCE-S024] BEHAVIORとARCHITECTUREでOpenSpec情報の省略を拒否する', () => {
  for (const operationLane of ['BEHAVIOR', 'ARCHITECTURE']) {
    const result = runValidator(createPullRequestBody({ 'Operation Lane': operationLane }));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /OpenSpec Change/u);
    assert.match(result.stderr, /Scenario IDs/u);
  }
});

// 正式なChange識別子と安定Scenario IDを持つ構造変更が受理されることを確認します。
it('OpenSpecを使う変更ではChange名と安定Scenario IDを受理する', () => {
  const result = runValidator(
    createPullRequestBody({
      'Operation Lane': 'ARCHITECTURE',
      'Review Depth': 'DEEP',
      'OpenSpec Change': 'adopt-behavior-contract-workflow',
      'Scenario IDs': 'WORKSPACE-GOVERNANCE-S005',
    })
  );
  assert.equal(result.status, 0, result.stderr);
});

// 許可されていない運用値と識別子をまとめて報告し、不正な本文を通さないことを確認します。
it('不正な変更運用値とScenario IDを拒否する', () => {
  const result = runValidator(
    createPullRequestBody({
      'Operation Lane': 'FEATURE',
      'UX Mode': 'REDESIGN',
      'Review Depth': 'FULL',
      'OpenSpec Change': 'adopt-behavior-contract-workflow',
      'Scenario IDs': 'invalid-scenario',
    })
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Operation Lane/u);
  assert.match(result.stderr, /UX Mode/u);
  assert.match(result.stderr, /Review Depth/u);
  assert.match(result.stderr, /Scenario IDs/u);
});

// 実際のUI変更で、設計関与と両表示幅の変更前後画像が必須になることを確認します。
it('UI変更では設計関与と変更前後画像を要求する', () => {
  const result = runValidator(
    createPullRequestBody({
      'Operation Lane': 'BEHAVIOR',
      'UX Mode': 'SHAPE',
      'OpenSpec Change': 'shape-agent-settings',
      'Scenario IDs': 'AGENT-MANAGEMENT-UI-S012',
      'UI / UX変更': 'あり',
    })
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /プロダクトデザイナー確認/u);
  assert.match(result.stderr, /Desktop Before/u);
  assert.match(result.stderr, /Mobile After/u);
});
