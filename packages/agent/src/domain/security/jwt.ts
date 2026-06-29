import { decodeBase64UrlBytes, decodeBase64UrlJsonObject } from './base64url';
import { verifyBytesWithAgentKey } from './crypto';
import { createAgentPrincipalTrustSummary, resolveControlPlaneTrustKey } from './trust-config';

import type { ControlPlaneTrustConfig } from './trust-config';
import type {
  AgentControlPlanePrincipalType,
  AgentControlPlaneScope,
  AgentPrincipalContext,
  AgentTrustKeyStatus,
} from './types';

const textEncoder = new TextEncoder();
const defaultClockSkewSeconds = 30;
const defaultMaxTokenTtlSeconds = 300;

/**
 * EdDSA Client Service JWT の検証設定です。
 */
export interface ClientServiceJwtVerifierOptions {
  readonly clockSkewSeconds?: number;
  readonly expectedAgentId?: string;
  readonly expectedAudience?: string;
  readonly expectedKeyFingerprint?: string;
  readonly maxTokenTtlSeconds?: number;
  readonly nowUnixSeconds?: number;
  readonly requiredScopes?: readonly AgentControlPlaneScope[];
  readonly trustConfig: ControlPlaneTrustConfig;
}

/**
 * Ed25519 JWT から検証済みとして抽出した control-plane principal です。
 */
export interface ClientServiceJwtPrincipalContext extends AgentPrincipalContext {
  readonly actingUserId: string;
  readonly audience: string;
  readonly expiresAtUnixMs: number;
  readonly fingerprint: string;
  readonly issuer: string;
  readonly jwtId: string;
  readonly keyId: string;
  readonly keyStatus: AgentTrustKeyStatus;
  readonly notBeforeUnixMs: number;
  readonly principalType: AgentControlPlanePrincipalType;
  readonly subject: string;
}

/**
 * Client Service JWT 検証が返す安全な失敗理由です。
 */
export type ClientServiceJwtFailureReason =
  | 'malformed'
  | 'unsupported_algorithm'
  | 'missing_kid'
  | 'unknown_issuer'
  | 'unknown_kid'
  | 'revoked_key'
  | 'invalid_signature'
  | 'invalid_issuer'
  | 'invalid_subject'
  | 'invalid_jwt_id'
  | 'invalid_audience'
  | 'expired'
  | 'not_before'
  | 'ttl_exceeded'
  | 'invalid_agent_scope'
  | 'agent_scope_denied'
  | 'scope_denied'
  | 'missing_scope'
  | 'fingerprint_mismatch'
  | 'invalid_acting_user';

/**
 * EdDSA Client Service JWT 検証の結果です。
 */
export type ClientServiceJwtVerificationResult =
  | {
      readonly principal: ClientServiceJwtPrincipalContext;
      readonly status: 'verified';
    }
  | {
      readonly message: string;
      readonly reason: ClientServiceJwtFailureReason;
      readonly status: 'rejected';
    };

/**
 * Ed25519 compact JWT を検証し、Agent RPC 用 principal context へ正規化します。
 *
 * @param token `Authorization: Bearer` から取り出した compact JWT です。
 * @param options trust config、audience、時刻、scope policy などの検証条件です。
 * @returns 検証済み principal、または secret を含まない拒否理由です。
 */
export async function verifyClientServiceJwt(
  token: string,
  options: ClientServiceJwtVerifierOptions
): Promise<ClientServiceJwtVerificationResult> {
  // compact JWS として読めない値は署名検証へ進めず、token 内容を外へ出しません。
  const parsed = parseCompactJwt(token);
  if (parsed === undefined) {
    return rejectClientJwt('malformed', 'Client Service JWT must be a compact JWS.');
  }
  // 本番 Client Service 認証は Ed25519/EdDSA のみに固定し、HS256 等は拒否します。
  if (parsed.algorithm !== 'EdDSA') {
    return rejectClientJwt('unsupported_algorithm', 'Client Service JWT algorithm must be EdDSA.');
  }
  if (parsed.keyId === undefined) {
    return rejectClientJwt('missing_kid', 'Client Service JWT key id is required.');
  }

  const issuer = readRequiredString(parsed.payload, 'iss');
  const trustKey = resolveControlPlaneTrustKey(options.trustConfig, issuer, parsed.keyId);
  if (trustKey.status === 'missing') {
    return rejectClientJwt(
      trustKey.reason,
      trustKey.reason === 'unknown_issuer'
        ? 'Client Service JWT issuer is not trusted.'
        : 'Client Service JWT key id is not trusted.'
    );
  }
  if (trustKey.key.status === 'revoked') {
    return rejectClientJwt('revoked_key', 'Client Service JWT key is revoked.');
  }

  const signatureValid = await verifyBytesWithAgentKey({
    algorithm: 'EdDSA',
    data: textEncoder.encode(parsed.signingInput),
    key: trustKey.key.publicJwk,
    signature: parsed.signature,
  });
  if (!signatureValid) {
    return rejectClientJwt('invalid_signature', 'Client Service JWT signature is invalid.');
  }

  return validateClientJwtClaims(parsed.payload, trustKey.key, options);
}

interface ParsedCompactJwt {
  readonly algorithm: string;
  readonly keyId?: string;
  readonly payload: Record<string, unknown>;
  readonly signature: Uint8Array;
  readonly signingInput: string;
}

function parseCompactJwt(token: string): ParsedCompactJwt | undefined {
  const segments = token.split('.');
  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  if (
    segments.length !== 3 ||
    encodedHeader === undefined ||
    encodedPayload === undefined ||
    encodedSignature === undefined
  ) {
    return undefined;
  }
  try {
    const header = decodeBase64UrlJsonObject(encodedHeader);
    const payload = decodeBase64UrlJsonObject(encodedPayload);
    if (header === undefined || payload === undefined) {
      return undefined;
    }
    const algorithm = readRequiredString(header, 'alg');
    if (algorithm === undefined) {
      return undefined;
    }
    return {
      algorithm,
      keyId: readOptionalString(header, 'kid'),
      payload,
      signature: decodeBase64UrlBytes(encodedSignature),
      signingInput: `${encodedHeader}.${encodedPayload}`,
    };
  } catch {
    return undefined;
  }
}

function validateClientJwtClaims(
  claims: Record<string, unknown>,
  key: Exclude<
    ReturnType<typeof resolveControlPlaneTrustKey>,
    { readonly status: 'missing' }
  >['key'],
  options: ClientServiceJwtVerifierOptions
): ClientServiceJwtVerificationResult {
  const issuer = readRequiredString(claims, 'iss');
  if (issuer !== key.issuer) {
    return rejectClientJwt('invalid_issuer', 'Client Service JWT issuer is invalid.');
  }
  const subject = readRequiredString(claims, 'sub');
  if (subject === undefined) {
    return rejectClientJwt('invalid_subject', 'Client Service JWT subject is required.');
  }
  const jwtId = readRequiredString(claims, 'jti');
  if (jwtId === undefined) {
    return rejectClientJwt('invalid_jwt_id', 'Client Service JWT ID is required.');
  }
  const audience = selectAcceptedAudience(claims, options);
  if (audience === undefined) {
    return rejectClientJwt('invalid_audience', 'Client Service JWT audience is invalid.');
  }
  const timeWindow = validateClientJwtTime(claims, options);
  if (timeWindow.status === 'rejected') {
    return timeWindow;
  }
  const agentId = readRequiredString(claims, 'agent_id');
  if (!isConcreteJwtAgentId(agentId)) {
    return rejectClientJwt('invalid_agent_scope', 'Client Service JWT agent scope is required.');
  }
  if (options.expectedAgentId !== undefined && agentId !== options.expectedAgentId) {
    return rejectClientJwt('invalid_agent_scope', 'Client Service JWT agent scope is invalid.');
  }
  if (!isAllowedPolicyValue(key.allowedAgentIds, agentId)) {
    return rejectClientJwt('agent_scope_denied', 'Client Service JWT agent is not allowed.');
  }
  const scopes = readScopes(claims);
  if (hasWildcardJwtScope(scopes)) {
    return rejectClientJwt('scope_denied', 'Client Service JWT scopes must be concrete.');
  }
  if (!areScopesAllowedByPolicy(scopes, key.allowedScopes)) {
    return rejectClientJwt('scope_denied', 'Client Service JWT scopes exceed key policy.');
  }
  if (!hasRequiredScopes(scopes, options.requiredScopes ?? [])) {
    return rejectClientJwt('missing_scope', 'Client Service JWT required scope is missing.');
  }
  const fingerprintResult = validateFingerprint(
    claims,
    key.fingerprint,
    options.expectedKeyFingerprint
  );
  if (fingerprintResult !== undefined) {
    return fingerprintResult;
  }
  const actingUserId = readRequiredString(claims, 'acting_user_id');
  if (actingUserId === undefined) {
    return rejectClientJwt('invalid_acting_user', 'Client Service JWT acting user is required.');
  }

  const trustSummary = createAgentPrincipalTrustSummary({ key });
  return {
    principal: {
      actingUserId,
      agentId,
      allowedAgentIds: key.allowedAgentIds,
      allowedScopes: key.allowedScopes,
      audience,
      expiresAtUnixMs: timeWindow.expiresAtUnixSeconds * 1000,
      fingerprint: key.fingerprint,
      issuer,
      jwtId,
      keyId: key.kid,
      keyStatus: key.status,
      notBeforeUnixMs: timeWindow.notBeforeUnixSeconds * 1000,
      principalId: subject,
      principalType: key.principalType,
      scopes,
      subject,
      trustSummary,
    },
    status: 'verified',
  };
}

type TimeValidationResult =
  | {
      readonly expiresAtUnixSeconds: number;
      readonly notBeforeUnixSeconds: number;
      readonly status: 'accepted';
    }
  | {
      readonly message: string;
      readonly reason: ClientServiceJwtFailureReason;
      readonly status: 'rejected';
    };

function validateClientJwtTime(
  claims: Record<string, unknown>,
  options: ClientServiceJwtVerifierOptions
): TimeValidationResult {
  const now = options.nowUnixSeconds ?? Math.floor(Date.now() / 1000);
  const skew = options.clockSkewSeconds ?? defaultClockSkewSeconds;
  const expiresAt = readRequiredNumber(claims, 'exp');
  if (expiresAt === undefined || now - skew >= expiresAt) {
    return rejectClientJwt('expired', 'Client Service JWT is expired.');
  }
  const notBefore = readRequiredNumber(claims, 'nbf');
  if (notBefore === undefined || now + skew < notBefore) {
    return rejectClientJwt('not_before', 'Client Service JWT is not active yet.');
  }
  const maxTtl = options.maxTokenTtlSeconds ?? defaultMaxTokenTtlSeconds;
  if (expiresAt <= notBefore || expiresAt - notBefore > maxTtl) {
    return rejectClientJwt('ttl_exceeded', 'Client Service JWT lifetime exceeds policy.');
  }
  return { expiresAtUnixSeconds: expiresAt, notBeforeUnixSeconds: notBefore, status: 'accepted' };
}

function selectAcceptedAudience(
  claims: Record<string, unknown>,
  options: ClientServiceJwtVerifierOptions
): string | undefined {
  const accepted = new Set(options.trustConfig.audiences);
  if (options.expectedAudience !== undefined) {
    accepted.add(options.expectedAudience);
  }
  for (const audience of readAudience(claims)) {
    if (accepted.has(audience)) {
      return audience;
    }
  }
  return undefined;
}

function validateFingerprint(
  claims: Record<string, unknown>,
  keyFingerprint: string,
  expectedKeyFingerprint: string | undefined
): ClientServiceJwtVerificationResult | undefined {
  const presented =
    readOptionalString(claims, 'key_fingerprint') ??
    readOptionalString(claims, 'public_fingerprint');
  if (presented !== undefined && presented !== keyFingerprint) {
    return rejectClientJwt(
      'fingerprint_mismatch',
      'Client Service JWT key fingerprint is invalid.'
    );
  }
  if (expectedKeyFingerprint !== undefined && expectedKeyFingerprint !== keyFingerprint) {
    return rejectClientJwt(
      'fingerprint_mismatch',
      'Expected Client Service key fingerprint is invalid.'
    );
  }
  return undefined;
}

function readAudience(claims: Record<string, unknown>): readonly string[] {
  const audience = claims.aud;
  if (typeof audience === 'string' && audience.trim() !== '') {
    return [audience.trim()];
  }
  if (Array.isArray(audience)) {
    return audience.filter((value): value is string => typeof value === 'string' && value !== '');
  }
  return [];
}

function readScopes(claims: Record<string, unknown>): readonly string[] {
  const scopes = new Set<string>();
  for (const value of readDelimitedStringClaim(claims.scope)) scopes.add(value);
  for (const value of readDelimitedStringClaim(claims.scp)) scopes.add(value);
  for (const value of readDelimitedStringClaim(claims.scopes)) scopes.add(value);
  return [...scopes];
}

function isConcreteJwtAgentId(agentId: string | undefined): agentId is string {
  // JWT の `agent_id` は署名主体と request body の Agent 境界を結ぶ実体 ID です。
  // `*` は trust config の allowedAgentIds policy だけに許されるため、token claim としては拒否します。
  return agentId !== undefined && agentId !== '' && agentId !== '*';
}

function hasWildcardJwtScope(scopes: readonly string[]): boolean {
  // `*` scope は trust config 側の broad policy 表現だけに閉じ、token 側は method matrix と照合できる具体 scope だけにします。
  // これにより `allowedScopes: ["*"]` が concrete token scope を許可しても、token 自身の wildcard scope は権限になりません。
  return scopes.includes('*');
}

function readDelimitedStringClaim(value: unknown): readonly string[] {
  if (typeof value === 'string') {
    return value
      .split(' ')
      .map((scope) => scope.trim())
      .filter((scope) => scope !== '');
  }
  if (Array.isArray(value)) {
    return value.filter((scope): scope is string => typeof scope === 'string' && scope !== '');
  }
  return [];
}

function hasRequiredScopes(scopes: readonly string[], requiredScopes: readonly string[]): boolean {
  const available = new Set(scopes);
  for (const requiredScope of requiredScopes) {
    if (!available.has(requiredScope)) return false;
  }
  return true;
}

function areScopesAllowedByPolicy(
  scopes: readonly string[],
  allowedScopes: readonly AgentControlPlaneScope[]
): boolean {
  if (allowedScopes.includes('*')) return true;
  const allowed = new Set<string>(allowedScopes);
  for (const scope of scopes) {
    if (!allowed.has(scope)) return false;
  }
  return true;
}

function isAllowedPolicyValue(allowedValues: readonly string[], value: string): boolean {
  return allowedValues.includes('*') || allowedValues.includes(value);
}

function readRequiredString(record: Record<string, unknown>, key: string): string | undefined {
  const value = readOptionalString(record, key);
  return value === undefined || value === '' ? undefined : value;
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  // JWT claim 名は外部入力なので、直接添字アクセスせず entries 走査で取得して object-injection 誤検知と危険な property 解決を避けます。
  const value = readRecordValue(record, key);
  if (typeof value === 'string') return value.trim();
  return undefined;
}

function readRequiredNumber(record: Record<string, unknown>, key: string): number | undefined {
  // NumericDate claim も同じ取得経路に寄せ、issuer 入力由来 key で prototype chain を辿らないようにします。
  const value = readRecordValue(record, key);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

function readRecordValue(record: Record<string, unknown>, key: string): unknown {
  // Object.entries は own enumerable property だけを走査するため、JWT payload の claim 値だけを安全に選択できます。
  return Object.entries(record).find(([entryKey]) => entryKey === key)?.[1];
}

function rejectClientJwt(
  reason: ClientServiceJwtFailureReason,
  message: string
): Extract<ClientServiceJwtVerificationResult, { readonly status: 'rejected' }> {
  return { message, reason, status: 'rejected' };
}
