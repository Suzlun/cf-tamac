import { describe, expect, it } from 'vitest';

import {
  createCredentialReferenceRepository,
  createManagedAgentRegistrationAttemptRepository,
  createManagedAgentRepository,
  createSigningKeyRepository,
  type ManagedAgentRecord,
} from '../server/db';

import { applyClientMigration, createTestD1Database } from './test-d1-helper';

import type { D1PreparedStatement } from '@cloudflare/workers-types';

describe('Managed Agent registry persistence', () => {
  it('[CLIENT-REGISTRY-S001] Managed Agent registry persists display and ordering metadata', async () => {
    const db = createTestD1Database();
    await applyClientMigration(db);
    const repository = createManagedAgentRepository(db);

    const alpha = await repository.upsertManagedAgent({
      agentId: 'agent-alpha',
      agentRpcOrigin: 'http://localhost:8787',
      displayName: 'Alpha Agent',
      displayOrder: 2,
    });
    await repository.upsertManagedAgent({
      agentId: 'agent-beta',
      agentRpcOrigin: 'http://localhost:8788',
      displayName: 'Beta Agent',
      displayOrder: 1,
    });

    expect(alpha.displayName).toBe('Alpha Agent');
    expect(alpha.displayOrder).toBe(2);
    expect(alpha.pinned).toBe(false);

    const pinnedBeta = await repository.setManagedAgentPinned('agent-beta', true);
    expect(pinnedBeta?.pinned).toBe(true);

    const renamedAlpha = await repository.renameManagedAgent({
      agentId: 'agent-alpha',
      displayName: 'Alpha Renamed',
    });
    expect(renamedAlpha?.displayName).toBe('Alpha Renamed');

    const opened = await repository.markManagedAgentOpened('agent-alpha');
    expect(opened?.lastOpenedAtMs).toBeTypeOf('number');

    const reordered = await repository.reorderManagedAgents([
      { agentId: 'agent-alpha', displayOrder: 10 },
      { agentId: 'agent-beta', displayOrder: 20 },
    ]);
    const orderMap = new Map(reordered.map((r: ManagedAgentRecord) => [r.agentId, r.displayOrder]));
    expect(orderMap.get('agent-alpha')).toBe(10);
    expect(orderMap.get('agent-beta')).toBe(20);

    const list = await repository.listManagedAgents();
    expect(list[0]?.agentId).toBe('agent-beta');
    expect(list[0]?.pinned).toBe(true);
    expect(list[1]?.agentId).toBe('agent-alpha');

    await repository.deleteManagedAgent('agent-alpha');
    const afterDelete = await repository.getManagedAgent('agent-alpha');
    expect(afterDelete).toBeUndefined();
  });
});

describe('Managed Agent signing identity metadata persistence', () => {
  it('[CLIENT-REGISTRY-S001] managed Agent registry persists signing issuer/kid/fingerprint and last verified at', async () => {
    const db = createTestD1Database();
    await applyClientMigration(db);
    const repository = createManagedAgentRepository(db);
    const signingKeys = createSigningKeyRepository(db);

    await repository.upsertManagedAgent({
      agentId: 'agent-alpha',
      agentRpcOrigin: 'http://localhost:8787',
      displayName: 'Alpha Agent',
    });
    await signingKeys.createSigningKey({
      issuer: 'cf-tamac-client',
      keyId: 'key-001',
      privateJwkCiphertext: '{"v":1,"iv":"i","ct":"c"}',
      publicFingerprint: 'sha256_b64u:abc',
      publicJwk: '{"kty":"OKP","crv":"Ed25519","x":"public"}',
    });

    const updated = await repository.updateManagedAgentSigningKey({
      agentId: 'agent-alpha',
      signingIssuer: 'cf-tamac-client',
      signingKeyId: 'key-001',
      signingPublicFingerprint: 'sha256_b64u:abc',
    });
    expect(updated?.signingIssuer).toBe('cf-tamac-client');
    expect(updated?.signingKeyId).toBe('key-001');
    expect(updated?.signingPublicFingerprint).toBe('sha256_b64u:abc');

    const verifiedAt = Date.now();
    const verified = await repository.markManagedAgentSigningVerified('agent-alpha', verifiedAt);
    expect(verified?.signingLastVerifiedAtMs).toBe(verifiedAt);

    // 台帳だけの更新では Agent Service 状態は変更されない (repository は client_managed_agents だけを扱う)。
    const reloaded = await repository.getManagedAgent('agent-alpha');
    expect(reloaded?.signingLastVerifiedAtMs).toBe(verifiedAt);
  });
});

describe('Credential reference safety', () => {
  it('[CLIENT-REGISTRY-S002] Credential reference stores no plaintext secret', async () => {
    const db = createTestD1Database();
    await applyClientMigration(db);
    const agents = createManagedAgentRepository(db);
    const credentials = createCredentialReferenceRepository(db);

    await agents.upsertManagedAgent({
      agentId: 'agent-alpha',
      agentRpcOrigin: 'http://localhost:8787',
      displayName: 'Alpha Agent',
    });

    const reference = await credentials.upsertCredentialReference({
      agentId: 'agent-alpha',
      credentialRef: 'wrangler-secret:agent-alpha-credential',
      keyId: 'key-001',
      publicFingerprint: 'sha256:abcdef',
      maskedHint: '****-****-****-001',
      status: 'active',
    });

    expect(reference.agentId).toBe('agent-alpha');
    expect(reference.keyId).toBe('key-001');
    expect(reference.maskedHint).toBe('****-****-****-001');
    expect(reference.status).toBe('active');

    const stored = await credentials.getCredentialReference(
      'agent-alpha',
      'wrangler-secret:agent-alpha-credential'
    );
    expect(stored).toBeDefined();
    if (stored === undefined) {
      throw new Error('stored credential reference should be defined');
    }
    const storedKeys = Object.keys(stored);
    expect(storedKeys).not.toContain('secretMaterial');
    expect(storedKeys).not.toContain('privateKey');
    expect(storedKeys).not.toContain('sharedSecret');
    expect(storedKeys).not.toContain('secret');
    expect(storedKeys).not.toContain('token');

    const list = await credentials.listCredentialReferences('agent-alpha');
    expect(list).toHaveLength(1);

    await credentials.deleteCredentialReference(
      'agent-alpha',
      'wrangler-secret:agent-alpha-credential'
    );
    const afterDelete = await credentials.listCredentialReferences('agent-alpha');
    expect(afterDelete).toEqual([]);
  });
});

describe('Managed Agent registration attempt atomicity', () => {
  it('[CLIENT-REGISTRY-S001] persists registration state, attempt ID, fixed initialization key, and request digest with credential/signing metadata', async () => {
    const db = createTestD1Database();
    await applyClientMigration(db);
    const repository = createManagedAgentRegistrationAttemptRepository(db);

    await repository.createRegistrationAttempt(createAttemptInput('agent-attempt', 'attempt-001'));

    const stored = await createManagedAgentRepository(db).getManagedAgent('agent-attempt');
    const credentials =
      await createCredentialReferenceRepository(db).listCredentialReferences('agent-attempt');
    expect(stored).toMatchObject({
      initializationIdempotencyKey: 'registration:agent-attempt:attempt-001',
      registrationAttemptId: 'attempt-001',
      registrationRequestDigest: 'sha256:attempt',
      registrationState: 'initializing',
      signingIssuer: 'client-service',
      signingKeyId: 'signing-key',
    });
    expect(credentials).toEqual([
      expect.objectContaining({ credentialRef: 'opaque:attempt', status: 'active' }),
    ]);
  });

  it('[CLIENT-REGISTRY-S001] create commit failure leaves the exact pre-create D1 postcondition', async () => {
    const db = createTestD1Database();
    await applyClientMigration(db);
    const agents = createManagedAgentRepository(db);
    await agents.upsertManagedAgent({
      agentId: 'agent-alpha',
      agentRpcOrigin: 'https://agent.example.com',
      displayName: 'Before create failure',
    });
    const repository = createManagedAgentRegistrationAttemptRepository(db);

    // duplicate Agent insert を batch の先頭で失敗させ、後続 credential/attempt metadata が部分保存されないことを検証する。
    await expect(
      repository.createRegistrationAttempt(createAttemptInput('agent-alpha', 'attempt-duplicate'))
    ).rejects.toThrow();

    const after = await agents.getManagedAgent('agent-alpha');
    expect(after).toMatchObject({
      displayName: 'Before create failure',
      registrationState: 'active',
    });
    expect(
      await createCredentialReferenceRepository(db).listCredentialReferences('agent-alpha')
    ).toEqual([]);
  });

  it('[CLIENT-REGISTRY-S001] rejects zero-row conditional attempt transitions instead of confirming a different attempt', async () => {
    const db = createTestD1Database();
    await applyClientMigration(db);
    const repository = createManagedAgentRegistrationAttemptRepository(db);
    await repository.createRegistrationAttempt(
      createAttemptInput('agent-conditional', 'attempt-current')
    );

    await expect(
      repository.markAttemptActive('agent-conditional', 'attempt-other')
    ).rejects.toThrow('Registration attempt could not be marked active.');
    await expect(
      repository.markAttemptReconciliationRequired({
        agentId: 'agent-conditional',
        attemptId: 'attempt-other',
        correlationId: 'safe-correlation',
        phase: 'active_commit',
        safeErrorCategory: 'unavailable',
      })
    ).rejects.toThrow('Registration attempt could not be marked for reconciliation.');
    await expect(
      repository.cleanupCreatedAttempt('agent-conditional', 'attempt-other')
    ).rejects.toThrow('Registration attempt could not be cleaned up.');

    expect(
      (await createManagedAgentRepository(db).getManagedAgent('agent-conditional'))
        ?.registrationState
    ).toBe('initializing');
  });

  it('[CLIENT-REGISTRY-S001] treats repeated same-attempt cleanup as an idempotent re-registration-ready postcondition', async () => {
    const db = createTestD1Database();
    await applyClientMigration(db);
    const repository = createManagedAgentRegistrationAttemptRepository(db);
    await repository.createRegistrationAttempt(
      createAttemptInput('agent-concurrent-cleanup', 'attempt-same')
    );

    // 同じ attempt を並行して cleanup しても、一方の削除後に他方が row 不在を確認して完了扱いにする。
    const cleanupResults = await Promise.all([
      repository.cleanupCreatedAttempt('agent-concurrent-cleanup', 'attempt-same'),
      repository.cleanupCreatedAttempt('agent-concurrent-cleanup', 'attempt-same'),
    ]);
    expect(cleanupResults.sort()).toEqual(['already_absent', 'deleted']);
    expect(await createManagedAgentRepository(db).getManagedAgent('agent-concurrent-cleanup')).toBe(
      undefined
    );
  });

  it('[AGENT-MANAGEMENT-UI-S002] edit batch failure restores all managed Agent and credential preimage fields', async () => {
    const db = createTestD1Database();
    await applyClientMigration(db);
    const agents = createManagedAgentRepository(db);
    const credentials = createCredentialReferenceRepository(db);
    await agents.upsertManagedAgent({
      agentId: 'agent-alpha',
      agentRpcOrigin: 'https://agent.example.com',
      displayName: 'Before edit failure',
      displayOrder: 4,
    });
    await credentials.upsertCredentialReference({
      agentId: 'agent-alpha',
      credentialRef: 'opaque:before',
      keyId: 'key-before',
      publicFingerprint: 'sha256:before',
      maskedHint: 'before',
      status: 'active',
    });
    const beforeAgent = await agents.getManagedAgent('agent-alpha');
    const beforeCredentials = await credentials.listCredentialReferences('agent-alpha');
    const failingBatchD1 = new Proxy(db, {
      // 1 statement 更新後に foreign-key failure を注入し、test D1 batch の rollback が全 row/field preimage を復元することを検証する。
      get(target, property, receiver) {
        if (property === 'batch') {
          return async (statements: D1PreparedStatement[]) => {
            const [firstStatement] = statements;
            if (firstStatement === undefined) {
              throw new TypeError(
                'Expected registration batch to include its managed Agent update.'
              );
            }
            return await db.batch([
              firstStatement,
              db
                .prepare(
                  `INSERT INTO client_agent_credential_refs (
                    agent_id, credential_ref, key_id, public_fingerprint, masked_hint, status, created_at_ms, updated_at_ms
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
                )
                .bind(
                  'missing-agent',
                  'opaque:failure',
                  'key',
                  'fingerprint',
                  'hint',
                  'active',
                  1,
                  1
                ),
            ]);
          };
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const repository = createManagedAgentRegistrationAttemptRepository(failingBatchD1);

    await expect(
      repository.updateRegistrationMetadata({
        agent: {
          agentId: 'agent-alpha',
          agentRpcOrigin: 'https://changed.example.com',
          displayName: 'After edit failure',
          displayOrder: 99,
        },
        credential: {
          credentialRef: 'opaque:after',
          keyId: 'key-after',
          publicFingerprint: 'sha256:after',
          maskedHint: 'after',
          status: 'rotating',
        },
      })
    ).rejects.toThrow();

    expect(await agents.getManagedAgent('agent-alpha')).toEqual(beforeAgent);
    expect(await credentials.listCredentialReferences('agent-alpha')).toEqual(beforeCredentials);
  });
});

function createAttemptInput(agentId: string, attemptId: string) {
  return {
    agent: {
      agentId,
      agentRpcOrigin: 'https://agent.example.com',
      displayName: 'Attempt Agent',
      displayOrder: 0,
    },
    attempt: {
      attemptId,
      initializationIdempotencyKey: `registration:${agentId}:${attemptId}`,
      modelPolicyRef: 'workers-ai-default',
      requestDigest: 'sha256:attempt',
    },
    credential: {
      credentialRef: 'opaque:attempt',
      keyId: 'key-attempt',
      publicFingerprint: 'sha256:attempt',
      maskedHint: 'attempt',
      status: 'active',
    },
    signing: {
      issuer: 'client-service',
      keyId: 'signing-key',
      publicFingerprint: 'sha256:signing',
    },
  };
}
