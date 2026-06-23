import type { ReplayMetadata, SecurityMetadata } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { createAgentDomainError } from '../domain/errors';
import { computeSha256Hex } from '../domain/security';

import { getCurrentAgentRpcAuditContext } from './interceptors/audit';

import type { AgentCoreRequestContext } from '../domain';
import type { AgentPrincipalContext, AgentRawBodyDigest } from '../domain/security';
import type { AuthenticatedAgentPrincipal } from './interceptors/authentication';

/**
 * Input for building an Agent-local command context from RPC request data.
 */
export interface CreateAgentCoreContextInput {
  readonly agentId: string;
  readonly causationId?: string;
  readonly correlationId?: string;
  readonly fallbackDigestSeed: unknown;
  readonly idempotencyKey?: string;
  readonly method: string;
  readonly replay?: ReplayMetadata;
  readonly security?: SecurityMetadata;
  readonly service: string;
}

/**
 * Build the context forwarded from the Connect facade to AIAgent final authorization.
 */
export async function createAgentCoreContext(
  input: CreateAgentCoreContextInput
): Promise<AgentCoreRequestContext> {
  const auditContext = getCurrentAgentRpcAuditContext();
  const principal = createPrincipal(input.agentId, input.security, auditContext?.principal);
  const nowMs = Date.now();
  const requestTimestampMs = Number(
    input.security?.timestamp?.unixMs ?? input.replay?.requestTimestampUnixMs ?? nowMs
  );
  return {
    agentId: input.agentId,
    bodyDigest: await createBodyDigest(input),
    causationId: input.causationId,
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey ?? input.replay?.idempotencyKey,
    method: input.method,
    nonce: input.security?.nonce?.nonce ?? input.replay?.nonce,
    principal,
    requestId: auditContext?.requestId,
    requestTimestampMs,
    requestedAtMs: nowMs,
    service: input.service,
  };
}

function createPrincipal(
  agentId: string,
  security: SecurityMetadata | undefined,
  auditPrincipal: AuthenticatedAgentPrincipal | undefined
): AgentPrincipalContext {
  if (security?.principal !== undefined) {
    return {
      actingUserId: security.principal.actingUserId,
      agentId,
      audience: security.principal.audience,
      issuer: security.principal.issuer,
      jwtId: security.principal.jwtId,
      keyId: security.principal.keyId,
      principalId: security.principal.principalId,
      principalType: normalizePrincipalType(security.principal.principalType),
      scopes: security.principal.scopes,
      subject: security.principal.subject,
    };
  }
  if (auditPrincipal !== undefined) {
    return { agentId, ...auditPrincipal };
  }
  throw createAgentDomainError({ kind: 'authentication', message: 'Agent RPC principal missing.' });
}

async function createBodyDigest(input: CreateAgentCoreContextInput): Promise<AgentRawBodyDigest> {
  const fallback = stableStringify(input.fallbackDigestSeed);
  const digestHex =
    input.security?.rawBodyDigest?.digestHex ??
    input.security?.idempotency?.bodySha256 ??
    input.replay?.bodySha256 ??
    (await computeSha256Hex(new TextEncoder().encode(fallback)));
  return {
    algorithm: 'sha-256',
    byteLength:
      input.security?.rawBodyDigest?.byteLength === undefined
        ? new TextEncoder().encode(fallback).byteLength
        : Number(input.security.rawBodyDigest.byteLength),
    digestHex,
  };
}

function normalizePrincipalType(value: string): AgentPrincipalContext['principalType'] {
  if (
    value === 'CLIENT_SERVICE' ||
    value === 'INTEGRATION_INSTALLATION' ||
    value === 'INTERNAL_SERVICE' ||
    value === 'ADMIN_OPERATOR'
  ) {
    return value;
  }
  return 'CLIENT_SERVICE';
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === 'bigint') return item.toString();
    if (item instanceof Uint8Array) return Array.from(item);
    return item;
  });
}
