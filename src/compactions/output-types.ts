import type {
  AgentHistoryIndexRow,
  AgentImmutableBlobWriter,
  AgentStorageRepositories,
  AgentThreadCompactionRow,
  AgentThreadMemoryItemRow,
  AgentThreadMemoryVersionRow,
} from '../storage';

/**
 * Handoff と ThreadHistory に記録する判断 trace です。
 *
 * @property actor 判断した主体です。未指定の場合は Agent 自身の判断として扱います。
 * @property decision 外部から検証できる判断内容です。
 * @property rationale 判断理由です。内部 chain-of-thought ではなく、利用者へ公開できる理由を入れます。
 * @property consideredOptions 検討した代替案です。
 */
export interface CompactionDecisionTrace {
  readonly actor?: string;
  readonly consideredOptions?: readonly string[];
  readonly decision: string;
  readonly rationale: string;
}

/**
 * Compaction が成功時に保存する Handoff 入力です。
 *
 * @property activeIntentions 現在有効な意図の一覧です。
 * @property constraints 継続時に守るべき制約です。
 * @property currentGoals 現在の目標です。
 * @property decisionsAndRationale 判断と明示的理由です。
 * @property expectedNextActions 次に実行すべき行動候補です。
 * @property historyReferences 重要な ThreadHistory 参照です。commit 時に今回の History ref も補完されます。
 * @property openLoops 閉じていない作業・確認事項です。
 * @property pendingQuestions 未解決質問です。
 * @property situation 再開時に最初に読む状況説明です。
 */
export interface CompactionHandoffOutput {
  readonly activeIntentions: readonly string[];
  readonly constraints: readonly string[];
  readonly currentGoals: readonly string[];
  readonly decisionsAndRationale: readonly CompactionDecisionTrace[];
  readonly expectedNextActions: readonly string[];
  readonly historyReferences: readonly string[];
  readonly openLoops: readonly string[];
  readonly pendingQuestions: readonly string[];
  readonly situation: string;
}

/**
 * Compaction が成功時に保存する ThreadHistory 入力です。
 *
 * @property actorIntentions Event 範囲内で観測できる主体ごとの意図です。
 * @property artifacts 生成・参照された成果物です。
 * @property assumptions 判断に使った前提です。
 * @property chronology 時系列の経緯です。
 * @property consideredOptions 検討した選択肢です。
 * @property decisions 判断 trace です。
 * @property explicitRationale 外部検証可能な理由一覧です。
 * @property replayManifest 再現に必要な Event/Run/Tool 参照 manifest です。
 * @property summary 検索 index に保存する短い要約です。
 * @property toolActivity Tool 活動の概要です。
 * @property unresolvedIssues 未解決の問題です。
 */
export interface CompactionThreadHistoryOutput {
  readonly actorIntentions: readonly string[];
  readonly artifacts: readonly string[];
  readonly assumptions: readonly string[];
  readonly chronology: readonly string[];
  readonly consideredOptions: readonly string[];
  readonly decisions: readonly CompactionDecisionTrace[];
  readonly explicitRationale: readonly string[];
  readonly replayManifest: readonly string[];
  readonly summary: string;
  readonly toolActivity: readonly string[];
  readonly unresolvedIssues: readonly string[];
}

/**
 * ThreadMemoryDelta が支援する operation 種別です。
 */
export type ThreadMemoryDeltaOperationKind =
  | 'add'
  | 'confirm'
  | 'revise'
  | 'supersede'
  | 'invalidate';

/**
 * ThreadMemoryDelta の単一 operation です。
 *
 * @property contentText 新規または更新後の Memory 本文です。
 * @property kind add/confirm/revise/supersede/invalidate のいずれかです。
 * @property memoryItemId 新しい Memory version 内で作成する item ID です。
 * @property provenanceRef operation の根拠を示す安全な参照です。
 * @property rationale operation の公開可能な理由です。
 * @property sourceEventId 根拠 Event ID です。
 * @property targetMemoryItemId confirm/revise/supersede/invalidate の対象 item ID です。
 */
export interface ThreadMemoryDeltaOperationInput {
  readonly contentText?: string;
  readonly kind: ThreadMemoryDeltaOperationKind;
  readonly memoryItemId: string;
  readonly provenanceRef: string;
  readonly rationale?: string;
  readonly sourceEventId?: string;
  readonly targetMemoryItemId?: string;
}

/**
 * Compaction 成功時に適用する ThreadMemoryDelta 入力です。
 *
 * @property operations versioned ThreadMemory に適用する operation 一覧です。
 * @property provenanceRef Delta 全体の根拠参照です。
 */
export interface ThreadMemoryDeltaInput {
  readonly operations: readonly ThreadMemoryDeltaOperationInput[];
  readonly provenanceRef: string;
}

/**
 * Handoff/History/MemoryDelta を一つの Compaction 成功 transaction として保存する入力です。
 *
 * @property compactionId 成功させる running Compaction ID です。
 * @property agentId Compaction と R2 object key を所有する Agent aggregate ID です。
 * @property blobWriter 大きな History body を Agent-owned R2 へ保存する writer です。R2 offload が必要な場合に必須です。
 * @property handoff 再開用 Handoff body です。
 * @property history 詳細 ThreadHistory body です。
 * @property historyId 保存する ThreadHistory index ID です。
 * @property historyRef 保存する ThreadHistory 参照です。未指定時は `history://<historyId>` を使います。
 * @property memoryDelta ThreadMemoryDelta operation 群です。
 * @property memoryId 作成する ThreadMemory version ID です。未指定時は Thread と version から導出します。
 * @property nowMs 書き込み timestamp です。
 * @property provenanceRef Compaction 成功出力全体の provenance 参照です。
 * @property repositories Agent-owned storage repository set です。
 * @property storageUsagePercent Durable Object SQLite 使用率です。90% 以上では大容量 body の R2 強制、95% 以上では compact/export 優先 policy を確認します。
 */
export interface CommitSuccessfulThreadCompactionInput {
  readonly agentId: string;
  readonly blobWriter?: AgentImmutableBlobWriter;
  readonly compactionId: string;
  readonly handoff: CompactionHandoffOutput;
  readonly history: CompactionThreadHistoryOutput;
  readonly historyId: string;
  readonly historyRef?: string;
  readonly memoryDelta: ThreadMemoryDeltaInput;
  readonly memoryId?: string;
  readonly nowMs: number;
  readonly provenanceRef: string;
  readonly repositories: AgentStorageRepositories;
  readonly storageUsagePercent?: number;
}

/**
 * Compaction 成功 transaction の永続化結果です。
 *
 * @property compaction ready へ遷移した Compaction row です。
 * @property historyIndex 保存された ThreadHistory index です。
 * @property memoryItems 新しい ThreadMemory version に属する item 一覧です。
 * @property memoryVersion 新しく active になった ThreadMemory version です。
 */
export interface CommitSuccessfulThreadCompactionResult {
  readonly compaction: AgentThreadCompactionRow;
  readonly historyIndex: AgentHistoryIndexRow;
  readonly memoryItems: readonly AgentThreadMemoryItemRow[];
  readonly memoryVersion: AgentThreadMemoryVersionRow;
}
