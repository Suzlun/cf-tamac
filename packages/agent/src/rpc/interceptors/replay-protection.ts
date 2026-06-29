import { Code } from '@connectrpc/connect';

import { getAIAgentDurableObjectStub } from '../../agent-routing';
import { createClientServiceJwtReplayKey } from '../../domain/security';

import type { AuthenticatedAgentPrincipal } from './authentication';
import type { AgentRpcGuardResult } from './types';
import type { AgentWorkerEnv } from '../../env';

/**
 * Agent RPC replay-protection hook に渡す入力です。
 */
export interface ReplayProtectionInspectionInput {
  readonly env: AgentWorkerEnv;
  readonly principal: AuthenticatedAgentPrincipal;
  readonly request: Request;
}

/**
 * Replay-protection hook result extracted before domain handling.
 */
export interface ReplayProtectionContext {
  readonly idempotencyKey?: string;
  readonly jwtId?: string;
  readonly nonce?: string;
}

/**
 * Client Service `jti` と test seam replay guard を domain handling 前に検査します。
 *
 * @param input request、env、認証済み principal を含む入力です。
 * @returns replay 検出時は安全な rejection、許可時は `undefined` です。
 */
export async function inspectReplayProtection(
  input: ReplayProtectionInspectionInput
): Promise<AgentRpcGuardResult> {
  // test seam の強制拒否は Vitest 専用 principal のみに限定し、本番 bearer principal では無視します。
  if (
    input.principal.authenticationMode === 'test' &&
    input.request.headers.get('x-agent-test-replay') === 'reject'
  ) {
    return {
      code: Code.InvalidArgument,
      message: 'Agent RPC replay protection rejected the request.',
      reason: 'test_replay_rejected',
    };
  }

  const { principal } = input;
  if (principal.authenticationMode !== 'bearer') return undefined;
  const { expiresAtUnixMs, issuer, jwtId, keyId, subject } = principal;
  if (jwtId === undefined || expiresAtUnixMs === undefined) {
    return {
      code: Code.Unauthenticated,
      message: 'Client Service JWT replay identifier is required.',
      reason: 'missing_jti',
    };
  }
  if (issuer === undefined || keyId === undefined || subject === undefined) {
    return {
      code: Code.Unauthenticated,
      message: 'Client Service JWT replay principal is incomplete.',
      reason: 'missing_replay_principal',
    };
  }

  const replayKey = createClientServiceJwtReplayKey({
    ...principal,
    issuer,
    jwtId,
    keyId,
    subject,
  });
  const reservation = await getAIAgentDurableObjectStub(
    input.env,
    principal.agentId
  ).reserveClientServiceJwtId({
    agentId: principal.agentId,
    expiresAtUnixMs,
    jwtId: replayKey.nonce,
    nowUnixMs: Date.now(),
    principalReplayId: replayKey.principalReplayId,
  });
  if (reservation.status === 'replay') {
    return {
      code: Code.PermissionDenied,
      message: 'Client Service JWT replay was rejected.',
      reason: 'jti_replay',
    };
  }
  return undefined;
}

/**
 * audit と command context 用に replay metadata header を安全な形へ抽出します。
 */
export function createReplayProtectionContext(
  request: Request,
  principal?: AuthenticatedAgentPrincipal
): ReplayProtectionContext {
  return {
    idempotencyKey: normalizeOptionalHeader(request.headers.get('x-agent-idempotency-key')),
    jwtId: principal?.jwtId,
    nonce: normalizeOptionalHeader(request.headers.get('x-agent-nonce')),
  };
}

function normalizeOptionalHeader(value: string | null): string | undefined {
  if (value === null || value.trim() === '') return undefined;
  return value.trim();
}
