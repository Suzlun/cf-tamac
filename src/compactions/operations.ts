import { createAgentDomainError } from '../domain/errors';

import {
  assertCompactionStatus,
  assertCompactionStatusTransition,
  type CompactionStatus,
} from './compaction-status';

import type {
  AgentSectionRow,
  AgentStorageRepositories,
  AgentThreadCompactionRow,
} from '../storage';

type StartableCompactionStatus = Extract<CompactionStatus, 'pending' | 'running'>;
type TerminalCompactionStatus = Extract<CompactionStatus, 'ready' | 'failed' | 'cancelled'>;

/**
 * Section closure と Compaction shell 作成を一つの transaction で行う入力です。
 *
 * @property compactionId 呼び出し側が採番した Compaction ID です。再試行時に同じ ID を渡すことで重複作成を検出できます。
 * @property initialStatus 作成直後の status です。省略時は出力生成を開始済みとして `running` を使います。
 * @property nextSectionId freeze 後に直ちに open する次 Section の ID です。
 * @property nowMs すべての永続 timestamp に使うミリ秒 epoch です。
 * @property provenanceRef Compaction を開始した原因や policy snapshot を指す安全な参照です。
 * @property repositories Agent-owned Durable Object SQLite repository set です。
 * @property threadId Compaction 対象 Thread の ID です。
 *
 * @example
 * ```ts
 * const result = beginThreadCompaction({
 *   compactionId: 'compaction-1',
 *   nextSectionId: 'section-2',
 *   nowMs: Date.now(),
 *   repositories,
 *   threadId: 'thread-1',
 * });
 * ```
 */
export interface BeginThreadCompactionInput {
  readonly compactionId: string;
  readonly initialStatus?: StartableCompactionStatus;
  readonly nextSectionId: string;
  readonly nowMs: number;
  readonly provenanceRef?: string;
  readonly repositories: AgentStorageRepositories;
  readonly threadId: string;
}

/**
 * Section closure transaction が返す永続化済み records です。
 *
 * @property compaction frozen Section を正確に一つだけ参照する Compaction record です。
 * @property frozenSection Event 範囲が確定し、以後の Event を受け取らない Section です。
 * @property openSection Compaction 中の新規 Event を受け取る次 Section です。
 */
export interface BeginThreadCompactionResult {
  readonly compaction: AgentThreadCompactionRow;
  readonly frozenSection: AgentSectionRow;
  readonly openSection: AgentSectionRow;
}

/**
 * Compaction status と出力参照を前進させる入力です。
 *
 * @property archiveRef archive segment を指す安全な参照です。
 * @property compactionId 更新対象 Compaction の ID です。
 * @property digestSha256 ready 出力の SHA-256 digest です。`ready` へ進めるときは 64 桁 hex が必要です。
 * @property errorCode `failed` または `cancelled` の安全な理由 code です。
 * @property errorMessage 秘密を含まない安全な診断 message です。
 * @property handoffRef Handoff 出力を指す安全な参照です。
 * @property historyRef ThreadHistory 出力を指す安全な参照です。
 * @property memoryDeltaRef ThreadMemoryDelta 出力を指す安全な参照です。
 * @property nowMs 更新 timestamp と終端 timestamp に使うミリ秒 epoch です。
 * @property outputRef 複合出力 manifest などを指す安全な参照です。
 * @property provenanceRef 出力生成に使った入力・policy・model などの provenance 参照です。
 * @property r2ObjectRef R2 object metadata を指す安全な参照です。
 * @property repositories Agent-owned Durable Object SQLite repository set です。
 * @property toStatus 遷移先 status です。`pending` へ戻すことはできません。
 *
 * @example
 * ```ts
 * transitionThreadCompactionStatus({
 *   compactionId: 'compaction-1',
 *   digestSha256: '0'.repeat(64),
 *   nowMs: Date.now(),
 *   outputRef: 'r2://agents/a/compactions/1/output.json',
 *   repositories,
 *   toStatus: 'ready',
 * });
 * ```
 */
export interface TransitionThreadCompactionStatusInput {
  readonly archiveRef?: string;
  readonly compactionId: string;
  readonly digestSha256?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly handoffRef?: string;
  readonly historyRef?: string;
  readonly memoryDeltaRef?: string;
  readonly nowMs: number;
  readonly outputRef?: string;
  readonly provenanceRef?: string;
  readonly r2ObjectRef?: string;
  readonly repositories: AgentStorageRepositories;
  readonly toStatus: Extract<CompactionStatus, 'running'> | TerminalCompactionStatus;
}

/**
 * 現在の open Section を freeze し、次 Section を直ちに open して Compaction record を作成します。
 *
 * @param input Thread、ID、timestamp、repository set を含む transaction 入力です。
 * @returns frozen Section、次 open Section、Compaction record の永続化済み snapshot です。
 * @throws AgentDomainError Thread が存在しない、open Section がない、compact できる Event がない、または既存 Compaction と衝突する場合に発生します。
 *
 * @example
 * ```ts
 * const { frozenSection, openSection } = beginThreadCompaction({
 *   compactionId: 'compaction-1',
 *   nextSectionId: 'section-2',
 *   nowMs: 1_700_000_000_000,
 *   repositories,
 *   threadId: 'thread-1',
 * });
 * ```
 */
export function beginThreadCompaction(
  input: BeginThreadCompactionInput
): BeginThreadCompactionResult {
  return input.repositories.transaction((repositories) => {
    // 呼び出し時点で許可された開始 status だけを受け入れ、Section closure と status の意味を揃えます。
    const initialStatus = input.initialStatus ?? 'running';
    assertStartableCompactionStatus(initialStatus);

    // Thread の存在を確認し、別 Agent や削除済み Thread へ Compaction が作られることを防ぎます。
    const thread = repositories.threads.findByThreadId(input.threadId);
    if (thread === undefined) {
      throw createAgentDomainError({
        kind: 'not_found',
        message: 'Thread not found for compaction.',
        target: input.threadId,
      });
    }

    // 現在の open Section を取得し、Compaction が一つの Section closure だけを所有するようにします。
    const section = repositories.sections.findOpenSection(input.threadId);
    if (section === undefined) {
      throw createAgentDomainError({
        kind: 'precondition',
        message: 'Open Section not found for compaction.',
        target: input.threadId,
      });
    }

    // 同じ Section を二重に compact すると履歴と Memory provenance が分岐するため、作成前に衝突を止めます。
    if (repositories.compactions.findBySectionId(input.threadId, section.sectionId) !== undefined) {
      throw createAgentDomainError({
        kind: 'conflict',
        message: 'Compaction already exists for the Section.',
        target: section.sectionId,
      });
    }

    // freeze する範囲の終端 Event sequence を確定し、空 Section や別 Section の Event 混入を拒否します。
    const endThreadSequence = resolveCompactableEndSequence(repositories, section);

    // frozen Section の直後から新しい Event を受けるため、次 Section の sequence/range を先に決めます。
    const nextSectionSequence = section.sequence + 1;
    const nextSectionStartSequence = endThreadSequence + 1;

    // 現在 Section を frozen にし、Compaction 出力生成対象の Event 範囲を永続的に固定します。
    repositories.sections.freezeSection({
      endThreadSequence,
      frozenAtMs: input.nowMs,
      sectionId: section.sectionId,
      threadId: input.threadId,
    });

    // Compaction が走っていても Event 受理を止めないため、次 Section を同じ transaction 内で open します。
    repositories.sections.insertSection({
      createdAtMs: input.nowMs,
      sectionId: input.nextSectionId,
      sequence: nextSectionSequence,
      startThreadSequence: nextSectionStartSequence,
      status: 'active',
      threadId: input.threadId,
    });

    // Thread の current Section pointer を更新し、既存 PublishEvent path が次 Event を新 Section へ入れるようにします。
    repositories.threads.updateCurrentSection({
      currentSectionId: input.nextSectionId,
      nowMs: input.nowMs,
      threadId: input.threadId,
    });

    // Compaction ordinal は Thread 内で単調増加させ、Section ordinal と別軸で再試行や照会の順序を保ちます。
    const compactionOrdinal = repositories.compactions.getNextCompactionOrdinal(input.threadId);
    const compaction = repositories.compactions.insertCompaction({
      compactionId: input.compactionId,
      compactionOrdinal,
      createdAtMs: input.nowMs,
      endThreadSequence,
      provenanceRef: input.provenanceRef,
      sectionId: section.sectionId,
      sectionOrdinal: section.sequence,
      startThreadSequence: section.startThreadSequence,
      startedAtMs: initialStatus === 'running' ? input.nowMs : undefined,
      status: initialStatus,
      threadId: input.threadId,
    });

    // 呼び出し側に確定後の records を返すため、transaction 内の最新 row を読み戻します。
    const frozenSection = readRequiredSection(repositories, input.threadId, section.sectionId);
    const openSection = readRequiredSection(repositories, input.threadId, input.nextSectionId);
    return { compaction, frozenSection, openSection };
  });
}

/**
 * Compaction status を状態機械に従って前進させ、ready/failed/cancelled の出力 metadata を保存します。
 *
 * @param input 遷移先 status、出力参照、timestamp、repository set を含む入力です。
 * @returns 更新後の Compaction record です。
 * @throws AgentDomainError Compaction が存在しない、ready 出力が不足している、または digest が不正な場合に発生します。
 * @throws TypeError 状態機械で許可されない status transition が要求された場合に発生します。
 */
export function transitionThreadCompactionStatus(
  input: TransitionThreadCompactionStatusInput
): AgentThreadCompactionRow {
  return input.repositories.transaction((repositories) => {
    // 現在 status を読み、永続値が状態機械の既知 status であることを確認します。
    const current = repositories.compactions.findByCompactionId(input.compactionId);
    if (current === undefined) {
      throw createAgentDomainError({
        kind: 'not_found',
        message: 'Compaction not found.',
        target: input.compactionId,
      });
    }
    assertCompactionStatus(current.status);

    // 遷移先を検証し、終端状態からの変更や pending への巻き戻しを拒否します。
    assertCompactionStatus(input.toStatus);
    if (current.status === input.toStatus) {
      return current;
    }
    assertCompactionStatusTransition({ from: current.status, to: input.toStatus });

    // running への遷移では出力参照を触らず、startedAt だけを確定させます。
    if (input.toStatus === 'running') {
      return repositories.compactions.updateCompactionStatus({
        compactionId: input.compactionId,
        startedAtMs: current.startedAtMs ?? input.nowMs,
        status: 'running',
        updatedAtMs: input.nowMs,
      });
    }

    // ready へ進める場合は、再開文脈として検証できる digest と出力参照が揃っていることを保証します。
    if (input.toStatus === 'ready') {
      assertReadyCompactionOutput(input);
    }

    // terminal status は completedAt と出力/error metadata を一度に保存し、latest-ready 照会の整合性を保ちます。
    return repositories.compactions.updateCompactionOutput({
      archiveRef: input.archiveRef,
      compactionId: input.compactionId,
      completedAtMs: input.nowMs,
      digestSha256: input.digestSha256,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      handoffRef: input.handoffRef,
      historyRef: input.historyRef,
      memoryDeltaRef: input.memoryDeltaRef,
      outputRef: input.outputRef,
      provenanceRef: input.provenanceRef,
      r2ObjectRef: input.r2ObjectRef,
      status: input.toStatus,
      updatedAtMs: input.nowMs,
    });
  });
}

function assertStartableCompactionStatus(
  status: CompactionStatus
): asserts status is StartableCompactionStatus {
  if (status !== 'pending' && status !== 'running') {
    throw createAgentDomainError({
      kind: 'validation',
      message: 'Compaction initial status must be pending or running.',
      target: status,
    });
  }
}

function assertReadyCompactionOutput(input: TransitionThreadCompactionStatusInput): void {
  // ready は future Run の再開文脈になるため、digest のない出力を受け入れません。
  if (input.digestSha256 === undefined) {
    throw createAgentDomainError({
      kind: 'precondition',
      message: 'Ready Compaction requires a SHA-256 digest.',
      target: input.compactionId,
    });
  }
  // digest は storage/R2 参照検証に使うため、hex 形式の SHA-256 だけを受け入れます。
  if (!/^[\da-f]{64}$/i.test(input.digestSha256)) {
    throw createAgentDomainError({
      kind: 'validation',
      message: 'Ready Compaction digest must be a 64 character SHA-256 hex string.',
      target: input.compactionId,
    });
  }
  // ready は少なくとも一つの出力参照を持つ必要があり、空の successful Compaction を防ぎます。
  if (
    input.archiveRef === undefined &&
    input.handoffRef === undefined &&
    input.historyRef === undefined &&
    input.memoryDeltaRef === undefined &&
    input.outputRef === undefined &&
    input.r2ObjectRef === undefined
  ) {
    throw createAgentDomainError({
      kind: 'precondition',
      message: 'Ready Compaction requires at least one output reference.',
      target: input.compactionId,
    });
  }
}

function readRequiredSection(
  repositories: AgentStorageRepositories,
  threadId: string,
  sectionId: string
): AgentSectionRow {
  // 書き込み直後の row が読めない場合は repository/transaction 境界の異常として扱います。
  const section = repositories.sections.findBySectionId(threadId, sectionId);
  if (section === undefined) {
    throw createAgentDomainError({
      kind: 'internal',
      message: 'Section write did not return a row.',
      target: sectionId,
    });
  }
  return section;
}

function resolveCompactableEndSequence(
  repositories: AgentStorageRepositories,
  section: AgentSectionRow
): number {
  // Thread の最新 Event を使って closure 範囲の終端を決め、Event のない Section を compact しません。
  const latestEvent = repositories.events.findLatestForThread(section.threadId);
  if (latestEvent === undefined || latestEvent.threadSequence < section.startThreadSequence) {
    throw createAgentDomainError({
      kind: 'precondition',
      message: 'Open Section does not contain compactable Events.',
      target: section.sectionId,
    });
  }
  // 最新 Event が現在 Section に属していない場合は、Section pointer と Event index の不整合として止めます。
  if (latestEvent.sectionId !== section.sectionId) {
    throw createAgentDomainError({
      kind: 'precondition',
      message: 'Latest Event is not inside the open Section.',
      target: section.sectionId,
    });
  }
  return latestEvent.threadSequence;
}
