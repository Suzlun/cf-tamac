import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const packageRoot = new URL('../..', import.meta.url);
const appRoot = new URL('../../app', import.meta.url);
const serverAgentRpcRoot = new URL('../server/agent-rpc', import.meta.url);

const forbiddenBrowserPatterns = [
  /@cf-tamac\/client-agent-rpc/,
  /@connectrpc\/connect(?:-web)?/,
  /createServerAgentRpcClients/,
  /createConnectTransport/,
  /x-client-credential-ref/,
  /x-client-key-id/,
  /x-agent-id/,
  /privateJwkCiphertext/,
  /privateJwk/,
];

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

describe('Management Client browser Agent RPC secrecy', () => {
  it('[MANAGEMENT-CLIENT-SHELL-S002] Browser bundle excludes Agent RPC credentials', () => {
    const browserIssues = collectFiles(appRoot).flatMap((filePath) => {
      const content = readFileSync(filePath, 'utf8');
      return forbiddenBrowserPatterns
        .filter((pattern) => pattern.test(content))
        .map((pattern) => `${relativePath(filePath)} matched ${String(pattern)}`);
    });

    expect(browserIssues).toEqual([]);

    const serverAgentRpcFiles = collectFiles(serverAgentRpcRoot);
    expect(serverAgentRpcFiles.length).toBeGreaterThan(0);
    for (const filePath of serverAgentRpcFiles) {
      expect(readFileSync(filePath, 'utf8')).toContain("import 'server-only';");
    }
    expect(
      readFileSync(
        fileURLToPath(new URL('../server/agent-rpc/create-client.ts', import.meta.url).href),
        'utf8'
      )
    ).toContain('useBinaryFormat: true');
  });

  it('[AGENT-MANAGEMENT-UI-S011] Browser never receives signing material from signing key UI', () => {
    const componentsRoot = new URL('../components', import.meta.url);
    const signingComponentIssues = collectFiles(componentsRoot).flatMap((filePath) => {
      const content = readFileSync(filePath, 'utf8');
      return [/privateJwkCiphertext/, /privateJwk/, /Bearer /, /secretMaterial/]
        .filter((pattern) => pattern.test(content))
        .map((pattern) => `${relativePath(filePath)} matched ${String(pattern)}`);
    });

    expect(signingComponentIssues).toEqual([]);
  });
});
