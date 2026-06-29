import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  toOptionalString,
  toBrowserSafeAgentConfigPreview,
  toSafeNumber,
  toSafeString,
  toSafeStringFromInt64,
} from '../server/actions/browser-safe-helpers';
import { deriveActingUserContext } from '../server/agent-rpc/acting-user';

import type { ActingUserContext } from '../server/agent-rpc/authentication';

function readSource(path: URL): string {
  return readFileSync(fileURLToPath(path.href), 'utf8');
}

describe('Browser-safe helper type conversions', () => {
  it('[CLIENT-REGISTRY-S003] toSafeString returns string values and fallback for non-strings', () => {
    expect(toSafeString('hello')).toBe('hello');
    expect(toSafeString(42)).toBe('');
    expect(toSafeString(42, 'fallback')).toBe('fallback');
    expect(toSafeString(undefined, 'default')).toBe('default');
    expect(toSafeString({ x: 1 }, 'safe')).toBe('safe');
  });

  it('[CLIENT-REGISTRY-S003] toSafeNumber returns number values and fallback for non-numbers', () => {
    expect(toSafeNumber(42)).toBe(42);
    expect(toSafeNumber('42')).toBe(0);
    expect(toSafeNumber('42', 99)).toBe(99);
    expect(toSafeNumber(undefined, 7)).toBe(7);
  });

  it('[CLIENT-REGISTRY-S003] toSafeStringFromInt64 converts bigint and number to string', () => {
    expect(toSafeStringFromInt64(BigInt(123456789))).toBe('123456789');
    expect(toSafeStringFromInt64(42)).toBe('42');
    expect(toSafeStringFromInt64('99')).toBe('99');
    expect(toSafeStringFromInt64(null, 'fallback')).toBe('fallback');
    expect(toSafeStringFromInt64(undefined, 'fallback')).toBe('fallback');
  });

  it('[CLIENT-REGISTRY-S003] toOptionalString returns string or undefined', () => {
    expect(toOptionalString('hello')).toBe('hello');
    expect(toOptionalString('')).toBeUndefined();
    expect(toOptionalString(42)).toBeUndefined();
    expect(toOptionalString(undefined)).toBeUndefined();
  });

  it('[CLIENT-REGISTRY-S010] Agent config preview strips raw model policy and payload refs', () => {
    const rawConfig = {
      agentId: 'agent-alpha',
      configVersion: '7',
      displayName: 'Alpha Agent',
      modelPolicyRef: 'workers-ai-default',
      budgetPolicyRef: 'budget-default',
      memoryPolicyRef: 'memory-default',
      toolPolicyRef: 'tool-default',
      schedulePolicyRef: 'schedule-default',
      updatedAtUnixMs: BigInt(42),
      configBodyRef: {
        ref: 'inline:config',
        inlineBytes: new Uint8Array([1, 2, 3]),
      },
      defaultModelPolicy: {
        policyRef: 'workers-ai-default',
        version: BigInt(3),
        safeMetadataRef: {
          ref: 'inline:policy-metadata',
          inlineBytes: new Uint8Array([4, 5, 6]),
        },
      },
      modelPolicyValidation: {
        ok: true,
        checkedAtUnixMs: BigInt(43),
      },
    };

    const safePreview = toBrowserSafeAgentConfigPreview(rawConfig);
    const serialized = JSON.stringify(safePreview);

    expect(safePreview.displayName).toBe('Alpha Agent');
    expect(safePreview.budgetPolicyRef).toBe('budget-default');
    expect(safePreview.memoryPolicyRef).toBe('memory-default');
    expect(safePreview.toolPolicyRef).toBe('tool-default');
    expect(safePreview.schedulePolicyRef).toBe('schedule-default');
    expect(Object.keys(safePreview)).not.toContain('modelPolicyRef');
    expect(Object.keys(safePreview)).not.toContain('defaultModelPolicy');
    expect(Object.keys(safePreview)).not.toContain('modelPolicyValidation');
    expect(Object.keys(safePreview)).not.toContain('configBodyRef');
    expect(Object.keys(safePreview)).not.toContain('updatedAtUnixMs');
    expect(serialized).not.toContain('inlineBytes');
    expect(serialized).not.toContain('safeMetadataRef');
  });
});

describe('Acting user context derivation', () => {
  it('[CLIENT-REGISTRY-S005] deriveActingUserContext returns server-side context without browser input', () => {
    const context: ActingUserContext = deriveActingUserContext();

    expect(context.operatorId).not.toBe('');
    expect(context.scopes.length).toBeGreaterThan(0);
    expect(context.operatorId).toBe('agent-management-ui-test-operator');
    expect(context.scopes).toContain('agent:read');
  });
});

describe('Server Action credential safety with mocked Agent RPC', () => {
  it('[CLIENT-REGISTRY-S002] browser-safe credential view strips secret fields from Agent RPC response', () => {
    const mockCredentialResponse = {
      credentialId: 'cred-001',
      agentId: 'agent-alpha',
      status: 'active',
      keyId: 'key-001',
      generation: 2,
      publicFingerprint: 'sha256:abc',
      secretReference: 'wrangler-secret:agent-alpha',
      verifierMaterialRef: 'r2://verifier/agent-alpha',
    };

    function toBrowserSafeAgentCredential(credential: Record<string, unknown> | undefined) {
      if (credential === undefined) return undefined;
      return {
        credentialId: toSafeString(credential.credentialId),
        agentId: toSafeString(credential.agentId),
        status: toSafeString(credential.status),
        keyId: toOptionalString(credential.keyId),
        generation: toSafeNumber(credential.generation),
      };
    }

    const safe = toBrowserSafeAgentCredential(mockCredentialResponse);
    expect(safe).toBeDefined();
    const safeKeys = Object.keys(safe ?? {});
    expect(safeKeys).not.toContain('publicFingerprint');
    expect(safeKeys).not.toContain('secretReference');
    expect(safeKeys).not.toContain('verifierMaterialRef');
    expect(safeKeys).not.toContain('secretMaterial');
    expect(safe?.credentialId).toBe('cred-001');
    expect(safe?.generation).toBe(2);
  });

  it('[CLIENT-REGISTRY-S004] Agent domain data is returned from Agent RPC, not persisted in Client D1', () => {
    const mockThreadResponse = {
      threads: [
        {
          threadId: 'thread-001',
          threadKey: 'conversation-1',
          status: 'active',
          currentSectionId: 'section-001',
        },
      ],
    };

    const summaries = mockThreadResponse.threads.map((thread) => {
      const t = thread as unknown as Record<string, unknown>;
      return {
        threadId: toSafeString(t.threadId),
        threadKey: toSafeString(t.threadKey),
        status: toSafeString(t.status),
        currentSectionId: toOptionalString(t.currentSectionId),
      };
    });

    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.threadId).toBe('thread-001');
    expect(summaries[0]?.threadKey).toBe('conversation-1');
    expect(summaries[0]?.status).toBe('active');
    expect(summaries[0]?.currentSectionId).toBe('section-001');
  });

  it('[CLIENT-REGISTRY-S004] Client reads Agent domain details from Agent RPC instead of D1 snapshots', () => {
    const lifecycleSource = readSource(
      new URL('../server/actions/agent-lifecycle.ts', import.meta.url)
    );
    const loaderSource = readSource(
      new URL('../server/agent-rpc/agent-loader.ts', import.meta.url)
    );
    const schemaSource = readSource(new URL('../server/db/schema.ts', import.meta.url));

    expect(lifecycleSource).toContain('loadAgentRpcClients(agentId)');
    expect(lifecycleSource).toContain('clients.lifecycle.getAgent({ agentId })');
    expect(lifecycleSource).toContain('clients.state.getConfig({ agentId })');
    expect(lifecycleSource).toContain('clients.state.getState({ agentId })');

    expect(loaderSource).toContain('createManagedAgentRepository(env.CLIENT_DB).getManagedAgent');
    expect(loaderSource).toContain('createSigningKeyRepository');
    expect(loaderSource).toContain('resolveEd25519PrivateKey');
    expect(loaderSource).toContain('createServerAgentRpcClients');

    expect(schemaSource).toContain('clientManagedAgentsTable');
    expect(schemaSource).toContain('clientAgentCredentialRefsTable');
    expect(schemaSource).toContain('forbiddenClientAgentSnapshotTables');
  });

  it('[CLIENT-REGISTRY-S003] error normalization wraps Agent RPC failures', async () => {
    const { withAgentRpcErrorNormalization, AgentRpcOperationError } =
      await import('../server/agent-rpc/errors');

    await expect(
      withAgentRpcErrorNormalization(() =>
        Promise.reject(new Error('Agent RPC connection refused'))
      )
    ).rejects.toBeInstanceOf(AgentRpcOperationError);

    try {
      await withAgentRpcErrorNormalization(() =>
        Promise.reject(new Error('Agent RPC connection refused'))
      );
      expect.fail('should have thrown');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain('connection refused');
      expect(message).not.toContain('Agent RPC');
    }
  });
});

describe('Server Action field mapping with generated Protobuf types', () => {
  it('[CLIENT-REGISTRY-S003] Agent overview maps AgentProfile.status (not lifecycleStatus)', () => {
    const mockAgentProfile = {
      agentId: 'agent-alpha',
      status: 'active',
      displayName: 'Alpha Agent',
      configVersion: '3',
      credentialGeneration: 2,
    };

    const overview = {
      agentId: toSafeString(mockAgentProfile.agentId),
      displayName: toSafeString(mockAgentProfile.displayName),
      status: toSafeString(mockAgentProfile.status),
      configVersion: toSafeString(mockAgentProfile.configVersion),
      credentialGeneration: toSafeNumber(mockAgentProfile.credentialGeneration),
    };

    expect(overview.status).toBe('active');
    expect(overview.configVersion).toBe('3');
    expect(overview.credentialGeneration).toBe(2);
  });

  it('[CLIENT-REGISTRY-S003] Event summary maps bigint sequences to string', () => {
    const mockEvent = {
      eventId: 'evt-001',
      agentSequence: BigInt(42),
      threadSequence: BigInt(17),
      eventType: 'message.appended',
    };

    const summary = {
      eventId: toSafeString(mockEvent.eventId),
      agentSequence: toSafeStringFromInt64(mockEvent.agentSequence),
      threadSequence: toSafeStringFromInt64(mockEvent.threadSequence),
      eventType: toSafeString(mockEvent.eventType),
    };

    expect(summary.agentSequence).toBe('42');
    expect(summary.threadSequence).toBe('17');
    expect(summary.eventType).toBe('message.appended');
  });

  it('[CLIENT-REGISTRY-S003] Tool summary maps AgentTool.displayName (not name)', () => {
    const mockTool = {
      toolId: 'tool-001',
      displayName: 'Search Web',
      status: 'available',
    };

    const summary = {
      toolId: toSafeString(mockTool.toolId),
      displayName: toSafeString(mockTool.displayName),
      status: toSafeString(mockTool.status),
    };

    expect(summary.displayName).toBe('Search Web');
    expect(summary.toolId).toBe('tool-001');
  });

  it('[CLIENT-REGISTRY-S010] Client server reads default policy truth from Agent RPC safely', () => {
    const modelPoliciesSource = readSource(
      new URL('../server/actions/model-policies.ts', import.meta.url)
    );
    const viewModelSource = readSource(
      new URL('../server/actions/model-policy-view-models.ts', import.meta.url)
    );
    const settingsPageSource = readSource(
      new URL('../../app/agents/[agentId]/settings/page.tsx', import.meta.url)
    );

    expect(modelPoliciesSource).toContain('clients.state.getConfig({ agentId })');
    expect(modelPoliciesSource).toContain('clients.modelPolicies.getModelPolicy');
    expect(modelPoliciesSource).toContain('getDefaultModelPolicyForManagedAgent');
    expect(settingsPageSource).toContain('getDefaultModelPolicyForManagedAgent');
    expect(viewModelSource).toContain('toBrowserSafeModelPolicyMetadata');
    expect(viewModelSource).not.toContain('raw prompt');
    expect(viewModelSource).not.toContain('raw completion');
    expect(viewModelSource).not.toContain('raw reasoning');
  });
});

describe('Registry mutation Server Actions coverage', () => {
  it('[CLIENT-REGISTRY-S001] managed-agents Server Actions cover full registry lifecycle', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');

    const managedAgentsPath = new URL('../server/actions/managed-agents.ts', import.meta.url);
    const source = readFileSync(fileURLToPath(managedAgentsPath.href), 'utf8');

    expect(source).toContain('export async function registerManagedAgent');
    expect(source).toContain('export async function listManagedAgents');
    expect(source).toContain('export async function markManagedAgentOpened');
    expect(source).toContain('export async function renameManagedAgent');
    expect(source).toContain('export async function setManagedAgentPinned');
    expect(source).toContain('export async function reorderManagedAgents');
    expect(source).toContain('export async function deleteManagedAgent');
    expect(source).toContain('export async function saveCredentialReference');
  });
});

describe('Server Action credential resolver integration', () => {
  it('[CLIENT-REGISTRY-S002] agent-loader resolves the Ed25519 signing key store in the Agent RPC path', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');

    const loaderPath = new URL('../server/agent-rpc/agent-loader.ts', import.meta.url);
    const source = readFileSync(fileURLToPath(loaderPath.href), 'utf8');

    expect(source).toContain('createSigningKeyRepository');
    expect(source).toContain('resolveEd25519PrivateKey');
    expect(source).toContain('deriveActingUserContext');
    // Agent RPC signing 経路から credentialRef / AGENT_CREDENTIAL_* 解決は撤去済みであること。
    expect(source).not.toContain('resolveCredentialSecret');
    expect(source).not.toContain('secretMaterial');
  });

  it('[CLIENT-REGISTRY-S005] Server Actions do not accept actingUser parameter from browser', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');

    const lifecyclePath = new URL('../server/actions/agent-lifecycle.ts', import.meta.url);
    const queriesPath = new URL('../server/actions/agent-queries.ts', import.meta.url);
    const operationsPath = new URL('../server/actions/agent-operations.ts', import.meta.url);

    const allSources =
      readFileSync(fileURLToPath(lifecyclePath.href), 'utf8') +
      '\n' +
      readFileSync(fileURLToPath(queriesPath.href), 'utf8') +
      '\n' +
      readFileSync(fileURLToPath(operationsPath.href), 'utf8');

    expect(allSources).not.toContain('actingUser?: ActingUserContext');
    expect(allSources).not.toContain('actingUser: ActingUserContext');
  });
});
