import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import ts from 'typescript';

import { collectActiveChangeDirectories, isDirectory } from '#openspec/change-artifacts';

const SCENARIO_ID_PATTERN = /^[\dA-Z]+(?:-[\dA-Z]+)*-S\d{3,}$/;
const SCENARIO_REF_PATTERN = /\[(?<id>[\dA-Z]+(?:-[\dA-Z]+)*-S\d{3,})\]/gu;
const DELTA_HEADING_PATTERN = /^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements\s*$/u;
const REQUIREMENT_HEADING_PATTERN = /^###\s+Requirement:\s+(.+?)\s*$/u;
const SCENARIO_HEADING_PATTERN = /^####\s+Scenario:\s+(.+)$/u;
const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:mjs|ts|tsx)$/u;
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.wrangler',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
]);

/**
 * @typedef {'BASE' | 'ADDED' | 'MODIFIED' | 'REMOVED' | 'RENAMED'} OperationKind
 */

/**
 * @typedef {{ id: string; relPath: string; line: number }} Scenario
 */

/**
 * @typedef {{
 *   kind: OperationKind;
 *   capability: string;
 *   requirement: string;
 *   target: string;
 *   replacement: string | null;
 *   scenarios: Scenario[];
 *   normalizedContent: string;
 *   absPath: string;
 *   relPath: string;
 *   line: number;
 *   changeId: string | null;
 * }} RequirementOperation
 */

/**
 * HTML コメントを改行だけに置換し、テンプレート例を仕様本文として解析しないようにする。
 *
 * @param {string} source - 仕様ファイルの完全な内容。
 * @returns {string} 元の行番号を維持した解析用内容。
 */
function removeHtmlComments(source) {
  return source.replace(/<!--[\s\S]*?-->/gu, (comment) =>
    '\n'.repeat(comment.split(/\r?\n/u).length - 1)
  );
}

/**
 * ディレクトリ配下から条件に合う通常ファイルを再帰的かつ安定した順序で収集する。
 *
 * @param {string} absoluteDirectory - 探索を開始する絶対パス。
 * @param {(absolutePath: string) => boolean} includeFile - ファイルを採用する条件。
 * @returns {string[]} 条件に合う絶対パス。
 */
function collectFiles(absoluteDirectory, includeFile) {
  if (!isDirectory(absoluteDirectory)) return [];

  const files = [];
  const pending = [absoluteDirectory];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (entry.isFile() && includeFile(entryPath)) files.push(entryPath);
    }
  }
  return files.sort();
}

/**
 * 比較対象の Markdown を空白差に影響されない文字列へ正規化する。
 *
 * @param {string} source - 要件または改名操作の本文。
 * @returns {string} 前後と連続空白を正規化した内容。
 */
function normalizeContent(source) {
  return source.replace(/\s+/gu, ' ').trim();
}

/**
 * Scenario 見出し末尾から安定識別子を取得し、不正な見出しを行番号付きエラーへ変換する。
 *
 * @param {string} headingBody - `Scenario:` より後ろの見出し内容。
 * @param {string} relPath - リポジトリ相対パス。
 * @param {number} line - 1 始まりの行番号。
 * @returns {{ id: string | null; error: string | null }} 取得した識別子またはエラー。
 */
function extractScenarioId(headingBody, relPath, line) {
  const match = /\(([^)]+)\)\s*$/u.exec(headingBody);
  if (!match?.[1]) {
    return {
      id: null,
      error: `${relPath}:${String(line)}: Scenario 見出しの末尾に安定 ID が必要です。`,
    };
  }

  const id = match[1].trim();
  if (!SCENARIO_ID_PATTERN.test(id)) {
    return {
      id: null,
      error: `${relPath}:${String(line)}: Scenario ID '${id}' は ${String(SCENARIO_ID_PATTERN)} に一致しません。`,
    };
  }
  return { id, error: null };
}

/**
 * 要件本文に含まれる Scenario を抽出し、識別子形式を同時に検査する。
 *
 * @param {string[]} lines - 仕様ファイル全体の行配列。
 * @param {number} startIndex - 要件見出しの 0 始まり行位置。
 * @param {number} endIndex - 次の要件または節の 0 始まり行位置。
 * @param {string} relPath - リポジトリ相対パス。
 * @returns {{ scenarios: Scenario[]; errors: string[] }} 抽出結果と構文エラー。
 */
function parseScenarios(lines, startIndex, endIndex, relPath) {
  const scenarios = [];
  const errors = [];
  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const body = SCENARIO_HEADING_PATTERN.exec(lines.at(index) ?? '')?.[1];
    if (!body) continue;

    const extracted = extractScenarioId(body, relPath, index + 1);
    if (extracted.error || !extracted.id) {
      errors.push(
        extracted.error ?? `${relPath}:${String(index + 1)}: Scenario 見出しが不正です。`
      );
      continue;
    }
    scenarios.push({
      id: extracted.id,
      relPath,
      line: index + 1,
    });
  }
  return { scenarios, errors };
}

/**
 * 差分仕様の Purpose が存在し、コメント以外の目的説明を持つことを確認する。
 *
 * @param {string[]} lines - コメントを除いた仕様ファイルの行配列。
 * @param {string} relPath - リポジトリ相対パス。
 * @returns {string[]} Purpose に関する検査エラー。
 */
function validateDeltaPurpose(lines, relPath) {
  const purposeIndex = lines.findIndex((line) => /^## Purpose\s*$/u.test(line));
  if (purposeIndex < 0) return [`${relPath}:1: 活動中の差分仕様には ## Purpose が必要です。`];

  const nextSectionOffset = lines.slice(purposeIndex + 1).findIndex((line) => /^##\s+/u.test(line));
  const endIndex = nextSectionOffset < 0 ? lines.length : purposeIndex + 1 + nextSectionOffset;
  const body = lines
    .slice(purposeIndex + 1, endIndex)
    .join('\n')
    .trim();
  return body === ''
    ? [`${relPath}:${String(purposeIndex + 1)}: ## Purpose に目的を記載してください。`]
    : [];
}

/**
 * 一つの主仕様または差分仕様を要件操作へ変換する。
 *
 * @param {string} absolutePath - 解析対象仕様の絶対パス。
 * @param {{ repositoryRoot: string; delta: boolean; changeId: string | null }} context - 配置と差分種別。
 * @returns {{ operations: RequirementOperation[]; errors: string[] }} 要件操作と解析エラー。
 */
function parseSpecFile(absolutePath, context) {
  const relPath = path.relative(context.repositoryRoot, absolutePath);
  const capability = path.basename(path.dirname(absolutePath));
  const source = removeHtmlComments(readFileSync(absolutePath, 'utf8'));
  const lines = source.split(/\r?\n/u);
  const operations = [];
  const errors = context.delta ? validateDeltaPurpose(lines, relPath) : [];
  let operationKind = context.delta ? null : 'BASE';

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines.at(index) ?? '';
    const deltaHeading = DELTA_HEADING_PATTERN.exec(line)?.[1];
    if (deltaHeading) {
      operationKind = /** @type {OperationKind} */ (deltaHeading);
      continue;
    }

    if (context.delta && /^##\s+/u.test(line) && !/^## Purpose\s*$/u.test(line)) {
      errors.push(
        `${relPath}:${String(index + 1)}: 差分仕様では Purpose と規定の Requirements 節だけを使用できます。`
      );
      operationKind = null;
      continue;
    }

    // RENAMED は OpenSpec の FROM/TO 対で表現され、要件本文を持たないため専用に解析する。
    if (operationKind === 'RENAMED') {
      const from = /^-\s+FROM:\s+`?### Requirement:\s+(.+?)`?\s*$/u.exec(line)?.[1];
      if (!from) continue;
      const to = /^-\s+TO:\s+`?### Requirement:\s+(.+?)`?\s*$/u.exec(
        lines.at(index + 1) ?? ''
      )?.[1];
      if (!to) {
        errors.push(
          `${relPath}:${String(index + 1)}: RENAMED Requirements の FROM には直後の TO が必要です。`
        );
        continue;
      }
      operations.push({
        kind: 'RENAMED',
        capability,
        requirement: from.trim(),
        target: normalizeContent(from),
        replacement: to.trim(),
        scenarios: [],
        normalizedContent: normalizeContent(`${from}->${to}`),
        absPath: absolutePath,
        relPath,
        line: index + 1,
        changeId: context.changeId,
      });
      index += 1;
      continue;
    }

    const requirement = REQUIREMENT_HEADING_PATTERN.exec(line)?.[1];
    if (!requirement) continue;
    if (operationKind === null) {
      errors.push(
        `${relPath}:${String(index + 1)}: Requirement は規定の差分節内に配置してください。`
      );
      continue;
    }

    let endIndex = index + 1;
    while (endIndex < lines.length) {
      if (
        REQUIREMENT_HEADING_PATTERN.test(lines.at(endIndex) ?? '') ||
        /^##\s+/u.test(lines.at(endIndex) ?? '')
      )
        break;
      endIndex += 1;
    }
    const parsedScenarios = parseScenarios(lines, index, endIndex, relPath);
    errors.push(...parsedScenarios.errors);
    operations.push({
      kind: operationKind,
      capability,
      requirement: requirement.trim(),
      target: normalizeContent(requirement),
      replacement: null,
      scenarios: parsedScenarios.scenarios,
      normalizedContent: normalizeContent(lines.slice(index, endIndex).join('\n')),
      absPath: absolutePath,
      relPath,
      line: index + 1,
      changeId: context.changeId,
    });
    index = endIndex - 1;
  }

  return { operations, errors };
}

/**
 * コマンドラインから全活動中差分または単一 Change の選択を解釈する。
 *
 * @param {string[]} args - Node.js 実行引数のスクリプト名以降。
 * @returns {{ changeId: string | null; error: string | null }} 選択結果または利用方法エラー。
 */
function parseArguments(args) {
  if (args.length === 0) return { changeId: null, error: null };
  if (args.length === 2 && args[0] === '--change' && /^[a-z0-9][a-z0-9-]*$/u.test(args[1] ?? '')) {
    return { changeId: args[1] ?? null, error: null };
  }
  return {
    changeId: null,
    error: 'Usage: node scripts/openspec/verify-scenario-coverage.mjs [--change <change-id>]',
  };
}

/**
 * 主仕様と対象となる活動中差分仕様を収集する。
 *
 * @param {string} repositoryRoot - リポジトリルートの絶対パス。
 * @param {string | null} selectedChangeId - 指定時は一つの Change だけを選択する。
 * @returns {{ mainFiles: string[]; deltaFiles: { path: string; changeId: string }[]; errors: string[] }} 仕様ファイルと選択エラー。
 */
function collectSpecFiles(repositoryRoot, selectedChangeId) {
  const mainFiles = collectFiles(path.join(repositoryRoot, 'openspec', 'specs'), (absolutePath) =>
    absolutePath.endsWith(`${path.sep}spec.md`)
  );
  const activeDirectories = collectActiveChangeDirectories(repositoryRoot);
  const selectedDirectories =
    selectedChangeId === null
      ? activeDirectories
      : activeDirectories.filter((directory) => path.basename(directory) === selectedChangeId);
  if (selectedChangeId !== null && selectedDirectories.length === 0) {
    return {
      mainFiles,
      deltaFiles: [],
      errors: [`Change '${selectedChangeId}' が活動中ディレクトリに存在しません。`],
    };
  }

  const deltaFiles = [];
  for (const changeDirectory of selectedDirectories) {
    for (const specPath of collectFiles(path.join(changeDirectory, 'specs'), (absolutePath) =>
      absolutePath.endsWith(`${path.sep}spec.md`)
    )) {
      deltaFiles.push({ path: specPath, changeId: path.basename(changeDirectory) });
    }
  }
  return { mainFiles, deltaFiles, errors: [] };
}

/**
 * 異なる活動中 Change が同じ要件へ異なる操作または内容を指定していないかを検査する。
 *
 * @param {RequirementOperation[]} operations - 全活動中差分の要件操作。
 * @returns {string[]} `ACTIVE_SPEC_CONFLICT` を含む競合エラー。
 */
function detectActiveConflicts(operations) {
  const errors = [];
  const byTarget = new Map();
  for (const operation of operations) {
    const key = `${operation.capability}\u0000${operation.target}`;
    const existing = byTarget.get(key) ?? [];
    for (const previous of existing) {
      if (previous.changeId === operation.changeId) continue;
      const sameMaterialOperation =
        previous.kind === operation.kind &&
        previous.normalizedContent === operation.normalizedContent &&
        previous.replacement === operation.replacement;
      if (!sameMaterialOperation) {
        errors.push(
          `ACTIVE_SPEC_CONFLICT: ${operation.capability}/${operation.requirement} に対する活動中操作が競合しています: ${previous.relPath}:${String(previous.line)} と ${operation.relPath}:${String(operation.line)}`
        );
      }
    }
    existing.push(operation);
    byTarget.set(key, existing);
  }
  return [...new Set(errors)].sort();
}

/**
 * 主仕様へ差分操作を適用し、検査対象となる実効要件集合を構築する。
 *
 * @param {RequirementOperation[]} baseOperations - 主仕様の要件。
 * @param {RequirementOperation[]} deltaOperations - 選択された差分操作。
 * @returns {{ requirements: RequirementOperation[]; errors: string[] }} 実効要件と適用エラー。
 */
function buildEffectiveRequirements(baseOperations, deltaOperations) {
  const errors = [];
  const effective = new Map();

  for (const operation of baseOperations) {
    const key = `${operation.capability}\u0000${operation.target}`;
    if (effective.has(key))
      errors.push(
        `${operation.relPath}:${String(operation.line)}: 同じ Requirement が主仕様内で重複しています。`
      );
    effective.set(key, operation);
  }

  // 同一内容の活動中操作は一度だけ適用し、意味のない重複による偽の失敗を避ける。
  const appliedFingerprints = new Set();
  for (const operation of deltaOperations) {
    const key = `${operation.capability}\u0000${operation.target}`;
    const fingerprint = `${key}\u0000${operation.kind}\u0000${operation.normalizedContent}\u0000${operation.replacement ?? ''}`;
    if (appliedFingerprints.has(fingerprint)) continue;
    appliedFingerprints.add(fingerprint);

    if (operation.kind === 'ADDED') {
      if (effective.has(key))
        errors.push(
          `${operation.relPath}:${String(operation.line)}: ADDED Requirement '${operation.requirement}' は実効仕様に既に存在します。`
        );
      else effective.set(key, operation);
    } else if (operation.kind === 'MODIFIED') {
      if (!effective.has(key))
        errors.push(
          `${operation.relPath}:${String(operation.line)}: MODIFIED Requirement '${operation.requirement}' が主仕様に存在しません。`
        );
      else effective.set(key, operation);
    } else if (operation.kind === 'REMOVED') {
      if (!effective.delete(key))
        errors.push(
          `${operation.relPath}:${String(operation.line)}: REMOVED Requirement '${operation.requirement}' が主仕様に存在しません。`
        );
    } else if (operation.kind === 'RENAMED') {
      const existing = effective.get(key);
      if (!existing || !operation.replacement) {
        errors.push(
          `${operation.relPath}:${String(operation.line)}: RENAMED Requirement '${operation.requirement}' が主仕様に存在しません。`
        );
        continue;
      }
      const replacementTarget = normalizeContent(operation.replacement);
      const replacementKey = `${operation.capability}\u0000${replacementTarget}`;
      effective.delete(key);
      effective.set(replacementKey, {
        ...existing,
        requirement: operation.replacement,
        target: replacementTarget,
      });
    }
  }
  return { requirements: [...effective.values()], errors };
}

/**
 * 実効要件に含まれる Scenario を識別子で索引化する。
 *
 * @param {RequirementOperation[]} requirements - 差分適用後の要件集合。
 * @returns {Map<string, Scenario[]>} Scenario ID ごとの定義一覧。
 */
function indexScenarios(requirements) {
  const byId = new Map();
  for (const requirement of requirements) {
    for (const scenario of requirement.scenarios) {
      const entries = byId.get(scenario.id) ?? [];
      entries.push(scenario);
      byId.set(scenario.id, entries);
    }
  }
  return byId;
}

/**
 * Playwrightの`test`関数またはその実行用修飾子を持つ呼び出しか判定する。
 *
 * @param {ts.Expression} expression - 呼び出し対象の構文要素。
 * @param {Set<string>} testNames - `test`として読み込まれた局所名。
 * @param {Set<string>} namespaceNames - Playwright名前空間として読み込まれた局所名。
 * @returns {boolean} Playwright試験を宣言する呼び出しの場合は`true`。
 */
function isPlaywrightTestCall(expression, testNames, namespaceNames) {
  if (ts.isIdentifier(expression)) return testNames.has(expression.text);
  if (!ts.isPropertyAccessExpression(expression)) return false;

  if (['only', 'skip', 'fixme', 'fail'].includes(expression.name.text)) {
    return isPlaywrightTestCall(expression.expression, testNames, namespaceNames);
  }

  return (
    expression.name.text === 'test' &&
    ts.isIdentifier(expression.expression) &&
    namespaceNames.has(expression.expression.text)
  );
}

/**
 * TypeScript構文木からPlaywright E2E試験の静的な題名だけを取得する。
 *
 * @param {string} source - E2E試験ファイルの内容。
 * @param {string} absolutePath - 構文解析対象の絶対パス。
 * @returns {string[]} 文字列リテラルで宣言された試験題名。
 */
function collectPlaywrightTestTitles(source, absolutePath) {
  const sourceFile = ts.createSourceFile(
    absolutePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    absolutePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const testNames = new Set(['test']);
  const namespaceNames = new Set();

  // `@playwright/test`の名前付き別名と名前空間読み込みを収集し、局所名で呼び出しを判定する。
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== '@playwright/test'
    )
      continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) {
      namespaceNames.add(bindings.name.text);
      continue;
    }
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if ((element.propertyName ?? element.name).text === 'test') testNames.add(element.name.text);
    }
  }

  const titles = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      isPlaywrightTestCall(node.expression, testNames, namespaceNames)
    ) {
      const title = node.arguments[0];
      if (title && (ts.isStringLiteral(title) || ts.isNoSubstitutionTemplateLiteral(title))) {
        titles.push(title.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return titles;
}

/**
 * Playwright E2E試験の静的な題名からScenario ID参照を収集する。
 *
 * @param {string} repositoryRoot - リポジトリルートの絶対パス。
 * @returns {Map<string, Set<string>>} Scenario IDごとの参照元E2E試験ファイル。
 */
function collectTestReferences(repositoryRoot) {
  const files = collectFiles(path.join(repositoryRoot, 'tests', 'e2e'), (absolutePath) =>
    TEST_FILE_PATTERN.test(absolutePath)
  );
  const references = new Map();
  for (const absolutePath of files) {
    const relPath = path.relative(repositoryRoot, absolutePath);
    const source = readFileSync(absolutePath, 'utf8');
    for (const title of collectPlaywrightTestTitles(source, absolutePath)) {
      for (const scenarioMatch of title.matchAll(SCENARIO_REF_PATTERN)) {
        const id = scenarioMatch.groups?.id;
        if (!id) continue;
        const paths = references.get(id) ?? new Set();
        paths.add(relPath);
        references.set(id, paths);
      }
    }
  }
  return references;
}

/**
 * Playwright E2E試験から仕様に存在しないScenarioへの孤立参照を検出する。
 *
 * @param {Set<string>} knownScenarioIds - 有効な参照先Scenario ID。
 * @param {Map<string, Set<string>>} references - Playwright E2E試験側のScenario ID参照。
 * @returns {string[]} 利用者が修正できる診断一覧。
 */
function validateReferences(knownScenarioIds, references) {
  const errors = [];
  for (const [id, paths] of references) {
    if (!knownScenarioIds.has(id))
      errors.push(`Orphan Playwright E2E reference '${id}': ${[...paths].sort().join(', ')}`);
  }
  return errors.sort();
}

/**
 * 活動中差分を適用した実効仕様で Scenario ID の一意性を検査する。
 *
 * @param {Map<string, Scenario[]>} scenariosById - 実効仕様の Scenario 索引。
 * @returns {string[]} 重複した Scenario ID の診断一覧。
 */
function validateScenarioDefinitions(scenariosById) {
  const errors = [];
  for (const [id, scenarios] of scenariosById) {
    if (scenarios.length > 1) {
      errors.push(
        `Duplicate Scenario ID '${id}': ${scenarios
          .map((scenario) => `${scenario.relPath}:${String(scenario.line)}`)
          .sort()
          .join(', ')}`
      );
    }
  }
  return errors.sort();
}

/**
 * CLI全体を実行し、仕様構造とPlaywright E2E試験からScenarioへの参照を検証する。
 *
 * @returns {void}
 */
function main() {
  const repositoryRoot = process.cwd();
  const parsedArguments = parseArguments(process.argv.slice(2));
  if (parsedArguments.error) {
    process.stderr.write(`${parsedArguments.error}\n`);
    process.exitCode = 1;
    return;
  }

  const files = collectSpecFiles(repositoryRoot, parsedArguments.changeId);
  const errors = [...files.errors];
  const baseOperations = [];
  const deltaOperations = [];

  for (const specPath of files.mainFiles) {
    const parsed = parseSpecFile(specPath, { repositoryRoot, delta: false, changeId: null });
    baseOperations.push(...parsed.operations);
    errors.push(...parsed.errors);
  }
  for (const deltaFile of files.deltaFiles) {
    const parsed = parseSpecFile(deltaFile.path, {
      repositoryRoot,
      delta: true,
      changeId: deltaFile.changeId,
    });
    deltaOperations.push(...parsed.operations);
    errors.push(...parsed.errors);
  }

  // 全活動中モードだけで Change 間競合を検査し、--change は選択した一件の実効結果に集中する。
  if (parsedArguments.changeId === null) errors.push(...detectActiveConflicts(deltaOperations));

  const effective = buildEffectiveRequirements(baseOperations, deltaOperations);
  errors.push(...effective.errors);
  const effectiveScenariosById = indexScenarios(effective.requirements);
  errors.push(...validateScenarioDefinitions(effectiveScenariosById));

  // 選択検査でも別の活動中Changeを参照するE2E試験を孤立と誤判定しないよう、全差分のIDを収集する。
  const allDeltaOperations = [];
  if (parsedArguments.changeId === null) {
    allDeltaOperations.push(...deltaOperations);
  } else {
    const allFiles = collectSpecFiles(repositoryRoot, null);
    for (const deltaFile of allFiles.deltaFiles) {
      const parsed = parseSpecFile(deltaFile.path, {
        repositoryRoot,
        delta: true,
        changeId: deltaFile.changeId,
      });
      allDeltaOperations.push(...parsed.operations);
    }
  }
  const knownOperations = [...baseOperations, ...allDeltaOperations];
  const knownScenarioIds = new Set(indexScenarios(knownOperations).keys());
  errors.push(...validateReferences(knownScenarioIds, collectTestReferences(repositoryRoot)));

  if (errors.length === 0) {
    process.stdout.write('OpenSpec scenario validation: OK\n');
    return;
  }
  process.stderr.write(
    `OpenSpec scenario validation: FAILED\n${[...new Set(errors)]
      .sort()
      .map((error) => `- ${error}`)
      .join('\n')}\n`
  );
  process.exitCode = 1;
}

main();
