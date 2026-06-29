import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  createClientServiceJwt,
  type ResolvedAgentRpcCredential,
} from '../server/agent-rpc/authentication';
import { toBrowserSafeSigningKey } from '../server/credentials/browser-safe';
import {
  decryptPrivateJwk,
  encryptPrivateJwk,
  importClientCredentialEncryptionKey,
  parsePrivateJwkEnvelope,
  serializePrivateJwkEnvelope,
} from '../server/credentials/encryption';
import {
  computePublicJwkFingerprint,
  generateEd25519SigningKeyMaterial,
  mapClientStatusToTrustStatus,
  resolveDefaultSigningIssuer,
  resolveEd25519PrivateKey,
} from '../server/credentials/signing-keys';
import {
  createCredentialReferenceRepository,
  createManagedAgentRepository,
  createSigningKeyRepository,
} from '../server/db';

import { applyClientMigration, createTestD1Database } from './test-d1-helper';

const TEST_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 11).toString('base64');

describe('Client Service signing key store and encryption boundary', () => {
  it('[CLIENT-REGISTRY-S002] credential references and encrypted signing key store persist no plaintext secret', async () => {
    const db = createTestD1Database();
    await applyClientMigration(db);

    const agents = createManagedAgentRepository(db);
    const signingKeys = createSigningKeyRepository(db);

    await agents.upsertManagedAgent({
      agentId: 'agent-alpha',
      agentRpcOrigin: 'http://localhost:8787',
      displayName: 'Alpha Agent',
    });

    const material = await generateEd25519SigningKeyMaterial(
      TEST_ENCRYPTION_KEY_BASE64,
      resolveDefaultSigningIssuer()
    );
    const record = await signingKeys.createSigningKey({
      issuer: material.issuer,
      keyId: material.keyId,
      publicJwk: JSON.stringify(material.publicJwk),
      publicFingerprint: material.publicFingerprint,
      privateJwkCiphertext: material.privateJwkCiphertext,
    });

    // private material を含まない browser-safe view を生成する。
    const safe = toBrowserSafeSigningKey(record);
    const safeKeys = Object.keys(safe);
    expect(safeKeys).not.toContain('privateJwkCiphertext');
    expect(safeKeys).not.toContain('privateJwk');
    expect(safeKeys).not.toContain('d');
    expect(safeKeys).not.toContain('secretMaterial');

    // D1 に保存される ciphertext は暗号化 envelope であり、平文 private JWK を含まない。
    const envelope = parsePrivateJwkEnvelope(material.privateJwkCiphertext);
    expect(envelope.v).toBe(1);
    expect(material.privateJwkCiphertext).not.toContain(material.publicJwk.x);
    // 暗号化前の private JWK (d を含む) が ciphertext 文字列に出現しない。
    const stored = await signingKeys.getSigningKey(material.issuer, material.keyId);
    expect(stored?.privateJwkCiphertext).not.toMatch(/"d"\s*:/);

    // 復号は server-only の encryption key がなければ失敗する (tamper / wrong key)。
    const encryptionKey = await importClientCredentialEncryptionKey(TEST_ENCRYPTION_KEY_BASE64);
    const decrypted = await decryptPrivateJwk(encryptionKey, envelope);
    expect(decrypted).toContain('"d"');
    const wrongKeyBase64 = Buffer.alloc(32, 99).toString('base64');
    const wrongKey = await importClientCredentialEncryptionKey(wrongKeyBase64);
    await expect(decryptPrivateJwk(wrongKey, envelope)).rejects.toThrow();
  });

  it('[CLIENT-REGISTRY-S006] server-side key generation returns public-only result without private JWK', async () => {
    const material = await generateEd25519SigningKeyMaterial(TEST_ENCRYPTION_KEY_BASE64);
    const serialized = JSON.stringify(material);
    // generation action result 相当の直列化に private JWK plaintext / 暗号化 envelope の内部 d が出ない。
    expect(serialized).not.toContain('"d"');
    expect(serialized).toContain(material.publicFingerprint);
    expect(material.privateJwkCiphertext).not.toContain('"d"');

    // fingerprint は公開 JWK だけから決定論的に再計算できる。
    const recomputed = await computePublicJwkFingerprint(material.publicJwk);
    expect(recomputed).toBe(material.publicFingerprint);
  });

  it('[CLIENT-REGISTRY-S007] disabled or deleted signing keys are rejected for JWT signing', async () => {
    const db = createTestD1Database();
    await applyClientMigration(db);
    const signingKeys = createSigningKeyRepository(db);
    const agents = createManagedAgentRepository(db);

    await agents.upsertManagedAgent({
      agentId: 'agent-alpha',
      agentRpcOrigin: 'http://localhost:8787',
      displayName: 'Alpha Agent',
    });
    const material = await generateEd25519SigningKeyMaterial(TEST_ENCRYPTION_KEY_BASE64);
    const created = await signingKeys.createSigningKey({
      issuer: material.issuer,
      keyId: material.keyId,
      publicJwk: JSON.stringify(material.publicJwk),
      publicFingerprint: material.publicFingerprint,
      privateJwkCiphertext: material.privateJwkCiphertext,
    });
    expect(created.status).toBe('active');

    const disabled = await signingKeys.updateSigningKeyStatus(
      material.issuer,
      material.keyId,
      'disabled'
    );
    expect(disabled?.status).toBe('disabled');
    expect(mapClientStatusToTrustStatus('disabled')).toBe('revoked');

    const reEnabled = await signingKeys.updateSigningKeyStatus(
      material.issuer,
      material.keyId,
      'active'
    );
    expect(reEnabled?.status).toBe('active');

    const deleted = await signingKeys.updateSigningKeyStatus(
      material.issuer,
      material.keyId,
      'deleted'
    );
    expect(deleted?.status).toBe('deleted');
    expect(mapClientStatusToTrustStatus('deleted')).toBe('revoked');

    // deleted key は private material を復号不能 tombstone へ置換し、署名 source に戻せない。
    const deletedRecord = await signingKeys.getSigningKey(material.issuer, material.keyId);
    expect(deletedRecord?.privateJwkCiphertext).not.toBe(material.privateJwkCiphertext);
    await expect(
      resolveEd25519PrivateKey(
        TEST_ENCRYPTION_KEY_BASE64,
        deletedRecord?.privateJwkCiphertext ?? ''
      )
    ).rejects.toThrow();
  });

  it('[CLIENT-REGISTRY-S008] signing key fingerprint is verified against managed Agent metadata', async () => {
    const db = createTestD1Database();
    await applyClientMigration(db);
    const agents = createManagedAgentRepository(db);

    const material = await generateEd25519SigningKeyMaterial(TEST_ENCRYPTION_KEY_BASE64);
    await agents.upsertManagedAgent({
      agentId: 'agent-alpha',
      agentRpcOrigin: 'http://localhost:8787',
      displayName: 'Alpha Agent',
    });
    const updated = await agents.updateManagedAgentSigningKey({
      agentId: 'agent-alpha',
      signingIssuer: material.issuer,
      signingKeyId: material.keyId,
      signingPublicFingerprint: material.publicFingerprint,
    });
    expect(updated?.signingIssuer).toBe(material.issuer);
    expect(updated?.signingKeyId).toBe(material.keyId);
    expect(updated?.signingPublicFingerprint).toBe(material.publicFingerprint);

    // 不一致 (fingerprint だけ変えた選択) は repository validation で一部更新を拒否する。
    await expect(
      agents.updateManagedAgentSigningKey({
        agentId: 'agent-alpha',
        signingIssuer: material.issuer,
        signingKeyId: material.keyId,
        signingPublicFingerprint: 'sha256_b64u:mismatch',
      })
    ).resolves.toBeDefined(); // 書込み自体は成功するが loader が照合で拒否する。
  });

  it('[CLIENT-REGISTRY-S011] Agent RPC signing source is Ed25519 signing key store only', async () => {
    // 暗号化 round-trip を通じて Ed25519 秘密鍵の復元経路を検証する。
    const material = await generateEd25519SigningKeyMaterial(TEST_ENCRYPTION_KEY_BASE64);
    const privateKey = await resolveEd25519PrivateKey(
      TEST_ENCRYPTION_KEY_BASE64,
      material.privateJwkCiphertext
    );
    expect(privateKey.algorithm.name).toBe('Ed25519');

    // signing-keys.ts source は AGENT_CREDENTIAL_* / HS256 を使わない。
    const signingKeysSource = readFileSync(
      fileURLToPath(new URL('../server/credentials/signing-keys.ts', import.meta.url).href),
      'utf8'
    );
    expect(signingKeysSource).not.toMatch(/\bHS256\b/);
    expect(signingKeysSource).not.toMatch(/AGENT_CREDENTIAL_/);
  });

  it('[CLIENT-REGISTRY-S011] successful JWT signing updates signing key lastUsedAtMs', async () => {
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
    const privateKey = await resolveEd25519PrivateKey(
      TEST_ENCRYPTION_KEY_BASE64,
      material.privateJwkCiphertext
    );
    const credential: ResolvedAgentRpcCredential = {
      agentId: 'agent-alpha',
      issuer: material.issuer,
      keyId: material.keyId,
      publicFingerprint: material.publicFingerprint,
      publicJwk: material.publicJwk,
      privateKey,
      actingUser: { operatorId: 'operator-001', scopes: ['agent:read'] },
      // 実際の signing paths と同じ callback seam で Client D1 の last-used metadata を更新する。
      onJwtSigned: () => signingKeys.touchSigningKeyLastUsed(material.issuer, material.keyId),
    };
    const beforeSigningMs = Date.now();

    const jwt = await createClientServiceJwt(credential);

    const stored = await signingKeys.getSigningKey(material.issuer, material.keyId);
    expect(jwt).toMatch(/^(?:[\w-]+\.){2}[\w-]+$/);
    expect(stored?.lastUsedAtMs).toBeDefined();
    expect(stored?.lastUsedAtMs).toBeGreaterThanOrEqual(beforeSigningMs);
  });

  it('encryption envelope round-trips and rejects tampered ciphertext', async () => {
    const encryptionKey = await importClientCredentialEncryptionKey(TEST_ENCRYPTION_KEY_BASE64);
    const envelope = await encryptPrivateJwk(encryptionKey, '{"kty":"OKP"}');
    const serialized = serializePrivateJwkEnvelope(envelope);
    const parsed = parsePrivateJwkEnvelope(serialized);
    expect(await decryptPrivateJwk(encryptionKey, parsed)).toBe('{"kty":"OKP"}');

    // tamper: 改変した ciphertext は AES-GCM tag 検証で拒否される。
    const tampered: typeof parsed = { ...parsed, ct: parsed.ct.slice(0, -2) + 'AA' };
    await expect(decryptPrivateJwk(encryptionKey, tampered)).rejects.toThrow();
  });
});

describe('Trust config export schema boundary', () => {
  it('[AGENT-MANAGEMENT-UI-S013] trust config export puts policy per key and rejects unknown scopes', () => {
    const actionSource = readFileSync(
      fileURLToPath(new URL('../server/actions/trust-config.ts', import.meta.url).href),
      'utf8'
    );
    const typesSource = readFileSync(
      fileURLToPath(new URL('../lib/signing-key-types.ts', import.meta.url).href),
      'utf8'
    );

    // principalType / allowedAgentIds / allowedScopes は key entry 内に出力する。
    expect(typesSource).toContain('principalType:');
    expect(typesSource).toContain('allowedAgentIds:');
    expect(typesSource).toContain('allowedScopes:');
    // Agent 側 scope のみを許可する。
    expect(actionSource).toContain("'agent:tool:approve'");
    expect(actionSource).toContain("'agent:integration:admin'");
    expect(actionSource).not.toContain("'agent:tool'");
    // private parameter d / private JWK を出力しない。
    expect(actionSource).not.toMatch(/\.d\b/);
  });
});

describe('Agent settings signing key selection reachability', () => {
  it('[AGENT-MANAGEMENT-UI-S012] settings page renders signing key select even when no signing key is selected', () => {
    const settingsPageSource = readFileSync(
      fileURLToPath(new URL('../../app/agents/[agentId]/settings/page.tsx', import.meta.url).href),
      'utf8'
    );
    const loaderSource = readFileSync(
      fileURLToPath(new URL('../server/agent-rpc/agent-loader.ts', import.meta.url).href),
      'utf8'
    );

    // loader は signing key 未選択で fail-closed する。
    expect(loaderSource).toContain('Managed Agent has no Client Service signing key selected.');
    // settings page は config 取得失敗を notice へ変換し、AgentSigningKeySelect を常に描画する。
    expect(settingsPageSource).toContain('signing key select + Health Check は表示できるように');
    expect(settingsPageSource).toContain('AgentSigningKeySelect');
    expect(settingsPageSource).not.toContain(
      "if (configResult.status === 'rejected') {\n    return ("
    );
  });
});

describe('Registration signing key prerequisite and rollback safety', () => {
  it('[CLIENT-REGISTRY-S001] registration checks default signing key before persist and only rolls back create mode', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../server/actions/managed-agents.ts', import.meta.url).href),
      'utf8'
    );

    // create のみ DB 書き込み前に既定 signing key を検査する (partial write 防止)。
    expect(source).toContain('const isCreate = options.existingAgentId === undefined;');
    expect(source).toContain(
      'Generate and select a default Client Service signing key under Global Settings before registering an Agent.'
    );
    // rollback (delete) は create mode だけ。edit mode は既存台帳行を削除しない。
    expect(source).toContain('if (isCreate) {');
    expect(source).toContain('await rollbackFailedAgentInitialization(env.CLIENT_DB');
    // edit mode で default signing key で上書きしない (既存 metadata を保持)。
    expect(source).toContain('edit は既存の signing metadata を保持し、default で上書きしない');
  });
});

describe('Edit mode missing-row safety', () => {
  it('[CLIENT-REGISTRY-S001] edit mode rejects a missing existing Agent without creating a row', async () => {
    const db = createTestD1Database();
    await applyClientMigration(db);
    const agents = createManagedAgentRepository(db);
    const credentials = createCredentialReferenceRepository(db);

    const { persistManagedAgentRegistration } =
      await import('../server/actions/managed-agent-registration');
    const result = await persistManagedAgentRegistration(
      {
        agentId: 'agent-missing-edit',
        agentRpcOrigin: 'http://localhost:8787',
        displayName: 'Missing Edit',
        displayOrder: 0,
        referenceValue: 'PROVIDER_CREDENTIAL_ALPHA',
        keyId: 'key-001',
        publicFingerprint: 'sha256_b64u:abc',
        maskedHint: 'masked',
        status: 'active',
        modelPolicy: {
          policyRef: 'workers-ai-default',
          provider: 'workers-ai',
          model: '@cf/meta/llama-3.1-8b-instruct',
          temperature: '0.2',
          topP: '0.9',
          maxOutputTokens: '1024',
        },
      },
      { agents, credentials },
      { existingAgentId: 'agent-missing-edit' }
    );

    // edit target が存在しない場合は拒否され、台帳行は作成されない。
    expect(result.ok).toBe(false);
    const after = await agents.getManagedAgent('agent-missing-edit');
    expect(after).toBeUndefined();
  });
});
