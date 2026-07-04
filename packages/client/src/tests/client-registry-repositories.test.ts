import { describe, expect, it } from 'vitest';

import {
  createCredentialReferenceRepository,
  createManagedAgentRepository,
  createSigningKeyRepository,
  type ManagedAgentRecord,
} from '../server/db';

import { applyClientMigration, createTestD1Database } from './test-d1-helper';

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
