import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const packageRoot = new URL('../..', import.meta.url);
const serverAgentRpcRoot = new URL('../server/agent-rpc', import.meta.url);
const clientSourceRoot = new URL('../', import.meta.url);

function collectFiles(root: URL): string[] {
  const rootPath = fileURLToPath(root.href);
  if (!existsSync(rootPath)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(rootPath).sort()) {
    const fullPath = `${rootPath}/${entry}`;
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectFiles(new URL(`${entry}/`, root)));
    } else if (stats.isFile() && /\.(?:ts|tsx)$/.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

function relativePath(filePath: string): string {
  return relative(fileURLToPath(packageRoot.href), filePath).replaceAll('\\', '/');
}

describe('Management Client Agent RPC import graph', () => {
  it('[MANAGEMENT-CLIENT-SHELL-S006] Client imports generated Agent RPC code without Agent runtime source', () => {
    const serverAgentRpcSource = collectFiles(serverAgentRpcRoot)
      .map((filePath) => readFileSync(filePath, 'utf8'))
      .join('\n');

    expect(serverAgentRpcSource).toContain('@cf-tamac/client-agent-rpc/cftamac/agent/v1_pb');
    expect(serverAgentRpcSource).toContain('@connectrpc/connect');
    expect(serverAgentRpcSource).toContain('server-only');

    const runtimeImportIssues = collectFiles(clientSourceRoot).flatMap((filePath) => {
      if (
        relativePath(filePath).includes('src/generated/agent-rpc/') ||
        relativePath(filePath).includes('src/tests/')
      )
        return [];
      const content = readFileSync(filePath, 'utf8');
      return /from ["']@cf-tamac\/agent["'/]/.test(content) ||
        content.includes('packages/agent/src')
        ? [`${relativePath(filePath)} imports Agent runtime source`]
        : [];
    });
    expect(runtimeImportIssues).toEqual([]);
  });
});
