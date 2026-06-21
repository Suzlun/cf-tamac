import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const packageRoot = new URL('../..', import.meta.url);
const scannedRoots = [new URL('../', import.meta.url), new URL('../../proto', import.meta.url)];
const packageJsonPath = new URL('../../package.json', import.meta.url);

const forbiddenDemoGraphPatterns = [
  /\bhello\b/i,
  /\busers\b/i,
  /\/api\/v1\/(?:hello|users)/i,
  /@cf-tamac-backend\//,
  /@cf-tamac-frontend\//,
  /packages\/(?:backend|frontend|typespec)\//,
];

function collectFiles(root: URL): string[] {
  const rootPath = fileURLToPath(root.href);
  if (!existsSync(rootPath)) return [];
  const entries = readdirSync(rootPath).sort();
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = `${rootPath}/${entry}`;
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectFiles(new URL(`${entry}/`, root)));
    } else if (stats.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function shouldScan(filePath: string): boolean {
  const normalizedPath = relative(fileURLToPath(packageRoot.href), filePath).replaceAll('\\', '/');
  if (normalizedPath.includes('src/tests/') || normalizedPath.includes('src/generated/'))
    return false;
  return /\.(?:ts|tsx|json|proto|tsp)$/.test(normalizedPath);
}

function collectDemoGraphIssues(): string[] {
  const issues: string[] = [];
  for (const filePath of [
    ...scannedRoots.flatMap((root) => collectFiles(root)),
    fileURLToPath(packageJsonPath.href),
  ]) {
    if (!shouldScan(filePath) && filePath !== fileURLToPath(packageJsonPath.href)) continue;
    const normalizedPath = relative(fileURLToPath(packageRoot.href), filePath).replaceAll(
      '\\',
      '/'
    );
    const content = readFileSync(filePath, 'utf8');
    if (forbiddenDemoGraphPatterns.some((pattern) => pattern.test(content))) {
      issues.push(`${normalizedPath}: reachable Agent graph references demo domain`);
    }
  }
  return issues;
}

describe('Agent source graph', () => {
  it('[AGENT-PLATFORM-S007] Demo domain files are not reachable from Agent entrypoints', () => {
    expect(collectDemoGraphIssues()).toEqual([]);
  });
});
