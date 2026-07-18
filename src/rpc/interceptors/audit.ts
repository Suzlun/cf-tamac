import type { AuthenticatedAgentPrincipal } from './authentication';
import type { ReplayProtectionContext } from './replay-protection';
import type { AgentRawBodyDigest } from '../../domain/security';

/**
 * Agent RPC audit context に含める secret-free な認証 field です。
 *
 * @remarks
 * `actingUserIdHash` と `subjectHash` は `AGENT_AUDIT_HASH_PEPPER` による HMAC-SHA-256 で生成します。
 * raw subject、raw acting user、bearer token、signature material はこの型に含めません。
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
 * Agent RPC の監査記録へ渡す secret-free context です。
 *
 * @remarks
 * この型は observability / audit 出力へ渡される前提の payload なので、raw principal や
 * bearer token 由来の生識別子を含めません。実行時認可で必要な principal は
 * `AgentRpcExecutionContext` に分離し、logging/telemetry path へ誤って伝搬しないようにします。
 */
export interface AgentRpcAuditContext {
  readonly auth: AgentRpcAuditAuthFields;
  readonly method: string;
  readonly requestId: string;
  readonly path: string;
  readonly rawBodyDigest: AgentRawBodyDigest;
  readonly replay: ReplayProtectionContext;
  readonly service: string;
  readonly startedAtUnixMs: number;
}

/**
 * Agent RPC handler 実行中だけ参照できる raw principal context です。
 *
 * @remarks
 * Domain authorization へ検証済み principal を渡すための実行専用 seam です。
 * 監査 payload と同じ object に混ぜないことで、JSON stringify や observability 連携時の漏えいを防ぎます。
 */
export interface AgentRpcExecutionContext {
  readonly principal: AuthenticatedAgentPrincipal;
}

/**
 * 1 つの Agent RPC request に紐づく safe audit context と execution context の組です。
 *
 * @remarks
 * `audit` は記録用、`execution` は handler 内部の認可用です。呼び出し側は用途ごとの accessor を使い、
 * raw principal を logging/telemetry path へ渡さない境界を保ちます。
 */
export interface AgentRpcRequestContext {
  readonly audit: AgentRpcAuditContext;
  readonly execution: AgentRpcExecutionContext;
}

let currentAgentRpcRequestContext: AgentRpcRequestContext | undefined;

/**
 * Agent RPC request から safe audit context と実行用 context を作成します。
 *
 * @param request - Connect binary Protobuf facade が受け取った HTTP request です。
 * @param principal - 認証済みの raw principal です。戻り値では `execution` 側だけに格納します。
 * @param replay - replay protection で検証済みの nonce / idempotency metadata です。
 * @param rawBodyDigest - adapter が読み取った Protobuf body bytes から算出した digest です。
 * @param auditHashPepper - 監査識別子 hash に使う `AGENT_AUDIT_HASH_PEPPER` secret です。
 * @returns 監査出力用の safe context と、handler 実行専用 principal context の組です。
 * @throws `auditHashPepper` が空文字の場合に `TypeError` を投げます。
 */
export async function createAgentRpcAuditContext(
  request: Request,
  principal: AuthenticatedAgentPrincipal,
  replay: ReplayProtectionContext,
  rawBodyDigest: AgentRawBodyDigest,
  auditHashPepper: string
): Promise<AgentRpcRequestContext> {
  const path = new URL(request.url).pathname;
  const methodIdentity = parseConnectMethodIdentity(path);
  return {
    audit: {
      auth: await createSafeAuditAuthFields(principal, auditHashPepper),
      method: methodIdentity.method,
      path,
      requestId: getRequestId(request),
      rawBodyDigest,
      replay,
      service: methodIdentity.service,
      startedAtUnixMs: Date.now(),
    },
    execution: { principal },
  };
}

async function createSafeAuditAuthFields(
  principal: AuthenticatedAgentPrincipal,
  auditHashPepper: string
): Promise<AgentRpcAuditAuthFields> {
  // 利用者識別子はハッシュ化し、token 本文や signature は含めず、調査に必要な issuer/kid/fingerprint/jti だけを保持します。
  return {
    actingUserIdHash: await hashAuditIdentifier(principal.actingUserId, auditHashPepper),
    authenticationMode: principal.authenticationMode,
    fingerprint: principal.fingerprint,
    issuer: principal.issuer,
    jwtId: principal.jwtId,
    keyId: principal.keyId,
    principalId: principal.principalId,
    principalType: principal.principalType,
    scopes: principal.scopes,
    subjectHash: await hashAuditIdentifier(principal.subject, auditHashPepper),
  };
}

async function hashAuditIdentifier(
  value: string | undefined,
  auditHashPepper: string
): Promise<string | undefined> {
  if (value === undefined) return undefined;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(assertAuditHashPepper(auditHashPepper)),
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    ['sign']
  );
  // HMAC-SHA-256 は secret pepper を知らない第三者による user ID / email の辞書照合を防ぎます。
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return encodeHex(new Uint8Array(digest));
}

function assertAuditHashPepper(value: string): string {
  if (value === '') {
    throw new TypeError('AGENT_AUDIT_HASH_PEPPER must not be empty.');
  }
  return value;
}

function encodeHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Agent RPC request context を current async scope 相当に設定して処理を実行します。
 *
 * @param context - safe audit context と実行専用 principal context の組です。
 * @param operation - context を参照する generated service handler の処理です。
 * @returns `operation` の戻り値 Promise です。
 * @remarks
 * 処理完了時には以前の context を復元し、別 request へ principal や audit metadata が漏れないようにします。
 */
export function runWithAgentRpcAuditContext<T>(
  context: AgentRpcRequestContext,
  operation: () => Promise<T>
): Promise<T> {
  const previousContext = currentAgentRpcRequestContext;
  currentAgentRpcRequestContext = context;
  return operation().finally(() => {
    currentAgentRpcRequestContext = previousContext;
  });
}

/**
 * generated service handler から現在の safe Agent RPC audit context を返します。
 *
 * @returns 現在の request に紐づく safe audit context。context 外では `undefined` です。
 */
export function getCurrentAgentRpcAuditContext(): AgentRpcAuditContext | undefined {
  return currentAgentRpcRequestContext?.audit;
}

/**
 * generated service handler の実行時認可だけに使う検証済み principal を返します。
 *
 * @returns 現在の request に紐づく raw principal。context 外では `undefined` です。
 * @remarks
 * この値は domain authorization 用であり、logging / telemetry / audit payload へ渡してはいけません。
 */
export function getCurrentAgentRpcExecutionPrincipal(): AuthenticatedAgentPrincipal | undefined {
  return currentAgentRpcRequestContext?.execution.principal;
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
