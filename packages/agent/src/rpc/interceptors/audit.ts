import type { AuthenticatedAgentPrincipal } from './authentication';
import type { ReplayProtectionContext } from './replay-protection';
import type { AgentRawBodyDigest } from '../../domain/security';

/**
 * Agent RPC audit context に含める secret-free な認証 field です。
 */
export interface AgentRpcAuditAuthFields {
  readonly actingUserIdHash?: string;
  readonly authenticationMode: 'bearer' | 'test';
  readonly fingerprint?: string;
  readonly issuer?: string;
  readonly jwtId?: string;
  readonly keyId?: string;
  readonly principalId: string;
  readonly principalType: string;
  readonly scopes: readonly string[];
  readonly subjectHash?: string;
}

/**
 * Audit context available to Agent RPC foundation handlers.
 */
export interface AgentRpcAuditContext {
  readonly auth: AgentRpcAuditAuthFields;
  readonly method: string;
  readonly requestId: string;
  readonly path: string;
  readonly principal: AuthenticatedAgentPrincipal;
  readonly rawBodyDigest: AgentRawBodyDigest;
  readonly replay: ReplayProtectionContext;
  readonly service: string;
  readonly startedAtUnixMs: number;
}

let currentAgentRpcAuditContext: AgentRpcAuditContext | undefined;

/**
 * Create the audit context for an Agent RPC request.
 */
export async function createAgentRpcAuditContext(
  request: Request,
  principal: AuthenticatedAgentPrincipal,
  replay: ReplayProtectionContext,
  rawBodyDigest: AgentRawBodyDigest
): Promise<AgentRpcAuditContext> {
  const path = new URL(request.url).pathname;
  const methodIdentity = parseConnectMethodIdentity(path);
  return {
    auth: await createSafeAuditAuthFields(principal),
    method: methodIdentity.method,
    path,
    requestId: getRequestId(request),
    principal,
    rawBodyDigest,
    replay,
    service: methodIdentity.service,
    startedAtUnixMs: Date.now(),
  };
}

async function createSafeAuditAuthFields(
  principal: AuthenticatedAgentPrincipal
): Promise<AgentRpcAuditAuthFields> {
  // 利用者識別子はハッシュ化し、token 本文や signature は含めず、調査に必要な issuer/kid/fingerprint/jti だけを保持します。
  return {
    actingUserIdHash: await hashAuditIdentifier(principal.actingUserId),
    authenticationMode: principal.authenticationMode,
    fingerprint: principal.fingerprint,
    issuer: principal.issuer,
    jwtId: principal.jwtId,
    keyId: principal.keyId,
    principalId: principal.principalId,
    principalType: principal.principalType,
    scopes: principal.scopes,
    subjectHash: await hashAuditIdentifier(principal.subject),
  };
}

async function hashAuditIdentifier(value: string | undefined): Promise<string | undefined> {
  if (value === undefined) return undefined;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return encodeHex(new Uint8Array(digest));
}

function encodeHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Execute an operation with an audit context seam.
 */
export function runWithAgentRpcAuditContext<T>(
  context: AgentRpcAuditContext,
  operation: () => Promise<T>
): Promise<T> {
  const previousContext = currentAgentRpcAuditContext;
  currentAgentRpcAuditContext = context;
  return operation().finally(() => {
    currentAgentRpcAuditContext = previousContext;
  });
}

/**
 * Return the current Agent RPC audit context for generated service handlers.
 */
export function getCurrentAgentRpcAuditContext(): AgentRpcAuditContext | undefined {
  return currentAgentRpcAuditContext;
}

function getRequestId(request: Request): string {
  const requestId = request.headers.get('x-request-id');
  if (requestId !== null && requestId.trim() !== '') {
    return requestId.trim();
  }
  return crypto.randomUUID();
}

function parseConnectMethodIdentity(path: string): {
  readonly method: string;
  readonly service: string;
} {
  const segments = path.split('/').filter((segment) => segment !== '');
  return {
    method: segments.at(1) ?? 'unknown',
    service: segments.at(0) ?? 'unknown',
  };
}
