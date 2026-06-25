import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BrowserSafeModelPolicyMetadata } from '../components/schemas/model-policy';

const mocks = vi.hoisted(() => ({
  loadAgentRpcClients: vi.fn(),
  revalidatePath: vi.fn(),
  upsertModelPolicyForManagedAgent: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('../server/agent-rpc/agent-loader', () => ({
  loadAgentRpcClients: mocks.loadAgentRpcClients,
}));

vi.mock('../server/actions/model-policies', () => ({
  upsertModelPolicyForManagedAgent: mocks.upsertModelPolicyForManagedAgent,
}));

const ACTIVE_POLICY_METADATA: BrowserSafeModelPolicyMetadata = {
  policyRef: 'workers-ai-default',
  digest: 'sha256:policy',
  provider: 'workers-ai',
  model: '@cf/meta/llama-3.1-8b-instruct',
  version: '1',
  status: 'active',
  generationParameters: {
    temperature: '0.20',
    topP: '0.90',
    maxOutputTokens: '1024',
  },
  warnings: [],
};

describe('Default model policy save Server Action', () => {
  beforeEach(() => {
    mocks.loadAgentRpcClients.mockReset();
    mocks.revalidatePath.mockReset();
    mocks.upsertModelPolicyForManagedAgent.mockReset();
  });

  it('[AGENT-MANAGEMENT-UI-S018] returns permission_denied when UpdateConfig rejects after policy upsert', async () => {
    const { saveDefaultModelPolicy } = await import('../server/actions/agent-operations');
    const permissionError = { category: 'permission_denied' };
    const updateConfig = vi.fn().mockRejectedValue(permissionError);
    mocks.upsertModelPolicyForManagedAgent.mockResolvedValue({
      ok: true,
      metadata: ACTIVE_POLICY_METADATA,
      fieldErrors: {},
      warnings: [],
    });
    mocks.loadAgentRpcClients.mockResolvedValue({
      clients: {
        state: { updateConfig },
        withErrorNormalization: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
      },
    });

    const result = await saveDefaultModelPolicy('agent-alpha', 'idem-001', {
      policyRef: 'workers-ai-default',
      provider: 'workers-ai',
      model: '@cf/meta/llama-3.1-8b-instruct',
      temperature: '0.20',
      topP: '0.90',
      maxOutputTokens: '1024',
    });

    expect(updateConfig).toHaveBeenCalledWith({
      agentId: 'agent-alpha',
      idempotencyKey: 'idem-001:config',
      config: {
        agentId: 'agent-alpha',
        modelPolicyRef: 'workers-ai-default',
      },
    });
    expect(result.ok).toBe(false);
    expect(result.errorCategory).toBe('permission_denied');
    expect(result.formError).toBe('You do not have permission to update the default model policy.');
    expect(result.configVersion).toBeUndefined();
  });

  it('[AGENT-MANAGEMENT-UI-S018] builds Agent-compatible v1 model policy payload', async () => {
    const { buildAgentModelPolicyInput, toBrowserSafeModelPolicyMetadata } =
      await import('../server/actions/model-policy-view-models');

    const payload = await buildAgentModelPolicyInput({
      maxOutputTokens: '1024',
      model: '@cf/meta/llama-3.1-8b-instruct',
      policyRef: 'workers-ai-default',
      provider: 'workers-ai',
      temperature: '0.20',
      topP: '0.90',
    });
    const generationParametersRef = readRecord(payload.generationParametersRef);

    expect(payload.decisionSchemaVersion).toBe('v1');
    expect(generationParametersRef).toMatchObject({
      contentType: 'application/json; charset=utf-8',
      storageClass: 'inline-safe-json',
    });
    expect(readInlineJson(generationParametersRef)).toEqual({
      maxOutputTokens: '1024',
      temperature: '0.20',
      topP: '0.90',
    });
    const metadata = toBrowserSafeModelPolicyMetadata({
      decisionSchemaVersion: 'v1',
      modelId: '@cf/meta/llama-3.1-8b-instruct',
      policyDigest: 'a'.repeat(64),
      policyRef: 'workers-ai-default',
      provider: 'workers-ai',
      safeGenerationParametersRef: generationParametersRef,
      status: 'active',
      version: 1n,
    });
    expect(metadata?.generationParameters).toEqual({
      maxOutputTokens: '1024',
      temperature: '0.20',
      topP: '0.90',
    });
  });
});

function readInlineJson(value: Record<string, unknown> | undefined): unknown {
  const inlineBytes = value?.inlineBytes;
  if (!(inlineBytes instanceof Uint8Array)) return undefined;
  return JSON.parse(new TextDecoder().decode(inlineBytes)) as unknown;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}
