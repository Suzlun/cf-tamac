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

import { mapAgentModelPolicySummary, mapAgentModelPolicyValidation } from './model-policies';

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
} from '../../domain';
import type { MessageInitShape } from '@bufbuild/protobuf';

/**
 * generated request message から Agent ID を取り出し、空白を除去した値へ正規化します。
 *
 * @param agentId generated RPC request body に含まれる `agent_id` 値です。
 * @returns 前後空白を取り除いた Agent ID です。
 * @throws TypeError 正規化後の Agent ID が空文字の場合に発生します。
 * @example
 * ```ts
 * const agentId = requireAgentId(request.agentId);
 * ```
 */
export function requireAgentId(agentId: string): string {
  const normalized = agentId.trim();
  if (normalized === '') throw new TypeError('agent_id must not be empty.');
  return normalized;
}

/**
 * InitializeAgent の domain result を generated response 初期化値へ変換します。
 *
 * @param result Agent profile、config、credential、thread key rule を含む domain result です。
 * @returns `InitializeAgentResponseSchema` に渡せる plain object です。
 * @throws この関数は検証済み domain result の純粋変換だけを行うため例外を投げません。
 * @example
 * ```ts
 * const response = mapInitializeAgentResponse(result);
 * ```
 */
export function mapInitializeAgentResponse(
  result: InitializeAgentResult
): MessageInitShape<typeof InitializeAgentResponseSchema> {
  return {
    agent: mapProfile(result.agent),
    audit: mapAudit(result.audit),
    config: mapConfig(result.config),
    credential: mapCredential(result.credential),
    defaultModelPolicy:
      result.defaultModelPolicy === undefined
        ? undefined
        : mapAgentModelPolicySummary(result.defaultModelPolicy),
    initializationReceipt: {
      idempotencyKey: result.initializationReceipt.idempotencyKey,
      registrationRequestDigest: result.initializationReceipt.registrationRequestDigest,
    },
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
 * GetAgent の domain result を generated response 初期化値へ変換します。
 *
 * @param result Agent profile、active credential、config、capability summary を含む取得結果です。
 * @returns `GetAgentResponseSchema` に渡せる plain object です。
 * @throws この関数は storage へアクセスせず、確定済み view を写像するだけなので例外を投げません。
 * @example
 * ```ts
 * const response = mapGetAgentResponse(result);
 * ```
 */
export function mapGetAgentResponse(
  result: GetAgentResult
): MessageInitShape<typeof GetAgentResponseSchema> {
  return {
    activeCredential: mapCredential(result.activeCredential),
    agent: mapProfile(result.agent),
    capabilitySummary: result.capabilitySummary,
    config: mapConfig(result.config),
    defaultModelPolicy:
      result.defaultModelPolicy === undefined
        ? undefined
        : mapAgentModelPolicySummary(result.defaultModelPolicy),
    initializationReceipt: {
      idempotencyKey: result.initializationReceipt.idempotencyKey,
      registrationRequestDigest: result.initializationReceipt.registrationRequestDigest,
    },
  };
}

/**
 * DestroyAgent の domain result を generated response 初期化値へ変換します。
 *
 * @param result 破棄後の Agent profile、audit、outcome を含む domain result です。
 * @returns `DestroyAgentResponseSchema` に渡せる plain object です。
 * @throws この関数は副作用を持たず、domain result の値を整形するだけなので例外を投げません。
 * @example
 * ```ts
 * const response = mapDestroyAgentResponse(result);
 * ```
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
 * RotateAgentCredential の domain result を generated response 初期化値へ変換します。
 *
 * @param result 新旧 credential と audit を含む rotation result です。
 * @returns `RotateAgentCredentialResponseSchema` に渡せる plain object です。
 * @throws この関数は credential view の純粋変換だけを行うため例外を投げません。
 * @example
 * ```ts
 * const response = mapRotateAgentCredentialResponse(result);
 * ```
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
 * UpdateConfig の domain result を generated response 初期化値へ変換します。
 *
 * @param result 更新後 config、model policy validation、audit、replay 状態を含む domain result です。
 * @returns `UpdateConfigResponseSchema` に渡せる plain object です。
 * @throws この関数は確定済み domain result を写像するだけなので例外を投げません。
 * @example
 * ```ts
 * const response = mapUpdateConfigResponse(result);
 * ```
 */
export function mapUpdateConfigResponse(
  result: UpdateAgentConfigResult
): MessageInitShape<typeof UpdateConfigResponseSchema> {
  return {
    audit: mapAudit(result.audit),
    config: mapConfig(result.config),
    defaultModelPolicy:
      result.config.defaultModelPolicy === undefined
        ? undefined
        : mapAgentModelPolicySummary(result.config.defaultModelPolicy),
    validation: mapAgentModelPolicyValidation(result.config.modelPolicyValidation),
    replayed: result.replayed,
  };
}

/**
 * GetConfig の domain view を generated response 初期化値へ変換します。
 *
 * @param config Agent-owned storage から読んだ config view です。
 * @returns `GetConfigResponseSchema` に渡せる plain object です。
 * @throws この関数は storage へ再アクセスせず、view の形を変えるだけなので例外を投げません。
 * @example
 * ```ts
 * const response = mapGetConfigResponse(config);
 * ```
 */
export function mapGetConfigResponse(
  config: AgentConfigView
): MessageInitShape<typeof GetConfigResponseSchema> {
  return {
    config: mapConfig(config),
    defaultModelPolicy:
      config.defaultModelPolicy === undefined
        ? undefined
        : mapAgentModelPolicySummary(config.defaultModelPolicy),
    updatedBy: mapUpdatedBy(config),
  };
}

/**
 * GetState の domain result を generated response 初期化値へ変換します。
 *
 * @param result lifecycle state、storage 使用量、model execution capability を含む domain result です。
 * @returns `GetStateResponseSchema` に渡せる plain object です。
 * @throws この関数は secret-free view の純粋変換だけを行うため例外を投げません。
 * @example
 * ```ts
 * const response = mapGetStateResponse(result);
 * ```
 */
export function mapGetStateResponse(
  result: GetAgentStateResult
): MessageInitShape<typeof GetStateResponseSchema> {
  return {
    modelExecution: mapModelExecutionCapability(result.modelExecution),
    state: mapState(result.state),
    storage: mapStorage(result.storage),
  };
}

/**
 * PublishEvent の domain result を generated response 初期化値へ変換します。
 *
 * @param result 受理結果、Event、Thread、任意の pending Run、replay 状態を含む domain result です。
 * @returns `PublishEventResponseSchema` に渡せる plain object です。
 * @throws この関数は domain result の写像だけを行うため例外を投げません。
 * @example
 * ```ts
 * const response = mapPublishEventResponse(result);
 * ```
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
 * GetEvent の Event view を generated response 初期化値へ変換します。
 *
 * @param event Agent-owned storage から読んだ Event view です。
 * @returns `GetEventResponseSchema` に渡せる plain object です。
 * @throws この関数は Event view と payload metadata の純粋変換だけを行うため例外を投げません。
 * @example
 * ```ts
 * const response = mapGetEventResponse(event);
 * ```
 */
export function mapGetEventResponse(
  event: AgentEventView
): MessageInitShape<typeof GetEventResponseSchema> {
  return { event: mapEvent(event), payload: mapPayload(event.payloadMetadata) };
}

/**
 * ListEvents の domain result を generated response 初期化値へ変換します。
 *
 * @param result Event view 配列と Agent-scoped page metadata を含む domain result です。
 * @returns `ListEventsResponseSchema` に渡せる plain object です。
 * @throws この関数は確定済み list result を写像するだけなので例外を投げません。
 * @example
 * ```ts
 * const response = mapListEventsResponse(result);
 * ```
 */
export function mapListEventsResponse(
  result: ListAgentEventsResult
): MessageInitShape<typeof ListEventsResponseSchema> {
  return { events: result.events.map(mapEvent), page: mapPage(result.page) };
}

/**
 * ListThreads の domain result を generated response 初期化値へ変換します。
 *
 * @param result Thread view 配列と Agent-scoped page metadata を含む domain result です。
 * @returns `ListThreadsResponseSchema` に渡せる plain object です。
 * @throws この関数は list result の純粋変換だけを行うため例外を投げません。
 * @example
 * ```ts
 * const response = mapListThreadsResponse(result);
 * ```
 */
export function mapListThreadsResponse(
  result: ListAgentThreadsResult
): MessageInitShape<typeof ListThreadsResponseSchema> {
  return { page: mapPage(result.page), threads: result.threads.map(mapThread) };
}

/**
 * GetThread の domain result を generated response 初期化値へ変換します。
 *
 * @param result Thread、任意の current section、latest Event/Run を含む domain result です。
 * @returns `GetThreadResponseSchema` に渡せる plain object です。
 * @throws この関数は domain view の写像だけを行うため例外を投げません。
 * @example
 * ```ts
 * const response = mapGetThreadResponse(result);
 * ```
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
 * ListSections の domain result を generated response 初期化値へ変換します。
 *
 * @param result Thread section view 配列と page metadata を含む domain result です。
 * @returns `ListSectionsResponseSchema` に渡せる plain object です。
 * @throws この関数は section view の純粋変換だけを行うため例外を投げません。
 * @example
 * ```ts
 * const response = mapListSectionsResponse(result);
 * ```
 */
export function mapListSectionsResponse(
  result: ListAgentSectionsResult
): MessageInitShape<typeof ListSectionsResponseSchema> {
  return { page: mapPage(result.page), sections: result.sections.map(mapSection) };
}

/**
 * generated credential policy fields を Agent-local command input へ変換します。
 *
 * @param agentId credential ID fallback を組み立てる Agent aggregate ID です。
 * @param policy generated request に含まれる任意の credential policy です。
 * @param credentialIdFallback request が明示した credential ID fallback です。
 * @returns domain operation が扱う credential command input です。
 * @throws この関数は値の詰め替えだけを行うため例外を投げません。
 * @example
 * ```ts
 * const input = mapCredentialCommand(agentId, request.policy, request.credentialId);
 * ```
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
 * generated config fields を Agent-local command input へ変換します。
 *
 * @param config generated request に含まれる任意の config 入力です。
 * @returns domain operation が扱う config command input です。
 * @throws この関数は参照値の抽出だけを行うため例外を投げません。
 * @example
 * ```ts
 * const input = mapConfigCommand(request.config);
 * ```
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
 * generated payload reference を Agent-local payload metadata view へ変換します。
 *
 * @param reference generated request/response に含まれる任意の payload reference です。
 * @returns Agent domain が扱う payload metadata、または入力が未指定の場合は `undefined` です。
 * @throws storage class が未知の場合、下位の正規化処理が例外を投げます。
 * @example
 * ```ts
 * const metadata = mapPayloadReference(request.payloadRef);
 * ```
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
 * generated int64 の任意 `bigint` field を JavaScript number へ変換します。
 *
 * @param value generated Protobuf runtime が返す `bigint`、または未指定値です。
 * @returns `number` に変換した値、または入力が未指定の場合は `undefined` です。
 * @throws この関数は `Number` 変換だけを行うため例外を投げません。
 * @example
 * ```ts
 * const pageSize = toNumber(request.pageSize);
 * ```
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
    defaultModelPolicy:
      config.defaultModelPolicy === undefined
        ? undefined
        : mapAgentModelPolicySummary(config.defaultModelPolicy),
    displayName: config.displayName,
    memoryPolicyRef: config.memoryPolicyRef,
    modelPolicyRef: config.modelPolicyRef,
    modelPolicyValidation: mapAgentModelPolicyValidation(config.modelPolicyValidation),
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
    policyOverrideSource: event.policyOverrideSource,
    modelPolicy:
      event.modelPolicy === undefined ? undefined : mapAgentModelPolicySummary(event.modelPolicy),
    modelPolicyValidation: mapAgentModelPolicyValidation(event.modelPolicyValidation),
    requestedModelPolicyRef: event.requestedModelPolicyRef,
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
    defaultModelPolicy:
      state.defaultModelPolicy === undefined
        ? undefined
        : mapAgentModelPolicySummary(state.defaultModelPolicy),
    lifecycleStatus: state.lifecycleStatus,
    modelExecution: mapModelExecutionCapability(state.modelExecution),
    schedulerStatus: state.schedulerStatus,
    stateRef: state.stateRef,
    stateVersion: state.stateVersion,
    storageStatus: state.storageStatus,
    updatedAtUnixMs: BigInt(state.updatedAtMs),
  };
}

function mapModelExecutionCapability(
  capability:
    | {
        readonly bindingPresent: boolean;
        readonly checkedAtMs: number;
        readonly defaultPolicyDigest?: string;
        readonly defaultPolicyRef?: string;
        readonly modelId?: string;
        readonly provider?: string;
        readonly safeDetailRef?: string;
        readonly status: string;
      }
    | undefined
) {
  if (capability === undefined) return undefined;
  return {
    bindingPresent: capability.bindingPresent,
    checkedAtUnixMs: BigInt(capability.checkedAtMs),
    defaultPolicyDigest: capability.defaultPolicyDigest,
    defaultPolicyRef: capability.defaultPolicyRef,
    modelId: capability.modelId,
    provider: capability.provider,
    safeDetailRef: capability.safeDetailRef,
    status: capability.status,
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
