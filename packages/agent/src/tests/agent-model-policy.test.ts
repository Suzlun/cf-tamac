import { describe, expect, it } from 'vitest';

import {
  mapAgentModelPolicyRow,
  mapAgentModelPolicySummaryRow,
} from '../domain/model-policy-operations';
import {
  computeAgentModelPolicyDigest,
  createAgentModelPolicyRepository,
  validateAgentModelPolicy,
  type AgentModelPolicyInputRecord,
  type AgentModelPolicyRow,
} from '../storage';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

describe('Agent model policy repository', () => {
  it('[AGENT-MODEL-POLICY-S001] Model policy upsert stores safe metadata and digest only', () => {
    const rows: Mutable<AgentModelPolicyRow>[] = [];
    const repository = createAgentModelPolicyRepository(
      'agent-alpha',
      createInMemoryPolicyDatabase(rows)
    );
    const policy = createSafePolicyInput();

    const row = repository.upsertPolicy({
      nowMs: 1_700_000_000_000,
      policy,
      principalId: 'principal-1',
    });

    expect(row).toMatchObject({
      budgetMetadataRef: 'policy-metadata://budget/default',
      budgetMetadataSha256: 'b'.repeat(64),
      createdByPrincipalId: 'principal-1',
      decisionSchemaVersion: 'v1',
      generationMaxOutputTokens: 512,
      generationParametersRef: 'policy-metadata://generation/default',
      generationParametersSha256: 'a'.repeat(64),
      generationTemperature: '0.35',
      generationTopP: '0.75',
      modelId: '@cf/meta/llama-3.1-8b-instruct',
      policyRef: 'workers-ai-default',
      provider: 'workers-ai',
      safeMetadataRef: 'policy-metadata://safe/default',
      safeMetadataSha256: 'c'.repeat(64),
      status: 'active',
      version: 1,
    });
    expect(row.policyDigest).toMatch(/^[\da-f]{64}$/);
    expect(row.policyDigest).toBe(computeAgentModelPolicyDigest(policy, 1));
    expect(JSON.stringify(row)).not.toMatch(/bearer|sk-|raw prompt|raw completion|reasoning/i);
  });

  it('[AGENT-MODEL-POLICY-S001] Model policy views restore safe generation metadata without raw bodies', async () => {
    const rows: Mutable<AgentModelPolicyRow>[] = [];
    const repository = createAgentModelPolicyRepository(
      'agent-alpha',
      createInMemoryPolicyDatabase(rows)
    );
    const row = repository.upsertPolicy({
      nowMs: 1_700_000_000_000,
      policy: createSafePolicyInput(),
      principalId: 'principal-1',
    });

    const summary = mapAgentModelPolicySummaryRow('agent-alpha', row);
    const full = mapAgentModelPolicyRow('agent-alpha', row);

    expect(readInlineJson(summary.safeMetadataRef)?.generationParameters).toEqual({
      maxOutputTokens: '512',
      temperature: '0.35',
      topP: '0.75',
    });
    expect(readInlineJson(full.safeGenerationParametersRef)).toEqual({
      maxOutputTokens: '512',
      temperature: '0.35',
      topP: '0.75',
    });
    expect(summary.safeMetadataRef?.sha256).toBe(
      await sha256Hex(summary.safeMetadataRef?.inlineBytes)
    );
    expect(full.safeGenerationParametersRef?.sha256).toBe(
      await sha256Hex(full.safeGenerationParametersRef?.inlineBytes)
    );
    expect(JSON.stringify({ full, summary })).not.toMatch(
      /bearer|sk-|raw prompt|raw completion|reasoning/i
    );
  });

  it('[AGENT-MODEL-POLICY-S002] Unsupported provider or model is rejected before state changes', () => {
    const rows: Mutable<AgentModelPolicyRow>[] = [];
    const repository = createAgentModelPolicyRepository(
      'agent-alpha',
      createInMemoryPolicyDatabase(rows)
    );
    const invalidPolicy = {
      ...createSafePolicyInput(),
      credentialRef: 'Bearer secret-token',
      modelId: 'openai:gpt-4.1',
      provider: 'external-provider',
    } satisfies AgentModelPolicyInputRecord;

    const validation = validateAgentModelPolicy(invalidPolicy, 1_700_000_000_000);

    expect(validation.ok).toBe(false);
    expect(validation.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'unsupported_provider',
        'unsupported_model',
        'unsafe_credential_reference',
      ])
    );
    expect(() =>
      repository.upsertPolicy({
        nowMs: 1_700_000_000_000,
        policy: invalidPolicy,
        principalId: 'principal-1',
      })
    ).toThrow(/validation failed/);
    expect(rows).toHaveLength(0);
  });
});

function createSafePolicyInput(): AgentModelPolicyInputRecord {
  return {
    budgetMetadataRef: {
      ref: 'policy-metadata://budget/default',
      sha256: 'b'.repeat(64),
      storageClass: 'reference',
    },
    credentialRef: 'credential-reference://workers-ai/default',
    decisionSchemaVersion: 'v1',
    generationParametersRef: {
      inlineBytes: encodeJson({ maxOutputTokens: '512', temperature: '0.35', topP: '0.75' }),
      ref: 'policy-metadata://generation/default',
      sha256: 'a'.repeat(64),
      storageClass: 'inline',
    },
    modelId: '@cf/meta/llama-3.1-8b-instruct',
    policyRef: 'workers-ai-default',
    provider: 'workers-ai',
    safeMetadataRef: {
      ref: 'policy-metadata://safe/default',
      sha256: 'c'.repeat(64),
      storageClass: 'reference',
    },
    safetyMetadataRef: {
      ref: 'policy-metadata://safety/default',
      sha256: 'd'.repeat(64),
      storageClass: 'reference',
    },
    status: 'active',
  };
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function readInlineJson(
  value: { readonly inlineBytes?: Uint8Array } | undefined
): Record<string, unknown> {
  const inlineBytes = value?.inlineBytes;
  if (inlineBytes === undefined) return {};
  return JSON.parse(new TextDecoder().decode(inlineBytes)) as Record<string, unknown>;
}

async function sha256Hex(bytes: Uint8Array | undefined): Promise<string | undefined> {
  if (bytes === undefined) return undefined;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function createInMemoryPolicyDatabase(rows: Mutable<AgentModelPolicyRow>[]) {
  return {
    insert: () => ({
      values: (value: Mutable<AgentModelPolicyRow> & { readonly agentId: string }) => ({
        run: () => {
          rows.push(value);
        },
      }),
    }),
    select: () => {
      const query = {
        all: () => [...rows],
        from: () => query,
        get: () => rows[0],
        limit: () => query,
        orderBy: () => query,
        where: () => query,
      };
      return query;
    },
    update: () => ({
      set: (value: Partial<Mutable<AgentModelPolicyRow>>) => ({
        where: () => ({
          run: () => {
            if (rows[0] !== undefined) Object.assign(rows[0], value);
          },
        }),
      }),
    }),
  } as unknown as Parameters<typeof createAgentModelPolicyRepository>[1];
}
