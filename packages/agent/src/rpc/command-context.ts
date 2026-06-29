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
  const principal = createPrincipal(input.agentId, auditContext?.principal);
  const nowMs = Date.now();
  const requestTimestampMs = Number(
    input.replay?.requestTimestampUnixMs ?? auditContext?.startedAtUnixMs ?? nowMs
  );
  return {
    agentId: input.agentId,
    bodyDigest: await createBodyDigest(input, auditContext?.rawBodyDigest),
    causationId: input.causationId,
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey ?? input.replay?.idempotencyKey,
    method: input.method,
    nonce: input.replay?.nonce,
    principal,
    requestId: auditContext?.requestId,
    requestTimestampMs,
    requestedAtMs: nowMs,
    service: input.service,
  };
}

function createPrincipal(
  agentId: string,
  auditPrincipal: AuthenticatedAgentPrincipal | undefined
): AgentPrincipalContext {
  if (auditPrincipal !== undefined) {
    // public RPC body の SecurityMetadata は caller が書けるため、検証済み JWT principal だけを AIAgent へ渡します。
    return {
      actingUserId: auditPrincipal.actingUserId,
      agentId,
      allowedAgentIds: auditPrincipal.allowedAgentIds,
      allowedScopes: auditPrincipal.allowedScopes,
      audience: auditPrincipal.audience,
      expiresAtUnixMs: auditPrincipal.expiresAtUnixMs,
      fingerprint: auditPrincipal.fingerprint,
      issuer: auditPrincipal.issuer,
      jwtId: auditPrincipal.jwtId,
      keyId: auditPrincipal.keyId,
      keyStatus: auditPrincipal.keyStatus,
      notBeforeUnixMs: auditPrincipal.notBeforeUnixMs,
      principalId: auditPrincipal.principalId,
      principalType: auditPrincipal.principalType,
      scopes: auditPrincipal.scopes,
      subject: auditPrincipal.subject,
      trustSummary: auditPrincipal.trustSummary,
    };
  }
  throw createAgentDomainError({ kind: 'authentication', message: 'Agent RPC principal missing.' });
}

async function createBodyDigest(
  input: CreateAgentCoreContextInput,
  verifiedBodyDigest: AgentRawBodyDigest | undefined
): Promise<AgentRawBodyDigest> {
  if (verifiedBodyDigest !== undefined) {
    // digest は adapter が読んだ不変 Protobuf bytes から算出した値を正本にし、body 内の自己申告 digest は信用しません。
    return verifiedBodyDigest;
  }
  const fallbackBytes = new TextEncoder().encode(stableStringify(input.fallbackDigestSeed));
  const digestHex = await computeSha256Hex(fallbackBytes);
  return {
    algorithm: 'sha-256',
    byteLength: fallbackBytes.byteLength,
    digestHex,
  };
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === 'bigint') return item.toString();
    if (item instanceof Uint8Array) return Array.from(item);
    return item;
  });
}
