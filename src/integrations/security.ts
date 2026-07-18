import { createAgentDomainError } from '../domain/errors';
import {
  isAgentSignatureAlgorithm,
  timingSafeEqualHex,
  verifyIntegrationDetachedSignature,
} from '../domain/security';

import type { AgentRawBodyDigest } from '../domain/security';
import type { AgentStorageRepositories } from '../storage';
import type { IntegrationIngressSignatureInput } from './types';

/**
 * IntegrationIngressService の generated service 名です。
 */
export const integrationIngressServiceName = 'cftamac.agent.v1.IntegrationIngressService';

/**
 * Integration ingress の署名検証入力です。
 */
export interface VerifyIntegrationIngressSignatureInput {
  readonly agentId: string;
  readonly connectionId?: string;
  readonly deliveryContextId?: string;
  readonly idempotencyKey: string;
  readonly installationId: string;
  readonly invocationId?: string;
  readonly canonicalBodyDigest: AgentRawBodyDigest;
  readonly method: 'PublishDeliveryResult' | 'PublishEvent' | 'PublishToolResult';
  readonly repositories: AgentStorageRepositories;
  readonly signature: IntegrationIngressSignatureInput;
  readonly toolId?: string;
}

/**
 * Integration ingress request の detached signature、時刻、digest metadata を検証します。
 *
 * @param input Agent/Installation/Connection と RPC method に bind された署名検証入力です。
 * @throws AgentDomainError 署名 metadata、trust key、timestamp、signature が不正な場合に発生します。
 */
export async function verifyIntegrationIngressSignature(
  input: VerifyIntegrationIngressSignatureInput
): Promise<void> {
  if (!isAgentSignatureAlgorithm(input.signature.algorithm)) {
    throw createAgentDomainError({
      kind: 'authorization',
      message: 'Unsupported Integration signature algorithm.',
      target: 'signature.algorithm',
    });
  }
  const algorithm = input.signature.algorithm;
  const installation = input.repositories.integrations.findInstallation(input.installationId);
  if (installation === undefined || installation.status === 'uninstalled') {
    throw createAgentDomainError({
      kind: 'authorization',
      message: 'Integration Installation is not trusted for ingress.',
      target: 'installation_id',
    });
  }
  const rawBodyDigest = normalizeRawBodyDigest(input.canonicalBodyDigest);
  if (
    !timingSafeEqualHex(input.signature.digestHex, rawBodyDigest.digestHex) ||
    input.signature.byteLength !== rawBodyDigest.byteLength
  ) {
    throw createAgentDomainError({
      kind: 'authorization',
      message: 'Raw body digest metadata is invalid.',
      target: 'raw_body_digest',
    });
  }
  const result = await verifyIntegrationDetachedSignature({
    acceptedSkewMs: input.signature.acceptedSkewMs,
    algorithm,
    canonical: {
      agentId: input.agentId,
      connectionId: input.connectionId,
      deliveryContextId: input.deliveryContextId,
      idempotencyKey: input.idempotencyKey,
      installationId: input.installationId,
      invocationId: input.invocationId,
      method: input.method,
      nonce: input.signature.nonce,
      rawBodyDigest,
      service: integrationIngressServiceName,
      timestampUnixMs: input.signature.timestampMs,
      toolId: input.toolId,
    },
    keyId: input.signature.keyId,
    keyResolver: ({ installationId, keyId }) => {
      const row = input.repositories.integrations.findActiveTrustKey({ installationId, keyId });
      if (row?.publicKeyMaterial === null || row?.publicKeyMaterial === undefined) return undefined;
      return { algorithm, key: parseKeyMaterial(row.publicKeyMaterial), keyId };
    },
    signature: input.signature.signature,
  });
  if (result.status === 'rejected') {
    throw createAgentDomainError({
      kind: 'authorization',
      message: 'Integration ingress signature rejected.',
      safeDetails: { reason: result.reason },
      target: 'signature',
    });
  }
}

function normalizeRawBodyDigest(input: AgentRawBodyDigest): AgentRawBodyDigest {
  return {
    algorithm: 'sha-256',
    byteLength: input.byteLength,
    digestHex: input.digestHex.toLowerCase(),
  };
}

function parseKeyMaterial(value: string): JsonWebKey | string {
  try {
    return JSON.parse(value) as JsonWebKey;
  } catch {
    return value;
  }
}
