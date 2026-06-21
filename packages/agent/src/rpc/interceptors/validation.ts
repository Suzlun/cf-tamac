import { Code } from '@connectrpc/connect';

import type { AgentRpcGuardResult } from './types';

/**
 * Run request validation seams before generated service handling.
 */
export function validateAgentRpcRequest(request: Request): AgentRpcGuardResult {
  if (request.headers.get('x-agent-test-validation') === 'reject') {
    return {
      code: Code.InvalidArgument,
      message: 'Agent RPC validation rejected the request.',
    };
  }
  return undefined;
}
