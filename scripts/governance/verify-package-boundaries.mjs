import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

const workflowFiles = [
  '.opencode/skills/coding-guardian/SKILL.md',
  '.opencode/skills/coding-guardian/references/repo-entrypoints.md',
  '.opencode/agents/openspec/applier.md',
  '.opencode/agents/unit/agent/engineer.md',
  '.opencode/agents/unit/agent/reviewer.md',
  '.opencode/agents/unit/client/engineer.md',
  '.opencode/agents/unit/client/reviewer.md',
  '.opencode/agents/unit/client/designer.md',
  '.opencode/agents/unit/build/builder.md',
  '.opencode/agents/unit/build/reviewer.md',
];

const generatedPolicyPaths = [
  'packages/agent/proto/**',
  'packages/agent/src/generated/rpc/**',
  'packages/client/src/generated/agent-rpc/**',
];

/**
 * Collect Agent/Client runtime coupling, binding, and workflow boundary issues.
 */
export function collectPackageBoundaryIssues(root = projectRoot) {
  return [
    ...collectRuntimeCouplingIssues(root),
    ...collectAgentLayerIssues(root),
    ...collectClientBoundaryIssues(root),
    ...collectBindingIssues(root),
    ...collectOpenCodeWorkflowIssues(root),
  ];
}

export function collectRuntimeCouplingIssues(root) {
  const issues = [];
  for (const filePath of collectFiles(`${root}/packages/agent/src`)) {
    const normalizedPath = normalizePath(root, filePath);
    if (normalizedPath.includes('/src/generated/') || normalizedPath.includes('/src/tests/')) {
      continue;
    }
    const content = readFileSync(filePath, 'utf8');
    if (/from ["']@cf-tamac\/client["'/]|packages\/client\/src|\.\.\/client\//.test(content)) {
      issues.push(`${normalizedPath}: Agent runtime must not import Client runtime`);
    }
  }
  for (const filePath of collectFiles(`${root}/packages/client/src`)) {
    const normalizedPath = normalizePath(root, filePath);
    if (normalizedPath.includes('/src/generated/') || normalizedPath.includes('/src/tests/')) {
      continue;
    }
    const content = readFileSync(filePath, 'utf8');
    if (/from ["']@cf-tamac\/agent["'/]|packages\/agent\/src|\.\.\/agent\//.test(content)) {
      issues.push(`${normalizedPath}: Client runtime must not import Agent runtime`);
    }
  }
  return issues;
}

/**
 * Collect Agent layer direction issues that would reintroduce inverted runtime dependencies.
 */
export function collectAgentLayerIssues(root) {
  const issues = [];
  for (const filePath of collectFiles(`${root}/packages/agent/src`)) {
    const normalizedPath = normalizePath(root, filePath);
    if (normalizedPath.includes('/src/generated/') || normalizedPath.includes('/src/tests/')) {
      continue;
    }
    const imports = collectResolvedImports(root, filePath);
    const content = readFileSync(filePath, 'utf8');

    issues.push(...collectAgentFoundationLayerImportIssues(normalizedPath, imports, content));
    issues.push(...collectAgentStorageLayerIssues(normalizedPath, imports));
    issues.push(...collectAgentRpcServiceLayerIssues(normalizedPath, imports, content));
  }
  return [...new Set(issues)];
}

function collectAgentFoundationLayerImportIssues(normalizedPath, imports, content) {
  if (!isAgentRuntimeFoundationPath(normalizedPath)) {
    return [];
  }
  const issues = [];
  for (const importedPath of imports) {
    if (
      isAgentRpcPath(importedPath) ||
      isAgentWorkerEntrypointPath(importedPath) ||
      importedPath.startsWith('@cf-tamac/agent-rpc')
    ) {
      issues.push(
        `${normalizedPath}: Agent runtime/domain/storage layer must not import RPC, Worker, or generated descriptor layers`
      );
    }
    if (isForbiddenAgentLowerLayerExternal(importedPath)) {
      issues.push(
        `${normalizedPath}: Agent runtime/domain/storage layer must not import framework, transport, persistence, or platform runtime packages`
      );
    }
  }
  if (/\b(?:fetch|Headers|Request|Response)\b/.test(content)) {
    issues.push(
      `${normalizedPath}: Agent runtime/domain/storage layer must not use Worker network globals directly`
    );
  }
  return issues;
}

function collectAgentStorageLayerIssues(normalizedPath, imports) {
  if (!normalizedPath.startsWith('/packages/agent/src/storage/')) {
    return [];
  }
  return imports
    .filter(
      (importedPath) => isAgentDomainRuntimePath(importedPath) || isAgentDoRuntimePath(importedPath)
    )
    .map(
      () => `${normalizedPath}: Agent storage layer must not import Agent domain/runtime layers`
    );
}

function collectAgentRpcServiceLayerIssues(normalizedPath, imports, content) {
  if (!normalizedPath.startsWith('/packages/agent/src/rpc/services/')) {
    return [];
  }
  const issues = imports
    .filter(
      (importedPath) =>
        isAgentRpcFacadePath(importedPath) ||
        importedPath.startsWith('/packages/agent/src/rpc/interceptors/')
    )
    .map(
      () =>
        `${normalizedPath}: Agent RPC service modules must not import router, adapter, or interceptor layers`
    );
  if (/\b(?:fetch|Headers|Request|Response)\b/.test(content)) {
    issues.push(
      `${normalizedPath}: Agent RPC service modules must not use Worker network globals directly`
    );
  }
  return issues;
}

/**
 * Collect Next.js Client server/browser boundary issues.
 */
export function collectClientBoundaryIssues(root) {
  const issues = [];
  for (const filePath of collectFiles(`${root}/packages/client`)) {
    const normalizedPath = normalizePath(root, filePath);
    if (!/\.(?:ts|tsx)$/.test(normalizedPath)) {
      continue;
    }
    if (normalizedPath.includes('/src/generated/') || normalizedPath.includes('/src/tests/')) {
      continue;
    }
    const content = readFileSync(filePath, 'utf8');
    const imports = collectResolvedImports(root, filePath);

    if (isClientBrowserVisiblePath(normalizedPath, content)) {
      for (const importedPath of imports) {
        if (
          importedPath.startsWith('/packages/client/src/server/') ||
          importedPath === 'server-only' ||
          importedPath.startsWith('@cf-tamac/client-agent-rpc') ||
          importedPath.startsWith('@connectrpc/connect')
        ) {
          issues.push(
            `${normalizedPath}: Client browser-visible modules must not import server-only Agent RPC, credentials, or Connect runtime`
          );
        }
      }
      if (
        /createServerAgentRpcClients|CLIENT_DB|credentialRef|credential_ref|Authorization|Bearer/.test(
          content
        )
      ) {
        issues.push(
          `${normalizedPath}: Client browser-visible modules must not contain Agent RPC credential or Client D1 access seams`
        );
      }
      if (
        /\bfetch\s*\(|\bglobalThis\.fetch\s*\(/.test(content) ||
        imports.includes('axios') ||
        imports.includes('cross-fetch')
      ) {
        issues.push(
          `${normalizedPath}: Client browser-visible modules must not perform direct network calls`
        );
      }
    }

    if (
      normalizedPath.startsWith('/packages/client/src/server/agent-rpc/') &&
      !content.includes("import 'server-only';")
    ) {
      issues.push(`${normalizedPath}: Client Agent RPC modules must import server-only`);
    }
  }
  return [...new Set(issues)];
}

function collectBindingIssues(root) {
  const issues = [];
  const agentWrangler = readProjectFile(root, 'packages/agent/wrangler.toml');
  const clientWrangler = readProjectFile(root, 'packages/client/wrangler.toml');

  if (
    !/name\s*=\s*"AI_AGENT"/.test(agentWrangler) ||
    !/class_name\s*=\s*"AIAgent"/.test(agentWrangler)
  ) {
    issues.push(
      'packages/agent/wrangler.toml: missing AI_AGENT Durable Object binding for AIAgent'
    );
  }
  if (!/binding\s*=\s*"AGENT_BLOBS"/.test(agentWrangler)) {
    issues.push('packages/agent/wrangler.toml: missing Agent blob storage binding');
  }
  if (
    /\[\[d1_databases]]|CLIENT_DB|\[\[queues\.|queue_producers|queue_consumers/.test(agentWrangler)
  ) {
    issues.push(
      'packages/agent/wrangler.toml: Agent Worker must not define D1, CLIENT_DB, or Cloudflare Queues bindings'
    );
  }

  if (!/binding\s*=\s*"CLIENT_DB"/.test(clientWrangler)) {
    issues.push('packages/client/wrangler.toml: missing CLIENT_DB binding');
  }
  if (/AI_AGENT|AGENT_BLOBS|\[\[r2_buckets]]/.test(clientWrangler)) {
    issues.push(
      'packages/client/wrangler.toml: Client Worker must not define Agent runtime bindings'
    );
  }
  return issues;
}

function collectOpenCodeWorkflowIssues(root) {
  const files = Object.fromEntries(
    workflowFiles.map((relativePath) => [relativePath, readProjectFile(root, relativePath)])
  );
  return collectOpenCodeWorkflowIssuesFromFiles(files);
}

export function collectOpenCodeWorkflowIssuesFromFiles(files) {
  const issues = [];
  const corpus = Object.values(files).join('\n');

  const mustMentionAgent = [
    '.opencode/skills/coding-guardian/SKILL.md',
    '.opencode/skills/coding-guardian/references/repo-entrypoints.md',
    '.opencode/agents/openspec/applier.md',
    '.opencode/agents/unit/agent/engineer.md',
    '.opencode/agents/unit/agent/reviewer.md',
    '.opencode/agents/unit/build/builder.md',
    '.opencode/agents/unit/build/reviewer.md',
  ];

  const mustMentionClient = [
    '.opencode/skills/coding-guardian/SKILL.md',
    '.opencode/skills/coding-guardian/references/repo-entrypoints.md',
    '.opencode/agents/openspec/applier.md',
    '.opencode/agents/unit/client/engineer.md',
    '.opencode/agents/unit/client/reviewer.md',
    '.opencode/agents/unit/client/designer.md',
    '.opencode/agents/unit/build/builder.md',
    '.opencode/agents/unit/build/reviewer.md',
  ];

  for (const relativePath of mustMentionAgent) {
    if (!files[relativePath]?.includes('packages/agent/**')) {
      issues.push(`${relativePath}: missing packages/agent/** scope`);
    }
  }

  for (const relativePath of mustMentionClient) {
    if (!files[relativePath]?.includes('packages/client/**')) {
      issues.push(`${relativePath}: missing packages/client/** scope`);
    }
  }

  if (corpus.includes('unit/backend/') || corpus.includes('unit/frontend/')) {
    issues.push('workflow references removed backend/frontend unit agents');
  }

  for (const generatedPath of generatedPolicyPaths) {
    if (!corpus.includes(generatedPath)) {
      issues.push(`missing generated output policy for ${generatedPath}`);
    }
  }
  if (!containsAny(corpus, ['command-owned', 'command owned'])) {
    issues.push('missing command-owned generated output wording');
  }
  if (!containsAny(corpus, ['hand-edit', 'hand edit', '手編集'])) {
    issues.push('missing generated output hand-edit prohibition');
  }
  if (!corpus.includes('scripts/governance/verify-package-boundaries.mjs')) {
    issues.push('missing governance boundary script entrypoint');
  }
  if (!corpus.includes('scripts/governance/verify-agent-surface.mjs')) {
    issues.push('missing governance Agent surface script entrypoint');
  }
  if (!corpus.includes('scripts/openspec/verify-scenario-coverage.mjs')) {
    issues.push('missing OpenSpec scenario coverage entrypoint');
  }
  if (
    /old demo package/i.test(corpus) &&
    !corpus.includes('packages/agent/**') &&
    !corpus.includes('packages/client/**')
  ) {
    issues.push('workflow remains demo-only guidance');
  }
  return issues;
}

function collectResolvedImports(root, filePath) {
  const content = readFileSync(filePath, 'utf8');
  return collectImportSpecifiers(content).map((specifier) =>
    resolveImportSpecifier(root, filePath, specifier)
  );
}

function collectImportSpecifiers(content) {
  return [...content.matchAll(/(?:import|export)\s+(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/g)].map(
    (match) => match[1]
  );
}

function resolveImportSpecifier(root, filePath, specifier) {
  if (!specifier.startsWith('.')) {
    return specifier;
  }
  return normalizePath(root, resolve(dirname(filePath), specifier));
}

function isAgentRuntimeFoundationPath(normalizedPath) {
  return (
    isAgentDomainRuntimePath(normalizedPath) ||
    normalizedPath.startsWith('/packages/agent/src/storage/') ||
    normalizedPath.startsWith('/packages/agent/src/observability/')
  );
}

function isAgentDomainRuntimePath(normalizedPath) {
  return [
    '/packages/agent/src/domain/',
    '/packages/agent/src/harness/',
    '/packages/agent/src/threads/',
    '/packages/agent/src/events/',
    '/packages/agent/src/runs/',
    '/packages/agent/src/compactions/',
    '/packages/agent/src/schedules/',
    '/packages/agent/src/tools/',
    '/packages/agent/src/integrations/',
    '/packages/agent/src/adapters/',
  ].some((prefix) => normalizedPath === prefix.slice(0, -1) || normalizedPath.startsWith(prefix));
}

function isAgentDoRuntimePath(normalizedPath) {
  return (
    normalizedPath === '/packages/agent/src/AIAgent' ||
    normalizedPath === '/packages/agent/src/AIAgent.ts' ||
    normalizedPath === '/packages/agent/src/agent-routing' ||
    normalizedPath === '/packages/agent/src/agent-routing.ts'
  );
}

function isAgentRpcPath(normalizedPath) {
  return normalizedPath.startsWith('/packages/agent/src/rpc/');
}

function isAgentRpcFacadePath(normalizedPath) {
  return [
    '/packages/agent/src/rpc/router',
    '/packages/agent/src/rpc/router.ts',
    '/packages/agent/src/rpc/connect-worker-adapter',
    '/packages/agent/src/rpc/connect-worker-adapter.ts',
  ].includes(normalizedPath);
}

function isAgentWorkerEntrypointPath(normalizedPath) {
  return [
    '/packages/agent/src/index',
    '/packages/agent/src/index.ts',
    '/packages/agent/src/worker',
    '/packages/agent/src/worker.ts',
  ].includes(normalizedPath);
}

function isForbiddenAgentLowerLayerExternal(importedPath) {
  return (
    [
      'hono',
      '@hono/zod-openapi',
      '@connectrpc/connect',
      'next',
      'react',
      'server-only',
      'drizzle-orm',
    ].some((specifier) => importedPath === specifier || importedPath.startsWith(`${specifier}/`)) ||
    importedPath.startsWith('@cloudflare/') ||
    importedPath.startsWith('cloudflare:')
  );
}

function isClientBrowserVisiblePath(normalizedPath, content) {
  if (normalizedPath.startsWith('/packages/client/app/')) {
    return true;
  }
  if (normalizedPath.startsWith('/packages/client/src/server/')) {
    return false;
  }
  return (
    normalizedPath.startsWith('/packages/client/src/') ||
    /^["']use client["'];?/.test(content.trimStart())
  );
}

function containsAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function readProjectFile(root, relativePath) {
  return readFileSync(`${root}/${relativePath}`, 'utf8');
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

function normalizePath(root, filePath) {
  return filePath.replace(root, '').replaceAll('\\', '/');
}

function main() {
  const issues = collectPackageBoundaryIssues();
  if (issues.length > 0) {
    process.stderr.write(
      `Package boundary governance failed:\n${issues.map((issue) => `- ${issue}`).join('\n')}\n`
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
