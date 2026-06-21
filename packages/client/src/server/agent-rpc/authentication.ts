import 'server-only';

import type { Interceptor } from '@connectrpc/connect';

/**
 * Server-only Agent RPC credential reference metadata.
 */
export interface AgentRpcCredentialMetadata {
  readonly agentId: string;
  readonly credentialRef: string;
  readonly keyId: string;
  readonly actingOperatorId?: string;
}

/**
 * Create metadata headers for server-side Agent RPC calls without credential bodies.
 */
export function createAgentRpcAuthHeaders(metadata: AgentRpcCredentialMetadata): Headers {
  const headers = new Headers();
  headers.set('x-agent-id', metadata.agentId);
  headers.set('x-client-credential-ref', metadata.credentialRef);
  headers.set('x-client-key-id', metadata.keyId);
  if (metadata.actingOperatorId !== undefined && metadata.actingOperatorId !== '') {
    headers.set('x-client-acting-operator-id', metadata.actingOperatorId);
  }
  return headers;
}

/**
 * Create a Connect interceptor that attaches server-only Agent credential references.
 */
export function createAgentRpcAuthInterceptor(metadata: AgentRpcCredentialMetadata): Interceptor {
  return (next) => async (request) => {
    const headers = createAgentRpcAuthHeaders(metadata);
    for (const [key, value] of headers) {
      request.header.set(key, value);
    }
    return next(request);
  };
}
