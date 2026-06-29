import type { AgentPrincipalContext, AgentRawBodyDigest, AgentRpcOperationIdentity } from './types';

/**
 * Client Service JWT replay key を作るために必須の検証済み principal claim です。
 *
 * @remarks issuer / jwtId / keyId / subject が欠落した principal から replay key を合成しないため、
 * 呼び出し前の認証・replay-protection 層で必ず存在を検査します。
 */
export type ClientServiceReplayPrincipal = AgentPrincipalContext & {
  readonly issuer: string;
  readonly jwtId: string;
  readonly keyId: string;
  readonly subject: string;
};

/**
 * Nonce reservation input scoped to an Agent principal.
 */
export interface AgentNonceReservationInput {
  readonly agentId: string;
  readonly expiresAtUnixMs: number;
  readonly nonce: string;
  readonly nowUnixMs: number;
  readonly principalId: string;
  readonly purpose: string;
}

/**
 * Result returned when reserving a replay-protection nonce.
 */
export type AgentNonceReservationResult =
  | {
      readonly status: 'reserved';
    }
  | {
      readonly firstSeenUnixMs?: number;
      readonly status: 'replay';
    };

/**
 * Repository seam for future Durable Object nonce persistence.
 */
export interface AgentNonceRepository {
  reserveNonce(input: AgentNonceReservationInput): Promise<AgentNonceReservationResult>;
}

/**
 * Idempotency command lookup scoped to a principal and request digest.
 */
export interface AgentIdempotencyLookupInput {
  readonly agentId: string;
  readonly bodyDigest: AgentRawBodyDigest;
  readonly idempotencyKey: string;
  readonly method: string;
  readonly principalId: string;
  readonly service: string;
}

/**
 * Replay result for an idempotent Agent command.
 */
export type AgentIdempotencyReplayResult<RecordedValue> =
  | {
      readonly status: 'new_command';
    }
  | {
      readonly recordedResponse: RecordedValue;
      readonly status: 'replay';
    }
  | {
      readonly existingBodyDigestHex: string;
      readonly status: 'digest_conflict';
    };

/**
 * Repository seam for future Durable Object idempotency records.
 */
export interface AgentIdempotencyRepository<RecordedValue> {
  beginCommand(
    input: AgentIdempotencyLookupInput
  ): Promise<AgentIdempotencyReplayResult<RecordedValue>>;
  recordCommandResponse(input: {
    readonly agentId: string;
    readonly idempotencyKey: string;
    readonly principalId: string;
    readonly response: RecordedValue;
  }): Promise<void>;
}

/**
 * Client Service JWT の `jti` replay reservation 入力です。
 *
 * @remarks
 * `principalReplayId` は principal 種別、issuer、subject、kid を束ねた値で、storage 側では
 * Agent ID と組み合わせて一意性を確保します。同じ `jti` でも別 principal / 別 Agent には波及させません。
 */
export interface ClientServiceJwtReplayReservationInput {
  readonly agentId: string;
  readonly expiresAtUnixMs: number;
  readonly jwtId: string;
  readonly nowUnixMs: number;
  readonly principalReplayId: string;
}

/**
 * Client Service JWT `jti` replay reservation の結果です。
 */
export type ClientServiceJwtReplayReservationResult =
  | { readonly status: 'reserved' }
  | { readonly firstSeenUnixMs?: number; readonly status: 'replay' };

/**
 * Client Service JWT の `jti` を Agent scope と principal scope に結び付ける storage nonce です。
 *
 * @param principal 認証済み Client Service principal です。
 * @returns Agent-owned replay ledger に保存する principalReplayId と nonce です。
 */
export function createClientServiceJwtReplayKey(principal: ClientServiceReplayPrincipal): {
  readonly nonce: string;
  readonly principalReplayId: string;
} {
  // principalReplayId は構造化 JSON として保存し、区切り文字を含む issuer / subject / kid でも衝突しないようにする。
  const principalReplayId = JSON.stringify([
    principal.principalType,
    principal.issuer,
    principal.subject,
    principal.keyId,
  ]);
  return { nonce: `client-service-jti:${principal.jwtId}`, principalReplayId };
}

/**
 * Replay metadata bound to a decoded Agent command.
 */
export interface AgentReplayContext {
  readonly bodyDigest: AgentRawBodyDigest;
  readonly idempotencyKey?: string;
  readonly nonce?: string;
  readonly requestTimestampUnixMs?: number;
}

/**
 * Typed command context shared by Agent domain modules.
 */
export interface AgentCommandContext extends AgentRpcOperationIdentity {
  readonly agentId: string;
  readonly causationId?: string;
  readonly correlationId?: string;
  readonly principal: AgentPrincipalContext;
  readonly replay: AgentReplayContext;
  readonly requestId?: string;
  readonly requestedAtUnixMs: number;
}
