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
  readonly actingUserId?: string;
  readonly audience?: string;
  readonly issuer?: string;
  readonly jwtId?: string;
  readonly keyId?: string;
  readonly subject?: string;
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
        actingUserId: normalizeOptionalHeader(request.headers.get('x-agent-test-acting-user-id')),
        audience: normalizeOptionalHeader(request.headers.get('x-agent-test-audience')),
        issuer: normalizeOptionalHeader(request.headers.get('x-agent-test-issuer')),
        jwtId: normalizeOptionalHeader(request.headers.get('x-agent-test-jwt-id')),
        keyId: normalizeOptionalHeader(request.headers.get('x-agent-test-key-id')),
        principalId: testPrincipalId.trim(),
        principalType:
          parsePrincipalType(request.headers.get('x-agent-test-principal-type')) ??
          'CLIENT_SERVICE',
        scopes: parseScopes(request.headers.get('x-agent-test-scopes')),
        subject: normalizeOptionalHeader(request.headers.get('x-agent-test-subject')),
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

function parsePrincipalType(
  rawType: string | null
): AuthenticatedAgentPrincipal['principalType'] | undefined {
  const normalizedType = normalizeOptionalHeader(rawType);
  if (normalizedType === undefined) {
    return undefined;
  }
  if (
    normalizedType === 'CLIENT_SERVICE' ||
    normalizedType === 'INTEGRATION_INSTALLATION' ||
    normalizedType === 'INTERNAL_SERVICE' ||
    normalizedType === 'ADMIN_OPERATOR'
  ) {
    return normalizedType;
  }
  return undefined;
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

function normalizeOptionalHeader(value: string | null): string | undefined {
  if (value === null || value.trim() === '') {
    return undefined;
  }
  return value.trim();
}
