import type {
  AgentHistoryIndexRow,
  AgentStorageRepositories,
  AgentThreadMemoryItemRow,
  AgentThreadMemoryVersionRow,
} from '../storage';

/**
 * Memory rebase を開始する理由を表す内部分類です。
 *
 * `compaction_count` は長期 Thread が一定数の Compaction を経た場合、
 * `memory_item_count` は active ThreadMemory の item 数が増えすぎた場合、
 * `token_estimate` は active ThreadMemory の概算 token 数が上限へ到達した場合、
 * `contradiction_count` は invalidate など矛盾解消操作が蓄積した場合、
 * `explicit_request` は運用者または harness が明示的に rebase を要求した場合に使います。
 */
export type ThreadMemoryRebaseTriggerReason =
  | 'compaction_count'
  | 'contradiction_count'
  | 'explicit_request'
  | 'memory_item_count'
  | 'token_estimate';

/**
 * Memory rebase の発火閾値をまとめる policy です。
 *
 * @property compactionCountThreshold Thread 内 Compaction 数がこの値以上なら rebase 対象にします。
 * @property contradictionCountThreshold active ThreadMemory 内の矛盾解消 item 数がこの値以上なら rebase 対象にします。
 * @property memoryItemCountThreshold active ThreadMemory item 数がこの値以上なら rebase 対象にします。
 * @property tokenEstimateThreshold active ThreadMemory 本文の概算 token 数がこの値以上なら rebase 対象にします。
 *
 * @example
 * ```ts
 * const policy: ThreadMemoryRebaseTriggerPolicy = {
 *   compactionCountThreshold: 50,
 *   contradictionCountThreshold: 3,
 *   memoryItemCountThreshold: 200,
 *   tokenEstimateThreshold: 32_000,
 * };
 * ```
 */
export interface ThreadMemoryRebaseTriggerPolicy {
  readonly compactionCountThreshold?: number;
  readonly contradictionCountThreshold?: number;
  readonly memoryItemCountThreshold?: number;
  readonly tokenEstimateThreshold?: number;
}

/**
 * 発火判定に使う ThreadMemory の現在状態です。
 *
 * @property compactionCount Thread 内で作成済みの Compaction 数です。
 * @property contradictionCount active ThreadMemory 内で矛盾解消を示す item 数です。
 * @property explicitRequest 運用者または harness が rebase を明示要求したかどうかです。
 * @property memoryItemCount active ThreadMemory version に属する item 数です。
 * @property tokenEstimate active ThreadMemory item 本文から見積もった token 数です。
 */
export interface ThreadMemoryRebaseTriggerState {
  readonly compactionCount: number;
  readonly contradictionCount: number;
  readonly explicitRequest: boolean;
  readonly memoryItemCount: number;
  readonly tokenEstimate: number;
}

/**
 * Memory rebase policy の評価結果です。
 *
 * @property reasons 閾値に到達した発火理由です。空の場合は rebase しません。
 * @property shouldRebase 少なくとも一つの発火理由がある場合に `true` です。
 * @property state 評価に使った観測値です。
 */
export interface ThreadMemoryRebaseTriggerEvaluation {
  readonly reasons: readonly ThreadMemoryRebaseTriggerReason[];
  readonly shouldRebase: boolean;
  readonly state: ThreadMemoryRebaseTriggerState;
}

/**
 * rebase provenance に保持する History 参照です。
 *
 * @property compactionId History を生成した Compaction ID です。
 * @property historyId History index の ID です。
 * @property historyRef 照会可能な History 参照です。
 * @property provenanceRef History index に保存済みの provenance 参照です。
 */
export interface ThreadMemoryRebaseHistoryReference {
  readonly compactionId: string | null;
  readonly historyId: string;
  readonly historyRef: string;
  readonly provenanceRef: string | null;
}

/**
 * Memory rebase 実行入力です。
 *
 * @property explicitRequest 閾値未到達でも明示要求として rebase を発火させるかどうかです。
 * @property historySearchLimit provenance に保持する History index の最大件数です。
 * @property memoryId 作成する新しい ThreadMemory version ID です。未指定時は Thread と version から導出します。
 * @property nowMs 書き込み timestamp です。
 * @property policy 自動 rebase の発火閾値です。
 * @property repositories Agent-owned storage repository set です。
 * @property requestProvenanceRef 明示要求や自動判定の根拠を示す安全な参照です。
 * @property threadId rebase 対象 Thread ID です。
 */
export interface ExecuteThreadMemoryRebaseInput {
  readonly explicitRequest?: boolean;
  readonly historySearchLimit?: number;
  readonly memoryId?: string;
  readonly nowMs: number;
  readonly policy?: ThreadMemoryRebaseTriggerPolicy;
  readonly repositories: AgentStorageRepositories;
  readonly requestProvenanceRef?: string;
  readonly threadId: string;
}

/**
 * Memory rebase が実行されなかった理由です。
 */
export type ThreadMemoryRebaseSkipReason = 'no_active_memory' | 'policy_not_triggered';

/**
 * Memory rebase の実行結果です。
 *
 * @property items 新 active version に copy-forward された item 群です。
 * @property priorVersion rebase 前に active だった ThreadMemory version です。
 * @property retainedHistoryRefs rebase provenance に保持した History 参照です。
 * @property skipReason rebase を実行しなかった場合の理由です。
 * @property status `rebased` は新 active version 作成済み、`skipped` は非実行です。
 * @property trigger rebase policy の評価結果です。
 * @property version 新しく active になった ThreadMemory version です。
 */
export interface ThreadMemoryRebaseExecutionResult {
  readonly items: readonly AgentThreadMemoryItemRow[];
  readonly priorVersion?: AgentThreadMemoryVersionRow;
  readonly retainedHistoryRefs: readonly ThreadMemoryRebaseHistoryReference[];
  readonly skipReason?: ThreadMemoryRebaseSkipReason;
  readonly status: 'rebased' | 'skipped';
  readonly trigger: ThreadMemoryRebaseTriggerEvaluation;
  readonly version?: AgentThreadMemoryVersionRow;
}

const defaultHistorySearchLimit = 500;

/**
 * repository の現在状態から Memory rebase 発火判定用の観測値を組み立てます。
 *
 * @param input Thread ID、明示要求フラグ、repository set を含む入力です。
 * @returns Compaction 数、Memory item 数、token 概算、矛盾数、明示要求フラグを返します。
 */
export function buildThreadMemoryRebaseTriggerState(input: {
  readonly explicitRequest?: boolean;
  readonly repositories: AgentStorageRepositories;
  readonly threadId: string;
}): ThreadMemoryRebaseTriggerState {
  // active version が存在する場合だけ item を読み、未作成 Thread でも安全に 0 件として扱います。
  const activeVersion = input.repositories.memory.findActiveThreadMemoryVersion(input.threadId);
  const activeItems = readActiveThreadMemoryItems(
    input.repositories,
    input.threadId,
    activeVersion
  );

  // Compaction ordinal は 1 始まりなので、次 ordinal から作成済み件数を導出します。
  const compactionCount = Math.max(
    0,
    input.repositories.compactions.getNextCompactionOrdinal(input.threadId) - 1
  );

  return {
    compactionCount,
    contradictionCount: countContradictoryMemoryItems(activeItems),
    explicitRequest: input.explicitRequest === true,
    memoryItemCount: activeItems.length,
    tokenEstimate: estimateThreadMemoryTokens(activeItems),
  };
}

/**
 * configured thresholds と現在状態から Memory rebase の発火理由を評価します。
 *
 * @param policy Compaction 数、item 数、token 概算、矛盾数の閾値です。
 * @param state repository から観測した現在状態です。
 * @returns rebase すべきかどうかと発火理由を返します。
 */
export function evaluateThreadMemoryRebaseTriggerPolicy(
  policy: ThreadMemoryRebaseTriggerPolicy,
  state: ThreadMemoryRebaseTriggerState
): ThreadMemoryRebaseTriggerEvaluation {
  // 理由は threshold の意味順で固定し、監査ログや test の比較を安定させます。
  const reasons: ThreadMemoryRebaseTriggerReason[] = [];
  appendThresholdReason(
    reasons,
    'compaction_count',
    state.compactionCount,
    policy.compactionCountThreshold
  );
  appendThresholdReason(
    reasons,
    'memory_item_count',
    state.memoryItemCount,
    policy.memoryItemCountThreshold
  );
  appendThresholdReason(
    reasons,
    'token_estimate',
    state.tokenEstimate,
    policy.tokenEstimateThreshold
  );
  appendThresholdReason(
    reasons,
    'contradiction_count',
    state.contradictionCount,
    policy.contradictionCountThreshold
  );
  if (state.explicitRequest) reasons.push('explicit_request');

  return { reasons, shouldRebase: reasons.length > 0, state };
}

/**
 * active ThreadMemory を retained History/provenance に基づく新 version へ rebase します。
 *
 * @param input Thread ID、policy、timestamp、repository set を含む実行入力です。
 * @returns rebase 済みの新 active version、copy-forward item、retained History refs を返します。
 */
export function executeThreadMemoryRebase(
  input: ExecuteThreadMemoryRebaseInput
): ThreadMemoryRebaseExecutionResult {
  // 実行前に発火状態を評価し、閾値未到達なら旧 active version を一切変更しません。
  const trigger = evaluateThreadMemoryRebaseTriggerPolicy(
    input.policy ?? {},
    buildThreadMemoryRebaseTriggerState(input)
  );
  if (!trigger.shouldRebase) return createSkippedRebaseResult(trigger, 'policy_not_triggered');

  return input.repositories.transaction((repositories) => {
    // transaction 内で active version を読み直し、rebase と同時に進んだ更新を silent overwrite しません。
    const activeVersion = repositories.memory.findActiveThreadMemoryVersion(input.threadId);
    if (activeVersion === undefined) {
      return createSkippedRebaseResult(trigger, 'no_active_memory');
    }

    const previousItems = repositories.memory.listThreadMemoryItems(
      input.threadId,
      activeVersion.memoryId
    );
    const retainedHistoryRefs = listRetainedHistoryReferences(
      repositories,
      input.threadId,
      input.historySearchLimit ?? defaultHistorySearchLimit
    );
    const nextVersion = activeVersion.version + 1;
    const nextMemoryId =
      input.memoryId ?? `thread-memory://${input.threadId}/v${String(nextVersion)}`;
    const latestReadyCompaction = repositories.compactions.findLatestReadyCompaction(
      input.threadId
    );

    // 旧 active version は削除せず superseded へ遷移し、過去 Run と lineage の説明可能性を残します。
    repositories.memory.updateThreadMemoryVersionStatus({
      memoryId: activeVersion.memoryId,
      status: 'superseded',
      threadId: input.threadId,
      updatedAtMs: input.nowMs,
    });

    const version = repositories.memory.createThreadMemoryVersion({
      createdAtMs: input.nowMs,
      itemCount: previousItems.length,
      latestCompactionId:
        latestReadyCompaction?.compactionId ?? activeVersion.latestCompactionId ?? undefined,
      memoryId: nextMemoryId,
      memoryRef: `thread-memory://${input.threadId}/v${String(nextVersion)}`,
      provenanceRef: createRebaseProvenanceRef({
        activeVersion,
        requestProvenanceRef: input.requestProvenanceRef,
        retainedHistoryRefs,
        trigger,
      }),
      rebaseStatus: 'rebased',
      snapshotRef: `thread-memory-rebase://${input.threadId}/from/v${String(
        activeVersion.version
      )}/to/v${String(nextVersion)}`,
      status: 'active',
      threadId: input.threadId,
      version: nextVersion,
    });

    // current active item を status/lineage/provenance ごと新 version へ copy-forward し、旧 version は監査用に残します。
    const items = previousItems.map((item) =>
      copyThreadMemoryItemToRebasedVersion(repositories, item, nextMemoryId, input.nowMs)
    );

    return {
      items,
      priorVersion: activeVersion,
      retainedHistoryRefs,
      status: 'rebased',
      trigger,
      version,
    };
  });
}

function readActiveThreadMemoryItems(
  repositories: AgentStorageRepositories,
  threadId: string,
  activeVersion: AgentThreadMemoryVersionRow | undefined
): readonly AgentThreadMemoryItemRow[] {
  if (activeVersion === undefined) return [];
  return repositories.memory.listThreadMemoryItems(threadId, activeVersion.memoryId);
}

function appendThresholdReason(
  reasons: ThreadMemoryRebaseTriggerReason[],
  reason: ThreadMemoryRebaseTriggerReason,
  actual: number,
  threshold: number | undefined
): void {
  if (threshold === undefined) return;
  if (actual >= threshold) reasons.push(reason);
}

function estimateThreadMemoryTokens(items: readonly AgentThreadMemoryItemRow[]): number {
  // 日本語と英数字が混ざる本文でも安全側に倒すため、4 文字を 1 token とする粗い上限見積もりにします。
  return items.reduce((total, item) => total + Math.ceil((item.contentText?.length ?? 0) / 4), 0);
}

function countContradictoryMemoryItems(items: readonly AgentThreadMemoryItemRow[]): number {
  // invalidate operation は矛盾解消の明示的な痕跡なので、status と lineage field のどちらでも検出します。
  return items.filter((item) => item.status === 'invalidated' || item.invalidatesItemId !== null)
    .length;
}

function listRetainedHistoryReferences(
  repositories: AgentStorageRepositories,
  threadId: string,
  limit: number
): readonly ThreadMemoryRebaseHistoryReference[] {
  // History body は直接展開せず、Agent-owned index の安全な参照と provenance だけを新 version に結びます。
  return repositories.history
    .searchHistoryIndexes({ limit, threadId })
    .map((history) => createRebaseHistoryReference(history));
}

function createRebaseHistoryReference(
  history: AgentHistoryIndexRow
): ThreadMemoryRebaseHistoryReference {
  return {
    compactionId: history.compactionId,
    historyId: history.historyId,
    historyRef: history.historyRef,
    provenanceRef: history.provenanceRef,
  };
}

function createRebaseProvenanceRef(input: {
  readonly activeVersion: AgentThreadMemoryVersionRow;
  readonly requestProvenanceRef?: string;
  readonly retainedHistoryRefs: readonly ThreadMemoryRebaseHistoryReference[];
  readonly trigger: ThreadMemoryRebaseTriggerEvaluation;
}): string {
  // provenance は prior version と retained History refs を一つの監査可能な JSON 参照として保持します。
  return JSON.stringify({
    priorMemoryId: input.activeVersion.memoryId,
    priorProvenanceRef: input.activeVersion.provenanceRef,
    priorVersion: input.activeVersion.version,
    requestProvenanceRef: input.requestProvenanceRef ?? null,
    retainedHistoryRefs: input.retainedHistoryRefs,
    schema: 'cftamac.agent.thread-memory-rebase.v1',
    triggerReasons: input.trigger.reasons,
  });
}

function copyThreadMemoryItemToRebasedVersion(
  repositories: AgentStorageRepositories,
  item: AgentThreadMemoryItemRow,
  nextMemoryId: string,
  nowMs: number
): AgentThreadMemoryItemRow {
  // item ID と lineage field を維持し、active/confirmed/revised/superseded/invalidated の説明可能性を保ちます。
  return repositories.memory.insertThreadMemoryItem({
    contentRef: item.contentRef ?? undefined,
    contentSha256: item.contentSha256 ?? undefined,
    contentText: item.contentText ?? undefined,
    createdAtMs: nowMs,
    invalidatesItemId: item.invalidatesItemId ?? undefined,
    memoryId: nextMemoryId,
    memoryItemId: item.memoryItemId,
    provenanceRef: item.provenanceRef ?? undefined,
    sourceCompactionId: item.sourceCompactionId ?? undefined,
    sourceEventId: item.sourceEventId ?? undefined,
    sourceHistoryId: item.sourceHistoryId ?? undefined,
    status: item.status,
    supersedesItemId: item.supersedesItemId ?? undefined,
    threadId: item.threadId,
  });
}

function createSkippedRebaseResult(
  trigger: ThreadMemoryRebaseTriggerEvaluation,
  skipReason: ThreadMemoryRebaseSkipReason
): ThreadMemoryRebaseExecutionResult {
  return {
    items: [],
    retainedHistoryRefs: [],
    skipReason,
    status: 'skipped',
    trigger,
  };
}
