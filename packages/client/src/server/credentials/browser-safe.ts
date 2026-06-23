import type { CredentialReferenceRecord } from '../db/access-credentials';

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
