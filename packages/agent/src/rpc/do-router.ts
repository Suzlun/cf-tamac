import type {
  DestroyAgentRequest,
  DestroyAgentResponseSchema,
  GetAgentRequest,
  GetAgentResponseSchema,
  GetConfigRequest,
  GetConfigResponseSchema,
  GetEventRequest,
  GetEventResponseSchema,
  GetLatestCompactionRequest,
  GetLatestCompactionResponseSchema,
  GetStateRequest,
  GetStateResponseSchema,
  GetThreadRequest,
  GetThreadResponseSchema,
  GetThreadMemoryRequest,
  GetThreadMemoryResponseSchema,
  InitializeAgentRequest,
  InitializeAgentResponseSchema,
  ListEventsRequest,
  ListEventsResponseSchema,
  ListSectionsRequest,
  ListSectionsResponseSchema,
  ListThreadsRequest,
  ListThreadsResponseSchema,
  PublishEventRequest,
  PublishEventResponseSchema,
  RotateAgentCredentialRequest,
  RotateAgentCredentialResponseSchema,
  SearchThreadHistoryRequest,
  SearchThreadHistoryResponseSchema,
  UpdateConfigRequest,
  UpdateConfigResponseSchema,
  CheckHealthRequestSchema,
  CheckHealthResponseSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { getAIAgentDurableObjectStub } from '../agent-routing';
import { loadControlPlaneTrustConfig } from '../domain/security';

import { createAgentCoreContext } from './command-context';
import { getCurrentAgentRpcAuditContext } from './interceptors/audit';
import {
  mapConfigCommand,
  mapCredentialCommand,
  mapDestroyAgentResponse,
  mapGetAgentResponse,
  mapGetConfigResponse,
  mapGetEventResponse,
  mapGetLatestCompactionResponse,
  mapGetStateResponse,
  mapGetThreadMemoryResponse,
  mapGetThreadResponse,
  mapInitializeAgentResponse,
  mapListEventsResponse,
  mapListSectionsResponse,
  mapListThreadsResponse,
  mapPayloadReference,
  mapPublishEventResponse,
  mapRotateAgentCredentialResponse,
  mapSearchThreadHistoryResponse,
  mapUpdateConfigResponse,
  requireAgentId,
  toNumber,
} from './message-mappers';
import { mapModelPolicyCommandInput } from './model-policy-message-mappers';

import type { AgentWorkerEnv } from '../env';
import type { MessageInitShape } from '@bufbuild/protobuf';

const agentContractPackage = 'cftamac.agent.v1';
const agentServiceVersion = '0.1.0';
const agentThreadServiceName = 'cftamac.agent.v1.AgentThreadService';

/**
 * Protobuf init shape for the generated health response.
 */
export type AgentHealthResponseInit = MessageInitShape<typeof CheckHealthResponseSchema>;

/**
 * Protobuf init shape for the generated health request.
 */
export type AgentHealthRequestInit = MessageInitShape<typeof CheckHealthRequestSchema>;

type InitializeAgentResponseInit = MessageInitShape<typeof InitializeAgentResponseSchema>;
type GetAgentResponseInit = MessageInitShape<typeof GetAgentResponseSchema>;
type DestroyAgentResponseInit = MessageInitShape<typeof DestroyAgentResponseSchema>;
type RotateAgentCredentialResponseInit = MessageInitShape<
  typeof RotateAgentCredentialResponseSchema
>;
type UpdateConfigResponseInit = MessageInitShape<typeof UpdateConfigResponseSchema>;
type GetConfigResponseInit = MessageInitShape<typeof GetConfigResponseSchema>;
type GetStateResponseInit = MessageInitShape<typeof GetStateResponseSchema>;
type PublishEventResponseInit = MessageInitShape<typeof PublishEventResponseSchema>;
type GetEventResponseInit = MessageInitShape<typeof GetEventResponseSchema>;
type ListEventsResponseInit = MessageInitShape<typeof ListEventsResponseSchema>;
type ListThreadsResponseInit = MessageInitShape<typeof ListThreadsResponseSchema>;
type GetThreadResponseInit = MessageInitShape<typeof GetThreadResponseSchema>;
type ListSectionsResponseInit = MessageInitShape<typeof ListSectionsResponseSchema>;
type GetLatestCompactionResponseInit = MessageInitShape<typeof GetLatestCompactionResponseSchema>;
type GetThreadMemoryResponseInit = MessageInitShape<typeof GetThreadMemoryResponseSchema>;
type SearchThreadHistoryResponseInit = MessageInitShape<typeof SearchThreadHistoryResponseSchema>;

/**
 * Dispatch a foundation health request to the Agent-owned Durable Object.
 */
export async function dispatchAgentHealthCheck(
  env: AgentWorkerEnv,
  request: AgentHealthRequestInit
): Promise<AgentHealthResponseInit> {
  const agentId = request.agentId ?? '';
  const agent = getAIAgentDurableObjectStub(env, agentId);
  const health = await agent.checkHealth();
  const checkedAtUnixMs = BigInt(Date.now());
  const servingStatus = mapLifecycleStatusToServingStatus(health.status);
  const dependencyStatusRef =
    request.includeDependencies === true ? createSafeDependencyStatusRef(health) : undefined;
  const modelExecution =
    health.modelExecution === undefined
      ? undefined
      : {
          bindingPresent: health.modelExecution.bindingPresent,
          checkedAtUnixMs: BigInt(health.modelExecution.checkedAtMs),
          defaultPolicyDigest: health.modelExecution.defaultPolicyDigest,
          defaultPolicyRef: health.modelExecution.defaultPolicyRef,
          modelId: health.modelExecution.modelId,
          provider: health.modelExecution.provider,
          safeDetailRef: health.modelExecution.safeDetailRef,
          status: health.modelExecution.status,
        };
  const trustConfig = await createTrustConfigDiagnostic(env);
  const currentPrincipalTrust = createCurrentPrincipalTrustDiagnostic();

  return {
    agentId: health.agentId,
    checkedAtUnixMs,
    contractPackage: agentContractPackage,
    dependencyStatusRef,
    health: {
      agentId: health.agentId,
      checkedAtUnixMs,
      contractPackage: agentContractPackage,
      dependencyStatusRef,
      modelExecution,
      serviceVersion: agentServiceVersion,
      servingStatus,
    },
    modelExecution,
    serviceVersion: agentServiceVersion,
    status: servingStatus,
    trustConfig,
    currentPrincipalTrust,
  };
}

async function createTrustConfigDiagnostic(env: AgentWorkerEnv): Promise<
  | {
      readonly fingerprint: string;
      readonly issuerCount: number;
      readonly keyCount: number;
      readonly loadedAtUnixMs: bigint;
      readonly status: string;
      readonly version: string;
    }
  | undefined
> {
  try {
    // health response は trust config の公開 fingerprint と集約数だけを返し、公開鍵全文や secret は返しません。
    const config = await loadControlPlaneTrustConfig(env.AGENT_CONTROL_PLANE_TRUST);
    return {
      fingerprint: config.diagnostic.fingerprint,
      issuerCount: config.diagnostic.issuerCount,
      keyCount: config.diagnostic.keyCount,
      loadedAtUnixMs: BigInt(config.diagnostic.loadedAtUnixMs),
      status: config.diagnostic.status,
      version: config.diagnostic.version,
    };
  } catch {
    // 認証済み RPC でここへ来ることは通常ありませんが、diagnostic は secret-free degraded として返します。
    return {
      fingerprint: 'unavailable',
      issuerCount: 0,
      keyCount: 0,
      loadedAtUnixMs: BigInt(Date.now()),
      status: 'unavailable',
      version: 'unavailable',
    };
  }
}

function createCurrentPrincipalTrustDiagnostic():
  | {
      readonly fingerprint: string;
      readonly issuer: string;
      readonly keyStatus: string;
      readonly kid: string;
      readonly principalType: string;
      readonly verified: boolean;
      readonly verifiedAtUnixMs: bigint;
    }
  | undefined {
  const summary = getCurrentAgentRpcAuditContext()?.principal.trustSummary;
  if (summary === undefined) return undefined;
  // 認証済み principal の安全な issuer/kid/fingerprint だけを health response へ写します。
  return {
    fingerprint: summary.fingerprint,
    issuer: summary.issuer,
    keyStatus: summary.keyStatus,
    kid: summary.kid,
    principalType: summary.principalType,
    verified: summary.verified,
    verifiedAtUnixMs: BigInt(summary.verifiedAtUnixMs),
  };
}

/**
 * Dispatch InitializeAgent to the Agent-owned Durable Object.
 */
export async function dispatchInitializeAgent(
  env: AgentWorkerEnv,
  request: InitializeAgentRequest
): Promise<InitializeAgentResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    idempotencyKey: request.idempotencyKey,
    method: 'InitializeAgent',
    security: request.security,
    service: 'cftamac.agent.v1.AgentLifecycleService',
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).initializeAgent({
    context,
    credential: mapCredentialCommand(agentId, request.credentialPolicy, request.idempotencyKey),
    displayName: request.displayName,
    initialConfig: mapConfigCommand(request.initialConfig),
    initialModelPolicy:
      request.initialModelPolicy === undefined
        ? undefined
        : mapModelPolicyCommandInput(request.initialModelPolicy),
  });
  return mapInitializeAgentResponse(result);
}

/**
 * Dispatch GetAgent to the Agent-owned Durable Object.
 */
export async function dispatchGetAgent(
  env: AgentWorkerEnv,
  request: GetAgentRequest
): Promise<GetAgentResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'GetAgent',
    service: 'cftamac.agent.v1.AgentLifecycleService',
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).getAgent({ context });
  return mapGetAgentResponse(result);
}

/**
 * Dispatch DestroyAgent to the Agent-owned Durable Object.
 */
export async function dispatchDestroyAgent(
  env: AgentWorkerEnv,
  request: DestroyAgentRequest
): Promise<DestroyAgentResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    idempotencyKey: request.idempotencyKey,
    method: 'DestroyAgent',
    security: request.security,
    service: 'cftamac.agent.v1.AgentLifecycleService',
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).destroyAgent({
    context,
    reason: request.reason,
  });
  return mapDestroyAgentResponse(result);
}

/**
 * Dispatch RotateAgentCredential to the Agent-owned Durable Object.
 */
export async function dispatchRotateAgentCredential(
  env: AgentWorkerEnv,
  request: RotateAgentCredentialRequest
): Promise<RotateAgentCredentialResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    idempotencyKey: request.idempotencyKey,
    method: 'RotateAgentCredential',
    security: request.security,
    service: 'cftamac.agent.v1.AgentLifecycleService',
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).rotateAgentCredential({
    context,
    credential: mapCredentialCommand(agentId, request.policy, request.credentialId),
  });
  return mapRotateAgentCredentialResponse(result);
}

/**
 * Dispatch UpdateConfig to the Agent-owned Durable Object.
 */
export async function dispatchUpdateConfig(
  env: AgentWorkerEnv,
  request: UpdateConfigRequest
): Promise<UpdateConfigResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    idempotencyKey: request.idempotencyKey,
    method: 'UpdateConfig',
    security: request.security,
    service: 'cftamac.agent.v1.AgentStateService',
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).updateConfig({
    config: mapConfigCommand(request.config),
    context,
  });
  return mapUpdateConfigResponse(result);
}

/**
 * Dispatch GetConfig to the Agent-owned Durable Object.
 */
export async function dispatchGetConfig(
  env: AgentWorkerEnv,
  request: GetConfigRequest
): Promise<GetConfigResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'GetConfig',
    service: 'cftamac.agent.v1.AgentStateService',
  });
  const config = await getAIAgentDurableObjectStub(env, agentId).getConfig({ context });
  return mapGetConfigResponse(config);
}

/**
 * Dispatch GetState to the Agent-owned Durable Object.
 */
export async function dispatchGetState(
  env: AgentWorkerEnv,
  request: GetStateRequest
): Promise<GetStateResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'GetState',
    service: 'cftamac.agent.v1.AgentStateService',
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).getState({ context });
  return mapGetStateResponse(result);
}

/**
 * Dispatch PublishEvent to the Agent-owned Durable Object.
 */
export async function dispatchPublishEvent(
  env: AgentWorkerEnv,
  request: PublishEventRequest
): Promise<PublishEventResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const event = request.event;
  const context = await createAgentCoreContext({
    agentId,
    causationId: event?.causationId,
    correlationId: event?.correlationId,
    fallbackDigestSeed: request,
    idempotencyKey: request.idempotencyKey,
    method: 'PublishEvent',
    replay: request.replay,
    security: request.security,
    service: 'cftamac.agent.v1.AgentEventService',
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).publishEvent({
    context,
    eventType: event?.eventType ?? '',
    occurredAtMs: toNumber(event?.occurredAtUnixMs),
    payload: event?.payload,
    payloadContentType: event?.payloadContentType,
    payloadReference: mapPayloadReference(event?.payloadReference),
    modelPolicyRef: event?.modelPolicyRef,
    source: event?.source ?? 'client',
    threadKey: request.threadKey,
  });
  return mapPublishEventResponse(result);
}

/**
 * Dispatch GetEvent to the Agent-owned Durable Object.
 */
export async function dispatchGetEvent(
  env: AgentWorkerEnv,
  request: GetEventRequest
): Promise<GetEventResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'GetEvent',
    service: 'cftamac.agent.v1.AgentEventService',
  });
  const event = await getAIAgentDurableObjectStub(env, agentId).getEvent({
    context,
    eventId: request.eventId,
    includePayload: request.includePayload,
  });
  return mapGetEventResponse(event);
}

/**
 * Dispatch ListEvents to the Agent-owned Durable Object.
 */
export async function dispatchListEvents(
  env: AgentWorkerEnv,
  request: ListEventsRequest
): Promise<ListEventsResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'ListEvents',
    service: 'cftamac.agent.v1.AgentEventService',
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).listEvents({
    context,
    eventType: request.eventType,
    pageSize: request.page?.pageSize,
    pageToken: request.page?.pageToken,
    sectionId: request.sectionId,
    threadId: request.threadId,
  });
  return mapListEventsResponse(result);
}

/**
 * Dispatch ListThreads to the Agent-owned Durable Object.
 */
export async function dispatchListThreads(
  env: AgentWorkerEnv,
  request: ListThreadsRequest
): Promise<ListThreadsResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'ListThreads',
    service: agentThreadServiceName,
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).listThreads({
    context,
    pageCursorScope: request.page?.cursorScope,
    pageSize: request.page?.pageSize,
    pageToken: request.page?.pageToken,
    status: request.status,
    threadKeyPrefix: request.threadKeyPrefix,
  });
  return mapListThreadsResponse(result);
}

/**
 * Dispatch GetThread to the Agent-owned Durable Object.
 */
export async function dispatchGetThread(
  env: AgentWorkerEnv,
  request: GetThreadRequest
): Promise<GetThreadResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'GetThread',
    service: agentThreadServiceName,
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).getThread({
    context,
    threadId: request.threadId,
  });
  return mapGetThreadResponse(result);
}

/**
 * Dispatch ListSections to the Agent-owned Durable Object.
 */
export async function dispatchListSections(
  env: AgentWorkerEnv,
  request: ListSectionsRequest
): Promise<ListSectionsResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'ListSections',
    service: agentThreadServiceName,
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).listSections({
    context,
    endSectionOrdinal: toNumber(request.sequenceRange?.endUnixMs),
    pageCursorScope: request.page?.cursorScope,
    pageSize: request.page?.pageSize,
    pageToken: request.page?.pageToken,
    startSectionOrdinal: toNumber(request.sequenceRange?.startUnixMs),
    threadId: request.threadId,
  });
  return mapListSectionsResponse(result);
}

/**
 * Agent-owned Durable Object へ GetLatestCompaction を dispatch します。
 */
export async function dispatchGetLatestCompaction(
  env: AgentWorkerEnv,
  request: GetLatestCompactionRequest
): Promise<GetLatestCompactionResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'GetLatestCompaction',
    service: agentThreadServiceName,
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).getLatestCompaction({
    context,
    threadId: request.threadId,
  });
  return mapGetLatestCompactionResponse(result);
}

/**
 * Agent-owned Durable Object へ GetThreadMemory を dispatch します。
 */
export async function dispatchGetThreadMemory(
  env: AgentWorkerEnv,
  request: GetThreadMemoryRequest
): Promise<GetThreadMemoryResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'GetThreadMemory',
    service: agentThreadServiceName,
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).getThreadMemory({
    context,
    threadId: request.threadId,
  });
  return mapGetThreadMemoryResponse(result);
}

/**
 * Agent-owned Durable Object へ SearchThreadHistory を dispatch します。
 */
export async function dispatchSearchThreadHistory(
  env: AgentWorkerEnv,
  request: SearchThreadHistoryRequest
): Promise<SearchThreadHistoryResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'SearchThreadHistory',
    service: agentThreadServiceName,
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).searchThreadHistory({
    compactionId: request.filter?.compactionId,
    context,
    endCreatedAtMs: toNumber(request.filter?.timeRange?.endUnixMs),
    pageCursorScope: request.page?.cursorScope,
    pageSize: request.page?.pageSize,
    pageToken: request.page?.pageToken,
    provenanceContains: request.filter?.provenanceContains,
    query:
      request.filter?.query === undefined || request.filter.query === ''
        ? request.query
        : request.filter.query,
    sectionId: request.filter?.sectionId,
    startCreatedAtMs: toNumber(request.filter?.timeRange?.startUnixMs),
    threadId: request.threadId,
  });
  return mapSearchThreadHistoryResponse(result);
}

function mapLifecycleStatusToServingStatus(status: string): 'serving' | 'degraded' {
  return status === 'destroying' || status === 'destroyed' ? 'degraded' : 'serving';
}

function createSafeDependencyStatusRef(health: {
  readonly storage: string;
  readonly queue: string;
}): string {
  return `storage:${health.storage};queue:${health.queue}`;
}
