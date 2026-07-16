import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { createServerAgentRpcClients } from '../server/agent-rpc/create-client';
import { createE2eFakeAgentRpcClients } from '../server/agent-rpc/e2e-fake-clients';
import { parseApprovedAgentRpcOrigins } from '../server/agent-rpc/origin-policy';
import {
  browserSafeErrorTitle,
  createBrowserSafeAgentRpcFailure,
  createBrowserSafeAgentRpcSuccess,
} from '../server/agent-rpc/safe-results';
import {
  toBrowserSafeCredentialReference,
  toBrowserSafeSigningKey,
} from '../server/credentials/browser-safe';
import {
  generateEd25519SigningKeyMaterial,
  resolveEd25519PrivateKey,
} from '../server/credentials/signing-keys';

import type { CredentialReferenceRecord } from '../server/db/access-credentials';

const TEST_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 7).toString('base64');
const agentLoaderPath = new URL('../server/agent-rpc/agent-loader.ts', import.meta.url);
const createClientPath = new URL('../server/agent-rpc/create-client.ts', import.meta.url);

function createApprovedOrigin() {
  const approvedOrigin = parseApprovedAgentRpcOrigins('["https://agent.example.test"]')
    .values()
    .next().value;
  if (approvedOrigin === undefined) {
    throw new Error('test origin must be configured');
  }
  return approvedOrigin;
}

/**
 * Client D1 が解決した SDK signing context を再現する test helper です。
 *
 * @returns Ed25519 private CryptoKey と public credential identity だけを持つ server-only context。
 * @remarks
 * Browser payload に含めない private key を SDK adapter が受け取る経路を、実際の Client signing key helper
 * を使って検証します。
 */
async function createSigningContext() {
  const material = await generateEd25519SigningKeyMaterial(TEST_ENCRYPTION_KEY_BASE64);
  const privateKey = await resolveEd25519PrivateKey(
    TEST_ENCRYPTION_KEY_BASE64,
    material.privateJwkCiphertext
  );
  return {
    audience: 'https://agent.example.test',
    credential: {
      agentId: 'agent-alpha',
      issuer: material.issuer,
      keyId: material.keyId,
      publicFingerprint: material.publicFingerprint,
    },
    privateKey,
  };
}

/**
 * Browser-safe credential view の source record を作る test helper です。
 *
 * @returns Client D1 credential reference row と同じ、server-only lookup metadata を持つ record。
 * @remarks
 * helper が返す `credentialRef` は Browser-safe mapper が削除することを検証するためだけに使い、
 * Agent RPC signing source として使いません。
 */
function createCredentialRecord(): CredentialReferenceRecord {
  return {
    agentId: 'agent-alpha',
    credentialRef: 'wrangler-secret:agent-alpha-provider',
    createdAtMs: 1000,
    keyId: 'provider-key-001',
    maskedHint: '****-001',
    publicFingerprint: 'sha256:provider-public',
    status: 'active',
    updatedAtMs: 2000,
  };
}

describe('SDK-backed Management Client Agent RPC adapter', () => {
  it('[TAMAC-SDK-S003] Client adapter passes Client-owned signing and acting-user context to the SDK', async () => {
    const signingContext = await createSigningContext();
    const clients = createServerAgentRpcClients({
      actingUser: {
        operatorId: 'operator-001',
        scopes: ['agent:read', 'agent:write'],
      },
      agentRpcOrigin: createApprovedOrigin(),
      signingContext,
    });

    expect(clients.invocation.agentId).toBe('agent-alpha');
    expect(clients.invocation.actingUser).toEqual({ actingUserId: 'operator-001' });
    expect(clients.invocation.scopes).toEqual(['agent:read', 'agent:write']);
    expect(clients.invocation.requestId).not.toBe('');
    expect(clients.invocation.correlationId).not.toBe('');
    await expect(clients.withErrorNormalization(() => Promise.resolve('sdk-result'))).resolves.toBe(
      'sdk-result'
    );

    const source = readFileSync(
      fileURLToPath(new URL('../server/agent-rpc/create-client.ts', import.meta.url).href),
      'utf8'
    );
    expect(source).toContain('@cf-tamac/sdk');
    expect(source).toContain('createTamacAgentClient');
    expect(source).not.toContain('@connectrpc/connect');
    expect(source).not.toContain('@cf-tamac/client-agent-rpc');
  });

  it('[TAMAC-SDK-S008] Factory accepts only a policy-approved origin after the loader validates stored metadata', async () => {
    const signingContext = await createSigningContext();
    const clients = createServerAgentRpcClients({
      actingUser: {
        operatorId: 'operator-001',
        scopes: ['agent:read'],
      },
      agentRpcOrigin: createApprovedOrigin(),
      signingContext,
    });
    const loaderSource = readFileSync(fileURLToPath(agentLoaderPath.href), 'utf8');
    const factorySource = readFileSync(fileURLToPath(createClientPath.href), 'utf8');

    expect(clients.agentRpcOrigin).toBe('https://agent.example.test');
    expect(loaderSource).toContain('approveAgentRpcOrigin');
    expect(loaderSource.indexOf('const approvedOrigin')).toBeLessThan(
      loaderSource.indexOf('resolveManagedAgentSigningContext')
    );
    expect(factorySource).toContain('readonly agentRpcOrigin: ApprovedAgentRpcOrigin;');
    expect(factorySource).toContain('agentRpcOrigin: config.agentRpcOrigin');
  });

  it('[TAMAC-SDK-S005] Client safe result helpers exclude signing and transport material', () => {
    const success = createBrowserSafeAgentRpcSuccess(
      { agentId: 'agent-alpha', displayName: 'Alpha Agent' },
      'correlation-success-001'
    );
    const failure = createBrowserSafeAgentRpcFailure(
      new Error('must remain server-side'),
      'correlation-failure-001',
      { message: 'safe failure', title: 'safe failure title' }
    );
    const serialized = JSON.stringify({ failure, success });

    expect(Object.keys(success).sort()).toEqual([
      'correlationId',
      'displayData',
      'safeErrorCategory',
      'safeStatus',
    ]);
    expect(Object.keys(failure).sort()).toEqual([
      'correlationId',
      'displayData',
      'safeErrorCategory',
      'safeStatus',
    ]);
    expect(success.safeErrorCategory).toBeNull();
    expect(failure.safeErrorCategory).toBe('internal');
    expect(serialized).not.toContain('must remain server-side');
    expect(serialized).not.toContain('privateKey');
    expect(serialized).not.toContain('Authorization');
    expect(serialized).not.toContain('agentRpcOrigin');
  });

  it('[TAMAC-SDK-S005] browser-safe error titles distinguish permission, availability, and invalid input', () => {
    // stable category mapping は raw SDK message を表示せず、利用者が次に取る操作を区別できる固定見出しだけを返す。
    expect(browserSafeErrorTitle('permission_denied')).toBe('権限を確認してください');
    expect(browserSafeErrorTitle('unavailable')).toBe('接続状態を確認してください');
    expect(browserSafeErrorTitle('invalid_argument')).toBe('入力内容を確認してください');
    expect(browserSafeErrorTitle('permission_denied')).not.toBe(
      browserSafeErrorTitle('unavailable')
    );
  });

  it('[AGENT-MANAGEMENT-UI-S018] E2E fake preserves safe metadata digest behavior', async () => {
    const clients = createE2eFakeAgentRpcClients('agent-alpha');
    const getModelPolicy = clients.modelPolicies.getModelPolicy as unknown as (
      request: Record<string, unknown>
    ) => Promise<Record<string, unknown>>;
    const response = await getModelPolicy({
      agentId: 'agent-alpha',
      policyRef: 'workers-ai-default',
    });
    const policy = response.policy as Record<string, unknown>;
    const safeMetadataRef = policy.safeMetadataRef as Record<string, unknown>;
    const inlineBytes = safeMetadataRef.inlineBytes;

    expect(inlineBytes).toBeInstanceOf(Uint8Array);
    expect(safeMetadataRef.sha256).toBe(
      createHash('sha256')
        .update(inlineBytes instanceof Uint8Array ? inlineBytes : new Uint8Array())
        .digest('hex')
    );
    expect(clients.invocation.correlationId).toContain('e2e-fake-correlation:agent-alpha');
  });
});

describe('Browser-safe Client D1 views', () => {
  it('[CLIENT-REGISTRY-S002] credential reference mapper excludes lookup material', () => {
    const safe = toBrowserSafeCredentialReference(createCredentialRecord());

    expect(Object.keys(safe)).not.toContain('credentialRef');
    expect(Object.keys(safe)).not.toContain('publicFingerprint');
    expect(Object.keys(safe)).not.toContain('secretMaterial');
  });

  it('[CLIENT-REGISTRY-S006] signing key mapper excludes encrypted private JWK material', () => {
    const safe = toBrowserSafeSigningKey({
      createdAtMs: 1000,
      isDefault: true,
      issuer: 'cf-tamac-client',
      keyId: 'key-001',
      privateJwkCiphertext: '{"v":1,"iv":"i","ct":"c"}',
      publicFingerprint: 'sha256_b64u:public',
      publicJwk: '{"kty":"OKP","crv":"Ed25519","x":"public"}',
      status: 'active',
      updatedAtMs: 2000,
    });

    expect(Object.keys(safe)).not.toContain('privateJwkCiphertext');
    expect(Object.keys(safe)).not.toContain('privateJwk');
    expect(Object.keys(safe)).not.toContain('d');
  });
});
