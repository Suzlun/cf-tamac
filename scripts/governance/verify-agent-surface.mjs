import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

const scanRoots = ['packages/agent', 'packages/client/app'];
const ignoredPathFragments = [
  '/.next/',
  '/.wrangler/',
  '/dist/',
  '/node_modules/',
  '/src/generated/',
  '/src/tests/',
];
const inspectableFilePattern = /\.(?:ts|tsx|js|jsx|mjs|cjs|json|proto|tsp|toml|ya?ml)$/;

const guardrails = {
  agentHealth: {
    concern:
      'Agent health must use AgentHealthService.Check over Connect binary Protobuf; REST /health or JSON health splits the RPC guardrail',
    scenario: 'AGENT-HEALTH-S002',
  },
  agentSecurity: {
    concern:
      'Agent public operations must stay behind the Connect facade; REST, Hono, OpenAPI/Orval, JSON DTO, or public Durable Object routes bypass authentication and final authorization',
    scenario: 'AGENT-SECURITY-S009',
  },
  clientRegistry: {
    concern:
      'Client must not expose public Agent proxy API routes; Agent operations stay behind Server Actions or Server Components',
    scenario: 'CLIENT-REGISTRY-S005',
  },
};

const forbiddenSourcePatterns = [
  {
    name: 'hono-rest-route',
    pattern: /from ["']hono["']|new Hono\b|\.get\(["']\/|\.post\(["']\//,
    guardrail: guardrails.agentSecurity,
  },
  {
    name: 'openapi-surface',
    pattern: /@hono\/zod-openapi|openapihono|createroute|openapi\.json|swagger/i,
    guardrail: guardrails.agentSecurity,
  },
  {
    name: 'orval-agent-client',
    pattern: /\borval\b/i,
    guardrail: guardrails.agentSecurity,
  },
  {
    name: 'ad-hoc-json-agent-api',
    pattern: /Response\.json\(|\.json\(\s*{/,
    guardrail: guardrails.agentSecurity,
  },
  {
    name: 'public-do-rpc-route',
    pattern:
      /ai_agent[\S\s]{0,300}\.get\([\S\s]{0,300}\)\.fetch\(|\/(?:__do_rpc|do-rpc|durable-object-rpc|agents?\/[^"'`]*\/(?:do|rpc))/i,
    guardrail: guardrails.agentSecurity,
  },
  {
    name: 'rest-health-endpoint',
    pattern: /["'`]\/health["#'/?`]|pathname\s*={2,3}\s*["'`]\/health|urlpattern[\S\s]{0,120}\/health/i,
    guardrail: guardrails.agentHealth,
  },
  {
    name: 'json-health-response',
    pattern: /response\.json\(\s*{[\S\s]{0,160}(?:health|ok|serving|status)|application\/json[\S\s]{0,160}health/i,
    guardrail: guardrails.agentHealth,
  },
];

const clientPublicProxyPathPattern =
  /^\/packages\/client\/app\/api\/(?:agent|agents|client)(?:\/|$)|^\/packages\/client\/app\/api\/.*(?:agent|rpc|proxy)/i;

const clientPublicProxyContentPatterns = [
  /export\s+async\s+function\s+(?:get|post|put|patch|delete)[\S\s]{0,500}(?:agent|rpc|proxy)/i,
  /@connectrpc\/connect|@cf-tamac\/client-agent-rpc|createServerAgentRpcClients|agentRpcOrigin|agent_rpc_origin/,
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
    issues.push(formatIssue(normalizedPath, guardrails.agentSecurity, 'forbidden Agent OpenAPI/Orval artifact path'));
  }
  if (clientPublicProxyPathPattern.test(normalizedPath)) {
    issues.push(formatIssue(normalizedPath, guardrails.clientRegistry, 'forbidden Client public Agent proxy route path'));
  }
  if (!inspectableFilePattern.test(normalizedPath)) {
    return;
  }
  const content = readFileSync(filePath, 'utf8');
  if (isClientPublicRouteFile(normalizedPath) && hasClientPublicProxyContent(content)) {
    issues.push(formatIssue(normalizedPath, guardrails.clientRegistry, 'forbidden Client public Agent proxy route'));
  }
  for (const rule of forbiddenSourcePatterns) {
    if (rule.pattern.test(content)) {
      issues.push(formatIssue(normalizedPath, rule.guardrail, `forbidden ${rule.name}`));
    }
  }
}

function formatIssue(normalizedPath, guardrail, detail) {
  return `${normalizedPath}: [${guardrail.scenario}] ${guardrail.concern}: ${detail}`;
}

function isClientPublicRouteFile(normalizedPath) {
  return normalizedPath.startsWith('/packages/client/app/api/') && /\/route\.(?:ts|js)$/.test(normalizedPath);
}

function hasClientPublicProxyContent(content) {
  return clientPublicProxyContentPatterns.some((pattern) => pattern.test(content));
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
