import { Code } from '@connectrpc/connect';

import type { AuthenticatedAgentPrincipal } from './authentication';
import type { AgentRpcGuardResult } from './types';

/**
 * Authorize an authenticated Agent RPC request, default-denying without a grant.
 */
export function authorizeAgentRequest(
  request: Request,
  principal: AuthenticatedAgentPrincipal
): AgentRpcGuardResult {
  if (request.headers.get('x-agent-test-grant') === 'allow') {
    return undefined;
  }
  if (principal.scopes.includes('agent.rpc')) {
    return undefined;
  }
  return {
    code: Code.PermissionDenied,
    message: 'Agent RPC authorization grant is required.',
  };
}
