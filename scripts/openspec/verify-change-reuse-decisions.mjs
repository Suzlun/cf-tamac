import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { collectActiveChangeDirectories } from '#openspec/change-artifacts';

const DESIGN_FILE_NAME = 'design.md';
const REUSE_HEADING = 'Reuse Assessment';
const EXPECTED_COLUMNS = [
  'Spec Unit',
  'Reusable Capability',
  'Source Classification',
  'Decision',
  'Selected Reuse / Version',
  'Research Evidence',
  'Limited Complement Justification',
];
const SOURCE_CLASSIFICATIONS = new Set([
  'REPOSITORY_CODE',
  'WORKSPACE_PACKAGE',
  'DIRECT_DEPENDENCY',
  'REPOSITORY_DEPENDENCY',
  'TRANSITIVE_ONLY',
  'NEW_EXTERNAL',
  'EXISTING_UPDATE',
  'NO_REUSABLE_CANDIDATE',
]);
const DECISIONS = new Set(['REUSE', 'ADOPT', 'UPDATE', 'REPLACE', 'LIMITED_COMPLEMENT']);
const RESEARCH_REPORT_PATTERN = /docs\/report\/research\/[\w./-]+\.md(?::\d+(?:-\d+)?)?/gu;

/**
 * Markdownセルの構造用記号と前後空白を除去する。
 *
 * @param {string} value - 表から読み取ったセル値。
 * @returns {string} 比較と検査に使う正規化済み値。
 */
function normalizeCell(value) {
  return value.trim().replace(/^`|`$/gu, '');
}

/**
 * 指定見出しの本文を次の第2階層見出し直前まで取得する。
 *
 * @param {string} source - design.mdの完全な内容。
 * @param {string} headingName - 取得する第2階層見出し名。
 * @returns {{ body: string; line: number } | null} 本文と見出し行。見出しがなければ`null`。
 */
function readLevelTwoSection(source, headingName) {
  const lines = source.split(/\r?\n/u);
  const startIndex = lines.findIndex((line) => line.trim() === `## ${headingName}`);
  if (startIndex < 0) return null;
  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (/^##\s+/u.test(lines.at(index) ?? '')) {
      endIndex = index;
      break;
    }
  }
  return { body: lines.slice(startIndex + 1, endIndex).join('\n'), line: startIndex + 1 };
}

/**
 * Markdown表を見出しとデータ行へ分解する。
 *
 * @param {string} source - Reuse Assessment節の本文。
 * @param {number} sectionLine - design.md内の節見出し行。
 * @returns {{ headers: string[]; rows: { cells: string[]; line: number }[] } | null} 表構造。表がなければ`null`。
 */
function parseMarkdownTable(source, sectionLine) {
  const lines = source.split(/\r?\n/u);
  const headerIndex = lines.findIndex((line, index) => {
    const nextLine = lines.at(index + 1) ?? '';
    return /^\s*\|.*\|\s*$/u.test(line) && /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/u.test(nextLine);
  });
  if (headerIndex < 0) return null;
  const splitRow = (line) => line.trim().slice(1, -1).split('|').map(normalizeCell);
  const rows = [];
  for (let index = headerIndex + 2; index < lines.length; index += 1) {
    const line = lines.at(index) ?? '';
    if (!/^\s*\|.*\|\s*$/u.test(line)) break;
    rows.push({ cells: splitRow(line), line: sectionLine + index + 1 });
  }
  return { headers: splitRow(lines.at(headerIndex) ?? ''), rows };
}

/**
 * Change配下のdelta Spec Unitをディレクトリ名から収集する。
 *
 * @param {string} changeDirectory - 活動中Changeの絶対パス。
 * @returns {string[]} `specs/`からの相対Spec Unit名。
 */
function collectSpecUnits(changeDirectory) {
  const specsDirectory = path.join(changeDirectory, 'specs');
  if (!existsSync(specsDirectory)) return [];
  const units = [];
  const pending = [specsDirectory];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile() && entry.name === 'spec.md') {
        units.push(
          path.relative(specsDirectory, path.dirname(entryPath)).split(path.sep).join('/')
        );
      }
    }
  }
  return units.sort();
}

/**
 * 調査証拠セルからリポジトリ相対の調査報告パスを抽出する。
 *
 * @param {string} value - Research Evidenceセル。
 * @returns {string[]} 行番号指定を除いた重複なしの報告パス。
 */
function collectResearchReportPaths(value) {
  return [
    ...new Set(
      [...value.matchAll(RESEARCH_REPORT_PATTERN)].map((match) =>
        (match[0] ?? '').replace(/:\d+(?:-\d+)?$/u, '')
      )
    ),
  ];
}

/**
 * 診断へ相対パスと1始まり行番号を付与する。
 *
 * @param {string[]} errors - 診断を蓄積する配列。
 * @param {string} absolutePath - 問題がある成果物の絶対パス。
 * @param {number} line - 1始まり行番号。
 * @param {string} message - 修正方法が判断できる説明。
 */
function addError(errors, absolutePath, line, message) {
  errors.push(`${path.relative(process.cwd(), absolutePath)}:${String(line)}: ${message}`);
}

const errors = [];

for (const changeDirectory of collectActiveChangeDirectories(process.cwd())) {
  const designPath = path.join(changeDirectory, DESIGN_FILE_NAME);
  if (!existsSync(designPath)) continue;

  const specUnits = collectSpecUnits(changeDirectory);
  const designSource = readFileSync(designPath, 'utf8');
  const section = readLevelTwoSection(designSource, REUSE_HEADING);
  if (!section) {
    addError(errors, designPath, 1, `architecture-changeには## ${REUSE_HEADING}が必要です。`);
    continue;
  }
  const table = parseMarkdownTable(section.body, section.line);
  if (!table) {
    addError(errors, designPath, section.line, `${REUSE_HEADING}には再利用判断表が必要です。`);
    continue;
  }
  if (table.headers.join('\u0000') !== EXPECTED_COLUMNS.join('\u0000')) {
    addError(
      errors,
      designPath,
      section.line,
      `再利用判断表の列は${EXPECTED_COLUMNS.join('、')}の指定順で記載してください。`
    );
    continue;
  }

  const coveredSpecUnits = new Set();
  const decisions = new Set();
  for (const row of table.rows) {
    if (row.cells.length !== EXPECTED_COLUMNS.length) {
      addError(errors, designPath, row.line, '再利用判断表の列数が見出しと一致しません。');
      continue;
    }
    const [
      specUnit,
      capability,
      sourceClassification,
      decision,
      selectedReuse,
      researchEvidence,
      complementJustification,
    ] = row.cells;
    if (!specUnit || !specUnits.includes(specUnit)) {
      addError(
        errors,
        designPath,
        row.line,
        `Spec Unit '${specUnit ?? ''}'はdelta specsに存在しません。`
      );
    } else {
      coveredSpecUnits.add(specUnit);
    }
    if (!capability) addError(errors, designPath, row.line, 'Reusable Capabilityが空です。');
    if (!sourceClassification || !SOURCE_CLASSIFICATIONS.has(sourceClassification)) {
      addError(
        errors,
        designPath,
        row.line,
        `Source Classificationは${[...SOURCE_CLASSIFICATIONS].join('、')}のいずれかでなければなりません。`
      );
    }
    if (!decision || !DECISIONS.has(decision)) {
      addError(
        errors,
        designPath,
        row.line,
        `Decisionは${[...DECISIONS].join('、')}のいずれかでなければなりません。`
      );
    }
    if (!selectedReuse)
      addError(errors, designPath, row.line, 'Selected Reuse / Versionが空です。');
    if (!complementJustification) {
      addError(
        errors,
        designPath,
        row.line,
        'Limited Complement JustificationはLIMITED_COMPLEMENTの根拠またはN/Aを記載してください。'
      );
    }
    const researchPaths = collectResearchReportPaths(researchEvidence ?? '');
    if (researchPaths.length === 0) {
      addError(
        errors,
        designPath,
        row.line,
        'Research Evidenceにはdocs/report/research配下の報告が必要です。'
      );
    }
    for (const researchPath of researchPaths) {
      if (!existsSync(path.join(process.cwd(), researchPath))) {
        addError(errors, designPath, row.line, `調査報告'${researchPath}'が存在しません。`);
      }
    }
    if (
      decision === 'LIMITED_COMPLEMENT' &&
      (!complementJustification || complementJustification === 'N/A')
    ) {
      addError(
        errors,
        designPath,
        row.line,
        'LIMITED_COMPLEMENTには既存資産と外部候補で代替できない根拠が必要です。'
      );
    }
    if (sourceClassification === 'NO_REUSABLE_CANDIDATE' && decision !== 'LIMITED_COMPLEMENT') {
      addError(
        errors,
        designPath,
        row.line,
        'NO_REUSABLE_CANDIDATEはLIMITED_COMPLEMENTと組み合わせてください。'
      );
    }
    if (
      decision === 'REUSE' &&
      ['REPOSITORY_DEPENDENCY', 'TRANSITIVE_ONLY', 'NEW_EXTERNAL', 'EXISTING_UPDATE'].includes(
        sourceClassification ?? ''
      )
    ) {
      addError(
        errors,
        designPath,
        row.line,
        `${sourceClassification}は対象packageで利用可能な既存採用ではないためREUSEにできません。`
      );
    }
    if (
      (decision === 'UPDATE' && sourceClassification !== 'EXISTING_UPDATE') ||
      (sourceClassification === 'EXISTING_UPDATE' && decision !== 'UPDATE')
    ) {
      addError(
        errors,
        designPath,
        row.line,
        'EXISTING_UPDATEとUPDATEは同じ行で組み合わせてください。'
      );
    }
    const decisionKey = `${specUnit ?? ''}\u0000${capability ?? ''}`;
    if (decisions.has(decisionKey)) {
      addError(
        errors,
        designPath,
        row.line,
        '同じSpec UnitとReusable Capabilityの判断が重複しています。'
      );
    }
    decisions.add(decisionKey);
  }

  for (const specUnit of specUnits) {
    if (!coveredSpecUnits.has(specUnit)) {
      addError(
        errors,
        designPath,
        section.line,
        `Spec Unit '${specUnit}'の再利用判断がありません。`
      );
    }
  }
}

if (errors.length > 0) {
  process.stderr.write(
    `OpenSpec Change reuse decision guard failed:\n${errors.map((error) => `- ${error}`).join('\n')}\n`
  );
  process.exitCode = 1;
}
