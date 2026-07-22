import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BrowserSafeModelPolicyMetadata } from '../components/schemas/model-policy';

const mocks = vi.hoisted(() => ({
  loadAgentRpcClients: vi.fn(),
  revalidatePath: vi.fn(),
  upsertModelPolicyWithClients: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('../server/agent-rpc/agent-loader', () => ({
  loadAgentRpcClients: mocks.loadAgentRpcClients,
}));

vi.mock('../server/actions/model-policies', () => ({
  upsertModelPolicyWithClients: mocks.upsertModelPolicyWithClients,
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
    mocks.upsertModelPolicyWithClients.mockReset();
  });

  it('[AGENT-MANAGEMENT-UI-S018] shares one client/correlation and derives :policy/:config keys in order', async () => {
    const { saveDefaultModelPolicy } = await import('../server/actions/agent-operations');
    const permissionError = new Error('safe test failure');
    const updateConfig = vi.fn().mockRejectedValue(permissionError);
    const getConfig = vi
      .fn()
      .mockResolvedValueOnce({ config: { configVersion: '10', modelPolicyRef: 'previous-policy' } })
      .mockResolvedValueOnce({
        config: { configVersion: '10', modelPolicyRef: 'previous-policy' },
      });
    mocks.upsertModelPolicyWithClients.mockResolvedValue({
      correlationId: 'save-correlation',
      displayData: {
        fieldErrors: {},
        message: '既定モデルポリシーを保存しました。',
        metadata: ACTIVE_POLICY_METADATA,
        ok: true,
        title: '既定モデルポリシーを保存しました',
        warnings: [],
      },
      safeErrorCategory: null,
      safeStatus: 'succeeded',
    });
    mocks.loadAgentRpcClients.mockResolvedValue({
      clients: {
        state: { getConfig, updateConfig },
        invocation: {
          actingUser: { actingUserId: 'operator-test' },
          agentId: 'agent-alpha',
          correlationId: 'save-correlation',
          requestId: 'save-request',
          scopes: ['agent:write'],
        },
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
    expect(mocks.upsertModelPolicyWithClients).toHaveBeenCalledWith(
      expect.objectContaining({
        invocation: expect.objectContaining({ correlationId: 'save-correlation' }),
      }),
      'agent-alpha',
      'idem-001:policy',
      expect.objectContaining({ policyRef: 'workers-ai-default' })
    );
    expect(getConfig).toHaveBeenCalledTimes(2);
    expect(result.safeStatus).toBe('failed');
    expect(result.safeErrorCategory).toBe('internal');
    expect(result.displayData.configVersion).toBeUndefined();
  });

  it('[AGENT-MANAGEMENT-UI-S018] reconciles an uncertain UpdateConfig response when desired ref and non-empty config version are confirmed', async () => {
    const { saveDefaultModelPolicy } = await import('../server/actions/agent-operations');
    const updateConfig = vi.fn().mockRejectedValue(new Error('response lost'));
    const getConfig = vi
      .fn()
      .mockResolvedValueOnce({ config: { configVersion: '9', modelPolicyRef: 'previous-policy' } })
      .mockResolvedValueOnce({
        config: { configVersion: ' 11 ', modelPolicyRef: 'workers-ai-default' },
        defaultModelPolicy: {
          modelId: '@cf/meta/llama-3.1-8b-instruct',
          policyDigest: 'sha256:policy',
          policyRef: 'workers-ai-default',
          provider: 'workers-ai',
          status: 'active',
          version: 1n,
        },
      });
    const clients = createClients(getConfig, updateConfig);
    mocks.loadAgentRpcClients.mockResolvedValue({ clients });
    mocks.upsertModelPolicyWithClients.mockResolvedValue(successfulUpsert());

    const result = await saveDefaultModelPolicy('agent-alpha', 'idem-002', createDraft());

    expect(result).toMatchObject({
      correlationId: 'save-correlation',
      safeErrorCategory: null,
      safeStatus: 'succeeded',
    });
    expect(result.displayData.configVersion).toBe('11');
    expect(result.displayData.reconciliationRequired).toBeUndefined();
    expect(mocks.upsertModelPolicyWithClients).toHaveBeenCalledWith(
      clients,
      'agent-alpha',
      'idem-002:policy',
      createDraft()
    );
    expect(updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'idem-002:config' })
    );
  });

  it('[AGENT-MANAGEMENT-UI-S018] rejects empty or whitespace config versions as invalid_argument instead of unknown', async () => {
    const { saveDefaultModelPolicy } = await import('../server/actions/agent-operations');
    const getConfig = vi.fn().mockResolvedValue({
      config: { configVersion: '8', modelPolicyRef: 'previous-policy' },
    });
    const updateConfig = vi.fn().mockResolvedValue({
      config: { configVersion: '   ', modelPolicyRef: 'workers-ai-default' },
    });
    mocks.loadAgentRpcClients.mockResolvedValue({
      clients: createClients(getConfig, updateConfig),
    });
    mocks.upsertModelPolicyWithClients.mockResolvedValue(successfulUpsert());

    const result = await saveDefaultModelPolicy('agent-alpha', 'idem-003', createDraft());

    expect(result.safeStatus).toBe('failed');
    expect(result.safeErrorCategory).toBe('invalid_argument');
    expect(result.displayData.errorCategory).toBe('invalid_argument');
    expect(result.displayData.configVersion).toBeUndefined();
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

function successfulUpsert() {
  return {
    correlationId: 'save-correlation',
    displayData: {
      fieldErrors: {},
      message: '既定モデルポリシーを保存しました。',
      metadata: ACTIVE_POLICY_METADATA,
      ok: true,
      title: '既定モデルポリシーを保存しました',
      warnings: [],
    },
    safeErrorCategory: null,
    safeStatus: 'succeeded' as const,
  };
}

function createDraft() {
  return {
    policyRef: 'workers-ai-default',
    provider: 'workers-ai' as const,
    model: '@cf/meta/llama-3.1-8b-instruct',
    temperature: '0.20',
    topP: '0.90',
    maxOutputTokens: '1024',
  };
}

function createClients(
  getConfig: ReturnType<typeof vi.fn>,
  updateConfig: ReturnType<typeof vi.fn>
) {
  return {
    state: { getConfig, updateConfig },
    invocation: {
      actingUser: { actingUserId: 'operator-test' },
      agentId: 'agent-alpha',
      correlationId: 'save-correlation',
      requestId: 'save-request',
      scopes: ['agent:write'],
    },
    withErrorNormalization: async <T>(callback: () => Promise<T>): Promise<T> => await callback(),
  };
}

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
