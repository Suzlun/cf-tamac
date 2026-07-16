import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { collectActiveChangeArtifacts } from '#openspec/change-artifacts';

// OpenSpec の未アーカイブ Change だけを検査し、過去の履歴や恒久的な運用文書を対象外にします。
const TASK_FILE_NAME = 'tasks.md';
const DESIGN_FILE_NAME = 'design.md';
const TASK_LINE_PATTERN = /^- \[[ Xx]] /;
const RELEASE_PROCEDURE_HEADING_PATTERN = /^##\s+(?:Release Procedure|リリース手順)\s*$/imu;
const COMPLETION_SECTION_PATTERN =
  /^##\s+(?:Merge Verification|Acceptance Criteria|マージ検証|受入条件)\s*$/imu;
const TOP_LEVEL_HEADING_PATTERN = /^##\s+/u;

// 実行環境へ副作用を起こす作業だけを検出し、repository 内の設定・CI 定義を編集する作業は許可します。
const EXTERNAL_OPERATION_PATTERNS = [
  {
    label: 'リリースまたはデプロイの実行',
    pattern:
      /(?:\b(?:run|execute|perform)\s+(?:a\s+)?(?:release|deployment)\b|(?:リリース|デプロイ)(?:を|の)?(?:実行|実施)|\bwrangler\s+deploy\s+(?:を|して|する|実行))/iu,
  },
  {
    label: '外部環境のプロビジョニング',
    pattern:
      /(?:(?:本番|production|staging|ステージング).{0,32}(?:環境|resource|リソース).{0,24}(?:作成|準備|provision)|(?:環境|resource|リソース).{0,24}(?:provision|プロビジョニング|作成).{0,32}(?:本番|production|staging|ステージング))/iu,
  },
  {
    label: '認証情報の取得・確認・検証',
    pattern:
      /(?:(?:credential|credentials|認証情報|アクセストークン|API token|secret).{0,32}(?:取得|入力|要求|確認|検証|probe)|(?:取得|入力|要求|確認|検証|probe).{0,32}(?:credential|credentials|認証情報|アクセストークン|API token|secret))/iu,
  },
  {
    label: '外部承認または運用担当者への依頼',
    pattern:
      /(?:(?:外部|運用担当|operator|第三者).{0,32}(?:承認|approval|許可|依頼|確認)|(?:承認|approval|許可|依頼|確認).{0,32}(?:外部|運用担当|operator|第三者))/iu,
  },
  {
    label: 'staging または production の検証',
    pattern:
      /(?:(?:本番|production|staging|ステージング).{0,32}(?:確認|検証|テスト|接続|リハーサル|rehearsal|監視|観測|observation)|(?:確認|検証|テスト|接続|リハーサル|rehearsal|監視|観測|observation).{0,32}(?:本番|production|staging|ステージング))/iu,
  },
  {
    label: 'production bookmark',
    pattern:
      /(?:production|本番).{0,32}(?:bookmark|ブックマーク)|(?:bookmark|ブックマーク).{0,32}(?:production|本番)/iu,
  },
];

/**
 * tasks.md の各 checkbox task と、その下に続く補足行を一つの検査単位へまとめる。
 *
 * @param {string} source - tasks.md の完全な内容。
 * @returns {{ line: number; text: string }[]} 各 task の開始行と検査対象テキスト。
 */
function collectTaskBlocks(source) {
  const taskBlocks = [];
  const lines = source.split(/\r?\n/u);
  let currentTask = null;

  for (const [index, line] of lines.entries()) {
    if (TASK_LINE_PATTERN.test(line)) {
      if (currentTask) taskBlocks.push(currentTask);
      currentTask = { line: index + 1, text: line };
      continue;
    }

    if (currentTask && TOP_LEVEL_HEADING_PATTERN.test(line)) {
      taskBlocks.push(currentTask);
      currentTask = null;
      continue;
    }

    if (currentTask) currentTask.text += `\n${line}`;
  }

  if (currentTask) taskBlocks.push(currentTask);
  return taskBlocks;
}

/**
 * 検査対象テキストが Change 外の実運用を要求していないかを識別する。
 *
 * @param {string} text - task または完了条件のテキスト。
 * @returns {string | null} 違反カテゴリ。違反がない場合は `null`。
 */
function getExternalOperationLabel(text) {
  return EXTERNAL_OPERATION_PATTERNS.find(({ pattern }) => pattern.test(text))?.label ?? null;
}

/**
 * design.md から merge 完了の根拠になる section だけを抽出する。
 *
 * @param {string} source - design.md の完全な内容。
 * @returns {{ line: number; text: string }[]} 検査対象 section の開始行とテキスト。
 */
function collectCompletionSections(source) {
  const sections = [];
  const lines = source.split(/\r?\n/u);
  let currentSection = null;

  for (const [index, line] of lines.entries()) {
    if (COMPLETION_SECTION_PATTERN.test(line)) {
      if (currentSection) sections.push(currentSection);
      currentSection = { line: index + 1, text: line };
      continue;
    }

    if (currentSection && TOP_LEVEL_HEADING_PATTERN.test(line)) {
      sections.push(currentSection);
      currentSection = null;
      continue;
    }

    if (currentSection) currentSection.text += `\n${line}`;
  }

  if (currentSection) sections.push(currentSection);
  return sections;
}

/**
 * 検査失敗を artifact の相対パスと行番号付きで蓄積する。
 *
 * @param {string[]} errors - 出力する失敗メッセージの配列。
 * @param {string} absolutePath - 違反がある artifact の絶対パス。
 * @param {number} line - 違反箇所の 1 始まり行番号。
 * @param {string} label - 違反した外部操作のカテゴリ。
 */
function addExternalOperationError(errors, absolutePath, line, label) {
  const relativePath = path.relative(process.cwd(), absolutePath);
  errors.push(
    `${relativePath}:${line}: ${label} は Change の task、受入条件、完了条件に含められません。repository-local または CI で検証できる作業へ置き換えてください。`
  );
}

const errors = [];

// 未アーカイブ Change がないリポジトリでも lint を成功させ、将来の Change 作成時から同じ境界を強制します。
for (const taskPath of collectActiveChangeArtifacts(
  process.cwd(),
  (_absolutePath, fileName) => fileName === TASK_FILE_NAME
)) {
  const taskSource = readFileSync(taskPath, 'utf8');
  for (const task of collectTaskBlocks(taskSource)) {
    const label = getExternalOperationLabel(task.text);
    if (label) addExternalOperationError(errors, taskPath, task.line, label);
  }
}

for (const designPath of collectActiveChangeArtifacts(
  process.cwd(),
  (_absolutePath, fileName) => fileName === DESIGN_FILE_NAME
)) {
  const designSource = readFileSync(designPath, 'utf8');
  const releaseProcedureLine = designSource
    .split(/\r?\n/u)
    .findIndex((line) => RELEASE_PROCEDURE_HEADING_PATTERN.test(line));
  if (releaseProcedureLine >= 0) {
    const relativePath = path.relative(process.cwd(), designPath);
    errors.push(
      `${relativePath}:${releaseProcedureLine + 1}: Release Procedure は Change の artifact に含められません。merge 検証を記述し、リリース影響は pull request template に記録してください。`
    );
  }

  for (const section of collectCompletionSections(designSource)) {
    const label = getExternalOperationLabel(section.text);
    if (label) addExternalOperationError(errors, designPath, section.line, label);
  }
}

if (errors.length > 0) {
  process.stderr.write(
    `OpenSpec Change task scope guard failed:\n${errors.map((error) => `- ${error}`).join('\n')}\n`
  );
  process.exitCode = 1;
}
