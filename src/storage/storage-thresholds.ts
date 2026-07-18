/**
 * Agent Durable Object SQLite の working set 上限として扱う byte 数です。
 *
 * Cloudflare Durable Object SQLite の設計上限に合わせ、threshold 判定は
 * この値に対する使用率で行います。R2 に逃がした body 本体は含めず、DO 側の
 * 権威 index と active working set を守るための運用判断に使います。
 *
 * @example
 * ```ts
 * const snapshot = createAgentStorageThresholdSnapshot({ currentBytes: 1024 });
 * console.log(snapshot.currentPercent);
 * ```
 */
export const agentDurableObjectStorageLimitBytes = 10 * 1024 * 1024 * 1024;

/**
 * Agent body を SQLite に inline 保存できる最大 byte 数です。
 *
 * Event payload、ThreadHistory body、archive segment などの共通 policy として
 * 使用します。この値を超える body は immutable R2 object として扱います。
 *
 * @example
 * ```ts
 * if (body.byteLength <= agentInlineBodyLimitBytes) {
 *   // body は inline 候補です。
 * }
 * ```
 */
export const agentInlineBodyLimitBytes = 64 * 1024;

/**
 * Agent storage threshold の初期値です。
 *
 * warning、compaction/archive priority、large body R2 強制、critical mode の
 * しきい値を、memo と OpenSpec の設計値に固定します。
 */
export const agentStorageThresholdPercents = {
  compactionPriorityPercent: 80,
  criticalPercent: 95,
  forceLargeBodyR2Percent: 90,
  warningPercent: 70,
} as const;

/**
 * Agent storage の運用状態です。
 *
 * `normal` は通常運用、`warning` は安全な degraded signal、
 * `compaction_priority` は compaction/archive を優先すべき状態、`force_r2` は
 * large body の inline 例外を拒否する状態、`critical` は read/delete/compact/export
 * を優先する状態を表します。
 */
export type AgentStorageThresholdStatus =
  | 'normal'
  | 'warning'
  | 'compaction_priority'
  | 'force_r2'
  | 'critical';

/**
 * storage threshold が判定する操作種別です。
 *
 * read/delete/compact/export は critical mode でも優先されます。
 * mutation は新規大容量 write を制限する対象です。
 */
export type AgentStorageOperationClass = 'read' | 'delete' | 'compact' | 'export' | 'mutation';

/**
 * Agent storage threshold の安全な snapshot です。
 *
 * raw body や secret は含めず、運用 UI や metrics へ出せる数値と boolean signal のみを
 * 保持します。
 */
export interface AgentStorageThresholdSnapshot {
  readonly compactionPriorityPercent: number;
  readonly criticalMode: boolean;
  readonly criticalPercent: number;
  readonly currentBytes: number;
  readonly currentPercent: number;
  readonly degraded: boolean;
  readonly forceLargeBodyR2: boolean;
  readonly forceLargeBodyR2Percent: number;
  readonly inlinePayloadLimitBytes: number;
  readonly shouldPrioritizeCompaction: boolean;
  readonly status: AgentStorageThresholdStatus;
  readonly warningPercent: number;
}

/**
 * Agent body の保存先判定結果です。
 *
 * 呼び出し側は `allowed` が false の場合、R2 write や SQLite mutation を行わずに
 * 呼び出し元へ安全な precondition error を返します。
 */
export interface AgentBodyStorageDecision {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly snapshot: AgentStorageThresholdSnapshot;
  readonly storageClass: 'inline' | 'r2';
}

/**
 * storage threshold による write 制限を表す error です。
 *
 * domain layer はこの error を捕捉し、AgentDomainError へ変換できます。
 */
export class AgentStorageThresholdViolation extends Error {
  readonly status: AgentStorageThresholdStatus;

  constructor(message: string, status: AgentStorageThresholdStatus) {
    super(message);
    this.name = 'AgentStorageThresholdViolation';
    this.status = status;
  }
}

/**
 * 現在使用 byte 数から Agent storage threshold snapshot を作成します。
 *
 * @param input.currentBytes Durable Object SQLite が現在使用している byte 数です。未知の場合は 0 として扱います。
 * @param input.storageLimitBytes 使用率計算の分母です。通常は 10 GiB の初期値を使います。
 * @returns secret-free な threshold snapshot を返します。
 *
 * @example
 * ```ts
 * const snapshot = createAgentStorageThresholdSnapshot({ currentBytes: 8_000_000_000 });
 * if (snapshot.shouldPrioritizeCompaction) {
 *   // compaction/archive 候補を優先します。
 * }
 * ```
 */
export function createAgentStorageThresholdSnapshot(input: {
  readonly currentBytes?: number;
  readonly storageLimitBytes?: number;
}): AgentStorageThresholdSnapshot {
  // 未知または不正な byte 数を 0 に丸め、metrics が NaN を出さないようにします。
  const currentBytes = normalizeNonNegativeNumber(input.currentBytes);
  const storageLimitBytes = normalizeStorageLimit(input.storageLimitBytes);
  const currentPercent = Math.min(100, Math.floor((currentBytes / storageLimitBytes) * 100));
  const status = resolveAgentStorageThresholdStatus(currentPercent);

  // snapshot は raw body を含めず、Client/ops へ渡せる signal だけで構成します。
  return {
    compactionPriorityPercent: agentStorageThresholdPercents.compactionPriorityPercent,
    criticalMode: status === 'critical',
    criticalPercent: agentStorageThresholdPercents.criticalPercent,
    currentBytes,
    currentPercent,
    degraded:
      currentPercent >= agentStorageThresholdPercents.warningPercent || status === 'critical',
    forceLargeBodyR2: currentPercent >= agentStorageThresholdPercents.forceLargeBodyR2Percent,
    forceLargeBodyR2Percent: agentStorageThresholdPercents.forceLargeBodyR2Percent,
    inlinePayloadLimitBytes: agentInlineBodyLimitBytes,
    shouldPrioritizeCompaction:
      currentPercent >= agentStorageThresholdPercents.compactionPriorityPercent,
    status,
    warningPercent: agentStorageThresholdPercents.warningPercent,
  };
}

/**
 * 使用率から Agent storage threshold 状態を解決します。
 *
 * @param currentPercent Durable Object SQLite 使用率です。
 * @returns storage threshold 状態を返します。
 */
export function resolveAgentStorageThresholdStatus(
  currentPercent: number
): AgentStorageThresholdStatus {
  // 高いしきい値から評価し、critical/force_r2 の優先順位を保ちます。
  if (currentPercent >= agentStorageThresholdPercents.criticalPercent) return 'critical';
  if (currentPercent >= agentStorageThresholdPercents.forceLargeBodyR2Percent) return 'force_r2';
  if (currentPercent >= agentStorageThresholdPercents.compactionPriorityPercent) {
    return 'compaction_priority';
  }
  if (currentPercent >= agentStorageThresholdPercents.warningPercent) return 'warning';
  return 'normal';
}

/**
 * body size と storage 使用率から inline/R2 保存先を決定します。
 *
 * @param input.byteSize 保存対象 body の byte 数です。
 * @param input.currentBytes Durable Object SQLite 使用 byte 数です。
 * @param input.currentPercent 既に計算済みの使用率です。指定時は `currentBytes` より優先します。
 * @param input.operationClass 操作種別です。critical mode では mutation の新規大容量 write を拒否します。
 * @returns 保存可否、保存先、threshold snapshot を返します。
 */
export function decideAgentBodyStorage(input: {
  readonly byteSize: number;
  readonly currentBytes?: number;
  readonly currentPercent?: number;
  readonly operationClass: AgentStorageOperationClass;
}): AgentBodyStorageDecision {
  // currentPercent が注入されたテスト・呼び出しでは byte 換算を逆算し、同じ snapshot 関数に集約します。
  const snapshot = createSnapshotFromBytesOrPercent(input.currentBytes, input.currentPercent);
  const isLargeBody = input.byteSize > agentInlineBodyLimitBytes;
  const storageClass = isLargeBody || snapshot.forceLargeBodyR2 ? 'r2' : 'inline';

  // critical mode では復旧に必要な read/delete/compact/export 以外の新規大容量 write を止めます。
  if (snapshot.criticalMode && isLargeBody && input.operationClass === 'mutation') {
    return {
      allowed: false,
      reason: 'Agent storage is in critical mode; new large writes are restricted.',
      snapshot,
      storageClass: 'r2',
    };
  }

  return { allowed: true, snapshot, storageClass };
}

/**
 * Agent body write が threshold policy 上許可されることを確認します。
 *
 * @param decision `decideAgentBodyStorage` が返した判定です。
 * @throws AgentStorageThresholdViolation 書き込みが critical mode により拒否される場合に発生します。
 */
export function assertAgentBodyStorageAllowed(decision: AgentBodyStorageDecision): void {
  // 呼び出し側が R2/SQLite を変更する前に停止できるよう、専用 error で理由を保持します。
  if (!decision.allowed) {
    throw new AgentStorageThresholdViolation(
      decision.reason ?? 'Agent storage threshold policy rejected the body write.',
      decision.snapshot.status
    );
  }
}

function createSnapshotFromBytesOrPercent(
  currentBytes: number | undefined,
  currentPercent: number | undefined
): AgentStorageThresholdSnapshot {
  if (currentPercent === undefined) {
    return createAgentStorageThresholdSnapshot({ currentBytes });
  }
  const normalizedPercent = Math.min(100, Math.max(0, Math.floor(currentPercent)));
  const currentBytesFromPercent = Math.floor(
    (agentDurableObjectStorageLimitBytes * normalizedPercent) / 100
  );
  return createAgentStorageThresholdSnapshot({ currentBytes: currentBytesFromPercent });
}

function normalizeNonNegativeNumber(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

function normalizeStorageLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return agentDurableObjectStorageLimitBytes;
  }
  return Math.floor(value);
}
