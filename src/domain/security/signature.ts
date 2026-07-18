import {
  verifyBytesWithAgentKey,
  type AgentSignatureAlgorithm,
  type AgentSignatureKeyMaterial,
} from './crypto';
import { createRawBodyDigest } from './digest';

import type { AgentNonceRepository } from './replay';
import type { AgentPrincipalContext, AgentRawBodyDigest } from './types';

const textEncoder = new TextEncoder();

/**
 * Canonical detached signature input shared by ingress and provider RPC metadata.
 */
export interface AgentDetachedSignatureBaseInput {
  readonly agentId: string;
  readonly connectionId?: string;
  readonly deliveryContextId?: string;
  readonly idempotencyKey: string;
  readonly installationId: string;
  readonly invocationId?: string;
  readonly method: string;
  readonly nonce: string;
  readonly rawBodyDigest: AgentRawBodyDigest;
  readonly service: string;
  readonly timestampUnixMs: number;
  readonly toolId?: string;
}

/**
 * Key lookup for an Integration detached signature.
 */
export interface IntegrationSignatureKeyLookup {
  readonly agentId: string;
  readonly algorithm: AgentSignatureAlgorithm;
  readonly installationId: string;
  readonly keyId: string;
}

/**
 * Integration detached signature verification key.
 */
export interface IntegrationSignatureVerificationKey {
  readonly algorithm: AgentSignatureAlgorithm;
  readonly key: AgentSignatureKeyMaterial;
  readonly keyId: string;
}

/**
 * Resolver for Integration detached signature verification keys.
 */
export type IntegrationSignatureKeyResolver = (
  lookup: IntegrationSignatureKeyLookup
) =>
  | IntegrationSignatureVerificationKey
  | Promise<IntegrationSignatureVerificationKey | undefined>
  | undefined;

/**
 * Verification request for an Integration Provider detached signature.
 */
export interface IntegrationDetachedSignatureVerificationInput {
  readonly acceptedSkewMs?: number;
  readonly algorithm: AgentSignatureAlgorithm;
  readonly canonical: AgentDetachedSignatureBaseInput;
  readonly keyId: string;
  readonly keyResolver: IntegrationSignatureKeyResolver;
  readonly nonceRepository?: AgentNonceRepository;
  readonly nowUnixMs?: number;
  readonly signature: Uint8Array;
}

/**
 * Safe failure reasons for Integration detached signature verification.
 */
export type IntegrationSignatureFailureReason =
  | 'timestamp_out_of_range'
  | 'missing_key'
  | 'invalid_signature'
  | 'nonce_replay';

/**
 * Result of Integration detached signature verification.
 */
export type IntegrationDetachedSignatureVerificationResult =
  | {
      readonly principal: AgentPrincipalContext;
      readonly signatureBaseDigest: AgentRawBodyDigest;
      readonly status: 'verified';
    }
  | {
      readonly reason: IntegrationSignatureFailureReason;
      readonly signatureBaseDigest?: AgentRawBodyDigest;
      readonly status: 'rejected';
    };

/**
 * Build the canonical detached signature base without secret material.
 */
export function createAgentDetachedSignatureBase(input: AgentDetachedSignatureBaseInput): string {
  return [
    'agent-detached-signature-v1',
    `service:${canonicalizeIdentity(input.service)}`,
    `method:${canonicalizeIdentity(input.method)}`,
    `agent_id:${canonicalizeIdentity(input.agentId)}`,
    `installation_id:${canonicalizeIdentity(input.installationId)}`,
    `connection_id:${canonicalizeOptionalIdentity(input.connectionId)}`,
    `tool_id:${canonicalizeOptionalIdentity(input.toolId)}`,
    `invocation_id:${canonicalizeOptionalIdentity(input.invocationId)}`,
    `delivery_context_id:${canonicalizeOptionalIdentity(input.deliveryContextId)}`,
    `timestamp_unix_ms:${String(input.timestampUnixMs)}`,
    `nonce:${canonicalizeIdentity(input.nonce)}`,
    `idempotency_key:${canonicalizeIdentity(input.idempotencyKey)}`,
    `body_sha256:${input.rawBodyDigest.digestHex.toLowerCase()}`,
    `body_length:${String(input.rawBodyDigest.byteLength)}`,
  ].join('\n');
}

/**
 * Build the Integration ingress signature base for verification.
 */
export function createIntegrationSignatureBase(input: AgentDetachedSignatureBaseInput): string {
  return createAgentDetachedSignatureBase(input);
}

/**
 * Verify an Integration detached signature and reserve its nonce when a repository is present.
 */
export async function verifyIntegrationDetachedSignature(
  input: IntegrationDetachedSignatureVerificationInput
): Promise<IntegrationDetachedSignatureVerificationResult> {
  const timeRejected = validateSignatureTimestamp(input);
  if (timeRejected !== undefined) {
    return timeRejected;
  }
  const signatureBase = createIntegrationSignatureBase(input.canonical);
  const signatureBaseDigest = await createRawBodyDigest(textEncoder.encode(signatureBase));
  const key = await input.keyResolver({
    agentId: input.canonical.agentId,
    algorithm: input.algorithm,
    installationId: input.canonical.installationId,
    keyId: input.keyId,
  });
  if (key?.algorithm !== input.algorithm) {
    return { reason: 'missing_key', signatureBaseDigest, status: 'rejected' };
  }
  const valid = await verifyBytesWithAgentKey({
    algorithm: input.algorithm,
    data: textEncoder.encode(signatureBase),
    key: key.key,
    signature: input.signature,
  });
  if (!valid) {
    return { reason: 'invalid_signature', signatureBaseDigest, status: 'rejected' };
  }
  const nonceRejected = await reserveSignatureNonce(input);
  if (nonceRejected !== undefined) {
    return { ...nonceRejected, signatureBaseDigest };
  }
  return {
    principal: {
      agentId: input.canonical.agentId,
      connectionId: input.canonical.connectionId,
      grants: [],
      installationId: input.canonical.installationId,
      keyId: input.keyId,
      principalId: input.canonical.installationId,
      principalType: 'INTEGRATION_INSTALLATION',
      scopes: [],
    },
    signatureBaseDigest,
    status: 'verified',
  };
}

function validateSignatureTimestamp(
  input: IntegrationDetachedSignatureVerificationInput
): IntegrationDetachedSignatureVerificationResult | undefined {
  const now = input.nowUnixMs ?? Date.now();
  const skew = input.acceptedSkewMs ?? 300_000;
  if (Math.abs(now - input.canonical.timestampUnixMs) > skew) {
    return { reason: 'timestamp_out_of_range', status: 'rejected' };
  }
  return undefined;
}

async function reserveSignatureNonce(input: IntegrationDetachedSignatureVerificationInput): Promise<
  | {
      readonly reason: 'nonce_replay';
      readonly status: 'rejected';
    }
  | undefined
> {
  if (input.nonceRepository === undefined) {
    return undefined;
  }
  const now = input.nowUnixMs ?? Date.now();
  const reservation = await input.nonceRepository.reserveNonce({
    agentId: input.canonical.agentId,
    expiresAtUnixMs: now + (input.acceptedSkewMs ?? 300_000),
    nonce: input.canonical.nonce,
    nowUnixMs: now,
    principalId: input.canonical.installationId,
    purpose: `${input.canonical.service}/${input.canonical.method}`,
  });
  if (reservation.status === 'replay') {
    return { reason: 'nonce_replay', status: 'rejected' };
  }
  return undefined;
}

function canonicalizeIdentity(value: string): string {
  return value.trim().normalize('NFC');
}

function canonicalizeOptionalIdentity(value: string | undefined): string {
  if (value === undefined || value.trim() === '') {
    return '-';
  }
  return canonicalizeIdentity(value);
}
