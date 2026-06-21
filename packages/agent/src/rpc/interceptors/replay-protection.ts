import { Code } from '@connectrpc/connect';

import type { AgentRpcGuardResult } from './types';

/**
 * Replay-protection hook result extracted before domain handling.
 */
export interface ReplayProtectionContext {
  readonly nonce?: string;
  readonly idempotencyKey?: string;
}

/**
 * Inspect replay metadata and return a test-seam rejection when requested.
 */
export function inspectReplayProtection(request: Request): AgentRpcGuardResult {
  if (request.headers.get('x-agent-test-replay') === 'reject') {
    return {
      code: Code.InvalidArgument,
      message: 'Agent RPC replay protection rejected the request.',
    };
  }
  return undefined;
}

/**
 * Extract replay context headers for audit and future nonce/idempotency checks.
 */
export function createReplayProtectionContext(request: Request): ReplayProtectionContext {
  return {
    nonce: normalizeOptionalHeader(request.headers.get('x-agent-nonce')),
    idempotencyKey: normalizeOptionalHeader(request.headers.get('x-agent-idempotency-key')),
  };
}

function normalizeOptionalHeader(value: string | null): string | undefined {
  if (value === null || value.trim() === '') {
    return undefined;
  }
  return value.trim();
}
