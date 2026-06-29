import type { BrowserSafeSigningKey } from '../../lib/signing-key-types';
import type { CredentialReferenceRecord } from '../db/access-credentials';
import type { ClientSigningKeyRecord } from '../db/signing-keys';

// src/lib/signing-key-types.ts で定義した browser-safe 表示型を再エクスポートする。
// server-only module から browser-visible 型定義へ依存するのは安全 (型のみで runtime 副作用はない)。
export type { BrowserSafeSigningKey } from '../../lib/signing-key-types';

/**
 * Browser-safe credential reference view that excludes secret lookup material.
 *
 * This type intentionally omits `credentialRef` and `publicFingerprint` so that
 * browser bundles, Server Action results, and rendered HTML cannot reach the
 * secret storage path or signing material identifiers.
 */
export interface BrowserSafeCredentialReference {
  readonly agentId: string;
  readonly keyId: string;
  readonly maskedHint: string;
  readonly status: string;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

/**
 * Convert a stored credential reference record into a browser-safe view.
 *
 * The resulting object strips `credentialRef` and `publicFingerprint` so that
 * only masked display metadata reaches Server Action results and rendered UI.
 */
export function toBrowserSafeCredentialReference(
  record: CredentialReferenceRecord
): BrowserSafeCredentialReference {
  return {
    agentId: record.agentId,
    keyId: record.keyId,
    maskedHint: record.maskedHint,
    status: record.status,
    createdAtMs: record.createdAtMs,
    updatedAtMs: record.updatedAtMs,
  };
}

/**
 * Convert a list of stored credential reference records into browser-safe views.
 */
export function toBrowserSafeCredentialReferences(
  records: readonly CredentialReferenceRecord[]
): readonly BrowserSafeCredentialReference[] {
  return records.map(toBrowserSafeCredentialReference);
}

/**
 * Client Service signing key record を private material を除外した browser-safe view へ変換する。
 *
 * @remarks
 * `privateJwkCiphertext` と暗号化 envelope の内部構造を一切含めず、
 * 公開鍵 JSON・fingerprint・status・default flag・timestamps だけを残す。
 * 戻り値は Server Action result・rendered HTML・browser bundle に渡しても安全。
 */
export function toBrowserSafeSigningKey(record: ClientSigningKeyRecord): BrowserSafeSigningKey {
  return {
    issuer: record.issuer,
    keyId: record.keyId,
    publicJwk: record.publicJwk,
    publicFingerprint: record.publicFingerprint,
    status: record.status,
    isDefault: record.isDefault,
    createdAtMs: record.createdAtMs,
    updatedAtMs: record.updatedAtMs,
    lastUsedAtMs: record.lastUsedAtMs,
  };
}

/**
 * Client Service signing key record の一覧を browser-safe view へ変換する。
 */
export function toBrowserSafeSigningKeys(
  records: readonly ClientSigningKeyRecord[]
): readonly BrowserSafeSigningKey[] {
  return records.map(toBrowserSafeSigningKey);
}
