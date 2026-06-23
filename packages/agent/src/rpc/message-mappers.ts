import type {
  DestroyAgentResponseSchema,
  GetAgentResponseSchema,
  GetConfigResponseSchema,
  GetEventResponseSchema,
  GetStateResponseSchema,
  GetThreadResponseSchema,
  InitializeAgentResponseSchema,
  ListEventsResponseSchema,
  ListSectionsResponseSchema,
  ListThreadsResponseSchema,
  PublishEventResponseSchema,
  RotateAgentCredentialResponseSchema,
  UpdateConfigResponseSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import type {
  AgentConfigCommandInput,
  AgentConfigView,
  AgentCredentialCommandInput,
  AgentCredentialView,
  AgentEventView,
  AgentPageView,
  AgentPayloadMetadataView,
  AgentProfileView,
  AgentRunView,
  AgentStateSnapshotView,
  AgentStorageThresholdStatusView,
  AgentThreadSectionView,
  AgentThreadView,
  DestroyAgentResult,
  GetAgentResult,
  GetAgentStateResult,
  GetAgentThreadResult,
  InitializeAgentResult,
  ListAgentEventsResult,
  ListAgentSectionsResult,
  ListAgentThreadsResult,
  PublishAgentEventResult,
  RotateAgentCredentialResult,
  UpdateAgentConfigResult,
} from '../domain';
import type { MessageInitShape } from '@bufbuild/protobuf';

export {
  mapGetLatestCompactionResponse,
  mapGetThreadMemoryResponse,
  mapSearchThreadHistoryResponse,
} from './thread-query-message-mappers';

/**
 * Require and normalize an Agent ID from a generated request message.
 */
export function requireAgentId(agentId: string): string {
  const normalized = agentId.trim();
  if (normalized === '') throw new TypeError('agent_id must not be empty.');
  return normalized;
}

/**
 * Map InitializeAgent domain result to a generated response init shape.
 */
export function mapInitializeAgentResponse(
  result: InitializeAgentResult
): MessageInitShape<typeof InitializeAgentResponseSchema> {
  return {
    agent: mapProfile(result.agent),
    audit: mapAudit(result.audit),
    config: mapConfig(result.config),
    credential: mapCredential(result.credential),
    threadKeyRule: {
      agentId: result.agent.agentId,
      caseSensitive: true,
      emptyForbidden: true,
      implicitPrefixForbidden: true,
      maxUtf8Bytes: 512,
      normalizedThreadKey: result.threadKeyRule.normalizedThreadKey,
      normalizedUnicodeForm: 'NFC',
      threadKey: result.threadKeyRule.threadKey,
    },
  };
}

/**
 * Map GetAgent domain result to a generated response init shape.
 */
export function mapGetAgentResponse(
  result: GetAgentResult
): MessageInitShape<typeof GetAgentResponseSchema> {
  return {
    activeCredential: mapCredential(result.activeCredential),
    agent: mapProfile(result.agent),
    capabilitySummary: result.capabilitySummary,
    config: mapConfig(result.config),
  };
}

/**
 * Map DestroyAgent domain result to a generated response init shape.
 */
export function mapDestroyAgentResponse(
  result: DestroyAgentResult
): MessageInitShape<typeof DestroyAgentResponseSchema> {
  return {
    agent: mapProfile(result.agent),
    audit: mapAudit(result.audit),
    status: { auditEventId: result.audit.auditEventId, ok: true, outcome: result.outcome },
  };
}

/**
 * Map RotateAgentCredential domain result to a generated response init shape.
 */
export function mapRotateAgentCredentialResponse(
  result: RotateAgentCredentialResult
): MessageInitShape<typeof RotateAgentCredentialResponseSchema> {
  return {
    audit: mapAudit(result.audit),
    credential: mapCredential(result.credential),
    previousCredential: mapCredential(result.previousCredential),
  };
}

/**
 * Map UpdateConfig domain result to a generated response init shape.
 */
export function mapUpdateConfigResponse(
  result: UpdateAgentConfigResult
): MessageInitShape<typeof UpdateConfigResponseSchema> {
  return {
    audit: mapAudit(result.audit),
    config: mapConfig(result.config),
    replayed: result.replayed,
  };
}

/**
 * Map GetConfig domain result to a generated response init shape.
 */
export function mapGetConfigResponse(
  config: AgentConfigView
): MessageInitShape<typeof GetConfigResponseSchema> {
  return { config: mapConfig(config), updatedBy: mapUpdatedBy(config) };
}

/**
 * Map GetState domain result to a generated response init shape.
 */
export function mapGetStateResponse(
  result: GetAgentStateResult
): MessageInitShape<typeof GetStateResponseSchema> {
  return { state: mapState(result.state), storage: mapStorage(result.storage) };
}

/**
 * Map PublishEvent domain result to a generated response init shape.
 */
export function mapPublishEventResponse(
  result: PublishAgentEventResult
): MessageInitShape<typeof PublishEventResponseSchema> {
  return {
    accepted: result.accepted,
    event: mapEvent(result.event),
    pendingRun: mapRun(result.pendingRun),
    replayed: result.replayed,
    thread: mapThread(result.thread),
  };
}

/**
 * Map GetEvent domain result to a generated response init shape.
 */
export function mapGetEventResponse(
  event: AgentEventView
): MessageInitShape<typeof GetEventResponseSchema> {
  return { event: mapEvent(event), payload: mapPayload(event.payloadMetadata) };
}

/**
 * Map ListEvents domain result to a generated response init shape.
 */
export function mapListEventsResponse(
  result: ListAgentEventsResult
): MessageInitShape<typeof ListEventsResponseSchema> {
  return { events: result.events.map(mapEvent), page: mapPage(result.page) };
}

/**
 * Map ListThreads domain result to a generated response init shape.
 */
export function mapListThreadsResponse(
  result: ListAgentThreadsResult
): MessageInitShape<typeof ListThreadsResponseSchema> {
  return { page: mapPage(result.page), threads: result.threads.map(mapThread) };
}

/**
 * Map GetThread domain result to a generated response init shape.
 */
export function mapGetThreadResponse(
  result: GetAgentThreadResult
): MessageInitShape<typeof GetThreadResponseSchema> {
  return {
    currentSection: mapOptionalSection(result.currentSection),
    latestEvent: result.latestEvent === undefined ? undefined : mapEvent(result.latestEvent),
    latestRun: result.latestRun === undefined ? undefined : mapRun(result.latestRun),
    thread: mapThread(result.thread),
  };
}

/**
 * Map ListSections domain result to a generated response init shape.
 */
export function mapListSectionsResponse(
  result: ListAgentSectionsResult
): MessageInitShape<typeof ListSectionsResponseSchema> {
  return { page: mapPage(result.page), sections: result.sections.map(mapSection) };
}

/**
 * Map generated credential policy fields to an Agent-local command input.
 */
export function mapCredentialCommand(
  agentId: string,
  policy:
    | {
        readonly overlapSeconds?: number;
        readonly publicFingerprint?: string;
        readonly requestedGeneration?: number;
        readonly revokePrevious?: boolean;
        readonly verifierMaterialRef?: string;
      }
    | undefined,
  credentialIdFallback: string
): AgentCredentialCommandInput {
  return {
    credentialId:
      credentialIdFallback === ''
        ? `${agentId}:credential:${String(policy?.requestedGeneration ?? 1)}`
        : credentialIdFallback,
    generation: policy?.requestedGeneration ?? 1,
    overlapSeconds: policy?.overlapSeconds,
    publicFingerprint: policy?.publicFingerprint,
    revokePrevious: policy?.revokePrevious,
    verifierMaterialRef: policy?.verifierMaterialRef,
  };
}

/**
 * Map generated config fields to an Agent-local command input.
 */
export function mapConfigCommand(
  config:
    | {
        readonly budgetPolicyRef?: string;
        readonly configBodyRef?: { readonly ref: string };
        readonly displayName?: string;
        readonly memoryPolicyRef?: string;
        readonly modelPolicyRef?: string;
        readonly schedulePolicyRef?: string;
        readonly toolPolicyRef?: string;
      }
    | undefined
): AgentConfigCommandInput {
  return {
    budgetPolicyRef: config?.budgetPolicyRef,
    configBodyRef: config?.configBodyRef?.ref,
    displayName: config?.displayName,
    memoryPolicyRef: config?.memoryPolicyRef,
    modelPolicyRef: config?.modelPolicyRef,
    schedulePolicyRef: config?.schedulePolicyRef,
    toolPolicyRef: config?.toolPolicyRef,
  };
}

/**
 * Map a generated payload reference to Agent-local payload metadata input.
 */
export function mapPayloadReference(
  reference:
    | {
        readonly byteSize: bigint;
        readonly contentType: string;
        readonly ref: string;
        readonly sha256: string;
        readonly storageClass: string;
      }
    | undefined
): AgentPayloadMetadataView | undefined {
  if (reference === undefined) return undefined;
  return {
    byteSize: Number(reference.byteSize),
    contentType: reference.contentType,
    ref: reference.ref,
    sha256: reference.sha256,
    storageClass: normalizeStorageClass(reference.storageClass),
  };
}

/**
 * Convert optional generated int64 bigint fields to JavaScript numbers.
 */
export function toNumber(value: bigint | undefined): number | undefined {
  return value === undefined ? undefined : Number(value);
}

function mapProfile(profile: AgentProfileView) {
  return {
    agentId: profile.agentId,
    capabilitySummaryRef: profile.capabilitySummaryRef,
    configVersion: String(profile.configVersion),
    createdAtUnixMs: BigInt(profile.createdAtMs),
    credentialGeneration: profile.credentialGeneration,
    displayName: profile.displayName,
    latestAuditEventId: profile.latestAuditEventId,
    status: profile.status,
    systemThreadId: profile.systemThreadId,
    updatedAtUnixMs: BigInt(profile.updatedAtMs),
  };
}

function mapConfig(config: AgentConfigView) {
  return {
    agentId: config.agentId,
    budgetPolicyRef: config.budgetPolicyRef,
    configBodyRef: mapRefOnly(config.configBodyRef),
    configVersion: String(config.configVersion),
    displayName: config.displayName,
    memoryPolicyRef: config.memoryPolicyRef,
    modelPolicyRef: config.modelPolicyRef,
    schedulePolicyRef: config.schedulePolicyRef,
    toolPolicyRef: config.toolPolicyRef,
    updatedAtUnixMs: BigInt(config.updatedAtMs),
    updatedByPrincipalId: config.updatedByPrincipalId,
  };
}

function mapCredential(credential: AgentCredentialView | undefined) {
  if (credential === undefined) return undefined;
  return {
    agentId: credential.agentId,
    auditEventId: credential.auditEventId,
    createdAtUnixMs: BigInt(credential.createdAtMs),
    credentialId: credential.credentialId,
    generation: credential.generation,
    keyId: credential.keyId,
    overlapUntilUnixMs: optionalBigInt(credential.overlapUntilMs),
    principalId: 'agent-local',
    publicFingerprint: credential.publicFingerprint,
    revokedAtUnixMs: optionalBigInt(credential.revokedAtMs),
    status: credential.status,
    verifierMaterialRef: credential.verifierMaterialRef,
  };
}

function mapAudit(audit: {
  readonly agentId: string;
  readonly auditEventId: string;
  readonly correlationId?: string;
  readonly occurredAtMs: number;
  readonly operation: string;
  readonly principalId: string;
  readonly result: string;
  readonly safeDetailRef?: string;
  readonly systemThreadId: string;
}) {
  return {
    agentId: audit.agentId,
    auditEventId: audit.auditEventId,
    correlationId: audit.correlationId,
    occurredAtUnixMs: BigInt(audit.occurredAtMs),
    operation: audit.operation,
    principalId: audit.principalId,
    result: audit.result,
    safeDetailRef: audit.safeDetailRef,
    systemThreadId: audit.systemThreadId,
  };
}

function mapEvent(event: AgentEventView) {
  return {
    agentId: event.agentId,
    agentSequence: BigInt(event.agentSequence),
    causationId: event.causationId,
    correlationId: event.correlationId,
    deliveryContextId: event.deliveryContextId,
    eventId: event.eventId,
    eventType: event.eventType,
    idempotencyKey: event.idempotencyKey,
    normalizedThreadKey: event.normalizedThreadKey,
    occurredAtUnixMs: BigInt(event.occurredAtMs),
    payloadMetadata: mapPayload(event.payloadMetadata),
    payloadRef: event.payloadRef,
    runId: event.runId,
    sectionId: event.sectionId,
    source: event.source,
    threadId: event.threadId,
    threadKey: event.threadKey,
    threadSequence: BigInt(event.threadSequence),
  };
}

function mapThread(thread: AgentThreadView) {
  return {
    agentId: thread.agentId,
    createdAtUnixMs: BigInt(thread.createdAtMs),
    currentSectionId: thread.currentSectionId,
    lastServedAtUnixMs: optionalBigInt(thread.lastServedAtMs),
    latestEventId: thread.latestEventId,
    latestRunId: thread.latestRunId,
    normalizedThreadKey: thread.normalizedThreadKey,
    priority: thread.priority,
    status: thread.status,
    threadId: thread.threadId,
    threadKey: thread.threadKey,
    updatedAtUnixMs: BigInt(thread.updatedAtMs),
  };
}

function mapRun(run: AgentRunView) {
  return {
    agentId: run.agentId,
    pendingSinceUnixMs: optionalBigInt(run.pendingSinceMs),
    runId: run.runId,
    status: run.status,
    threadId: run.threadId,
    triggerEventId: run.triggerEventId,
  };
}

function mapOptionalSection(section: AgentThreadSectionView | undefined) {
  return section === undefined ? undefined : mapSection(section);
}

function mapSection(section: AgentThreadSectionView) {
  return {
    agentId: section.agentId,
    endThreadSequence: optionalBigInt(section.endThreadSequence),
    eventCount: section.eventCount,
    frozenAtUnixMs: optionalBigInt(section.frozenAtMs),
    openedAtUnixMs: BigInt(section.openedAtMs),
    sectionId: section.sectionId,
    sectionOrdinal: section.sectionOrdinal,
    startThreadSequence: BigInt(section.startThreadSequence),
    status: section.status,
    threadId: section.threadId,
  };
}

function mapState(state: AgentStateSnapshotView) {
  return {
    agentId: state.agentId,
    capabilitySummary: state.capabilitySummary,
    configVersion: String(state.configVersion),
    currentRunId: state.currentRunId,
    lifecycleStatus: state.lifecycleStatus,
    schedulerStatus: state.schedulerStatus,
    stateRef: state.stateRef,
    stateVersion: state.stateVersion,
    storageStatus: state.storageStatus,
    updatedAtUnixMs: BigInt(state.updatedAtMs),
  };
}

function mapStorage(storage: AgentStorageThresholdStatusView) {
  return {
    agentId: storage.agentId,
    compactionPriorityPercent: storage.compactionPriorityPercent,
    criticalPercent: storage.criticalPercent,
    currentPercent: storage.currentPercent,
    forceLargeBodyR2Percent: storage.forceLargeBodyR2Percent,
    inlinePayloadLimitBytes: BigInt(storage.inlinePayloadLimitBytes),
    warningPercent: storage.warningPercent,
  };
}

function mapPayload(payload: AgentPayloadMetadataView | undefined) {
  if (payload === undefined) return undefined;
  return {
    byteSize: BigInt(payload.byteSize),
    contentType: payload.contentType,
    inlineBytes: payload.inlineBytes,
    ref: payload.ref,
    sha256: payload.sha256,
    storageClass: payload.storageClass,
  };
}

function mapPage(page: AgentPageView) {
  return {
    cursorScope: page.cursorScope,
    nextPageToken: page.nextPageToken,
    resultCount: page.resultCount,
  };
}

function mapRefOnly(ref: string | undefined) {
  if (ref === undefined) return undefined;
  return {
    byteSize: 0n,
    contentType: 'application/octet-stream',
    ref,
    sha256: '',
    storageClass: 'reference',
  };
}

function mapUpdatedBy(config: AgentConfigView) {
  if (config.updatedByPrincipalId === undefined) return undefined;
  return {
    principalId: config.updatedByPrincipalId,
    principalType: 'CLIENT_SERVICE',
    scopes: [],
  };
}

function optionalBigInt(value: number | undefined): bigint | undefined {
  return value === undefined ? undefined : BigInt(value);
}

function normalizeStorageClass(value: string): 'inline' | 'r2' | 'reference' {
  return value === 'r2' || value === 'reference' ? value : 'inline';
}
