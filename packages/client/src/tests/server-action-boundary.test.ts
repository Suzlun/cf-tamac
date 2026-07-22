import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

const healthActionMocks = vi.hoisted(() => ({
  loadAgentRpcClients: vi.fn(),
  markManagedAgentSigningVerified: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: healthActionMocks.revalidatePath }));
vi.mock('../server/agent-rpc/agent-loader', () => ({
  loadAgentRpcClients: healthActionMocks.loadAgentRpcClients,
}));
vi.mock('../server/db', () => ({
  createManagedAgentRepository: () => ({
    markManagedAgentSigningVerified: healthActionMocks.markManagedAgentSigningVerified,
  }),
}));
vi.mock('../server/env', () => ({ getClientWorkerEnv: () => ({ CLIENT_DB: {} }) }));

const serverActionPath = new URL('../server/actions/managed-agents.ts', import.meta.url);
const createClientPath = new URL('../server/agent-rpc/create-client.ts', import.meta.url);
const safeResultsPath = new URL('../server/agent-rpc/safe-results.ts', import.meta.url);
const sdkBackedMutationActionPaths = [
  new URL('../server/actions/agent-health.ts', import.meta.url),
  new URL('../server/actions/agent-lifecycle.ts', import.meta.url),
  new URL('../server/actions/agent-operations/default-model-policy.ts', import.meta.url),
  new URL('../server/actions/agent-operations/integrations.ts', import.meta.url),
  new URL('../server/actions/agent-operations/schedules.ts', import.meta.url),
  new URL('../server/actions/agent-operations/tools.ts', import.meta.url),
  new URL('../server/actions/agent-queries/runs.ts', import.meta.url),
  new URL('../server/actions/managed-agents.ts', import.meta.url),
  new URL('../server/actions/model-policies.ts', import.meta.url),
];
const sdkBackedQueryActionPaths = [
  new URL('../server/actions/agent-lifecycle.ts', import.meta.url),
  new URL('../server/actions/agent-operations/integrations.ts', import.meta.url),
  new URL('../server/actions/agent-operations/schedules.ts', import.meta.url),
  new URL('../server/actions/agent-operations/tools.ts', import.meta.url),
  new URL('../server/actions/agent-queries/events.ts', import.meta.url),
  new URL('../server/actions/agent-queries/runs.ts', import.meta.url),
  new URL('../server/actions/agent-queries/threads.ts', import.meta.url),
  new URL('../server/actions/model-policies.ts', import.meta.url),
];

describe('Server Action credential boundary', () => {
  it('[CLIENT-REGISTRY-S002] saveCredentialReference returns browser-safe credential reference', () => {
    const source = readFileSync(fileURLToPath(serverActionPath.href), 'utf8');

    expect(source).toContain('toBrowserSafeCredentialReference');
    expect(source).toContain('BrowserSafeCredentialReference');
    expect(source).not.toContain('CredentialReferenceRecord');
  });
});

describe('Server Agent RPC factory SDK integration', () => {
  it('[TAMAC-SDK-S003] Client factory delegates transport and error normalization to the SDK', () => {
    const source = readFileSync(fileURLToPath(createClientPath.href), 'utf8');

    expect(source).toContain("import 'server-only';");
    expect(source).toContain('@cf-tamac/sdk');
    expect(source).toContain('createTamacAgentClient');
    expect(source).toContain('withErrorNormalization');
    expect(source).not.toContain('@connectrpc/connect');
    expect(source).not.toContain('@connectrpc/connect-web');
    expect(source).not.toContain('@cf-tamac/client-agent-rpc');
  });

  it('[TAMAC-SDK-S005] SDK-backed mutation actions project closed four-field Browser-safe results', () => {
    const helperSource = readFileSync(fileURLToPath(safeResultsPath.href), 'utf8');

    expect(helperSource).toContain('readonly displayData: TDisplayData;');
    expect(helperSource).toContain("readonly safeStatus: 'succeeded';");
    expect(helperSource).toContain("readonly safeStatus: 'failed';");
    expect(helperSource).toContain('readonly safeErrorCategory: null;');
    expect(helperSource).toContain('readonly correlationId: string;');

    for (const actionPath of sdkBackedMutationActionPaths) {
      const source = readFileSync(fileURLToPath(actionPath.href), 'utf8');
      expect(source).toContain('createBrowserSafeAgentRpc');
      expect(source).not.toContain('@cf-tamac/sdk');
      expect(source).not.toContain('@connectrpc/connect');
    }
  });

  it('[TAMAC-SDK-S005] SDK-backed query actions use closed envelopes and allowlisted display DTOs', () => {
    for (const actionPath of sdkBackedQueryActionPaths) {
      const source = readFileSync(fileURLToPath(actionPath.href), 'utf8');

      // query も mutation と同じ four-field result type を宣言し、unbounded response を直接返さない。
      expect(source).toContain('Promise<BrowserSafeAgentRpcActionResult<');
      expect(source).toContain('executeBrowserSafeAgentRpcQuery');
    }

    const safeResultsSource = readFileSync(fileURLToPath(safeResultsPath.href), 'utf8');
    expect(safeResultsSource).toContain('createBrowserSafeAgentRpcActionSuccess');
    expect(safeResultsSource).toContain('createBrowserSafeAgentRpcActionFailure');

    const lifecycleSource = readFileSync(
      fileURLToPath(new URL('../server/actions/agent-lifecycle.ts', import.meta.url).href),
      'utf8'
    );
    const querySources = sdkBackedQueryActionPaths
      .map((actionPath) => readFileSync(fileURLToPath(actionPath.href), 'utf8'))
      .join('\n');

    // raw state object / generated response を Browser へ返さず、mapper が許可した DTO だけを使う。
    expect(lifecycleSource).not.toContain('readonly state?: Record<string, unknown>');
    expect(lifecycleSource).toContain('toBrowserSafeAgentConfigPreview');
    expect(lifecycleSource).toContain('toBrowserSafeCapabilitySummary');
    expect(querySources).toContain('toBrowserSafeEventSummary');
    expect(querySources).toContain('toBrowserSafeThreadSummary');
    expect(querySources).toContain('toBrowserSafeRunSummary');
    expect(querySources).toContain('toBrowserSafeInstallationSummary');
    expect(querySources).toContain('toBrowserSafeScheduleSummary');
    expect(querySources).toContain('toBrowserSafeToolSummary');
    expect(querySources).toContain('toBrowserSafeInvocationSummary');
    expect(querySources).toContain('toBrowserSafeModelPolicyMetadata');
  });

  it('[TAMAC-SDK-S005] Health D1 verification write failure remains a closed Browser-safe result', async () => {
    // Agent RPC は verified response を返す一方、Client D1 ledger の後続更新だけを拒否する状態を再現します。
    healthActionMocks.loadAgentRpcClients.mockResolvedValueOnce({
      clients: {
        health: {
          check: () =>
            Promise.resolve({
              checkedAtUnixMs: BigInt(1700000000000),
              currentPrincipalTrust: { verified: true },
              status: 'serving',
            }),
        },
        invocation: { correlationId: 'health-d1-write-failure-001' },
        withErrorNormalization: async <T>(operation: () => Promise<T>): Promise<T> => operation(),
      },
    });
    healthActionMocks.markManagedAgentSigningVerified.mockRejectedValueOnce(
      new Error('raw Client D1 repository detail')
    );

    const { verifyAgentHealth } = await import('../server/actions/agent-health');
    const result = await verifyAgentHealth('agent-alpha');

    // 失敗時も top-level key は固定四属性だけで、repository exception 本文を Browser に含めません。
    expect(Object.keys(result).sort()).toEqual([
      'correlationId',
      'displayData',
      'safeErrorCategory',
      'safeStatus',
    ]);
    expect(result).toEqual({
      correlationId: 'health-d1-write-failure-001',
      displayData: {
        message: 'ヘルスチェック結果を保存できませんでした。時間をおいてもう一度実行してください。',
        title: 'Agentの接続状態を保存できませんでした',
      },
      safeErrorCategory: 'internal',
      safeStatus: 'failed',
    });
    expect(JSON.stringify(result)).not.toContain('raw Client D1 repository detail');
  });
});
