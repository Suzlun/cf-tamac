import type { AgentPrincipalContext, AgentRawBodyDigest } from './security/types';

/**
 * Agent-owned model policy の安全な参照 metadata です。
 *
 * @remarks
 * provider credential や raw generation body は含めず、Run selection と UI 表示に必要な
 * ref、digest、provider/model、schema version のみを返します。
 */
export interface AgentModelPolicySummaryView {
  readonly agentId: string;
  readonly checkedAtMs?: number;
  readonly decisionSchemaVersion: string;
  readonly modelId: string;
  readonly policyDigest: string;
  readonly policyRef: string;
  readonly provider: string;
  readonly safeMetadataRef?: AgentPayloadMetadataView;
  readonly status: string;
  readonly version: number;
}

/**
 * Model policy validation issue の安全な view です。
 */
export interface AgentModelPolicyValidationIssueView {
  readonly code: string;
  readonly retryable: boolean;
  readonly safeMessage: string;
  readonly severity: string;
  readonly target?: string;
}

/**
 * Model policy validation の安全な view です。
 */
export interface AgentModelPolicyValidationView {
  readonly checkedAtMs?: number;
  readonly issues: readonly AgentModelPolicyValidationIssueView[];
  readonly modelId: string;
  readonly ok: boolean;
  readonly policyDigest?: string;
  readonly policyRef: string;
  readonly provider: string;
  readonly safeMetadataRef?: AgentPayloadMetadataView;
  readonly status: string;
  readonly warnings: readonly AgentModelPolicyValidationIssueView[];
}

/**
 * Agent の model 実行能力を返す安全な view です。
 *
 * @remarks
 * Workers AI binding の有無、現在の default model policy、provider/model ID、状態だけを含めます。
 * credential、raw prompt、raw completion、hidden reasoning は含めず、Health/GetState の両方で同じ
 * secret-free metadata として利用します。
 */
export interface AgentModelExecutionCapabilityView {
  readonly bindingPresent: boolean;
  readonly checkedAtMs: number;
  readonly defaultPolicyDigest?: string;
  readonly defaultPolicyRef?: string;
  readonly modelId?: string;
  readonly provider?: string;
  readonly safeDetailRef?: string;
  readonly status: 'degraded' | 'serving' | 'unavailable';
}

/**
 * Shared context for Agent-local commands and sensitive queries.
 */
export interface AgentCoreRequestContext {
  readonly agentId: string;
  readonly bodyDigest: AgentRawBodyDigest;
  readonly causationId?: string;
  readonly correlationId?: string;
  readonly idempotencyKey?: string;
  readonly method: string;
  readonly nonce?: string;
  readonly principal: AgentPrincipalContext;
  readonly requestId?: string;
  readonly requestTimestampMs?: number;
  readonly requestedAtMs: number;
  readonly service: string;
}

/**
 * Initial Agent credential command input.
 */
export interface AgentCredentialCommandInput {
  readonly credentialId: string;
  readonly generation: number;
  readonly overlapSeconds?: number;
  readonly publicFingerprint?: string;
  readonly revokePrevious?: boolean;
  readonly verifierMaterialRef?: string;
}

/**
 * Agent configuration command input.
 */
export interface AgentConfigCommandInput {
  readonly budgetPolicyRef?: string;
  readonly configBodyRef?: string;
  readonly displayName?: string;
  readonly memoryPolicyRef?: string;
  readonly modelPolicyRef?: string;
  readonly schedulePolicyRef?: string;
  readonly toolPolicyRef?: string;
}

/**
 * InitializeAgent command accepted by the AIAgent Durable Object.
 */
export interface InitializeAgentCommand {
  readonly context: AgentCoreRequestContext;
  readonly credential: AgentCredentialCommandInput;
  readonly displayName?: string;
  readonly initialConfig: AgentConfigCommandInput;
  readonly initialModelPolicy?: AgentModelPolicyCommandInput;
  readonly registrationRequestDigest: string;
}

/**
 * AgentModelPolicyService と InitializeAgent seed が共有する policy 入力です。
 */
export interface AgentModelPolicyCommandInput {
  readonly budgetMetadataRef?: AgentPayloadMetadataView;
  readonly credentialReference?: string;
  readonly decisionSchemaVersion: string;
  readonly expectedPolicyDigest?: string;
  readonly generationParametersRef?: AgentPayloadMetadataView;
  readonly modelId: string;
  readonly policyRef: string;
  readonly provider: string;
  readonly safeMetadataRef?: AgentPayloadMetadataView;
  readonly safetyMetadataRef?: AgentPayloadMetadataView;
  readonly status?: string;
}

/**
 * RotateAgentCredential command accepted by the AIAgent Durable Object.
 */
export interface RotateAgentCredentialCommand {
  readonly context: AgentCoreRequestContext;
  readonly credential: AgentCredentialCommandInput;
}

/**
 * UpdateConfig command accepted by the AIAgent Durable Object.
 */
export interface UpdateAgentConfigCommand {
  readonly config: AgentConfigCommandInput;
  readonly context: AgentCoreRequestContext;
}

/**
 * DestroyAgent command accepted by the AIAgent Durable Object.
 */
export interface DestroyAgentCommand {
  readonly context: AgentCoreRequestContext;
  readonly reason?: string;
}

/**
 * Agent-scoped query accepted by the AIAgent Durable Object.
 */
export interface AgentScopedQuery {
  readonly context: AgentCoreRequestContext;
}

/**
 * PublishEvent command accepted by the AIAgent Durable Object.
 */
export interface PublishAgentEventCommand {
  readonly context: AgentCoreRequestContext;
  readonly deliveryContextId?: string;
  readonly eventType: string;
  readonly occurredAtMs?: number;
  readonly payload?: Uint8Array;
  readonly payloadContentType?: string;
  readonly payloadReference?: AgentPayloadMetadataView;
  readonly modelPolicyRef?: string;
  readonly source: string;
  readonly threadKey: string;
}

/**
 * GetEvent query accepted by the AIAgent Durable Object.
 */
export interface GetAgentEventQuery extends AgentScopedQuery {
  readonly eventId: string;
  readonly includePayload: boolean;
}

/**
 * ListEvents query accepted by the AIAgent Durable Object.
 */
export interface ListAgentEventsQuery extends AgentScopedQuery {
  readonly eventType?: string;
  readonly pageSize?: number;
  readonly pageToken?: string;
  readonly sectionId?: string;
  readonly threadId: string;
}

/**
 * ListThreads query accepted by the AIAgent Durable Object.
 */
export interface ListAgentThreadsQuery extends AgentScopedQuery {
  readonly pageCursorScope?: string;
  readonly pageSize?: number;
  readonly pageToken?: string;
  readonly status?: string;
  readonly threadKeyPrefix?: string;
}

/**
 * GetThread query accepted by the AIAgent Durable Object.
 */
export interface GetAgentThreadQuery extends AgentScopedQuery {
  readonly threadId: string;
}

/**
 * ListSections query accepted by the AIAgent Durable Object.
 */
export interface ListAgentSectionsQuery extends AgentScopedQuery {
  readonly endSectionOrdinal?: number;
  readonly pageCursorScope?: string;
  readonly pageSize?: number;
  readonly pageToken?: string;
  readonly startSectionOrdinal?: number;
  readonly threadId: string;
}

/**
 * AgentThreadService.GetLatestCompaction が Durable Object に渡す Thread-scoped query です。
 *
 * @property context 認証済み principal、request digest、Agent ID を含む実行文脈です。
 * @property threadId latest ready Compaction を取得する Thread ID です。
 *
 * @example
 * ```ts
 * const result = getLatestCompactionFromStore({
 *   agentId: 'agent-1',
 *   query: { context, threadId: 'thread-1' },
 *   repositories,
 * });
 * ```
 */
export interface GetLatestAgentThreadCompactionQuery extends AgentScopedQuery {
  readonly threadId: string;
}

/**
 * AgentThreadService.GetThreadMemory が Durable Object に渡す Thread-scoped query です。
 *
 * @property context 認証済み principal と Agent scope を含む実行文脈です。
 * @property threadId active ThreadMemory version を取得する Thread ID です。
 */
export interface GetAgentThreadMemoryQuery extends AgentScopedQuery {
  readonly threadId: string;
}

/**
 * AgentThreadService.SearchThreadHistory が Durable Object に渡す検索 query です。
 *
 * @property compactionId 特定 Compaction 由来の History に絞る任意 filter です。
 * @property endCreatedAtMs History index 作成時刻の終了境界です。
 * @property pageCursorScope Agent/Thread scope を検証する pagination cursor scope です。
 * @property pageSize 1 ページに返す最大件数です。
 * @property pageToken 前ページの最後に返された cursor token です。
 * @property provenanceContains provenance_ref に含まれる文字列で絞る任意 filter です。
 * @property query query_text に含まれる文字列で絞る任意 filter です。
 * @property sectionId 特定 Section 由来の History に絞る任意 filter です。
 * @property startCreatedAtMs History index 作成時刻の開始境界です。
 * @property threadId 検索対象 Thread ID です。
 */
export interface SearchAgentThreadHistoryQuery extends AgentScopedQuery {
  readonly compactionId?: string;
  readonly endCreatedAtMs?: number;
  readonly pageCursorScope?: string;
  readonly pageSize?: number;
  readonly pageToken?: string;
  readonly provenanceContains?: string;
  readonly query?: string;
  readonly sectionId?: string;
  readonly startCreatedAtMs?: number;
  readonly threadId: string;
}

/**
 * Safe Agent profile view returned by Agent-local operations.
 */
export interface AgentProfileView {
  readonly agentId: string;
  readonly capabilitySummaryRef?: string;
  readonly configVersion: number;
  readonly createdAtMs: number;
  readonly credentialGeneration: number;
  readonly displayName?: string;
  readonly latestAuditEventId?: string;
  readonly status: string;
  readonly systemThreadId: string;
  readonly updatedAtMs: number;
}

/**
 * Client registration reconciliation 用の Agent-owned initialization receipt です。
 *
 * @remarks
 * この値は初期化 command の固定 idempotency key と Client が正規化した registration intent digest だけを含みます。
 * credential、JWT、private key、request 本文は保持せず、GetAgent のserver-side照合にだけ使用します。
 * profileが存在するinitialized Agentでは必ず存在し、欠落した状態は成功responseへ変換してはいけません。
 *
 * @example
 * ```ts
 * const receipt: AgentInitializationReceiptView = {
 *   idempotencyKey: 'registration-1',
 *   registrationRequestDigest: 'sha256:...',
 * };
 * ```
 */
export interface AgentInitializationReceiptView {
  /**
   * 成功したInitializeAgent commandに指定されたidempotency keyです。
   *
   * この値は同一登録試行のreplayを識別するために使い、後続commandのkeyで上書きしません。
   */
  readonly idempotencyKey: string;

  /**
   * Clientが登録requestから固定した照合用digestです。
   *
   * 空白だけの値はdomain validationで拒否し、保存時は入力文字列をtrimせず完全一致で保持します。
   */
  readonly registrationRequestDigest: string;
}

/**
 * Safe Agent config view returned by Agent-local operations.
 */
export interface AgentConfigView {
  readonly agentId: string;
  readonly budgetPolicyRef?: string;
  readonly configBodyRef?: string;
  readonly configVersion: number;
  readonly defaultModelPolicy?: AgentModelPolicySummaryView;
  readonly displayName?: string;
  readonly memoryPolicyRef?: string;
  readonly modelPolicyRef?: string;
  readonly modelPolicyValidation?: AgentModelPolicyValidationView;
  readonly schedulePolicyRef?: string;
  readonly toolPolicyRef?: string;
  readonly updatedAtMs: number;
  readonly updatedByPrincipalId?: string;
}

/**
 * Safe Agent credential view returned by lifecycle operations.
 */
export interface AgentCredentialView {
  readonly agentId: string;
  readonly auditEventId?: string;
  readonly credentialId: string;
  readonly createdAtMs: number;
  readonly expiresAtMs?: number;
  readonly generation: number;
  readonly keyId?: string;
  readonly overlapUntilMs?: number;
  readonly publicFingerprint?: string;
  readonly revokedAtMs?: number;
  readonly status: string;
  readonly verifierMaterialRef?: string;
}

/**
 * Safe lifecycle audit view linked to the system Thread.
 */
export interface AgentAuditView {
  readonly agentId: string;
  readonly auditEventId: string;
  readonly correlationId?: string;
  readonly occurredAtMs: number;
  readonly operation: string;
  readonly principalId: string;
  readonly result: string;
  readonly safeDetailRef?: string;
  readonly systemThreadId: string;
}

/**
 * Capability summary owned by the Agent aggregate.
 */
export interface AgentCapabilitySummaryView {
  readonly activeInstallationCount: number;
  readonly activeScheduleCount: number;
  readonly adapterConnectionCount: number;
  readonly agentId: string;
  readonly deliveryCapabilityCount: number;
  readonly toolCount: number;
}

/**
 * Thread view returned after event acceptance.
 */
export interface AgentThreadView {
  readonly agentId: string;
  readonly createdAtMs: number;
  readonly currentSectionId?: string;
  readonly latestEventId?: string;
  readonly latestRunId?: string;
  readonly lastServedAtMs?: number;
  readonly normalizedThreadKey: string;
  readonly priority: number;
  readonly status: string;
  readonly threadId: string;
  readonly threadKey: string;
  readonly updatedAtMs: number;
}

/**
 * Thread Section view used by Event append internals.
 */
export interface AgentThreadSectionView {
  readonly agentId: string;
  readonly endThreadSequence?: number;
  readonly eventCount: number;
  readonly frozenAtMs?: number;
  readonly openedAtMs: number;
  readonly sectionId: string;
  readonly sectionOrdinal: number;
  readonly startThreadSequence: number;
  readonly status: string;
  readonly threadId: string;
}

/**
 * Safe Event payload metadata view.
 */
export interface AgentPayloadMetadataView {
  readonly byteSize: number;
  readonly contentType: string;
  readonly inlineBytes?: Uint8Array;
  readonly ref: string;
  readonly sha256: string;
  readonly storageClass: 'inline' | 'r2' | 'reference';
}

/**
 * Safe Agent Event view returned by Event commands and queries.
 */
export interface AgentEventView {
  readonly agentId: string;
  readonly agentSequence: number;
  readonly causationId?: string;
  readonly correlationId?: string;
  readonly deliveryContextId?: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly idempotencyKey?: string;
  readonly normalizedThreadKey: string;
  readonly occurredAtMs: number;
  readonly payloadMetadata?: AgentPayloadMetadataView;
  readonly payloadRef?: string;
  readonly policyOverrideSource?: string;
  readonly modelPolicy?: AgentModelPolicySummaryView;
  readonly modelPolicyValidation?: AgentModelPolicyValidationView;
  readonly requestedModelPolicyRef?: string;
  readonly runId?: string;
  readonly sectionId: string;
  readonly source: string;
  readonly threadId: string;
  readonly threadKey: string;
  readonly threadSequence: number;
}

/**
 * Pending Agent Run view created by mailbox semantics.
 */
export interface AgentRunView {
  readonly agentId: string;
  readonly pendingSinceMs?: number;
  readonly runId: string;
  readonly status: string;
  readonly threadId: string;
  readonly triggerEventId?: string;
}

/**
 * ready Compaction だけを公開 query へ返すための安全な ThreadCompaction view です。
 *
 * 出力 body そのものは含めず、再開や監査に必要な参照、digest、Thread/Section 所有情報だけを返します。
 */
export interface AgentThreadCompactionView {
  readonly agentId: string;
  readonly completedAtMs?: number;
  readonly compactionId: string;
  readonly compactionOrdinal: number;
  readonly digestSha256?: string;
  readonly endThreadSequence: number;
  readonly handoffRef?: string;
  readonly historyRef?: string;
  readonly memoryDeltaRef?: string;
  readonly sectionId: string;
  readonly sectionOrdinal: number;
  readonly startThreadSequence: number;
  readonly startedAtMs?: number;
  readonly status: string;
  readonly threadId: string;
}

/**
 * Compaction snapshot/output 参照を検証するための digest 付き metadata です。
 *
 * raw body を返さず、Agent/Thread/Compaction/Section の所有関係と digest だけを公開します。
 */
export interface AgentCompactionSnapshotReferenceView {
  readonly agentId: string;
  readonly compactionId: string;
  readonly digestSha256: string;
  readonly sectionId: string;
  readonly snapshotRef: string;
  readonly threadId: string;
}

/**
 * active ThreadMemory version の安全な snapshot view です。
 *
 * Memory body は参照だけを保持し、version、latest Compaction、rebase 状態を公開します。
 */
export interface AgentThreadMemoryView {
  readonly agentId: string;
  readonly itemCount: number;
  readonly latestCompactionId?: string;
  readonly memoryId: string;
  readonly memoryRef?: string;
  readonly rebaseStatus?: string;
  readonly snapshotRef?: string;
  readonly threadId: string;
  readonly updatedAtMs?: number;
  readonly version: number;
}

/**
 * ThreadMemory item の lineage/provenance を返す安全な view です。
 *
 * 本文の raw text は返さず、content_ref が存在する場合だけ digest 付き参照として公開します。
 */
export interface AgentThreadMemoryItemView {
  readonly agentId: string;
  readonly contentRef?: AgentPayloadMetadataView;
  readonly memoryId: string;
  readonly memoryItemId: string;
  readonly provenanceRef?: string;
  readonly status: string;
  readonly supersedesItemId?: string;
  readonly threadId: string;
}

/**
 * ThreadHistory search が返す digest 付き参照 view です。
 *
 * R2 body の raw bytes は返さず、History ref、body metadata、provenance、Compaction 所有情報を返します。
 */
export interface AgentThreadHistoryResultView {
  readonly agentId: string;
  readonly body?: AgentPayloadMetadataView;
  readonly compactionId?: string;
  readonly createdAtMs?: number;
  readonly historyId: string;
  readonly historyRef: string;
  readonly provenanceRef?: string;
  readonly sectionId?: string;
  readonly summary?: string;
  readonly threadId: string;
}

/**
 * Safe Agent state snapshot returned by Agent-local state queries.
 */
export interface AgentStateSnapshotView {
  readonly agentId: string;
  readonly capabilitySummary: AgentCapabilitySummaryView;
  readonly configVersion: number;
  readonly currentRunId?: string;
  readonly defaultModelPolicy?: AgentModelPolicySummaryView;
  readonly lifecycleStatus: string;
  readonly modelExecution?: AgentModelExecutionCapabilityView;
  readonly schedulerStatus: string;
  readonly stateRef?: string;
  readonly stateVersion: string;
  readonly storageStatus: string;
  readonly updatedAtMs: number;
}

/**
 * Safe storage threshold status for Agent-local operational snapshots.
 */
export interface AgentStorageThresholdStatusView {
  readonly agentId: string;
  readonly compactionPriorityPercent: number;
  readonly criticalPercent: number;
  readonly currentPercent: number;
  readonly forceLargeBodyR2Percent: number;
  readonly inlinePayloadLimitBytes: number;
  readonly warningPercent: number;
}

/**
 * Page metadata for scoped Agent-local query results.
 */
export interface AgentPageView {
  readonly cursorScope: string;
  readonly nextPageToken?: string;
  readonly resultCount: number;
}

/**
 * InitializeAgent result produced by Agent-local lifecycle handling.
 */
export interface InitializeAgentResult {
  readonly agent: AgentProfileView;
  readonly audit: AgentAuditView;
  readonly config: AgentConfigView;
  readonly credential: AgentCredentialView;
  readonly defaultModelPolicy?: AgentModelPolicySummaryView;
  readonly initializationReceipt: AgentInitializationReceiptView;
  readonly replayed: boolean;
  readonly threadKeyRule: {
    readonly normalizedThreadKey: string;
    readonly threadKey: string;
  };
}

/**
 * GetAgent result produced by Agent-local lifecycle query handling.
 */
export interface GetAgentResult {
  readonly activeCredential?: AgentCredentialView;
  readonly agent: AgentProfileView;
  readonly capabilitySummary: AgentCapabilitySummaryView;
  readonly config: AgentConfigView;
  readonly defaultModelPolicy?: AgentModelPolicySummaryView;
  readonly initializationReceipt: AgentInitializationReceiptView;
}

/**
 * DestroyAgent result produced by Agent-local lifecycle handling.
 */
export interface DestroyAgentResult {
  readonly agent: AgentProfileView;
  readonly audit: AgentAuditView;
  readonly outcome: string;
  readonly replayed: boolean;
}

/**
 * RotateAgentCredential result produced by Agent-local credential handling.
 */
export interface RotateAgentCredentialResult {
  readonly audit: AgentAuditView;
  readonly credential: AgentCredentialView;
  readonly previousCredential?: AgentCredentialView;
  readonly replayed: boolean;
}

/**
 * UpdateConfig result produced by Agent-local config handling.
 */
export interface UpdateAgentConfigResult {
  readonly audit: AgentAuditView;
  readonly config: AgentConfigView;
  readonly replayed: boolean;
}

/**
 * PublishEvent result produced by Agent-local Event acceptance.
 */
export interface PublishAgentEventResult {
  readonly accepted: boolean;
  readonly event: AgentEventView;
  readonly pendingRun: AgentRunView;
  readonly replayed: boolean;
  readonly thread: AgentThreadView;
}

/**
 * ListEvents result produced by Agent-local Event query handling.
 */
export interface ListAgentEventsResult {
  readonly events: readonly AgentEventView[];
  readonly page: AgentPageView;
}

/**
 * ListThreads result produced by Agent-local Thread query handling.
 */
export interface ListAgentThreadsResult {
  readonly page: AgentPageView;
  readonly threads: readonly AgentThreadView[];
}

/**
 * GetThread result produced by Agent-local Thread query handling.
 */
export interface GetAgentThreadResult {
  readonly currentSection?: AgentThreadSectionView;
  readonly latestEvent?: AgentEventView;
  readonly latestRun?: AgentRunView;
  readonly thread: AgentThreadView;
}

/**
 * ListSections result produced by Agent-local Section query handling.
 */
export interface ListAgentSectionsResult {
  readonly page: AgentPageView;
  readonly sections: readonly AgentThreadSectionView[];
}

/**
 * latest ready Compaction query の結果です。
 *
 * Compaction がまだ存在しない Thread では optional fields を省いた空結果を返します。
 */
export interface GetLatestAgentThreadCompactionResult {
  readonly compaction?: AgentThreadCompactionView;
  readonly snapshot?: AgentCompactionSnapshotReferenceView;
}

/**
 * active ThreadMemory query の結果です。
 *
 * usable な active version がない場合は `memory` を省き、`items` を空配列にします。
 */
export interface GetAgentThreadMemoryResult {
  readonly items: readonly AgentThreadMemoryItemView[];
  readonly memory?: AgentThreadMemoryView;
}

/**
 * ThreadHistory search の結果です。
 *
 * page は Agent/Thread scoped cursor を返し、results は ready Compaction 由来の History だけを含みます。
 */
export interface SearchAgentThreadHistoryResult {
  readonly page: AgentPageView;
  readonly results: readonly AgentThreadHistoryResultView[];
}

/**
 * GetState result produced by Agent-local state query handling.
 */
export interface GetAgentStateResult {
  readonly modelExecution?: AgentModelExecutionCapabilityView;
  readonly state: AgentStateSnapshotView;
  readonly storage: AgentStorageThresholdStatusView;
}
