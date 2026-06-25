import { create, toBinary } from '@bufbuild/protobuf';

import {
  PublishDeliveryResultRequestSchema,
  PublishIntegrationEventRequestSchema,
  PublishToolResultRequestSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';
import type {
  CreateAdapterConnectionRequest,
  CreateAdapterConnectionResponseSchema,
  DeleteAdapterConnectionRequest,
  DeleteAdapterConnectionResponseSchema,
  GetInstallationRequest,
  GetInstallationResponseSchema,
  InstallIntegrationRequest,
  InstallIntegrationResponseSchema,
  ListAdapterConnectionsRequest,
  ListAdapterConnectionsResponseSchema,
  ListInstallationsRequest,
  ListInstallationsResponseSchema,
  PublishDeliveryResultRequest,
  PublishDeliveryResultResponseSchema,
  PublishIntegrationEventRequest,
  PublishIntegrationEventResponseSchema,
  PublishToolResultRequest,
  PublishToolResultResponseSchema,
  RawBodyDigest,
  RequestTimestamp,
  SignatureMetadata,
  UninstallIntegrationRequest,
  UninstallIntegrationResponseSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { getAIAgentDurableObjectStub } from '../agent-routing';
import { createAgentDomainError } from '../domain/errors';
import { computeSha256Hex } from '../domain/security';

import { createAgentCoreContext } from './command-context';
import {
  mapCreateAdapterConnectionResponse,
  mapDeleteAdapterConnectionResponse,
  mapGetInstallationResponse,
  mapInstallIntegrationResponse,
  mapListAdapterConnectionsResponse,
  mapListInstallationsResponse,
  mapPublishDeliveryResultResponse,
  mapPublishIntegrationEventResponse,
  mapPublishToolResultResponse,
  mapUninstallIntegrationResponse,
} from './integration-message-mappers';
import { mapPayloadReference, requireAgentId, toNumber } from './message-mappers';

import type { AgentCoreRequestContext } from '../domain';
import type { AgentRawBodyDigest } from '../domain/security';
import type { AgentWorkerEnv } from '../env';
import type { IntegrationIngressSignatureInput } from '../integrations';
import type { MessageInitShape } from '@bufbuild/protobuf';

const agentIntegrationServiceName = 'cftamac.agent.v1.AgentIntegrationService';
const integrationIngressServiceName = 'cftamac.agent.v1.IntegrationIngressService';

type InstallIntegrationResponseInit = MessageInitShape<typeof InstallIntegrationResponseSchema>;
type UninstallIntegrationResponseInit = MessageInitShape<typeof UninstallIntegrationResponseSchema>;
type GetInstallationResponseInit = MessageInitShape<typeof GetInstallationResponseSchema>;
type ListInstallationsResponseInit = MessageInitShape<typeof ListInstallationsResponseSchema>;
type CreateAdapterConnectionResponseInit = MessageInitShape<
  typeof CreateAdapterConnectionResponseSchema
>;
type DeleteAdapterConnectionResponseInit = MessageInitShape<
  typeof DeleteAdapterConnectionResponseSchema
>;
type ListAdapterConnectionsResponseInit = MessageInitShape<
  typeof ListAdapterConnectionsResponseSchema
>;
type PublishIntegrationEventResponseInit = MessageInitShape<
  typeof PublishIntegrationEventResponseSchema
>;
type PublishToolResultResponseInit = MessageInitShape<typeof PublishToolResultResponseSchema>;
type PublishDeliveryResultResponseInit = MessageInitShape<
  typeof PublishDeliveryResultResponseSchema
>;

/** InstallIntegration RPC を Agent-owned Durable Object へ配送します。 */
export async function dispatchInstallIntegration(
  env: AgentWorkerEnv,
  request: InstallIntegrationRequest
): Promise<InstallIntegrationResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createIntegrationServiceContext(agentId, request, 'InstallIntegration');
  const result = await getAIAgentDurableObjectStub(env, agentId).installIntegration({
    context,
    integrationId: request.integrationId,
    manifestPayload: mapPayloadReference(request.manifestPayload),
    manifestRef: request.manifestRef,
    requestedGrants: request.requestedGrants,
    setupMetadataRef: mapPayloadReference(request.setupMetadataRef),
  });
  return mapInstallIntegrationResponse(result);
}

/** UninstallIntegration RPC を Agent-owned Durable Object へ配送します。 */
export async function dispatchUninstallIntegration(
  env: AgentWorkerEnv,
  request: UninstallIntegrationRequest
): Promise<UninstallIntegrationResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createIntegrationServiceContext(agentId, request, 'UninstallIntegration');
  const result = await getAIAgentDurableObjectStub(env, agentId).uninstallIntegration({
    context,
    installationId: request.installationId,
    reason: request.reason,
  });
  return mapUninstallIntegrationResponse(result);
}

/** GetInstallation RPC を Agent-owned Durable Object へ配送します。 */
export async function dispatchGetInstallation(
  env: AgentWorkerEnv,
  request: GetInstallationRequest
): Promise<GetInstallationResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createIntegrationServiceContext(agentId, request, 'GetInstallation');
  const result = await getAIAgentDurableObjectStub(env, agentId).getIntegrationInstallation({
    context,
    installationId: request.installationId,
  });
  return mapGetInstallationResponse(result);
}

/** ListInstallations RPC を Agent-owned Durable Object へ配送します。 */
export async function dispatchListInstallations(
  env: AgentWorkerEnv,
  request: ListInstallationsRequest
): Promise<ListInstallationsResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createIntegrationServiceContext(agentId, request, 'ListInstallations');
  const result = await getAIAgentDurableObjectStub(env, agentId).listIntegrationInstallations({
    context,
    pageSize: request.page?.pageSize,
    pageToken: request.page?.pageToken,
    status: request.status,
  });
  return mapListInstallationsResponse(result);
}

/** CreateAdapterConnection RPC を Agent-owned Durable Object へ配送します。 */
export async function dispatchCreateAdapterConnection(
  env: AgentWorkerEnv,
  request: CreateAdapterConnectionRequest
): Promise<CreateAdapterConnectionResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createIntegrationServiceContext(
    agentId,
    request,
    'CreateAdapterConnection'
  );
  const result = await getAIAgentDurableObjectStub(env, agentId).createAdapterConnection({
    adapterId: request.adapterId,
    connectionKey: request.connectionKey,
    context,
    externalSubject: request.externalSubject,
    installationId: request.installationId,
    metadataRef: mapPayloadReference(request.metadataRef),
  });
  return mapCreateAdapterConnectionResponse(result);
}

/** DeleteAdapterConnection RPC を Agent-owned Durable Object へ配送します。 */
export async function dispatchDeleteAdapterConnection(
  env: AgentWorkerEnv,
  request: DeleteAdapterConnectionRequest
): Promise<DeleteAdapterConnectionResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createIntegrationServiceContext(
    agentId,
    request,
    'DeleteAdapterConnection'
  );
  const result = await getAIAgentDurableObjectStub(env, agentId).deleteAdapterConnection({
    connectionId: request.connectionId,
    context,
    reason: request.reason,
  });
  return mapDeleteAdapterConnectionResponse(result);
}

/** ListAdapterConnections RPC を Agent-owned Durable Object へ配送します。 */
export async function dispatchListAdapterConnections(
  env: AgentWorkerEnv,
  request: ListAdapterConnectionsRequest
): Promise<ListAdapterConnectionsResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createIntegrationServiceContext(agentId, request, 'ListAdapterConnections');
  const result = await getAIAgentDurableObjectStub(env, agentId).listAdapterConnections({
    adapterId: request.adapterId,
    context,
    installationId: request.installationId,
    pageSize: request.page?.pageSize,
    pageToken: request.page?.pageToken,
    status: request.status,
  });
  return mapListAdapterConnectionsResponse(result);
}

/** IntegrationIngressService.PublishEvent RPC を Agent-owned Durable Object へ配送します。 */
export async function dispatchPublishIntegrationEvent(
  env: AgentWorkerEnv,
  request: PublishIntegrationEventRequest
): Promise<PublishIntegrationEventResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const event = request.event;
  const context = await createIntegrationIngressContext(agentId, request, 'PublishEvent');
  const result = await getAIAgentDurableObjectStub(env, agentId).publishIntegrationEvent({
    connectionId: request.connectionId,
    context,
    deliveryCapability: event?.deliveryContext?.capability,
    deliveryExpiresAtMs: toNumber(event?.deliveryContext?.expiresAtUnixMs),
    deliveryMetadataRef: mapPayloadReference(event?.deliveryContext?.metadataRef),
    eventType: event?.eventType ?? '',
    installationId: request.installationId,
    modelPolicyRef: event?.modelPolicyRef,
    occurredAtMs: toNumber(event?.occurredAtUnixMs),
    payload: event?.payload,
    payloadContentType: event?.payloadContentType,
    payloadReference: mapPayloadReference(event?.payloadReference),
    signature: mapSignatureInput(request),
    source: event?.source ?? 'integration',
    threadKey: request.threadKey,
  });
  return mapPublishIntegrationEventResponse(result);
}

/** IntegrationIngressService.PublishToolResult RPC を Agent-owned Durable Object へ配送します。 */
export async function dispatchPublishToolResult(
  env: AgentWorkerEnv,
  request: PublishToolResultRequest
): Promise<PublishToolResultResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createIntegrationIngressContext(agentId, request, 'PublishToolResult');
  const result = await getAIAgentDurableObjectStub(env, agentId).publishIntegrationToolResult({
    context,
    installationId: request.installationId,
    invocationId: request.invocationId,
    outputPayload: mapPayloadReference(request.outputPayload),
    outputRef: request.outputRef,
    providerOperationId: request.providerOperationId,
    signature: mapSignatureInput(request),
    status: normalizeToolResultStatus(request.status),
  });
  return mapPublishToolResultResponse(result);
}

/** IntegrationIngressService.PublishDeliveryResult RPC を Agent-owned Durable Object へ配送します。 */
export async function dispatchPublishDeliveryResult(
  env: AgentWorkerEnv,
  request: PublishDeliveryResultRequest
): Promise<PublishDeliveryResultResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createIntegrationIngressContext(agentId, request, 'PublishDeliveryResult');
  const result = await getAIAgentDurableObjectStub(env, agentId).publishIntegrationDeliveryResult({
    context,
    deliveryContextId: request.deliveryContextId,
    deliveryId: request.deliveryId,
    installationId: request.installationId,
    providerOperationId: request.providerOperationId,
    signature: mapSignatureInput(request),
    status: request.status,
  });
  return mapPublishDeliveryResultResponse(result);
}

async function createIntegrationServiceContext(
  agentId: string,
  request:
    | CreateAdapterConnectionRequest
    | DeleteAdapterConnectionRequest
    | GetInstallationRequest
    | InstallIntegrationRequest
    | ListAdapterConnectionsRequest
    | ListInstallationsRequest
    | UninstallIntegrationRequest,
  method: string
): Promise<AgentCoreRequestContext> {
  return createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    idempotencyKey: 'idempotencyKey' in request ? request.idempotencyKey : undefined,
    method,
    security: 'security' in request ? request.security : undefined,
    service: agentIntegrationServiceName,
  });
}

async function createIntegrationIngressContext(
  agentId: string,
  request: PublishDeliveryResultRequest | PublishIntegrationEventRequest | PublishToolResultRequest,
  method: 'PublishDeliveryResult' | 'PublishEvent' | 'PublishToolResult'
): Promise<AgentCoreRequestContext> {
  const signature = mapSignatureInput(request);
  const canonicalBodyDigest = await createUnsignedIngressBodyDigest(request, method);
  return {
    agentId,
    bodyDigest: canonicalBodyDigest,
    idempotencyKey: request.idempotencyKey,
    method,
    nonce: signature.nonce,
    principal: {
      agentId,
      installationId: request.installationId,
      keyId: signature.keyId,
      principalId: request.installationId,
      principalType: 'INTEGRATION_INSTALLATION',
      scopes: [],
    },
    requestTimestampMs: signature.timestampMs,
    requestedAtMs: Date.now(),
    service: integrationIngressServiceName,
  };
}

async function createUnsignedIngressBodyDigest(
  request: PublishDeliveryResultRequest | PublishIntegrationEventRequest | PublishToolResultRequest,
  method: 'PublishDeliveryResult' | 'PublishEvent' | 'PublishToolResult'
): Promise<AgentRawBodyDigest> {
  const unsigned = stripIngressSignatureMetadata(request);
  const bytes =
    method === 'PublishEvent'
      ? toBinary(
          PublishIntegrationEventRequestSchema,
          create(PublishIntegrationEventRequestSchema, unsigned as PublishIntegrationEventRequest)
        )
      : method === 'PublishToolResult'
        ? toBinary(
            PublishToolResultRequestSchema,
            create(PublishToolResultRequestSchema, unsigned as PublishToolResultRequest)
          )
        : toBinary(
            PublishDeliveryResultRequestSchema,
            create(PublishDeliveryResultRequestSchema, unsigned as PublishDeliveryResultRequest)
          );
  return {
    algorithm: 'sha-256',
    byteLength: bytes.byteLength,
    digestHex: await computeSha256Hex(bytes),
  };
}

function stripIngressSignatureMetadata<
  Request extends
    | PublishDeliveryResultRequest
    | PublishIntegrationEventRequest
    | PublishToolResultRequest,
>(request: Request): Request {
  return {
    ...request,
    nonce: undefined,
    rawBodyDigest: undefined,
    signature: undefined,
    timestamp: undefined,
  };
}

function mapSignatureInput(
  request: PublishDeliveryResultRequest | PublishIntegrationEventRequest | PublishToolResultRequest
): IntegrationIngressSignatureInput {
  const timestamp = requireTimestamp(request.timestamp);
  const rawBodyDigest = requireRawBodyDigest(request.rawBodyDigest);
  const signature = requireSignature(request.signature);
  const nonce = request.nonce?.nonce;
  if (nonce === undefined || nonce === '') {
    throw createAgentDomainError({ kind: 'authentication', message: 'Integration nonce missing.' });
  }
  return {
    acceptedSkewMs: Number(timestamp.acceptedSkewMs),
    algorithm: signature.algorithm,
    byteLength: Number(rawBodyDigest.byteLength),
    digestHex: rawBodyDigest.digestHex,
    keyId: signature.keyId,
    nonce,
    signature: signature.signature,
    signedAtMs: Number(signature.signedAtUnixMs),
    timestampMs: Number(timestamp.unixMs),
  };
}

function requireTimestamp(timestamp: RequestTimestamp | undefined): RequestTimestamp {
  if (timestamp === undefined) {
    throw createAgentDomainError({
      kind: 'authentication',
      message: 'Integration timestamp missing.',
    });
  }
  return timestamp;
}

function requireRawBodyDigest(rawBodyDigest: RawBodyDigest | undefined): RawBodyDigest {
  if (rawBodyDigest?.algorithm !== 'sha-256') {
    throw createAgentDomainError({
      kind: 'authentication',
      message: 'Integration raw body digest missing or unsupported.',
    });
  }
  return rawBodyDigest;
}

function requireSignature(signature: SignatureMetadata | undefined): SignatureMetadata {
  if (signature === undefined) {
    throw createAgentDomainError({
      kind: 'authentication',
      message: 'Integration signature missing.',
    });
  }
  return signature;
}

function normalizeToolResultStatus(status: string): 'failed' | 'succeeded' {
  if (status === 'succeeded' || status === 'failed') return status;
  throw createAgentDomainError({
    kind: 'validation',
    message: 'Tool result status must be succeeded or failed.',
    target: 'status',
  });
}
