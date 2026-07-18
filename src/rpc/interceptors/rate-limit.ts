import { Code } from '@connectrpc/connect';

import type { AgentRpcGuardResult } from './types';

/**
 * Apply Agent RPC rate-limit guard seams before domain handling.
 */
export function inspectAgentRateLimit(request: Request): AgentRpcGuardResult {
  if (request.headers.get('x-agent-test-rate-limit') === 'exhausted') {
    return {
      code: Code.ResourceExhausted,
      message: 'Agent RPC rate limit exhausted.',
    };
  }
  return undefined;
}
