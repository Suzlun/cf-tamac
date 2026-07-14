import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  createBrowserSafeAgentRpcFailure,
  createBrowserSafeAgentRpcSuccess,
} from '../server/agent-rpc/safe-results';

const packageRoot = new URL('../..', import.meta.url);
const appRoot = new URL('../../app', import.meta.url);
const serverAgentRpcRoot = new URL('../server/agent-rpc', import.meta.url);

const forbiddenBrowserPatterns = [
  /@cf-tamac\/client-agent-rpc/,
  /@cf-tamac\/sdk/,
  /@connectrpc\/connect(?:-web)?/,
  /createTamacAgentClient/,
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
    const adapterSource = readFileSync(
      fileURLToPath(new URL('../server/agent-rpc/create-client.ts', import.meta.url).href),
      'utf8'
    );
    expect(adapterSource).toContain('@cf-tamac/sdk');
    expect(adapterSource).toContain('createTamacAgentClient');
    expect(adapterSource).not.toContain('@connectrpc/connect');
    expect(adapterSource).not.toContain('@cf-tamac/client-agent-rpc');
  });

  it('[TAMAC-SDK-S005] SDK result is reduced to display data, safe status, category, and correlation identifier', () => {
    const success = createBrowserSafeAgentRpcSuccess(
      { agentId: 'agent-alpha', displayName: 'Alpha Agent' },
      'correlation-success-001'
    );
    const failure = createBrowserSafeAgentRpcFailure(
      new Error('raw transport detail must not reach the Browser'),
      'correlation-failure-001',
      { message: '安全な失敗文言', title: '安全な失敗見出し' }
    );

    expect(success).toEqual({
      correlationId: 'correlation-success-001',
      displayData: { agentId: 'agent-alpha', displayName: 'Alpha Agent' },
      safeErrorCategory: null,
      safeStatus: 'succeeded',
    });
    expect(failure).toEqual({
      correlationId: 'correlation-failure-001',
      displayData: { message: '安全な失敗文言', title: '安全な失敗見出し' },
      safeErrorCategory: 'internal',
      safeStatus: 'failed',
    });
    expect(JSON.stringify({ failure, success })).not.toContain('raw transport detail');
    expect(JSON.stringify({ failure, success })).not.toContain('agentRpcOrigin');
    expect(JSON.stringify({ failure, success })).not.toContain('privateKey');
    expect(JSON.stringify({ failure, success })).not.toContain('Authorization');
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
