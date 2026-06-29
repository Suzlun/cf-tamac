import { decodeBase64UrlBytes } from './base64url';
import { computeSha256Hex } from './digest';

import type {
  AgentControlPlanePrincipalType,
  AgentControlPlaneScope,
  AgentPrincipalTrustSummary,
  AgentTrustConfigDiagnostic,
  AgentTrustKeyPolicy,
  AgentTrustKeyStatus,
} from './types';

const textEncoder = new TextEncoder();

const acceptedScopes = new Set<AgentControlPlaneScope>([
  'agent:read',
  'agent:write',
  'agent:tool:approve',
  'agent:integration:admin',
  'agent:admin',
  '*',
]);

const acceptedPrincipalTypes = new Set<AgentControlPlanePrincipalType>([
  'CLIENT_SERVICE',
  'ADMIN_OPERATOR',
]);

const acceptedKeyStatuses = new Set<AgentTrustKeyStatus>(['active', 'retiring', 'revoked']);

let cachedTrustConfig:
  | {
      readonly raw: string;
      readonly config: ControlPlaneTrustConfig;
    }
  | undefined;

/**
 * Trust config の検証失敗理由です。
 */
export type ControlPlaneTrustConfigErrorReason =
  | 'malformed_json'
  | 'schema_invalid'
  | 'private_parameter_present'
  | 'unsupported_key_type'
  | 'missing_policy';

/**
 * `AGENT_CONTROL_PLANE_TRUST` の検証で発生した安全な error です。
 *
 * @remarks
 * Error message は secret や public key full value を含めず、運用者が設定項目を直せる分類だけを保持します。
 */
export class ControlPlaneTrustConfigError extends Error {
  readonly reason: ControlPlaneTrustConfigErrorReason;

  constructor(reason: ControlPlaneTrustConfigErrorReason, message: string) {
    super(message);
    this.name = 'ControlPlaneTrustConfigError';
    this.reason = reason;
  }
}

/**
 * Agent Worker が検証済みとして保持する control-plane trust config です。
 */
export interface ControlPlaneTrustConfig {
  readonly audiences: readonly string[];
  readonly diagnostic: AgentTrustConfigDiagnostic;
  readonly fingerprint: string;
  readonly issuers: ReadonlyMap<string, ControlPlaneTrustIssuer>;
  readonly loadedAtUnixMs: number;
  readonly version: string;
}

/**
 * Trust config 上の issuer と配下 key policy です。
 */
export interface ControlPlaneTrustIssuer {
  readonly issuer: string;
  readonly keys: ReadonlyMap<string, AgentTrustKeyPolicy>;
}

/**
 * Trust config から issuer/kid を解決した結果です。
 */
export type ControlPlaneTrustKeyLookupResult =
  | { readonly key: AgentTrustKeyPolicy; readonly status: 'found' }
  | { readonly reason: 'unknown_issuer' | 'unknown_kid'; readonly status: 'missing' };

/**
 * `AGENT_CONTROL_PLANE_TRUST` JSON を cache 付きで検証して返します。
 *
 * @param rawTrustConfig Worker secret から取得した JSON 文字列です。
 * @param nowUnixMs cache miss 時に loadedAt として記録する Unix epoch milliseconds です。
 * @returns schema validation と fingerprint 計算済みの trust config です。
 */
export async function loadControlPlaneTrustConfig(
  rawTrustConfig: string,
  nowUnixMs = Date.now()
): Promise<ControlPlaneTrustConfig> {
  // 同一 secret 文字列では loadedAt/fingerprint を安定させ、request ごとの過剰 parse を避けます。
  if (cachedTrustConfig?.raw === rawTrustConfig) {
    return cachedTrustConfig.config;
  }
  const config = await parseControlPlaneTrustConfig(rawTrustConfig, nowUnixMs);
  cachedTrustConfig = { config, raw: rawTrustConfig };
  return config;
}

/**
 * `AGENT_CONTROL_PLANE_TRUST` JSON を検証し、issuer/kid lookup 可能な構造へ正規化します。
 *
 * @param rawTrustConfig Worker secret に設定された JSON 文字列です。
 * @param loadedAtUnixMs 読み込み成功時に診断へ保持する Unix epoch milliseconds です。
 * @returns 検証済み trust config です。
 * @throws ControlPlaneTrustConfigError JSON、schema、private parameter、policy が不正な場合に発生します。
 */
export async function parseControlPlaneTrustConfig(
  rawTrustConfig: string,
  loadedAtUnixMs = Date.now()
): Promise<ControlPlaneTrustConfig> {
  // JSON parse は秘密情報を error message に混ぜないため、詳細 exception を外へ出しません。
  const parsed = parseJsonObject(rawTrustConfig);
  if (containsPrivateJwkParameter(parsed)) {
    throw new ControlPlaneTrustConfigError(
      'private_parameter_present',
      'Control-plane trust config must not contain private JWK parameters.'
    );
  }

  const version = readRequiredVersion(parsed, 'version');
  const audiences = readRequiredStringArray(parsed, 'audiences');
  const rawIssuers = readRequiredArray(parsed, 'issuers');
  if (version === undefined || audiences.length === 0 || rawIssuers.length === 0) {
    throw new ControlPlaneTrustConfigError(
      'schema_invalid',
      'Control-plane trust config requires version, audiences, and issuers.'
    );
  }

  const issuers = new Map<string, ControlPlaneTrustIssuer>();
  let keyCount = 0;
  for (const issuerEntry of rawIssuers) {
    const issuer = await parseTrustIssuer(issuerEntry);
    if (issuers.has(issuer.issuer)) {
      throw new ControlPlaneTrustConfigError(
        'schema_invalid',
        'Duplicate trust issuer is invalid.'
      );
    }
    keyCount += issuer.keys.size;
    issuers.set(issuer.issuer, issuer);
  }
  if (keyCount === 0) {
    throw new ControlPlaneTrustConfigError(
      'schema_invalid',
      'Control-plane trust config requires at least one Ed25519 public key.'
    );
  }

  const fingerprint = await createSafeFingerprint({ audiences, issuers: rawIssuers, version });
  const diagnostic: AgentTrustConfigDiagnostic = {
    fingerprint,
    issuerCount: issuers.size,
    keyCount,
    loadedAtUnixMs,
    status: 'serving',
    version,
  };
  return { audiences, diagnostic, fingerprint, issuers, loadedAtUnixMs, version };
}

/**
 * 検証済み trust config から issuer/kid の key policy を取得します。
 *
 * @param config parse 済み trust config です。
 * @param issuer JWT payload の `iss` です。
 * @param kid JWT header の `kid` です。
 * @returns 解決済み key policy、または unknown issuer/kid の安全な分類です。
 */
export function resolveControlPlaneTrustKey(
  config: ControlPlaneTrustConfig,
  issuer: string | undefined,
  kid: string | undefined
): ControlPlaneTrustKeyLookupResult {
  if (issuer === undefined || issuer === '') {
    return { reason: 'unknown_issuer', status: 'missing' };
  }
  const trustIssuer = config.issuers.get(issuer);
  if (trustIssuer === undefined) {
    return { reason: 'unknown_issuer', status: 'missing' };
  }
  if (kid === undefined || kid === '') {
    return { reason: 'unknown_kid', status: 'missing' };
  }
  const key = trustIssuer.keys.get(kid);
  if (key === undefined) {
    return { reason: 'unknown_kid', status: 'missing' };
  }
  return { key, status: 'found' };
}

/**
 * 認証済み principal の health/audit 用 trust summary を作成します。
 */
export function createAgentPrincipalTrustSummary(input: {
  readonly key: AgentTrustKeyPolicy;
  readonly verifiedAtUnixMs?: number;
}): AgentPrincipalTrustSummary {
  return {
    fingerprint: input.key.fingerprint,
    issuer: input.key.issuer,
    keyStatus: input.key.status,
    kid: input.key.kid,
    principalType: input.key.principalType,
    verified: true,
    verifiedAtUnixMs: input.verifiedAtUnixMs ?? Date.now(),
  };
}

async function parseTrustIssuer(value: unknown): Promise<ControlPlaneTrustIssuer> {
  const record = requireRecord(value);
  const issuer = readRequiredString(record, 'issuer');
  const rawKeys = readRequiredArray(record, 'keys');
  if (issuer === undefined || rawKeys.length === 0) {
    throw new ControlPlaneTrustConfigError(
      'schema_invalid',
      'Each trust issuer requires issuer and keys.'
    );
  }

  const keys = new Map<string, AgentTrustKeyPolicy>();
  for (const keyEntry of rawKeys) {
    const key = await parseTrustKey(issuer, keyEntry);
    if (keys.has(key.kid)) {
      throw new ControlPlaneTrustConfigError(
        'schema_invalid',
        'Duplicate trust key id is invalid.'
      );
    }
    keys.set(key.kid, key);
  }
  return { issuer, keys };
}

async function parseTrustKey(issuer: string, value: unknown): Promise<AgentTrustKeyPolicy> {
  const record = requireRecord(value);
  const kid = readRequiredString(record, 'kid');
  const kty = readRequiredString(record, 'kty');
  const crv = readRequiredString(record, 'crv');
  const x = readRequiredString(record, 'x');
  const status = readKeyStatus(record.status);
  const principalType = readPrincipalType(record.principalType);
  const allowedAgentIds = readRequiredStringArray(record, 'allowedAgentIds');
  const allowedScopes = readAllowedScopes(record.allowedScopes);

  if (kid === undefined || x === undefined || status === undefined) {
    throw new ControlPlaneTrustConfigError(
      'schema_invalid',
      'Each trust key requires kid, x, and status.'
    );
  }
  if (kty !== 'OKP' || crv !== 'Ed25519') {
    throw new ControlPlaneTrustConfigError(
      'unsupported_key_type',
      'Control-plane trust keys must be OKP Ed25519 public keys.'
    );
  }
  // Control-plane bearer JWT の trust policy は通常運用の Client Service と break-glass の Admin Operator だけを受け入れます。
  // Integration Installation / Internal Service は別認証方式の主体なので、ここで混在させると権限境界が曖昧になります。
  if (principalType === undefined || allowedAgentIds.length === 0 || allowedScopes.length === 0) {
    throw new ControlPlaneTrustConfigError(
      'missing_policy',
      'Each trust key requires CLIENT_SERVICE or ADMIN_OPERATOR principalType, allowedAgentIds, and allowedScopes.'
    );
  }
  assertBase64UrlEd25519PublicParameter(x);

  const publicJwk: JsonWebKey = { crv: 'Ed25519', ext: true, kty: 'OKP', x };
  return {
    allowedAgentIds,
    allowedScopes,
    crv: 'Ed25519',
    fingerprint: await createSafeFingerprint({ crv: 'Ed25519', kty: 'OKP', x }),
    issuer,
    kid,
    kty: 'OKP',
    principalType,
    publicJwk,
    status,
  };
}

async function createSafeFingerprint(value: unknown): Promise<string> {
  // canonical JSON を SHA-256 化し、public key full value を diagnostic/log へ直接出さない識別子にします。
  return `sha256:${await computeSha256Hex(textEncoder.encode(stableStringify(value)))}`;
}

function parseJsonObject(rawTrustConfig: string): Record<string, unknown> {
  try {
    return requireRecord(JSON.parse(rawTrustConfig) as unknown);
  } catch {
    throw new ControlPlaneTrustConfigError(
      'malformed_json',
      'Control-plane trust config must be valid JSON object.'
    );
  }
}

function containsPrivateJwkParameter(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsPrivateJwkParameter(item));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).some(
      ([key, nestedValue]) => key === 'd' || containsPrivateJwkParameter(nestedValue)
    );
  }
  return false;
}

function assertBase64UrlEd25519PublicParameter(x: string): void {
  const bytes = decodeBase64UrlBytes(x);
  if (bytes.byteLength !== 32) {
    throw new ControlPlaneTrustConfigError(
      'unsupported_key_type',
      'Ed25519 public key parameter x must decode to 32 bytes.'
    );
  }
}

function readPrincipalType(value: unknown): AgentControlPlanePrincipalType | undefined {
  if (typeof value !== 'string') return undefined;
  return acceptedPrincipalTypes.has(value as AgentControlPlanePrincipalType)
    ? (value as AgentControlPlanePrincipalType)
    : undefined;
}

function readKeyStatus(value: unknown): AgentTrustKeyStatus | undefined {
  if (typeof value !== 'string') return undefined;
  return acceptedKeyStatuses.has(value as AgentTrustKeyStatus)
    ? (value as AgentTrustKeyStatus)
    : undefined;
}

function readAllowedScopes(value: unknown): readonly AgentControlPlaneScope[] {
  const scopes = readStringArray(value);
  return scopes.filter((scope): scope is AgentControlPlaneScope =>
    acceptedScopes.has(scope as AgentControlPlaneScope)
  );
}

function readRequiredString(record: Record<string, unknown>, key: string): string | undefined {
  // Trust config の key 名は JSON 由来なので、添字アクセスではなく own property 走査で安全に値を選びます。
  const value = readRecordValue(record, key);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function readRequiredVersion(record: Record<string, unknown>, key: string): string | undefined {
  // runbook は numeric schema version を正本にするため、health/proto へは string 表現へ正規化して返します。
  const value = readRecordValue(record, key);
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function readRequiredStringArray(record: Record<string, unknown>, key: string): readonly string[] {
  // 配列 claim も同じ読み取り経路へ集約し、prototype chain や想定外 property への到達を避けます。
  return readStringArray(readRecordValue(record, key));
}

function readStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

function readRequiredArray(record: Record<string, unknown>, key: string): readonly unknown[] {
  // issuer/key 配列は public trust config だけから取得し、own property 以外は schema 欠落として扱います。
  const value = readRecordValue(record, key);
  return Array.isArray(value) ? value : [];
}

function readRecordValue(record: Record<string, unknown>, key: string): unknown {
  // Object.entries は JSON object の own enumerable property だけを列挙するため、設定値の読み取り範囲を明確にできます。
  return Object.entries(record).find(([entryKey]) => entryKey === key)?.[1];
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new ControlPlaneTrustConfigError('schema_invalid', 'Trust config value must be an object.');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableStringify(nestedValue)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
