import { Code } from '@connectrpc/connect';

import type { AgentRpcGuardRejection } from './types';

/**
 * Principal established by Agent RPC authentication.
 */
export interface AuthenticatedAgentPrincipal {
  readonly principalId: string;
  readonly principalType:
    | 'CLIENT_SERVICE'
    | 'INTEGRATION_INSTALLATION'
    | 'INTERNAL_SERVICE'
    | 'ADMIN_OPERATOR';
  readonly scopes: readonly string[];
}

/**
 * Result of the Agent RPC authentication seam.
 */
export type AgentAuthenticationResult =
  | {
      readonly principal: AuthenticatedAgentPrincipal;
      readonly rejection?: undefined;
    }
  | {
      readonly principal?: undefined;
      readonly rejection: AgentRpcGuardRejection;
    };

/**
 * Authenticate an Agent RPC request, default-denying without an explicit test seam.
 */
export function authenticateAgentRequest(request: Request): AgentAuthenticationResult {
  const testPrincipalId = request.headers.get('x-agent-test-principal-id');
  if (testPrincipalId !== null && testPrincipalId.trim() !== '') {
    return {
      principal: {
        principalId: testPrincipalId.trim(),
        principalType: 'CLIENT_SERVICE',
        scopes: parseScopes(request.headers.get('x-agent-test-scopes')),
      },
    };
  }

  return {
    rejection: {
      code: Code.Unauthenticated,
      message: 'Agent RPC authentication is required.',
    },
  };
}

function parseScopes(rawScopes: string | null): readonly string[] {
  if (rawScopes === null || rawScopes.trim() === '') {
    return [];
  }
  return rawScopes
    .split(',')
    .map((scope) => scope.trim())
    .filter((scope) => scope !== '');
}
