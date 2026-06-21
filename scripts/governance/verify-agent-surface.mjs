import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

const scanRoots = ['packages/agent/src', 'packages/agent/proto'];
const ignoredPathFragments = ['/src/generated/', '/src/tests/', '/node_modules/'];

const forbiddenSourcePatterns = [
  {
    name: 'hono-rest-route',
    pattern: /from ["']hono["']|new Hono\b|\.get\(["']\/|\.post\(["']\//,
  },
  {
    name: 'openapi-surface',
    pattern: /@hono\/zod-openapi|openapihono|createroute|openapi\.json|swagger/i,
  },
  {
    name: 'orval-agent-client',
    pattern: /\borval\b/i,
  },
  {
    name: 'ad-hoc-json-agent-api',
    pattern: /Response\.json\(|\.json\(\s*{/,
  },
];

/**
 * Collect forbidden public Agent API surface issues.
 */
export function collectAgentSurfaceIssues(root = projectRoot) {
  const issues = [];
  for (const relativeRoot of scanRoots) {
    for (const filePath of collectFiles(`${root}/${relativeRoot}`)) {
      const normalizedPath = filePath.replace(root, '').replaceAll('\\', '/');
      if (ignoredPathFragments.some((fragment) => normalizedPath.includes(fragment))) {
        continue;
      }
      inspectAgentSurfaceFile(filePath, normalizedPath, issues);
    }
  }
  return issues;
}

function inspectAgentSurfaceFile(filePath, normalizedPath, issues) {
  if (/openapi|orval/i.test(normalizedPath)) {
    issues.push(`${normalizedPath}: forbidden Agent OpenAPI/Orval artifact path`);
  }
  if (!/\.(?:ts|tsx|js|jsx|mjs|cjs|json|proto|tsp)$/.test(normalizedPath)) {
    return;
  }
  const content = readFileSync(filePath, 'utf8');
  for (const rule of forbiddenSourcePatterns) {
    if (rule.pattern.test(content)) {
      issues.push(`${normalizedPath}: forbidden ${rule.name}`);
    }
  }
}

function collectFiles(root) {
  if (!existsSync(root)) {
    return [];
  }
  const entries = readdirSync(root).sort();
  const files = [];
  for (const entry of entries) {
    const fullPath = `${root}/${entry}`;
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else if (stats.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function main() {
  const issues = collectAgentSurfaceIssues();
  if (issues.length > 0) {
    process.stderr.write(`Agent surface governance failed:\n${issues.map((issue) => `- ${issue}`).join('\n')}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
