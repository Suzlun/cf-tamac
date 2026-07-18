import {
  toBrowserSafePageInfo,
  toBrowserSafePayloadReference,
  toOptionalString,
  toSafeNumber,
  toSafeRecord,
  toSafeString,
  toSafeStringFromInt64,
  type BrowserSafePageInput,
  type BrowserSafePageInfo,
  type BrowserSafePayloadReference,
} from '../browser-safe-helpers';

/**
 * Thread 一覧 RPC の filter と cursor 入力。
 *
 * @remarks Agent/Thread scope は Server Action 側で固定し、Client D1 へ保存しない。
 */
export interface ListThreadsOptions {
  readonly status?: string;
  readonly threadKeyPrefix?: string;
  readonly page?: BrowserSafePageInput;
}

/**
 * Event 一覧 RPC の Thread-scoped filter と cursor 入力。
 *
 * @remarks `threadId` を必須にして、Agent 横断または Thread 横断の Event 一覧を作らない。
 */
export interface ListEventsOptions {
  readonly threadId: string;
  readonly eventType?: string;
  readonly sectionId?: string;
  readonly page?: BrowserSafePageInput;
}

/**
 * Run 一覧 RPC の Agent/Thread-scoped filter と cursor 入力。
 *
 * @remarks status と Thread の絞り込みだけを Browser から受け、RPC client 自体は渡さない。
 */
export interface ListRunsOptions {
  readonly threadId?: string;
  readonly status?: string;
  readonly page?: BrowserSafePageInput;
}

/**
 * Thread History 検索 RPC の filter と cursor 入力。
 *
 * @remarks R2 body は取得せず、History index と参照メタデータだけを Browser へ返す。
 */
export interface SearchThreadHistoryOptions {
  readonly page?: BrowserSafePageInput;
  readonly sectionId?: string;
  readonly compactionId?: string;
  readonly provenanceContains?: string;
}

/**
 * Browser-safe Thread list item.
 *
 * @remarks Agent-owned Thread metadata のみを含み、Client D1 snapshot として永続化しない。
 */
export interface BrowserSafeThreadSummary {
  readonly threadId: string;
  readonly threadKey: string;
  readonly status: string;
  readonly currentSectionId?: string;
  readonly latestEventId?: string;
  readonly latestRunId?: string;
  readonly updatedAtUnixMs: string;
  readonly snapshotRef?: string;
}

/**
 * Browser-safe Thread Section summary.
 *
 * @remarks Section sequence は文字列化し、BigInt を Browser 境界へ直接渡さない。
 */
export interface BrowserSafeThreadSectionSummary {
  readonly sectionId: string;
  readonly status: string;
  readonly sectionOrdinal: number;
  readonly startThreadSequence: string;
  readonly endThreadSequence?: string;
  readonly latestCompactionId?: string;
  readonly eventCount: number;
}

/**
 * Browser-safe Thread detail.
 *
 * @remarks latest Event / Run は安全化済み要約だけを含む。
 */
export interface BrowserSafeThreadDetail {
  readonly threadId: string;
  readonly threadKey: string;
  readonly status: string;
  readonly currentSection?: BrowserSafeThreadSectionSummary;
  readonly latestEvent?: BrowserSafeEventSummary;
  readonly latestRun?: BrowserSafeRunSummary;
}

/**
 * Browser-safe Event list item.
 *
 * @remarks payload は inline body を返さず、R2 参照メタデータだけを含める。
 */
export interface BrowserSafeEventSummary {
  readonly eventId: string;
  readonly threadId: string;
  readonly sectionId: string;
  readonly agentSequence: string;
  readonly threadSequence: string;
  readonly eventType: string;
  readonly source: string;
  readonly occurredAtUnixMs: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly runId?: string;
  readonly payloadRef?: string;
  readonly payloadMetadata?: BrowserSafePayloadReference;
}

/**
 * Browser-safe Run summary.
 *
 * @remarks immutable snapshot reference と causal link だけを表示用に返す。
 */
export interface BrowserSafeRunSummary {
  readonly runId: string;
  readonly status: string;
  readonly threadId?: string;
  readonly triggerEventId?: string;
  readonly sectionId?: string;
  readonly startedAtUnixMs?: string;
  readonly finishedAtUnixMs?: string;
  readonly configVersion?: string;
  readonly toolSetVersion?: string;
  readonly integrationVersion?: string;
  readonly snapshotRef?: string;
  readonly safeErrorMessage?: string;
}

/**
 * Browser-safe Run input snapshot metadata.
 *
 * @remarks Context Builder が使った sequence と version を文字列で保持する。
 */
export interface BrowserSafeRunInputSnapshot {
  readonly runInputId: string;
  readonly triggerEventId: string;
  readonly triggerStartThreadSequence: string;
  readonly triggerEndThreadSequence: string;
  readonly threadMemoryVersion?: string;
  readonly latestReadyCompactionId?: string;
  readonly uncompactedUpperThreadSequence?: string;
  readonly configVersion: string;
  readonly toolSetVersion?: string;
  readonly integrationInstallationVersion?: string;
  readonly stateSnapshotRef?: string;
}

/**
 * Browser-safe Run snapshot reference.
 *
 * @remarks Snapshot body は返さず、digest と参照だけを表示する。
 */
export interface BrowserSafeRunSnapshotReference {
  readonly snapshotRef: string;
  readonly threadId: string;
  readonly runId: string;
  readonly createdAtUnixMs: string;
  readonly digestSha256: string;
}

/**
 * Browser-safe Run detail.
 *
 * @remarks Run record、input snapshot、snapshot reference を Browser-safe 型へ分解する。
 */
export interface BrowserSafeRunDetail extends BrowserSafeRunSummary {
  readonly input?: BrowserSafeRunInputSnapshot;
  readonly snapshot?: BrowserSafeRunSnapshotReference;
}

/**
 * Browser-safe Compaction detail.
 *
 * @remarks Handoff/History/MemoryDelta は参照と digest のみを含める。
 */
export interface BrowserSafeCompactionDetail {
  readonly compactionId?: string;
  readonly status?: string;
  readonly threadId?: string;
  readonly sectionId?: string;
  readonly handoffRef?: string;
  readonly historyRef?: string;
  readonly memoryDeltaRef?: string;
  readonly digestSha256?: string;
  readonly compactionOrdinal?: number;
  readonly sectionOrdinal?: number;
  readonly startThreadSequence?: string;
  readonly endThreadSequence?: string;
  readonly snapshot?: BrowserSafeCompactionSnapshotReference;
}

/**
 * Browser-safe Compaction snapshot reference.
 *
 * @remarks Snapshot body は Browser へ返さず、R2/DO index の参照情報のみを返す。
 */
export interface BrowserSafeCompactionSnapshotReference {
  readonly snapshotRef: string;
  readonly threadId: string;
  readonly compactionId: string;
  readonly sectionId: string;
  readonly digestSha256: string;
}

/**
 * Browser-safe Thread memory item.
 *
 * @remarks provenance と supersede lineage を明示し、Memory 本文は ref のみを表示する。
 */
export interface BrowserSafeThreadMemoryItem {
  readonly memoryItemId: string;
  readonly status: string;
  readonly contentRef?: BrowserSafePayloadReference;
  readonly provenanceRef?: string;
  readonly supersedesItemId?: string;
}

/**
 * Browser-safe Thread memory detail.
 *
 * @remarks active version、snapshot ref、rebase 状態を含むが、本文 blob は返さない。
 */
export interface BrowserSafeThreadMemoryDetail {
  readonly memoryId?: string;
  readonly version?: string;
  readonly itemCount: number;
  readonly memoryRef?: string;
  readonly snapshotRef?: string;
  readonly latestCompactionId?: string;
  readonly rebaseStatus?: string;
  readonly updatedAtUnixMs?: string;
  readonly items: readonly BrowserSafeThreadMemoryItem[];
}

/**
 * Browser-safe History search item.
 *
 * @remarks History body は inline 表示せず、R2 参照メタデータと provenance のみを返す。
 */
export interface BrowserSafeThreadHistoryItem {
  readonly historyId: string;
  readonly historyRef: string;
  readonly sectionId?: string;
  readonly compactionId?: string;
  readonly summary?: string;
  readonly body?: BrowserSafePayloadReference;
  readonly provenanceRef?: string;
  readonly createdAtUnixMs?: string;
}

/**
 * Browser-safe Thread history search result.
 *
 * @remarks cursor metadata を含め、Load more を Agent-scoped に保つ。
 */
export interface BrowserSafeThreadHistoryResult {
  readonly items: readonly BrowserSafeThreadHistoryItem[];
  readonly page: BrowserSafePageInfo;
}

/** AgentThreadService.ListThreads response を Browser-safe summary へ変換する。 */
export function toBrowserSafeThreadSummary(thread: unknown): BrowserSafeThreadSummary {
  const record = toSafeRecord(thread);
  return {
    threadId: toSafeString(record?.threadId),
    threadKey: toSafeString(record?.threadKey),
    status: toSafeString(record?.status),
    currentSectionId: toOptionalString(record?.currentSectionId),
    latestEventId: toOptionalString(record?.latestEventId),
    latestRunId: toOptionalString(record?.latestRunId),
    updatedAtUnixMs: toSafeStringFromInt64(record?.updatedAtUnixMs),
    snapshotRef: toOptionalString(record?.snapshotRef),
  };
}

/** AgentThreadService.GetThread response の section metadata を Browser-safe summary へ変換する。 */
export function toBrowserSafeThreadSection(
  section: unknown
): BrowserSafeThreadSectionSummary | undefined {
  const record = toSafeRecord(section);
  if (record === undefined) {
    return undefined;
  }
  return {
    sectionId: toSafeString(record.sectionId),
    status: toSafeString(record.status),
    sectionOrdinal: toSafeNumber(record.sectionOrdinal),
    startThreadSequence: toSafeStringFromInt64(record.startThreadSequence),
    endThreadSequence: toOptionalInt64String(record.endThreadSequence),
    latestCompactionId: toOptionalString(record.latestCompactionId),
    eventCount: toSafeNumber(record.eventCount),
  };
}

/** AgentEventService.ListEvents response を Browser-safe summary へ変換する。 */
export function toBrowserSafeEventSummary(event: unknown): BrowserSafeEventSummary {
  const record = toSafeRecord(event);
  return {
    eventId: toSafeString(record?.eventId),
    threadId: toSafeString(record?.threadId),
    sectionId: toSafeString(record?.sectionId),
    agentSequence: toSafeStringFromInt64(record?.agentSequence),
    threadSequence: toSafeStringFromInt64(record?.threadSequence),
    eventType: toSafeString(record?.eventType),
    source: toSafeString(record?.source),
    occurredAtUnixMs: toSafeStringFromInt64(record?.occurredAtUnixMs),
    correlationId: toOptionalString(record?.correlationId),
    causationId: toOptionalString(record?.causationId),
    runId: toOptionalString(record?.runId),
    payloadRef: toOptionalString(record?.payloadRef),
    payloadMetadata: toBrowserSafePayloadReference(record?.payloadMetadata),
  };
}

/** AgentRunService の run metadata を Browser-safe summary へ変換する。 */
export function toBrowserSafeRunSummary(
  run: unknown,
  fallbackRunId = '',
  fallbackStatus = ''
): BrowserSafeRunSummary {
  const record = toSafeRecord(run);
  const safeError = toSafeRecord(record?.safeError);
  return {
    runId: toSafeString(record?.runId, fallbackRunId),
    status: toSafeString(record?.status, fallbackStatus),
    threadId: toOptionalString(record?.threadId),
    triggerEventId: toOptionalString(record?.triggerEventId),
    sectionId: toOptionalString(record?.sectionId),
    startedAtUnixMs: toOptionalInt64String(record?.startedAtUnixMs),
    finishedAtUnixMs: toOptionalInt64String(record?.finishedAtUnixMs),
    configVersion: toOptionalString(record?.configVersion),
    toolSetVersion: toOptionalString(record?.toolSetVersion),
    integrationVersion: toOptionalString(record?.integrationVersion),
    snapshotRef: toOptionalString(record?.snapshotRef),
    safeErrorMessage: toOptionalString(safeError?.message),
  };
}

/** AgentRunService.GetRun response の input snapshot を Browser-safe metadata へ変換する。 */
export function toBrowserSafeRunInput(input: unknown): BrowserSafeRunInputSnapshot | undefined {
  const record = toSafeRecord(input);
  if (record === undefined) {
    return undefined;
  }
  return {
    runInputId: toSafeString(record.runInputId),
    triggerEventId: toSafeString(record.triggerEventId),
    triggerStartThreadSequence: toSafeStringFromInt64(record.triggerStartThreadSequence),
    triggerEndThreadSequence: toSafeStringFromInt64(record.triggerEndThreadSequence),
    threadMemoryVersion: toOptionalString(record.threadMemoryVersion),
    latestReadyCompactionId: toOptionalString(record.latestReadyCompactionId),
    uncompactedUpperThreadSequence: toOptionalInt64String(record.uncompactedUpperThreadSequence),
    configVersion: toSafeString(record.configVersion),
    toolSetVersion: toOptionalString(record.toolSetVersion),
    integrationInstallationVersion: toOptionalString(record.integrationInstallationVersion),
    stateSnapshotRef: toOptionalString(record.stateSnapshotRef),
  };
}

/** AgentRunService.GetRun response の snapshot reference を Browser-safe metadata へ変換する。 */
export function toBrowserSafeRunSnapshot(
  snapshot: unknown
): BrowserSafeRunSnapshotReference | undefined {
  const record = toSafeRecord(snapshot);
  if (record === undefined) {
    return undefined;
  }
  return {
    snapshotRef: toSafeString(record.snapshotRef),
    threadId: toSafeString(record.threadId),
    runId: toSafeString(record.runId),
    createdAtUnixMs: toSafeStringFromInt64(record.createdAtUnixMs),
    digestSha256: toSafeString(record.digestSha256),
  };
}

/** AgentThreadService.GetLatestCompaction response を Browser-safe detail へ変換する。 */
export function toBrowserSafeCompaction(
  compaction: unknown,
  snapshot: unknown
): BrowserSafeCompactionDetail {
  const record = toSafeRecord(compaction);
  return {
    compactionId: toOptionalString(record?.compactionId),
    status: toOptionalString(record?.status),
    threadId: toOptionalString(record?.threadId),
    sectionId: toOptionalString(record?.sectionId),
    handoffRef: toOptionalString(record?.handoffRef),
    historyRef: toOptionalString(record?.historyRef),
    memoryDeltaRef: toOptionalString(record?.memoryDeltaRef),
    digestSha256: toOptionalString(record?.digestSha256),
    compactionOrdinal: toOptionalNumber(record?.compactionOrdinal),
    sectionOrdinal: toOptionalNumber(record?.sectionOrdinal),
    startThreadSequence: toOptionalInt64String(record?.startThreadSequence),
    endThreadSequence: toOptionalInt64String(record?.endThreadSequence),
    snapshot: toBrowserSafeCompactionSnapshot(snapshot),
  };
}

/** AgentThreadService.GetThreadMemory response の Memory item を Browser-safe metadata へ変換する。 */
export function toBrowserSafeThreadMemoryItem(item: unknown): BrowserSafeThreadMemoryItem {
  const record = toSafeRecord(item);
  return {
    memoryItemId: toSafeString(record?.memoryItemId),
    status: toSafeString(record?.status),
    contentRef: toBrowserSafePayloadReference(record?.contentRef),
    provenanceRef: toOptionalString(record?.provenanceRef),
    supersedesItemId: toOptionalString(record?.supersedesItemId),
  };
}

/** AgentThreadService.SearchThreadHistory response の search item を Browser-safe metadata へ変換する。 */
export function toBrowserSafeHistoryItem(result: unknown): BrowserSafeThreadHistoryItem {
  const record = toSafeRecord(result);
  return {
    historyId: toSafeString(record?.historyId),
    historyRef: toSafeString(record?.historyRef),
    sectionId: toOptionalString(record?.sectionId),
    compactionId: toOptionalString(record?.compactionId),
    summary: toOptionalString(record?.summary),
    body: toBrowserSafePayloadReference(record?.body),
    provenanceRef: toOptionalString(record?.provenanceRef),
    createdAtUnixMs: toOptionalInt64String(record?.createdAtUnixMs),
  };
}

/** Agent RPC の page response を Browser-safe cursor metadata へ変換する。 */
export { toBrowserSafePageInfo };

function toOptionalInt64String(value: unknown): string | undefined {
  const converted = toSafeStringFromInt64(value);
  return converted === '' ? undefined : converted;
}

function toBrowserSafeCompactionSnapshot(
  snapshot: unknown
): BrowserSafeCompactionSnapshotReference | undefined {
  const record = toSafeRecord(snapshot);
  if (record === undefined) {
    return undefined;
  }
  return {
    snapshotRef: toSafeString(record.snapshotRef),
    threadId: toSafeString(record.threadId),
    compactionId: toSafeString(record.compactionId),
    sectionId: toSafeString(record.sectionId),
    digestSha256: toSafeString(record.digestSha256),
  };
}

function toOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}
