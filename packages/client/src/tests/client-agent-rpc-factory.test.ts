import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  createAgentRpcAuthHeaders,
  createClientServiceJwt,
  type ResolvedAgentRpcCredential,
} from '../server/agent-rpc/authentication';
import { createE2eFakeAgentRpcClients } from '../server/agent-rpc/e2e-fake-clients';
import {
  AgentRpcOperationError,
  normalizeAgentRpcError,
  withAgentRpcErrorNormalization,
} from '../server/agent-rpc/errors';
import {
  toBrowserSafeCredentialReference,
  toBrowserSafeCredentialReferences,
} from '../server/credentials/browser-safe';
import { resolveCredentialSecret } from '../server/credentials/secret-resolution';

import type { CredentialReferenceRecord } from '../server/db/access-credentials';

function makeCredentialRecord(
  overrides: Partial<CredentialReferenceRecord> = {}
): CredentialReferenceRecord {
  return {
    agentId: 'agent-alpha',
    credentialRef: 'wrangler-secret:agent-alpha-credential',
    keyId: 'key-001',
    publicFingerprint: 'sha256:abcdef',
    maskedHint: '****-****-****-001',
    status: 'active',
    createdAtMs: 1000,
    updatedAtMs: 2000,
    ...overrides,
  };
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

describe('Server-side Agent RPC client factory', () => {
  it('[CLIENT-REGISTRY-S003] generated Connect factory stays server-only and binary', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../server/agent-rpc/create-client.ts', import.meta.url).href),
      'utf8'
    );

    expect(source).toContain("import 'server-only';");
    expect(source).toContain("import { createClient, type Client } from '@connectrpc/connect';");
    expect(source).toContain("import { createConnectTransport } from '@connectrpc/connect-web';");
    expect(source).toContain('@cf-tamac/client-agent-rpc/cftamac/agent/v1_pb');
    expect(source).toContain('useBinaryFormat: true');
    expect(source).toContain('useHttpGet: false');
    expect(source).toContain('createClient(AgentLifecycleService, transport)');
    expect(source).toContain('createClient(AgentModelPolicyService, transport)');
    expect(source).toContain('createClient(AgentStateService, transport)');
  });

  it('[CLIENT-REGISTRY-S003] Server Action calls Agent RPC with generated Connect client metadata', () => {
    const metadata: ResolvedAgentRpcCredential = {
      agentId: 'agent-alpha',
      credentialRef: 'wrangler-secret:agent-alpha-credential',
      keyId: 'key-001',
      secretMaterial: 'resolved-secret-material',
      actingUser: {
        operatorId: 'operator-001',
        scopes: ['agent:read', 'agent:write'],
      },
    };

    const headers = createAgentRpcAuthHeaders(metadata);
    expect(headers.get('x-agent-id')).toBe('agent-alpha');
    expect(headers.get('x-client-credential-ref')).toBe('wrangler-secret:agent-alpha-credential');
    expect(headers.get('x-client-key-id')).toBe('key-001');
    expect(headers.get('x-client-acting-operator-id')).toBe('operator-001');
    expect(headers.get('x-client-acting-scopes')).toBe('agent:read agent:write');
  });

  it('[CLIENT-MANAGEMENT-S018] E2E fake safe metadata digest matches inline bytes', async () => {
    const clients = createE2eFakeAgentRpcClients('agent-alpha');
    const getModelPolicy = clients.modelPolicies.getModelPolicy as unknown as (
      request: Record<string, unknown>
    ) => Promise<Record<string, unknown>>;

    const response = await getModelPolicy({
      agentId: 'agent-alpha',
      policyRef: 'workers-ai-default',
    });
    const policy = readRecord(response.policy);
    const safeMetadataRef = readRecord(policy?.safeMetadataRef);
    const inlineBytes = safeMetadataRef?.inlineBytes;

    expect(inlineBytes).toBeInstanceOf(Uint8Array);
    expect(safeMetadataRef?.sha256).toBe(
      createHash('sha256')
        .update(inlineBytes instanceof Uint8Array ? inlineBytes : new Uint8Array())
        .digest('hex')
    );
  });

  it('[CLIENT-REGISTRY-S003] auth headers omit acting user context when not provided', () => {
    const credential: ResolvedAgentRpcCredential = {
      agentId: 'agent-beta',
      credentialRef: 'wrangler-secret:agent-beta-credential',
      keyId: 'key-002',
      secretMaterial: 'resolved-secret-material',
    };
    const headers = createAgentRpcAuthHeaders(credential);
    expect(headers.get('x-client-acting-operator-id')).toBeNull();
    expect(headers.get('x-client-acting-scopes')).toBeNull();
  });

  it('[CLIENT-REGISTRY-S003] auth headers do not expose secret material in reference headers', () => {
    const credential: ResolvedAgentRpcCredential = {
      agentId: 'agent-beta',
      credentialRef: 'wrangler-secret:agent-beta-credential',
      keyId: 'key-002',
      secretMaterial: 'resolved-secret-material',
    };
    const headers = createAgentRpcAuthHeaders(credential);
    expect(headers.get('Authorization')).toBeNull();
    expect(Array.from(headers.keys())).not.toContain('authorization');
  });

  it('[CLIENT-REGISTRY-S003] Client Service JWT signs without exposing raw secret material', async () => {
    const credential: ResolvedAgentRpcCredential = {
      agentId: 'agent-beta',
      credentialRef: 'wrangler-secret:agent-beta-credential',
      keyId: 'key-002',
      secretMaterial: 'resolved-secret-material',
      actingUser: {
        operatorId: 'operator-002',
        scopes: ['agent:read'],
      },
    };

    const jwt = await createClientServiceJwt(credential);
    expect(jwt.split('.')).toHaveLength(3);
    expect(jwt).not.toContain('resolved-secret-material');
    expect(jwt).not.toContain('wrangler-secret:agent-beta-credential');
  });

  it('[CLIENT-REGISTRY-S003] RPC error normalization maps errors to browser-safe messages', () => {
    const error = new Error('permission denied: insufficient scope');
    const normalized = normalizeAgentRpcError(error);
    expect(normalized).toBeInstanceOf(AgentRpcOperationError);
    expect(normalized.category).toBe('internal');
    expect(normalized.message).not.toContain('permission denied');
    expect(normalized.message).not.toContain('insufficient scope');
  });

  it('[CLIENT-REGISTRY-S003] withAgentRpcErrorNormalization wraps thrown errors', async () => {
    await expect(
      withAgentRpcErrorNormalization(() => Promise.reject(new Error('connect failure')))
    ).rejects.toBeInstanceOf(AgentRpcOperationError);

    const result = await withAgentRpcErrorNormalization(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });
});

describe('Browser-safe credential serialization', () => {
  it('[CLIENT-REGISTRY-S002] browser-safe credential reference excludes secret lookup material', () => {
    const record = makeCredentialRecord();
    const safe = toBrowserSafeCredentialReference(record);
    const safeKeys = Object.keys(safe);

    expect(safeKeys).toContain('agentId');
    expect(safeKeys).toContain('keyId');
    expect(safeKeys).toContain('maskedHint');
    expect(safeKeys).toContain('status');
    expect(safeKeys).not.toContain('credentialRef');
    expect(safeKeys).not.toContain('publicFingerprint');
    expect(safeKeys).not.toContain('secretMaterial');
    expect(safeKeys).not.toContain('secret');
  });

  it('toBrowserSafeCredentialReferences maps lists', () => {
    const records = [
      makeCredentialRecord({ keyId: 'key-001' }),
      makeCredentialRecord({ keyId: 'key-002' }),
    ];
    const safe = toBrowserSafeCredentialReferences(records);
    expect(safe).toHaveLength(2);
    expect(safe[0]?.keyId).toBe('key-001');
    expect(safe[1]?.keyId).toBe('key-002');
  });
});

describe('Credential secret resolution boundary', () => {
  it('[CLIENT-REGISTRY-S002] resolveCredentialSecret rejects unsafe credential references', async () => {
    const env = {
      CLIENT_DB: {},
      AGENT_RPC_DEFAULT_ORIGIN: 'http://localhost:8787',
      CLIENT_CREDENTIAL_SECRET_REF: 'CLIENT_CREDENTIAL_ENCRYPTION_KEY',
      AGENT_CREDENTIAL_ALPHA: 'secret-value',
    } as unknown as Parameters<typeof resolveCredentialSecret>[0];

    await expect(resolveCredentialSecret(env, 'agent-alpha', 'CLIENT_DB')).rejects.toThrow();

    await expect(
      resolveCredentialSecret(env, 'agent-alpha', 'AGENT_CREDENTIAL_alpha')
    ).rejects.toThrow();

    await expect(resolveCredentialSecret(env, 'agent-alpha', '../etc/passwd')).rejects.toThrow();
  });

  it('[CLIENT-REGISTRY-S002] resolveCredentialSecret accepts allowed prefix and resolves secret', async () => {
    const env = {
      CLIENT_DB: {},
      AGENT_RPC_DEFAULT_ORIGIN: 'http://localhost:8787',
      CLIENT_CREDENTIAL_SECRET_REF: 'CLIENT_CREDENTIAL_ENCRYPTION_KEY',
      AGENT_CREDENTIAL_ALPHA: 'secret-value',
    } as unknown as Parameters<typeof resolveCredentialSecret>[0];

    const resolved = await resolveCredentialSecret(env, 'agent-alpha', 'AGENT_CREDENTIAL_ALPHA');
    expect(resolved.agentId).toBe('agent-alpha');
    expect(resolved.secretMaterial).toBe('secret-value');
  });

  it('[CLIENT-REGISTRY-S002] resolveCredentialSecret error messages do not leak credentialRef', async () => {
    const env = {
      CLIENT_DB: {},
      AGENT_RPC_DEFAULT_ORIGIN: 'http://localhost:8787',
      CLIENT_CREDENTIAL_SECRET_REF: 'CLIENT_CREDENTIAL_ENCRYPTION_KEY',
    } as unknown as Parameters<typeof resolveCredentialSecret>[0];

    try {
      await resolveCredentialSecret(env, 'agent-alpha', 'AGENT_CREDENTIAL_MISSING');
      expect.fail('should have thrown');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain('AGENT_CREDENTIAL_MISSING');
      expect(message).not.toContain('agent-alpha');
    }
  });
});
