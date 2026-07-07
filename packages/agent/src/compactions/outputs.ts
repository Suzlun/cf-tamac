import { createAgentDomainError } from '../domain/errors';
import { encodeBase64UrlBytes } from '../domain/security/base64url';
import { computeSha256Hex } from '../domain/security/digest';

import { assertCompactionStatus, assertCompactionStatusTransition } from './compaction-status';
import {
  recordThreadHistoryBodyReference,
  storeThreadHistoryBody,
  type EncodedCompactionJsonPayload,
  type StoredCompactionJsonPayload,
} from './history-body-storage';

import type {
  CommitSuccessfulThreadCompactionInput,
  CommitSuccessfulThreadCompactionResult,
  CompactionDecisionTrace,
  CompactionHandoffOutput,
  CompactionThreadHistoryOutput,
  ThreadMemoryDeltaInput,
  ThreadMemoryDeltaOperationInput,
  ThreadMemoryDeltaOperationKind,
} from './output-types';
import type {
  AgentStorageRepositories,
  AgentThreadCompactionRow,
  AgentThreadMemoryItemRow,
  AgentThreadMemoryVersionRow,
} from '../storage';

const jsonContentType = 'application/json';
const textEncoder = new TextEncoder();

type EncodedJsonPayload = EncodedCompactionJsonPayload;
type StoredJsonPayload = StoredCompactionJsonPayload;

interface PreparedSuccessfulCompactionOutput {
  readonly handoff: unknown;
  readonly handoffPayload: EncodedJsonPayload;
  readonly historyBody: unknown;
  readonly historyPayload: StoredJsonPayload;
  readonly historyRef: string;
  readonly memoryDelta: unknown;
  readonly memoryDeltaPayload: EncodedJsonPayload;
  readonly outputDigestSha256: string;
  readonly outputRef: string;
}

interface ApplyThreadMemoryDeltaResult {
  readonly items: readonly AgentThreadMemoryItemRow[];
  readonly version: AgentThreadMemoryVersionRow;
}

/**
 * Handoff、ThreadHistory index/body metadata、ThreadMemoryDelta application を一つの transaction で保存し、Compaction を ready にします。
 *
 * @param input 成功出力、ID、timestamp、repository set を含む入力です。
 * @returns ready Compaction、History index、新 active ThreadMemory version/items を返します。
 * @throws AgentDomainError Compaction が存在しない、status が ready 遷移不可、MemoryDelta が不正、または対象 Memory item が存在しない場合に発生します。
 *
 * @example
 * ```ts
 * await commitSuccessfulThreadCompaction({
 *   compactionId: 'compaction-1',
 *   handoff,
 *   history,
 *   historyId: 'history-1',
 *   memoryDelta,
 *   nowMs: Date.now(),
 *   provenanceRef: 'compaction://compaction-1/provenance',
 *   repositories,
 * });
 * ```
 */
export async function commitSuccessfulThreadCompaction(
  input: CommitSuccessfulThreadCompactionInput
): Promise<CommitSuccessfulThreadCompactionResult> {
  // R2 write 前に Compaction の存在と遷移可否を確認し、不要な orphan object を作らないようにします。
  const preparationCompaction = readRequiredCompaction(input.repositories, input.compactionId);
  assertCompactionCanReceiveSuccessfulOutput(preparationCompaction, input.compactionId);

  // JSON body と digest/R2 offload は transaction の前に生成し、transaction 内では SQLite mutation だけを行います。
  const prepared = await prepareSuccessfulCompactionOutput(input, preparationCompaction);

  return input.repositories.transaction((repositories) => {
    // 成功対象 Compaction を読み、Thread/Section/Event 範囲の所有関係を確定します。
    const compaction = readRequiredCompaction(repositories, input.compactionId);
    assertCompactionCanReceiveSuccessfulOutput(compaction, input.compactionId);

    // R2 object reference index は History index / Compaction output と同じ transaction 境界で作成します。
    recordThreadHistoryBodyReference({
      commit: input,
      compaction,
      payload: prepared.historyPayload,
      repositories,
    });

    // ThreadHistory は検索可能な index と body metadata を保存し、large body は R2 ref として保持します。
    const historyIndex = repositories.history.insertHistoryIndex({
      bodyByteSize: prepared.historyPayload.byteSize,
      bodyContentType: jsonContentType,
      bodyRef: prepared.historyPayload.ref,
      bodySha256: prepared.historyPayload.digestSha256,
      bodyStorageClass: prepared.historyPayload.storageClass,
      compactionId: compaction.compactionId,
      createdAtMs: input.nowMs,
      endThreadSequence: compaction.endThreadSequence,
      historyId: input.historyId,
      historyRef: prepared.historyRef,
      provenanceRef: input.provenanceRef,
      queryText: createHistoryQueryText(input.history),
      retentionStatus: 'active',
      sectionId: compaction.sectionId,
      startThreadSequence: compaction.startThreadSequence,
      summary: input.history.summary,
      threadId: compaction.threadId,
    });

    // ThreadMemoryDelta を新しい active version と item lineage に適用します。
    const memory = applyThreadMemoryDelta({
      compaction,
      historyId: input.historyId,
      memoryDelta: input.memoryDelta,
      memoryDeltaRef: prepared.memoryDeltaPayload.ref,
      memoryId: input.memoryId,
      nowMs: input.nowMs,
      repositories,
    });

    // Handoff/History/MemoryDelta の参照を Compaction row に結び、latest ready として利用可能にします。
    const readyCompaction = repositories.compactions.updateCompactionOutput({
      compactionId: compaction.compactionId,
      completedAtMs: input.nowMs,
      digestSha256: prepared.outputDigestSha256,
      handoffRef: prepared.handoffPayload.ref,
      historyRef: prepared.historyRef,
      memoryDeltaRef: prepared.memoryDeltaPayload.ref,
      outputRef: prepared.outputRef,
      provenanceRef: input.provenanceRef,
      r2ObjectRef:
        prepared.historyPayload.storageClass === 'r2' ? prepared.historyPayload.ref : undefined,
      status: 'ready',
      updatedAtMs: input.nowMs,
    });

    return {
      compaction: readyCompaction,
      historyIndex,
      memoryItems: memory.items,
      memoryVersion: memory.version,
    };
  });
}

async function prepareSuccessfulCompactionOutput(
  input: CommitSuccessfulThreadCompactionInput,
  compaction: AgentThreadCompactionRow
): Promise<PreparedSuccessfulCompactionOutput> {
  // History ref は Handoff からも参照するため、最初に安定した値へ正規化します。
  const historyRef = input.historyRef ?? `history://${input.historyId}`;
  const handoff = createHandoffBody(input.handoff, historyRef);
  const historyBody = createHistoryBody(input.history, input.compactionId);
  const memoryDelta = createMemoryDeltaBody(input.memoryDelta, input.compactionId, input.historyId);

  // 各出力 body を inline JSON ref に変換し、後続 R2 offload へ移行可能な digest/size を同時に持たせます。
  const handoffPayload = await encodeJsonPayload('handoff', handoff);
  const encodedHistoryPayload = await encodeJsonPayload('history-body', historyBody);
  const historyPayload = await storeThreadHistoryBody(input, compaction, encodedHistoryPayload);
  const memoryDeltaPayload = await encodeJsonPayload('memory-delta', memoryDelta);
  const outputDigestSha256 = await computeSha256Hex(
    textEncoder.encode(
      stringifyStable({
        compactionId: input.compactionId,
        handoffDigestSha256: handoffPayload.digestSha256,
        historyDigestSha256: historyPayload.digestSha256,
        historyId: input.historyId,
        memoryDeltaDigestSha256: memoryDeltaPayload.digestSha256,
        provenanceRef: input.provenanceRef,
        schema: 'cftamac.agent.compaction-output.v1',
      })
    )
  );

  return {
    handoff,
    handoffPayload,
    historyBody,
    historyPayload,
    historyRef,
    memoryDelta,
    memoryDeltaPayload,
    outputDigestSha256,
    outputRef: `inline://agent/compaction-output/${outputDigestSha256}`,
  };
}

function applyThreadMemoryDelta(input: {
  readonly compaction: AgentThreadCompactionRow;
  readonly historyId: string;
  readonly memoryDelta: ThreadMemoryDeltaInput;
  readonly memoryDeltaRef: string;
  readonly memoryId?: string;
  readonly nowMs: number;
  readonly repositories: AgentStorageRepositories;
}): ApplyThreadMemoryDeltaResult {
  // 既存 active version を読み、次 version 番号と copy-forward 対象を決めます。
  const activeVersion = input.repositories.memory.findActiveThreadMemoryVersion(
    input.compaction.threadId
  );
  const previousItems =
    activeVersion !== undefined
      ? input.repositories.memory.listThreadMemoryItems(
          input.compaction.threadId,
          activeVersion.memoryId
        )
      : [];
  const nextVersion = (activeVersion?.version ?? 0) + 1;
  const nextMemoryId =
    input.memoryId ?? `thread-memory://${input.compaction.threadId}/v${String(nextVersion)}`;
  const operationTargets = collectOperationTargets(input.memoryDelta.operations);
  const copiedItems = previousItems.filter((item) =>
    shouldCarryForwardMemoryItem(item, operationTargets)
  );
  const itemCount = copiedItems.length + input.memoryDelta.operations.length;

  // 新しい active version を作る前に旧 active version を superseded にし、active selection を一意にします。
  if (activeVersion !== undefined) {
    input.repositories.memory.updateThreadMemoryVersionStatus({
      memoryId: activeVersion.memoryId,
      status: 'superseded',
      threadId: activeVersion.threadId,
      updatedAtMs: input.nowMs,
    });
  }

  const version = input.repositories.memory.createThreadMemoryVersion({
    createdAtMs: input.nowMs,
    itemCount,
    latestCompactionId: input.compaction.compactionId,
    memoryId: nextMemoryId,
    memoryRef: `thread-memory://${input.compaction.threadId}/v${String(nextVersion)}`,
    provenanceRef: input.memoryDelta.provenanceRef,
    snapshotRef: input.memoryDeltaRef,
    status: 'active',
    threadId: input.compaction.threadId,
    version: nextVersion,
  });

  // 対象外の既存 item は新 version へ copy-forward し、version snapshot として完全な現在状態を残します。
  const copiedRows = copiedItems.map((item) =>
    input.repositories.memory.insertThreadMemoryItem({
      contentRef: item.contentRef ?? undefined,
      contentSha256: item.contentSha256 ?? undefined,
      contentText: item.contentText ?? undefined,
      createdAtMs: input.nowMs,
      invalidatesItemId: item.invalidatesItemId ?? undefined,
      memoryId: nextMemoryId,
      memoryItemId: item.memoryItemId,
      provenanceRef: item.provenanceRef ?? undefined,
      sourceCompactionId: item.sourceCompactionId ?? undefined,
      sourceEventId: item.sourceEventId ?? undefined,
      sourceHistoryId: item.sourceHistoryId ?? undefined,
      status: item.status,
      supersedesItemId: item.supersedesItemId ?? undefined,
      threadId: input.compaction.threadId,
    })
  );

  // Delta operation は provenance と source Compaction/History を持つ新 item として記録します。
  const operationRows = insertMemoryDeltaOperationRows({
    compaction: input.compaction,
    historyId: input.historyId,
    memoryId: nextMemoryId,
    nowMs: input.nowMs,
    operations: input.memoryDelta.operations,
    previousItems,
    repositories: input.repositories,
  });

  return { items: [...copiedRows, ...operationRows], version };
}

function insertMemoryDeltaOperationRows(input: {
  readonly compaction: AgentThreadCompactionRow;
  readonly historyId: string;
  readonly memoryId: string;
  readonly nowMs: number;
  readonly operations: readonly ThreadMemoryDeltaOperationInput[];
  readonly previousItems: readonly AgentThreadMemoryItemRow[];
  readonly repositories: AgentStorageRepositories;
}): AgentThreadMemoryItemRow[] {
  const previousById = new Map(input.previousItems.map((item) => [item.memoryItemId, item]));
  const insertedIds = new Set<string>();
  return input.operations.map((operation) => {
    // 各 operation の対象と本文を検証し、lineage field へ変換します。
    assertUniqueOperationItemId(insertedIds, operation.memoryItemId);
    const target = readOperationTarget(operation, previousById);
    return input.repositories.memory.insertThreadMemoryItem({
      contentText: resolveOperationContentText(operation, target),
      createdAtMs: input.nowMs,
      invalidatesItemId: operation.kind === 'invalidate' ? operation.targetMemoryItemId : undefined,
      memoryId: input.memoryId,
      memoryItemId: operation.memoryItemId,
      provenanceRef: operation.provenanceRef,
      sourceCompactionId: input.compaction.compactionId,
      sourceEventId: operation.sourceEventId,
      sourceHistoryId: input.historyId,
      status: resolveOperationItemStatus(operation.kind),
      supersedesItemId:
        operation.kind === 'confirm' ||
        operation.kind === 'revise' ||
        operation.kind === 'supersede'
          ? operation.targetMemoryItemId
          : undefined,
      threadId: input.compaction.threadId,
    });
  });
}

function createHandoffBody(input: CompactionHandoffOutput, historyRef: string): unknown {
  return {
    activeIntentions: normalizeTextArray(input.activeIntentions),
    constraints: normalizeTextArray(input.constraints),
    currentGoals: normalizeTextArray(input.currentGoals),
    decisionsAndRationale: input.decisionsAndRationale.map(normalizeDecisionTrace),
    expectedNextActions: normalizeTextArray(input.expectedNextActions),
    historyReferences: includeRequiredReference(input.historyReferences, historyRef),
    openLoops: normalizeTextArray(input.openLoops),
    pendingQuestions: normalizeTextArray(input.pendingQuestions),
    schema: 'cftamac.agent.handoff.v1',
    situation: input.situation,
  };
}

function createHistoryBody(input: CompactionThreadHistoryOutput, compactionId: string): unknown {
  return {
    actorIntentions: normalizeTextArray(input.actorIntentions),
    artifacts: normalizeTextArray(input.artifacts),
    assumptions: normalizeTextArray(input.assumptions),
    chronology: normalizeTextArray(input.chronology),
    compactionId,
    consideredOptions: normalizeTextArray(input.consideredOptions),
    decisions: input.decisions.map(normalizeDecisionTrace),
    explicitRationale: normalizeTextArray(input.explicitRationale),
    replayManifest: normalizeTextArray(input.replayManifest),
    schema: 'cftamac.agent.thread-history.v1',
    summary: input.summary,
    toolActivity: normalizeTextArray(input.toolActivity),
    unresolvedIssues: normalizeTextArray(input.unresolvedIssues),
  };
}

function createMemoryDeltaBody(
  input: ThreadMemoryDeltaInput,
  compactionId: string,
  historyId: string
): unknown {
  return {
    compactionId,
    historyId,
    operations: input.operations.map((operation) => ({
      contentText: operation.contentText ?? null,
      kind: operation.kind,
      memoryItemId: operation.memoryItemId,
      provenanceRef: operation.provenanceRef,
      rationale: operation.rationale ?? null,
      sourceEventId: operation.sourceEventId ?? null,
      targetMemoryItemId: operation.targetMemoryItemId ?? null,
    })),
    provenanceRef: input.provenanceRef,
    schema: 'cftamac.agent.thread-memory-delta.v1',
  };
}

async function encodeJsonPayload(kind: string, value: unknown): Promise<EncodedJsonPayload> {
  const text = stringifyStable(value);
  const bytes = textEncoder.encode(text);
  const digestSha256 = await computeSha256Hex(bytes);
  return {
    byteSize: bytes.byteLength,
    bytes,
    digestSha256,
    ref: `inline://agent/${kind}/${digestSha256}/${encodeBase64UrlBytes(bytes)}`,
    storageClass: 'inline',
    text,
  };
}

function assertCompactionCanReceiveSuccessfulOutput(
  compaction: AgentThreadCompactionRow,
  target: string
): void {
  assertCompactionStatus(compaction.status);
  if (compaction.status === 'ready') {
    throw createAgentDomainError({
      kind: 'conflict',
      message: 'Compaction outputs are already ready.',
      target,
    });
  }
  assertCompactionStatusTransition({ from: compaction.status, to: 'ready' });
}

function readRequiredCompaction(
  repositories: AgentStorageRepositories,
  compactionId: string
): AgentThreadCompactionRow {
  const compaction = repositories.compactions.findByCompactionId(compactionId);
  if (compaction === undefined) {
    throw createAgentDomainError({
      kind: 'not_found',
      message: 'Compaction not found for successful output commit.',
      target: compactionId,
    });
  }
  return compaction;
}

function createHistoryQueryText(input: CompactionThreadHistoryOutput): string {
  return [
    input.summary,
    ...input.chronology,
    ...input.actorIntentions,
    ...input.consideredOptions,
    ...input.explicitRationale,
    ...input.assumptions,
    ...input.unresolvedIssues,
    ...input.toolActivity,
    ...input.artifacts,
    ...input.replayManifest,
  ].join('\n');
}

function collectOperationTargets(
  operations: readonly ThreadMemoryDeltaOperationInput[]
): ReadonlySet<string> {
  return new Set(
    operations
      .map((operation) => operation.targetMemoryItemId)
      .filter((target): target is string => target !== undefined)
  );
}

function shouldCarryForwardMemoryItem(
  item: AgentThreadMemoryItemRow,
  operationTargets: ReadonlySet<string>
): boolean {
  if (operationTargets.has(item.memoryItemId)) return false;
  return item.status !== 'invalidated' && item.status !== 'superseded';
}

function readOperationTarget(
  operation: ThreadMemoryDeltaOperationInput,
  previousById: ReadonlyMap<string, AgentThreadMemoryItemRow>
): AgentThreadMemoryItemRow | undefined {
  if (operation.kind === 'add') return undefined;
  if (operation.targetMemoryItemId === undefined) {
    throw createAgentDomainError({
      kind: 'validation',
      message: 'MemoryDelta operation requires a target Memory item.',
      target: operation.memoryItemId,
    });
  }
  const target = previousById.get(operation.targetMemoryItemId);
  if (target === undefined) {
    throw createAgentDomainError({
      kind: 'precondition',
      message: 'MemoryDelta target Memory item was not found in the active version.',
      target: operation.targetMemoryItemId,
    });
  }
  return target;
}

function resolveOperationContentText(
  operation: ThreadMemoryDeltaOperationInput,
  target: AgentThreadMemoryItemRow | undefined
): string | undefined {
  if (operation.kind === 'add' || operation.kind === 'revise' || operation.kind === 'supersede') {
    if (operation.contentText === undefined || operation.contentText === '') {
      throw createAgentDomainError({
        kind: 'validation',
        message: 'MemoryDelta operation requires content text.',
        target: operation.memoryItemId,
      });
    }
    return operation.contentText;
  }
  return operation.contentText ?? target?.contentText ?? undefined;
}

function resolveOperationItemStatus(kind: ThreadMemoryDeltaOperationKind): string {
  if (kind === 'confirm') return 'confirmed';
  if (kind === 'invalidate') return 'invalidated';
  return 'active';
}

function assertUniqueOperationItemId(insertedIds: Set<string>, memoryItemId: string): void {
  if (insertedIds.has(memoryItemId)) {
    throw createAgentDomainError({
      kind: 'conflict',
      message: 'MemoryDelta operation item IDs must be unique.',
      target: memoryItemId,
    });
  }
  insertedIds.add(memoryItemId);
}

function includeRequiredReference(
  values: readonly string[],
  requiredValue: string
): readonly string[] {
  const normalized = normalizeTextArray(values);
  return normalized.includes(requiredValue) ? normalized : [...normalized, requiredValue];
}

function normalizeDecisionTrace(input: CompactionDecisionTrace): unknown {
  return {
    actor: input.actor ?? 'agent',
    consideredOptions: normalizeTextArray(input.consideredOptions ?? []),
    decision: input.decision,
    rationale: input.rationale,
  };
}

function normalizeTextArray(values: readonly string[]): readonly string[] {
  return values.map((value) => value.trim()).filter((value) => value !== '');
}

function stringifyStable(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    const arrayValue = value as readonly unknown[];
    return `[${arrayValue.map((item) => stringifyStable(item)).join(',')}]`;
  }
  const record = value as Readonly<Record<string, unknown>>;
  const entries = Object.entries(record).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stringifyStable(entryValue)}`)
    .join(',')}}`;
}
