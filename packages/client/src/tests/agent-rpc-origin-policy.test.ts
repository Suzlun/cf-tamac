import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { validateManagedAgentRegistrationInput } from '../server/actions/managed-agent-registration';
import { registerManagedAgent } from '../server/actions/managed-agents';
import {
  approveAgentRpcOrigin,
  parseApprovedAgentRpcOrigins,
} from '../server/agent-rpc/origin-policy';
import { createBrowserSafeAgentRpcSuccess } from '../server/agent-rpc/safe-results';
import { generateEd25519SigningKeyMaterial } from '../server/credentials/signing-keys';
import {
  createManagedAgentRegistrationAttemptRepository,
  createManagedAgentRepository,
  createSigningKeyRepository,
} from '../server/db';

import { applyClientMigration, createTestD1Database } from './test-d1-helper';

const TEST_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 23).toString('base64');
const loaderPath = new URL('../server/agent-rpc/agent-loader.ts', import.meta.url);
const managedAgentsActionPath = new URL('../server/actions/managed-agents.ts', import.meta.url);

const mocks = vi.hoisted(() => ({
  getCloudflareContext: vi.fn(),
}));

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: mocks.getCloudflareContext,
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

afterEach(() => {
  // E2E fake はこの test の registration initialization だけに限定し、他 test の signing/transport 経路へ漏らしません。
  delete process.env.E2E_FAKE_AGENT_RPC;
  mocks.getCloudflareContext.mockReset();
  vi.unstubAllGlobals();
});

describe('Management Client Agent RPC origin policy', () => {
  it('[TAMAC-SDK-S007] Registration canonicalizes an approved HTTPS origin before persistence and returns a safe result', async () => {
    const db = createTestD1Database();
    await applyClientMigration(db);
    const input = {
      agentId: 'agent-alpha',
      agentRpcOrigin: 'HTTPS://AGENT.example.com:443',
      displayName: 'Alpha Agent',
      displayOrder: '0',
      keyId: 'provider-key-001',
      maskedHint: 'ed25519:ab…12',
      modelPolicy: {
        maxOutputTokens: '1024',
        model: '@cf/meta/llama-3.1-8b-instruct',
        policyRef: 'workers-ai-default',
        provider: 'workers-ai' as const,
        temperature: '0.20',
        topP: '0.90',
      },
      publicFingerprint: 'sha256:provider-public',
      referenceValue: 'PROVIDER_CREDENTIAL_ALPHA',
      status: 'active',
    };
    const validation = validateManagedAgentRegistrationInput(input);
    if (!validation.ok) {
      throw new Error('valid registration fixture must pass field validation');
    }
    const componentValidation = validateManagedAgentRegistrationInput({
      ...input,
      agentRpcOrigin: 'https://agent.example.com/not-an-origin',
    });
    expect(componentValidation).toMatchObject({
      fieldErrors: {
        agentRpcOrigin: 'scheme、host、任意のportで構成されたoriginを入力してください。',
      },
      ok: false,
    });
    const approvedOrigin = approveAgentRpcOrigin(
      validation.value.agentRpcOrigin,
      parseApprovedAgentRpcOrigins('["https://agent.example.com"]')
    );
    await createManagedAgentRegistrationAttemptRepository(db).createRegistrationAttempt({
      agent: {
        agentId: validation.value.agentId,
        agentRpcOrigin: approvedOrigin,
        displayName: validation.value.displayName,
        displayOrder: validation.value.displayOrder,
      },
      attempt: {
        attemptId: 'attempt-origin-001',
        initializationIdempotencyKey: 'registration:agent-alpha:attempt-origin-001',
        modelPolicyRef: validation.value.modelPolicy.policyRef,
        requestDigest: 'sha256:origin-policy-test',
      },
      credential: {
        credentialRef: validation.value.referenceValue,
        keyId: validation.value.keyId,
        publicFingerprint: validation.value.publicFingerprint,
        maskedHint: validation.value.maskedHint,
        status: validation.value.status,
      },
      signing: {
        issuer: 'client-service',
        keyId: 'default-key',
        publicFingerprint: 'sha256:default-signing',
      },
    });
    const result = createBrowserSafeAgentRpcSuccess(
      {
        agentId: validation.value.agentId,
        displayName: input.displayName,
        fieldErrors: {},
        message: `「${input.displayName}」を管理対象に追加しました。`,
        title: 'Agentを登録しました',
      },
      'registration-correlation-001'
    );

    expect(Object.keys(result).sort()).toEqual([
      'correlationId',
      'displayData',
      'safeErrorCategory',
      'safeStatus',
    ]);
    expect(result.safeStatus).toBe('succeeded');
    expect(result.safeErrorCategory).toBeNull();
    expect(result.correlationId).not.toBe('');
    const persisted = await createManagedAgentRepository(db).getManagedAgent('agent-alpha');
    expect(persisted?.agentRpcOrigin).toBe('https://agent.example.com');
  });

  it('[TAMAC-SDK-S007] rejects non-canonical policy configuration, duplicate entries, and non-origin URL components', () => {
    expect(() => parseApprovedAgentRpcOrigins('[]')).toThrow();
    expect(() => parseApprovedAgentRpcOrigins('["https://agent.example.com:443"]')).toThrow();
    expect(() => parseApprovedAgentRpcOrigins('["https://bücher.example"]')).toThrow();
    expect(() =>
      parseApprovedAgentRpcOrigins('["https://agent.example.com", "https://agent.example.com"]')
    ).toThrow();
    expect(() => parseApprovedAgentRpcOrigins('["https://agent.example.com/path"]')).toThrow();
    expect(() => parseApprovedAgentRpcOrigins('["http://agent.example.com"]')).toThrow();

    const allowed = parseApprovedAgentRpcOrigins('["https://agent.example.com:8443"]');
    expect(approveAgentRpcOrigin('https://AGENT.example.com:8443', allowed)).toBe(
      'https://agent.example.com:8443'
    );
    expect(() => approveAgentRpcOrigin('https://agent.example.com', allowed)).toThrow();

    const idnAllowed = parseApprovedAgentRpcOrigins('["https://xn--bcher-kva.example"]');
    expect(approveAgentRpcOrigin('https://bücher.example', idnAllowed)).toBe(
      'https://xn--bcher-kva.example'
    );

    const managedAgentsAction = readFileSync(fileURLToPath(managedAgentsActionPath.href), 'utf8');
    expect(managedAgentsAction).toContain('export async function registerManagedAgent');
    expect(managedAgentsAction).toContain('approveAgentRpcOrigin');
    expect(managedAgentsAction).toContain('parseApprovedAgentRpcOrigins');
  });

  it('[TAMAC-SDK-S007] rejects a legacy registry write outside the current allowlist before persistence', async () => {
    const db = createTestD1Database();
    await applyClientMigration(db);
    setWorkerEnv(db, '["https://agent.example.com"]');

    await expect(
      registerManagedAgent({
        agentId: 'agent-not-approved',
        agentRpcOrigin: 'https://not-approved.example.com',
        displayName: 'Not approved Agent',
      })
    ).rejects.toThrow();
    expect(
      await createManagedAgentRepository(db).getManagedAgent('agent-not-approved')
    ).toBeUndefined();

    const record = await registerManagedAgent({
      agentId: 'agent-approved',
      agentRpcOrigin: 'HTTPS://AGENT.example.com:443',
      displayName: 'Approved Agent',
    });
    expect(record.agentRpcOrigin).toBe('https://agent.example.com');
  });

  it('[TAMAC-SDK-S008] Loader revalidates the stored origin before signing-key resolution and returns a safe configuration result', async () => {
    const db = createTestD1Database();
    await applyClientMigration(db);
    const material = await createDefaultSigningKey(db);
    const agents = createManagedAgentRepository(db);
    await agents.upsertManagedAgent({
      agentId: 'agent-policy-violation',
      agentRpcOrigin: 'https://no-longer-approved.example.com',
      displayName: 'Policy violation Agent',
    });
    await agents.updateManagedAgentSigningKey({
      agentId: 'agent-policy-violation',
      signingIssuer: material.issuer,
      signingKeyId: material.keyId,
      signingPublicFingerprint: material.publicFingerprint,
    });
    setWorkerEnv(db, '["https://agent.example.com"]');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { validateModelPolicyForManagedAgent } = await import('../server/actions/model-policies');
    const result = await validateModelPolicyForManagedAgent('agent-policy-violation', {
      maxOutputTokens: '1024',
      model: '@cf/meta/llama-3.1-8b-instruct',
      policyRef: 'workers-ai-default',
      provider: 'workers-ai' as const,
      temperature: '0.20',
      topP: '0.90',
    });

    expect(result.safeStatus).toBe('failed');
    expect(result.safeErrorCategory).toBe('configuration');
    expect(result.correlationId).not.toBe('');
    expect(result.displayData.message).not.toContain('no-longer-approved.example.com');
    const signingKey = await createSigningKeyRepository(db).getSigningKey(
      material.issuer,
      material.keyId
    );
    expect(signingKey?.lastUsedAtMs).toBeUndefined();
    // stored origin rejection は actual Server Action entry で transport/JWT signing より前に完了するため、外部 fetch と signing-key usage を起こさない。
    expect(fetchSpy).not.toHaveBeenCalled();

    const source = readFileSync(fileURLToPath(loaderPath.href), 'utf8');
    const originValidationStart = source.indexOf('const approvedOrigin');
    expect(originValidationStart).toBeGreaterThan(-1);
    expect(originValidationStart).toBeLessThan(source.indexOf('resolveManagedAgentSigningContext'));
    expect(originValidationStart).toBeLessThan(
      source.indexOf('deriveActingUserContext', originValidationStart)
    );
  });

  it('[TAMAC-SDK-S008] rejects whitespace-only required configuration without exposing its value', async () => {
    const db = createTestD1Database();
    await applyClientMigration(db);
    setWorkerEnv(db, '["https://agent.example.com"]');
    mocks.getCloudflareContext.mockReturnValue({
      env: {
        AGENT_RPC_ALLOWED_ORIGINS: '["https://agent.example.com"]',
        AGENT_RPC_AUDIENCE: 'cf-tamac-agent',
        CLIENT_ACTING_OPERATOR_ID: 'origin-policy-test-operator',
        CLIENT_ACTING_SCOPES: 'agent:read agent:write',
        CLIENT_CREDENTIAL_ENCRYPTION_KEY: '   ',
        CLIENT_DB: db,
      },
    });

    const { getClientWorkerEnv } = await import('../server/env');
    await expect(Promise.resolve().then(getClientWorkerEnv)).rejects.toThrow(
      'Client Worker environment bindings are not available.'
    );
    // error contract は secret value を含まない固定 configuration message だけである。
    await expect(Promise.resolve().then(getClientWorkerEnv)).rejects.not.toThrow('   ');
  });
});

/**
 * Client D1 に active な既定 Client Service signing key を作成します。
 *
 * @param db - test 用の Client D1 binding です。
 * @returns managed Agent metadata へ保存する public signing key identity です。
 */
async function createDefaultSigningKey(db: D1Database) {
  const material = await generateEd25519SigningKeyMaterial(TEST_ENCRYPTION_KEY_BASE64);
  const signingKeys = createSigningKeyRepository(db);
  await signingKeys.createSigningKey({
    issuer: material.issuer,
    keyId: material.keyId,
    privateJwkCiphertext: material.privateJwkCiphertext,
    publicFingerprint: material.publicFingerprint,
    publicJwk: JSON.stringify(material.publicJwk),
  });
  await signingKeys.setDefaultSigningKey(material.issuer, material.keyId);
  return material;
}

/**
 * origin policy test が必要とする Client Worker env を Cloudflare context mock へ設定します。
 *
 * @param db - Client repository が使用する D1 binding です。
 * @param allowedOrigins - canonical HTTPS origin だけを含む JSON allowlist です。
 */
function setWorkerEnv(db: D1Database, allowedOrigins: string): void {
  mocks.getCloudflareContext.mockReturnValue({
    env: {
      AGENT_RPC_ALLOWED_ORIGINS: allowedOrigins,
      AGENT_RPC_AUDIENCE: 'cf-tamac-agent',
      CLIENT_ACTING_OPERATOR_ID: 'origin-policy-test-operator',
      CLIENT_ACTING_SCOPES: 'agent:read agent:write',
      CLIENT_CREDENTIAL_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY_BASE64,
      CLIENT_DB: db,
    },
  });
}
