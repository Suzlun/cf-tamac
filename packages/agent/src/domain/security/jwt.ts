import { decodeBase64UrlBytes, decodeBase64UrlJsonObject } from './base64url';
import {
  isAgentSignatureAlgorithm,
  verifyBytesWithAgentKey,
  type AgentSignatureAlgorithm,
  type AgentSignatureKeyMaterial,
} from './crypto';

import type { AgentPrincipalContext } from './types';

const textEncoder = new TextEncoder();

/**
 * Key lookup information extracted from an untrusted Client Service JWT header.
 */
export interface ClientServiceJwtKeyLookup {
  readonly algorithm: AgentSignatureAlgorithm;
  readonly issuer?: string;
  readonly keyId?: string;
}

/**
 * Verification key material returned for a Client Service JWT.
 */
export interface ClientServiceJwtVerificationKey {
  readonly algorithm: AgentSignatureAlgorithm;
  readonly key: AgentSignatureKeyMaterial;
  readonly keyId?: string;
}

/**
 * Resolver used by the Worker or tests to provide Client Service JWT verifier keys.
 */
export type ClientServiceJwtKeyResolver = (
  lookup: ClientServiceJwtKeyLookup
) =>
  | ClientServiceJwtVerificationKey
  | Promise<ClientServiceJwtVerificationKey | undefined>
  | undefined;

/**
 * Options controlling Client Service JWT verification.
 */
export interface ClientServiceJwtVerifierOptions {
  readonly expectedAgentId: string;
  readonly expectedAudience: string;
  readonly expectedIssuer: string;
  readonly keyResolver: ClientServiceJwtKeyResolver;
  readonly nowUnixSeconds?: number;
  readonly requiredScopes: readonly string[];
  readonly clockSkewSeconds?: number;
}

/**
 * Verified Client Service principal and required JWT claims.
 */
export interface ClientServiceJwtPrincipalContext extends AgentPrincipalContext {
  readonly actingUserId: string;
  readonly audience: string;
  readonly issuer: string;
  readonly jwtId: string;
  readonly principalType: 'CLIENT_SERVICE';
  readonly subject: string;
}

/**
 * Failure reason returned without exposing token material.
 */
export type ClientServiceJwtFailureReason =
  | 'malformed'
  | 'unsupported_algorithm'
  | 'missing_key'
  | 'invalid_signature'
  | 'invalid_issuer'
  | 'invalid_subject'
  | 'invalid_jwt_id'
  | 'invalid_audience'
  | 'expired'
  | 'not_before'
  | 'invalid_agent_scope'
  | 'missing_scope'
  | 'invalid_acting_user';

/**
 * Result of Client Service JWT verification.
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
 * Verify a short-lived Client Service JWT and extract a typed Agent principal.
 */
export async function verifyClientServiceJwt(
  token: string,
  options: ClientServiceJwtVerifierOptions
): Promise<ClientServiceJwtVerificationResult> {
  const parsed = parseCompactJwt(token);
  if (parsed === undefined) {
    return rejectClientJwt('malformed', 'Client Service JWT must be a compact JWS.');
  }
  if (!isAgentSignatureAlgorithm(parsed.algorithm)) {
    return rejectClientJwt('unsupported_algorithm', 'Client Service JWT algorithm is unsupported.');
  }
  const key = await options.keyResolver({
    algorithm: parsed.algorithm,
    issuer: readOptionalString(parsed.payload, 'iss'),
    keyId: parsed.keyId,
  });
  if (key?.algorithm !== parsed.algorithm) {
    return rejectClientJwt('missing_key', 'Client Service JWT verification key is unavailable.');
  }
  const signatureValid = await verifyBytesWithAgentKey({
    algorithm: parsed.algorithm,
    data: textEncoder.encode(parsed.signingInput),
    key: key.key,
    signature: parsed.signature,
  });
  if (!signatureValid) {
    return rejectClientJwt('invalid_signature', 'Client Service JWT signature is invalid.');
  }
  return validateClientJwtClaims(parsed.payload, parsed.keyId ?? key.keyId, options);
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
  keyId: string | undefined,
  options: ClientServiceJwtVerifierOptions
): ClientServiceJwtVerificationResult {
  const issuer = readRequiredString(claims, 'iss');
  if (issuer !== options.expectedIssuer) {
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
  const audience = readAudience(claims);
  if (!audience.includes(options.expectedAudience)) {
    return rejectClientJwt('invalid_audience', 'Client Service JWT audience is invalid.');
  }
  const timeResult = validateClientJwtTime(claims, options);
  if (timeResult !== undefined) {
    return timeResult;
  }
  const agentId = readRequiredString(claims, 'agent_id');
  if (agentId !== options.expectedAgentId) {
    return rejectClientJwt('invalid_agent_scope', 'Client Service JWT agent scope is invalid.');
  }
  const scopes = readScopes(claims);
  if (!hasRequiredScopes(scopes, options.requiredScopes)) {
    return rejectClientJwt('missing_scope', 'Client Service JWT required scope is missing.');
  }
  const actingUserId = readRequiredString(claims, 'acting_user_id');
  if (actingUserId === undefined) {
    return rejectClientJwt('invalid_acting_user', 'Client Service JWT acting user is required.');
  }
  return {
    principal: {
      actingUserId,
      agentId,
      audience: options.expectedAudience,
      issuer,
      jwtId,
      keyId,
      principalId: subject,
      principalType: 'CLIENT_SERVICE',
      scopes,
      subject,
    },
    status: 'verified',
  };
}

function validateClientJwtTime(
  claims: Record<string, unknown>,
  options: ClientServiceJwtVerifierOptions
): ClientServiceJwtVerificationResult | undefined {
  const now = options.nowUnixSeconds ?? Math.floor(Date.now() / 1000);
  const skew = options.clockSkewSeconds ?? 30;
  const expiresAt = readRequiredNumber(claims, 'exp');
  if (expiresAt === undefined || now - skew >= expiresAt) {
    return rejectClientJwt('expired', 'Client Service JWT is expired.');
  }
  const notBefore = readRequiredNumber(claims, 'nbf');
  if (notBefore === undefined || now + skew < notBefore) {
    return rejectClientJwt('not_before', 'Client Service JWT is not active yet.');
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
  for (const value of readDelimitedStringClaim(claims.scope)) {
    scopes.add(value);
  }
  for (const value of readDelimitedStringClaim(claims.scp)) {
    scopes.add(value);
  }
  for (const value of readDelimitedStringClaim(claims.scopes)) {
    scopes.add(value);
  }
  return [...scopes];
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
    if (!available.has(requiredScope)) {
      return false;
    }
  }
  return true;
}

function readRequiredString(record: Record<string, unknown>, key: string): string | undefined {
  const value = readOptionalString(record, key);
  if (value === undefined || value === '') {
    return undefined;
  }
  return value;
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = readRecordValue(record, key);
  if (typeof value === 'string') {
    return value.trim();
  }
  return undefined;
}

function readRequiredNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = readRecordValue(record, key);
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function readRecordValue(record: Record<string, unknown>, key: string): unknown {
  for (const [candidateKey, value] of Object.entries(record)) {
    if (candidateKey === key) {
      return value;
    }
  }
  return undefined;
}

function rejectClientJwt(
  reason: ClientServiceJwtFailureReason,
  message: string
): ClientServiceJwtVerificationResult {
  return { message, reason, status: 'rejected' };
}
