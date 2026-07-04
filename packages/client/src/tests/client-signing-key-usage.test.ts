import { beforeEach, describe, expect, it, vi } from 'vitest';

import { generateEd25519SigningKeyMaterial } from '../server/credentials/signing-keys';
import { createManagedAgentRepository, createSigningKeyRepository } from '../server/db';

import { applyClientMigration, createTestD1Database } from './test-d1-helper';

import type { ResolvedAgentRpcCredential } from '../server/agent-rpc/authentication';
import type { ServerAgentRpcClients } from '../server/agent-rpc/create-client';

const TEST_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 17).toString('base64');

const mocks = vi.hoisted(() => ({
  getCloudflareContext: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: mocks.getCloudflareContext,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('../server/agent-rpc/create-client', async () => {
  const { createClientServiceJwt } = await import('../server/agent-rpc/authentication');

  return {
    createServerAgentRpcClients(config: {
      readonly credential: ResolvedAgentRpcCredential;
    }): ServerAgentRpcClients {
      const clients = {
        modelPolicies: {
          async validateModelPolicy() {
            // 生成済み Connect client の auth interceptor 相当として JWT 署名まで実行し、
            // signing path に渡された onJwtSigned callback が D1 の last-used metadata を更新することを検査する。
            await createClientServiceJwt(config.credential);
            return {
              validation: { ok: true, warnings: [] },
              policyPreview: {
                policyRef: 'workers-ai-default',
                policyDigest: 'sha256:policy',
                provider: 'workers-ai',
                modelId: '@cf/meta/llama-3.1-8b-instruct',
                status: 'active',
                version: 1n,
              },
            };
          },
        },
        async withErrorNormalization<T>(callback: () => Promise<T>): Promise<T> {
          // この test では error normalization の変換ではなく signing usage tracking を観測する。
          return callback();
        },
      };
      return clients as unknown as ServerAgentRpcClients;
    },
  };
});

describe('Client signing key usage tracking from signing paths', () => {
  beforeEach(() => {
    mocks.getCloudflareContext.mockReset();
    mocks.revalidatePath.mockReset();
    delete process.env.E2E_FAKE_AGENT_RPC;
  });

  it('[CLIENT-REGISTRY-S011] managed Agent RPC signing updates selected signing key lastUsedAtMs', async () => {
    const { db, material } = await createSigningKeyUsageFixture();
    const agents = createManagedAgentRepository(db);
    await agents.upsertManagedAgent({
      agentId: 'agent-alpha',
      agentRpcOrigin: 'https://agent.example.com',
      displayName: 'Alpha Agent',
    });
    await agents.updateManagedAgentSigningKey({
      agentId: 'agent-alpha',
      signingIssuer: material.issuer,
      signingKeyId: material.keyId,
      signingPublicFingerprint: material.publicFingerprint,
    });
    setClientWorkerEnv(db);
    const beforeSigningMs = Date.now();

    const { loadAgentRpcClients } = await import('../server/agent-rpc/agent-loader');
    const { clients } = await loadAgentRpcClients('agent-alpha');
    await clients.withErrorNormalization(() =>
      clients.modelPolicies.validateModelPolicy({
        agentId: 'agent-alpha',
        policy: { policyRef: 'workers-ai-default' } as never,
      })
    );

    const stored = await createSigningKeyRepository(db).getSigningKey(
      material.issuer,
      material.keyId
    );
    expect(stored?.lastUsedAtMs).toBeDefined();
    expect(stored?.lastUsedAtMs).toBeGreaterThanOrEqual(beforeSigningMs);
  });

  it('[CLIENT-REGISTRY-S011] registration default-key validation signing updates lastUsedAtMs', async () => {
    const { db, material } = await createSigningKeyUsageFixture();
    setClientWorkerEnv(db);
    const beforeSigningMs = Date.now();

    const { validateModelPolicyForRegistration } = await import('../server/actions/model-policies');
    const result = await validateModelPolicyForRegistration({
      agentId: 'agent-new',
      agentRpcOrigin: 'https://agent.example.com',
      credentialReference: 'PROVIDER_CREDENTIAL_ALPHA',
      keyId: 'provider-key-001',
      modelPolicy: {
        policyRef: 'workers-ai-default',
        provider: 'workers-ai',
        model: '@cf/meta/llama-3.1-8b-instruct',
        temperature: '0.20',
        topP: '0.90',
        maxOutputTokens: '1024',
      },
    });

    const stored = await createSigningKeyRepository(db).getSigningKey(
      material.issuer,
      material.keyId
    );
    expect(result.ok).toBe(true);
    expect(stored?.lastUsedAtMs).toBeDefined();
    expect(stored?.lastUsedAtMs).toBeGreaterThanOrEqual(beforeSigningMs);
  });
});

async function createSigningKeyUsageFixture(): Promise<{
  readonly db: D1Database;
  readonly material: Awaited<ReturnType<typeof generateEd25519SigningKeyMaterial>>;
}> {
  const db = createTestD1Database();
  await applyClientMigration(db);
  const signingKeys = createSigningKeyRepository(db);
  const material = await generateEd25519SigningKeyMaterial(TEST_ENCRYPTION_KEY_BASE64);
  await signingKeys.createSigningKey({
    issuer: material.issuer,
    keyId: material.keyId,
    publicJwk: JSON.stringify(material.publicJwk),
    publicFingerprint: material.publicFingerprint,
    privateJwkCiphertext: material.privateJwkCiphertext,
  });
  await signingKeys.setDefaultSigningKey(material.issuer, material.keyId);
  return { db, material };
}

function setClientWorkerEnv(db: D1Database): void {
  mocks.getCloudflareContext.mockReturnValue({
    env: {
      CLIENT_DB: db,
      AGENT_RPC_DEFAULT_ORIGIN: 'https://agent.example.com',
      CLIENT_CREDENTIAL_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY_BASE64,
      CLIENT_ACTING_OPERATOR_ID: 'operator-usage-test',
      CLIENT_ACTING_SCOPES: 'agent:read agent:write',
    },
  });
}
