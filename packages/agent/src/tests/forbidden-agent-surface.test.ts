import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { handleAgentConnectRequest } from '../rpc/connect-worker-adapter';
import { createAgentRpcRouter } from '../rpc/router';

import { testControlPlaneTrustConfig } from './test-control-plane-trust';

import type { AIAgent } from '../AIAgent';
import type { AgentWorkerEnv } from '../env';

const packageRoot = new URL('../..', import.meta.url);
const sourceRoot = new URL('../', import.meta.url);
const protoRoot = new URL('../../proto', import.meta.url);
const packageJsonPath = new URL('../../package.json', import.meta.url);
const baseUrl = 'https://agent.example.test';

const forbiddenPathTerms = [/openapi/i, /orval/i, /swagger/i];
const forbiddenSourcePatterns = [
  /from ["']hono["']|new Hono\b|\.get\(["']\/|\.post\(["']\//,
  /@hono\/zod-openapi|openapihono|createroute|openapi\.json|swagger/i,
  /\borval\b/i,
  /Response\.json\(|\.json\(\s*{/,
];

function createTestEnv(): AgentWorkerEnv {
  return {
    AGENT_BLOBS: {} as R2Bucket,
    AGENT_AUDIT_HASH_PEPPER: 'test-audit-hash-pepper',
    AGENT_CONTROL_PLANE_TRUST: testControlPlaneTrustConfig,
    AGENT_INTEGRATION_SIGNATURE_KEYS: 'test-integration-key',
    AGENT_MODEL_PROVIDER_SECRET_REFS: 'test-model-secret',
    AGENT_RPC_AUDIENCE: 'test-audience',
    AI_AGENT: {
      get: () => ({}) as DurableObjectStub<AIAgent>,
      idFromName: (name: string) => ({ name }) as unknown as DurableObjectId,
    } as unknown as DurableObjectNamespace<AIAgent>,
  };
}

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

function isScannedSourceFile(filePath: string): boolean {
  const normalizedPath = relative(fileURLToPath(packageRoot.href), filePath).replaceAll('\\', '/');
  if (normalizedPath.includes('src/generated/') || normalizedPath.includes('src/tests/'))
    return false;
  return /\.(?:ts|tsx|js|jsx|mjs|cjs|json|proto|tsp)$/.test(normalizedPath);
}

function collectForbiddenSurfaceIssues(): string[] {
  const issues: string[] = [];
  for (const filePath of [...collectFiles(sourceRoot), ...collectFiles(protoRoot)]) {
    const normalizedPath = relative(fileURLToPath(packageRoot.href), filePath).replaceAll(
      '\\',
      '/'
    );
    if (forbiddenPathTerms.some((pattern) => pattern.test(normalizedPath))) {
      issues.push(`${normalizedPath}: forbidden Agent REST/OpenAPI/Orval path`);
    }
    if (!isScannedSourceFile(filePath)) continue;
    const content = readFileSync(filePath, 'utf8');
    if (forbiddenSourcePatterns.some((pattern) => pattern.test(content))) {
      issues.push(`${normalizedPath}: forbidden Agent REST/OpenAPI/Orval source`);
    }
  }
  return issues;
}

function createAuthenticatedRestLikeRequest(path: string, method = 'POST'): Request {
  return new Request(`${baseUrl}${path}`, {
    body: method === 'GET' ? undefined : new Uint8Array(),
    headers: {
      'Content-Type': 'application/proto',
      'x-agent-test-grant': 'allow',
      'x-agent-test-principal-id': 'principal-1',
    },
    method,
  });
}

async function readErrorCode(response: Response): Promise<string> {
  const parsed: unknown = JSON.parse(await response.text());
  expect(parsed).toEqual(expect.objectContaining({ code: expect.any(String) }));
  return (parsed as { readonly code: string }).code;
}

describe('Agent forbidden API surface', () => {
  it('[AGENT-PLATFORM-S003] [AGENT-PLATFORM-S016] [AGENT-SECURITY-S009] [AGENT-HEALTH-S002] REST, DO, and Orval Agent surfaces are unreachable', async () => {
    const packageJson = JSON.parse(readFileSync(fileURLToPath(packageJsonPath.href), 'utf8')) as {
      readonly exports: Record<string, string>;
    };

    expect(collectForbiddenSurfaceIssues()).toEqual([]);
    expect(Object.keys(packageJson.exports)).toEqual(['.']);

    // generated Protobuf service は Connect router に登録し、REST/OpenAPI/Orval では公開しません。
    expect(
      createAgentRpcRouter(createTestEnv()).handlers.map((handler) => handler.requestPath)
    ).toEqual(
      expect.arrayContaining([
        '/cftamac.agent.v1.AgentModelPolicyService/UpsertModelPolicy',
        '/cftamac.agent.v1.AgentModelPolicyService/GetModelPolicy',
        '/cftamac.agent.v1.AgentModelPolicyService/ListModelPolicies',
        '/cftamac.agent.v1.AgentModelPolicyService/ArchiveModelPolicy',
        '/cftamac.agent.v1.AgentModelPolicyService/ValidateModelPolicy',
      ])
    );

    const getRestPath = await handleAgentConnectRequest(
      createAuthenticatedRestLikeRequest('/agents/agent-1/events', 'GET'),
      createTestEnv()
    );
    expect(await readErrorCode(getRestPath)).toBe('unimplemented');

    const postRestPath = await handleAgentConnectRequest(
      createAuthenticatedRestLikeRequest('/agents/agent-1/events'),
      createTestEnv()
    );
    expect(await readErrorCode(postRestPath)).toBe('unimplemented');

    // model policy も Protobuf RPC descriptor だけを公開し、REST 風 resource path は成功させません。
    const modelPolicyRestPath = await handleAgentConnectRequest(
      createAuthenticatedRestLikeRequest('/agents/agent-1/model-policies'),
      createTestEnv()
    );
    expect(await readErrorCode(modelPolicyRestPath)).toBe('unimplemented');

    const publicDurableObjectLikePath = await handleAgentConnectRequest(
      createAuthenticatedRestLikeRequest('/cdn-cgi/ai-agent/agent-1/checkHealth'),
      createTestEnv()
    );
    expect(await readErrorCode(publicDurableObjectLikePath)).toBe('unimplemented');
  });
});
