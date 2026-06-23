import type { AgentPrincipalContext, AgentRawBodyDigest, AgentRpcOperationIdentity } from './types';

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
