import {
  signBytesWithAgentKey,
  type AgentSignatureAlgorithm,
  type AgentSignatureKeyMaterial,
} from './crypto';
import { createRawBodyDigest } from './digest';
import { createAgentDetachedSignatureBase } from './signature';

import type { AgentRawBodyDigest } from './types';

const textEncoder = new TextEncoder();

/**
 * Provider-facing Integration Tool service name used in signed metadata.
 */
export const integrationToolServiceName = 'cftamac.agent.v1.IntegrationToolService';

/**
 * Provider-facing Integration Delivery service name used in signed metadata.
 */
export const integrationDeliveryServiceName = 'cftamac.agent.v1.IntegrationDeliveryService';

/**
 * Supported Provider-facing Tool RPC methods.
 */
export type IntegrationToolProviderMethod = 'InvokeTool' | 'GetOperation' | 'CancelOperation';

/**
 * Supported Provider-facing Delivery RPC methods.
 */
export type IntegrationDeliveryProviderMethod = 'Deliver';

/**
 * Signing key material and metadata for Agent-to-Provider RPC requests.
 */
export interface AgentToProviderSigningKey {
  readonly algorithm: AgentSignatureAlgorithm;
  readonly key: AgentSignatureKeyMaterial;
  readonly keyId: string;
}

/**
 * Common fields for Agent-to-Provider signed metadata builders.
 */
export interface AgentToProviderSignatureBaseRequest {
  readonly agentId: string;
  readonly connectionId?: string;
  readonly idempotencyKey: string;
  readonly installationId: string;
  readonly nonce: string;
  readonly rawBodyBytes: Uint8Array;
  readonly signingKey: AgentToProviderSigningKey;
  readonly timestampUnixMs: number;
}

/**
 * Tool Provider signature metadata builder request.
 */
export interface IntegrationToolSignatureMetadataRequest extends AgentToProviderSignatureBaseRequest {
  readonly invocationId: string;
  readonly method: IntegrationToolProviderMethod;
  readonly toolId: string;
}

/**
 * Delivery Provider signature metadata builder request.
 */
export interface IntegrationDeliverySignatureMetadataRequest extends AgentToProviderSignatureBaseRequest {
  readonly deliveryContextId: string;
  readonly method: IntegrationDeliveryProviderMethod;
}

/**
 * Signature metadata attached to Agent-to-Provider Connect RPC calls.
 */
export interface AgentToProviderSignatureMetadata {
  readonly agentId: string;
  readonly algorithm: AgentSignatureAlgorithm;
  readonly connectionId?: string;
  readonly deliveryContextId?: string;
  readonly idempotencyKey: string;
  readonly installationId: string;
  readonly invocationId?: string;
  readonly keyId: string;
  readonly method: string;
  readonly nonce: string;
  readonly rawBodyDigest: AgentRawBodyDigest;
  readonly service: string;
  readonly signature: Uint8Array;
  readonly signatureBaseDigest: AgentRawBodyDigest;
  readonly timestampUnixMs: number;
  readonly toolId?: string;
}

/**
 * Build signed metadata for IntegrationToolService Agent-to-Provider calls.
 */
export function buildIntegrationToolSignatureMetadata(
  input: IntegrationToolSignatureMetadataRequest
): Promise<AgentToProviderSignatureMetadata> {
  return buildAgentToProviderSignatureMetadata({
    ...input,
    service: integrationToolServiceName,
  });
}

/**
 * Build signed metadata for IntegrationDeliveryService Agent-to-Provider calls.
 */
export function buildIntegrationDeliverySignatureMetadata(
  input: IntegrationDeliverySignatureMetadataRequest
): Promise<AgentToProviderSignatureMetadata> {
  return buildAgentToProviderSignatureMetadata({
    ...input,
    service: integrationDeliveryServiceName,
  });
}

interface AgentToProviderSignatureRequest extends AgentToProviderSignatureBaseRequest {
  readonly deliveryContextId?: string;
  readonly invocationId?: string;
  readonly method: string;
  readonly service: string;
  readonly toolId?: string;
}

async function buildAgentToProviderSignatureMetadata(
  input: AgentToProviderSignatureRequest
): Promise<AgentToProviderSignatureMetadata> {
  const rawBodyDigest = await createRawBodyDigest(input.rawBodyBytes);
  const signatureBase = createAgentDetachedSignatureBase({
    agentId: input.agentId,
    connectionId: input.connectionId,
    deliveryContextId: input.deliveryContextId,
    idempotencyKey: input.idempotencyKey,
    installationId: input.installationId,
    invocationId: input.invocationId,
    method: input.method,
    nonce: input.nonce,
    rawBodyDigest,
    service: input.service,
    timestampUnixMs: input.timestampUnixMs,
    toolId: input.toolId,
  });
  const signature = await signBytesWithAgentKey({
    algorithm: input.signingKey.algorithm,
    data: textEncoder.encode(signatureBase),
    key: input.signingKey.key,
  });
  return {
    agentId: input.agentId,
    algorithm: input.signingKey.algorithm,
    connectionId: input.connectionId,
    deliveryContextId: input.deliveryContextId,
    idempotencyKey: input.idempotencyKey,
    installationId: input.installationId,
    invocationId: input.invocationId,
    keyId: input.signingKey.keyId,
    method: input.method,
    nonce: input.nonce,
    rawBodyDigest,
    service: input.service,
    signature,
    signatureBaseDigest: await createRawBodyDigest(textEncoder.encode(signatureBase)),
    timestampUnixMs: input.timestampUnixMs,
    toolId: input.toolId,
  };
}
