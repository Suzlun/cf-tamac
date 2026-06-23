import { normalizeAdapterDefinition, type NormalizedAdapterDefinition } from '../adapters';
import { createAgentDomainError } from '../domain/errors';
import {
  computeSha256Hex,
  isAgentSignatureAlgorithm,
  verifyBytesWithAgentKey,
} from '../domain/security';

import type { AgentPayloadMetadataView } from '../domain';
import type { AgentSignatureAlgorithm, AgentSignatureKeyMaterial } from '../domain/security';

const supportedIntegrationManifestSchemaVersion = '2026-06-agent-integration-v1';
const manifestContentType = 'application/json';

/**
 * 検証済み Integration manifest です。
 *
 * @remarks
 * Provider から受け取った JSON を検証し、Agent storage へ保存する Installation、Adapter、Tool、
 * Delivery capability、trust key の情報だけに正規化した結果です。
 */
export interface VerifiedIntegrationManifest {
  readonly adapters: readonly NormalizedAdapterDefinition[];
  readonly deliveryCapabilityCount: number;
  readonly displayName: string;
  readonly grants: readonly string[];
  readonly integrationId: string;
  readonly manifestDigestSha256: string;
  readonly manifestRef: string;
  readonly providerBaseUrl: string;
  readonly providerId: string;
  readonly schemaVersion: string;
  readonly setupInstructionsRef?: string;
  readonly setupRequired: boolean;
  readonly tools: readonly VerifiedIntegrationToolDefinition[];
  readonly trustKey: VerifiedIntegrationTrustKey;
}

/**
 * Manifest 由来の Tool definition です。
 */
export interface VerifiedIntegrationToolDefinition {
  readonly approvalRequired: boolean;
  readonly cancellationSupported: boolean;
  readonly description?: string;
  readonly displayName: string;
  readonly inputSchemaRef?: string;
  readonly outputSchemaRef?: string;
  readonly providerTargetRef?: string;
  readonly toolId: string;
  readonly version: string;
}

/**
 * Manifest signature と ingress callback 検証に使う Provider trust key です。
 */
export interface VerifiedIntegrationTrustKey {
  readonly algorithm: AgentSignatureAlgorithm;
  readonly keyId: string;
  readonly publicKeyMaterial?: AgentSignatureKeyMaterial;
  readonly publicKeyRef: string;
}

/**
 * Manifest payload を取得するための入力です。
 */
export interface ResolveIntegrationManifestInput {
  readonly integrationId: string;
  readonly loadManifestBytes?: IntegrationManifestBytesLoader;
  readonly manifestPayload?: AgentPayloadMetadataView;
  readonly manifestRef: string;
  readonly requestedGrants: readonly string[];
}

/**
 * HTTPS manifest を外部境界で読み込んだ結果です。
 *
 * @remarks
 * domain 層は network I/O を直接呼ばず、Worker/DO 境界が取得した HTTP 結果だけを受け取ります。
 * これにより runtime 依存を外側に閉じ、manifest 検証は content type、status、byte size、署名の
 * 判定だけへ集中できます。
 */
export interface IntegrationManifestLoadResult {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly ok: boolean;
  readonly status: number;
}

/**
 * HTTPS manifest を Worker/DO 境界で読み込むための関数型です。
 *
 * @param manifestRef 検証済み HTTPS manifest URL です。
 * @returns HTTP status、content type、body bytes を含む取得結果です。
 * @throws transport failure など、HTTP response を得られない場合に呼び出し元の error を送出します。
 * @example
 * ```ts
 * const result = await loadManifestBytes('https://provider.example/manifest.json');
 * ```
 */
export type IntegrationManifestBytesLoader = (
  manifestRef: string
) => Promise<IntegrationManifestLoadResult>;

/**
 * manifest payload を外部 loader または inline bytes から読み込み、署名と schema を検証します。
 *
 * @param input InstallIntegration RPC で受け取った manifest 参照、payload、要求 grant です。
 * @returns Agent domain に保存できる検証済み manifest です。
 * @throws AgentDomainError manifest が欠落、不正 schema、署名不正、要求 grant 不一致の場合に発生します。
 */
export async function resolveAndVerifyIntegrationManifest(
  input: ResolveIntegrationManifestInput
): Promise<VerifiedIntegrationManifest> {
  const manifestBytes = await resolveManifestBytes(
    input.manifestRef,
    input.manifestPayload,
    input.loadManifestBytes
  );
  const manifestDigestSha256 = await computeSha256Hex(manifestBytes);
  const manifestText = new TextDecoder().decode(manifestBytes);
  const parsed = parseManifestJson(manifestText);
  const manifest = normalizeManifest(parsed, input.manifestRef, manifestDigestSha256);
  assertIntegrationIdentity(manifest, input.integrationId);
  assertRequestedGrants(manifest.grants, input.requestedGrants);
  await verifyManifestSignature(parsed, manifest.trustKey);
  return manifest;
}

/**
 * Integration manifest の canonical signature base を作成します。
 *
 * @param manifest `signature` field を含み得る JSON object です。
 * @returns Provider が署名する安定 JSON 文字列です。
 */
export function createIntegrationManifestSignatureBase(manifest: unknown): string {
  const record = asRecord(manifest, 'manifest');
  const { signature: _signature, ...unsigned } = record;
  return stableStringify(unsigned);
}

async function resolveManifestBytes(
  manifestRef: string,
  payload: AgentPayloadMetadataView | undefined,
  loadManifestBytes: IntegrationManifestBytesLoader | undefined
): Promise<Uint8Array> {
  if (payload?.inlineBytes !== undefined) return payload.inlineBytes;
  if (manifestRef.startsWith('data:')) return decodeDataUrlManifest(manifestRef);
  const url = parseHttpsManifestUrl(manifestRef);
  if (loadManifestBytes === undefined) {
    throw createAgentDomainError({
      kind: 'provider_failure',
      message: 'Integration manifest loader is unavailable.',
      target: 'manifest_ref',
    });
  }
  const response = await loadManifestBytes(url);
  if (!response.ok) {
    throw createAgentDomainError({
      kind: 'provider_failure',
      message: 'Integration manifest load failed.',
      safeDetails: { status: String(response.status) },
      target: 'manifest_ref',
    });
  }
  if (!response.contentType.toLowerCase().includes(manifestContentType)) {
    throw createAgentDomainError({
      kind: 'validation',
      message: 'Integration manifest must be JSON.',
      target: 'manifest_ref',
    });
  }
  const { bytes } = response;
  if (bytes.byteLength > 256 * 1024) {
    throw createAgentDomainError({
      kind: 'validation',
      message: 'Integration manifest is too large.',
      target: 'manifest_ref',
    });
  }
  return bytes;
}

function parseHttpsManifestUrl(manifestRef: string): string {
  try {
    const url = new URL(manifestRef);
    if (url.protocol !== 'https:') throw new Error('manifest URL must be https');
    return url.toString();
  } catch {
    throw createAgentDomainError({
      kind: 'validation',
      message: 'Integration manifest_ref must be HTTPS URL, data URL, or inline payload.',
      target: 'manifest_ref',
    });
  }
}

function decodeDataUrlManifest(manifestRef: string): Uint8Array {
  const match = /^data:application\/json;base64,(?<body>[A-Za-z0-9+/=]+)$/u.exec(manifestRef);
  if (match?.groups?.body === undefined) {
    throw createAgentDomainError({
      kind: 'validation',
      message: 'Integration manifest data URL must be base64 JSON.',
      target: 'manifest_ref',
    });
  }
  const binary = atob(match.groups.body);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function parseManifestJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw createAgentDomainError({
      kind: 'validation',
      message: 'Integration manifest JSON is invalid.',
      target: 'manifest',
    });
  }
}

function normalizeManifest(
  value: unknown,
  manifestRef: string,
  manifestDigestSha256: string
): VerifiedIntegrationManifest {
  const record = asRecord(value, 'manifest');
  const integrationId = requireText(record, ['integration_id', 'integrationId'], 'integration_id');
  const schemaVersion = requireText(record, ['schema_version', 'schemaVersion'], 'schema_version');
  if (schemaVersion !== supportedIntegrationManifestSchemaVersion) {
    throw createAgentDomainError({
      kind: 'validation',
      message: 'Unsupported Integration manifest schema version.',
      safeDetails: { schemaVersion },
      target: 'schema_version',
    });
  }
  const provider = asRecord(record.provider, 'provider');
  const providerId = requireText(provider, ['id', 'provider_id', 'providerId'], 'provider_id');
  const providerBaseUrl = requireText(provider, ['base_url', 'baseUrl'], 'provider_base_url');
  const trustKey = normalizeTrustKey(provider.public_key ?? provider.publicKey);
  const adapters = readArray(record.adapters, 'adapters').map((adapter) =>
    normalizeAdapterDefinition(adapter, integrationId)
  );
  const tools = readArray(record.tools, 'tools').map(normalizeToolDefinition);
  const deliveryCapabilityCount = readArray(
    record.delivery_capabilities ?? record.deliveryCapabilities,
    'delivery_capabilities'
  ).length;
  return {
    adapters,
    deliveryCapabilityCount,
    displayName: optionalText(record, ['display_name', 'displayName']) ?? integrationId,
    grants: readStringArray(record.grants ?? record.requested_grants ?? record.requestedGrants),
    integrationId,
    manifestDigestSha256,
    manifestRef,
    providerBaseUrl,
    providerId,
    schemaVersion,
    setupInstructionsRef: normalizeReference(
      asOptionalRecord(record.setup)?.instructions_ref ??
        asOptionalRecord(record.setup)?.instructionsRef
    ),
    setupRequired: asOptionalRecord(record.setup)?.required === true,
    tools,
    trustKey,
  };
}

function normalizeTrustKey(value: unknown): VerifiedIntegrationTrustKey {
  const record = asRecord(value, 'public_key');
  const algorithm = requireText(record, ['algorithm', 'alg'], 'public_key.algorithm');
  if (!isAgentSignatureAlgorithm(algorithm)) {
    throw createAgentDomainError({
      kind: 'validation',
      message: 'Unsupported Provider signature algorithm.',
      target: 'public_key.algorithm',
    });
  }
  const material =
    record.material ?? record.jwk ?? record.public_key_material ?? record.publicKeyMaterial;
  return {
    algorithm,
    keyId: requireText(record, ['key_id', 'keyId', 'kid'], 'public_key.key_id'),
    publicKeyMaterial: normalizeKeyMaterial(material),
    publicKeyRef: requireText(record, ['ref', 'public_key_ref', 'publicKeyRef'], 'public_key.ref'),
  };
}

function normalizeToolDefinition(value: unknown): VerifiedIntegrationToolDefinition {
  const record = asRecord(value, 'tool');
  const toolId = requireText(record, ['tool_id', 'toolId'], 'tool_id');
  return {
    approvalRequired: record.approval_required === true || record.approvalRequired === true,
    cancellationSupported:
      record.cancellation_supported === true || record.cancellationSupported === true,
    description: optionalText(record, ['description']),
    displayName: optionalText(record, ['display_name', 'displayName']) ?? toolId,
    inputSchemaRef: normalizeReference(record.input_schema_ref ?? record.inputSchemaRef),
    outputSchemaRef: normalizeReference(record.output_schema_ref ?? record.outputSchemaRef),
    providerTargetRef: normalizeOptionalText(
      record.provider_target_ref ?? record.providerTargetRef
    ),
    toolId,
    version: optionalText(record, ['version']) ?? '1.0.0',
  };
}

async function verifyManifestSignature(
  manifest: unknown,
  trustKey: VerifiedIntegrationTrustKey
): Promise<void> {
  const signatureRecord = asRecord(asRecord(manifest, 'manifest').signature, 'signature');
  const algorithm = requireText(signatureRecord, ['algorithm', 'alg'], 'signature.algorithm');
  if (algorithm !== trustKey.algorithm || !isAgentSignatureAlgorithm(algorithm)) {
    throw createAgentDomainError({
      kind: 'authorization',
      message: 'Integration manifest signature algorithm does not match trust key.',
      target: 'signature.algorithm',
    });
  }
  const keyId = requireText(signatureRecord, ['key_id', 'keyId', 'kid'], 'signature.key_id');
  if (keyId !== trustKey.keyId) {
    throw createAgentDomainError({
      kind: 'authorization',
      message: 'Integration manifest signature key does not match Provider key.',
      target: 'signature.key_id',
    });
  }
  if (trustKey.publicKeyMaterial === undefined) {
    throw createAgentDomainError({
      kind: 'authorization',
      message: 'Integration manifest trust key material is required for verification.',
      target: 'public_key.material',
    });
  }
  const signature = decodeBase64Url(
    requireText(signatureRecord, ['signature', 'signature_base64url'], 'signature.signature')
  );
  const valid = await verifyBytesWithAgentKey({
    algorithm,
    data: new TextEncoder().encode(createIntegrationManifestSignatureBase(manifest)),
    key: trustKey.publicKeyMaterial,
    signature,
  });
  if (!valid) {
    throw createAgentDomainError({
      kind: 'authorization',
      message: 'Integration manifest signature is invalid.',
      target: 'signature',
    });
  }
}

function assertIntegrationIdentity(
  manifest: VerifiedIntegrationManifest,
  requestedId: string
): void {
  if (manifest.integrationId !== requestedId) {
    throw createAgentDomainError({
      kind: 'validation',
      message: 'Integration manifest identity does not match request.',
      target: 'integration_id',
    });
  }
}

function assertRequestedGrants(
  manifestGrants: readonly string[],
  requestedGrants: readonly string[]
): void {
  const grantSet = new Set(manifestGrants);
  for (const grant of requestedGrants) {
    if (!grantSet.has(grant)) {
      throw createAgentDomainError({
        kind: 'authorization',
        message: 'Requested Integration grant is not declared by manifest.',
        safeDetails: { grant },
        target: 'requested_grants',
      });
    }
  }
}

function asRecord(value: unknown, target: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw createAgentDomainError({ kind: 'validation', message: `Invalid ${target}.`, target });
  }
  return value as Record<string, unknown>;
}

function asOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function readArray(value: unknown, target: string): readonly unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw createAgentDomainError({
      kind: 'validation',
      message: `${target} must be an array.`,
      target,
    });
  }
  return value;
}

function readStringArray(value: unknown): readonly string[] {
  return readArray(value, 'grants').map((item) => {
    const normalized = normalizeOptionalText(item);
    if (normalized === undefined) {
      throw createAgentDomainError({
        kind: 'validation',
        message: 'Integration grant must be a non-empty string.',
        target: 'grants',
      });
    }
    return normalized;
  });
}

function requireText(
  record: Readonly<Record<string, unknown>>,
  names: readonly string[],
  target: string
): string {
  const value = optionalText(record, names);
  if (value === undefined) {
    throw createAgentDomainError({
      kind: 'validation',
      message: `${target} must not be empty.`,
      target,
    });
  }
  return value;
}

function optionalText(
  record: Readonly<Record<string, unknown>>,
  names: readonly string[]
): string | undefined {
  for (const name of names) {
    const value = normalizeOptionalText(record[name]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().normalize('NFC');
  return normalized === '' ? undefined : normalized;
}

function normalizeReference(value: unknown): string | undefined {
  if (typeof value === 'string') return normalizeOptionalText(value);
  return normalizeOptionalText(asOptionalRecord(value)?.ref);
}

function normalizeKeyMaterial(value: unknown): AgentSignatureKeyMaterial | undefined {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as JsonWebKey;
    } catch {
      return value;
    }
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as JsonWebKey;
  }
  return undefined;
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}
