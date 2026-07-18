import type { AgentSchedulerWakeRecord } from './AIAgent.types';
import type { AgentStorageRepositories } from './storage';

interface DurableObjectStorageWithSqlSize {
  readonly sql?: {
    readonly databaseSize?: number;
  };
}

/**
 * Durable Object SQLite の database size を安全に読み取ります。
 *
 * @param storage AIAgent Durable Object に紐づく Cloudflare DurableObjectStorage です。
 * @returns Workers runtime が `sql.databaseSize` を提供する場合は非負整数 bytes、未提供や不正値の場合は undefined です。
 * @throws この関数は runtime 差分を undefined へ丸めるため、例外は投げません。
 * @example
 * ```ts
 * const bytes = readDurableObjectSqlDatabaseSizeBytes(ctx.storage);
 * ```
 */
export function readDurableObjectSqlDatabaseSizeBytes(
  storage: DurableObjectStorage
): number | undefined {
  // Workers runtime が SQLite databaseSize を提供する場合だけ使用し、test/fallback 環境では未知値として扱います。
  const sqliteStorage = storage as DurableObjectStorageWithSqlSize;
  const databaseSize = sqliteStorage.sql?.databaseSize;
  if (typeof databaseSize !== 'number' || !Number.isFinite(databaseSize) || databaseSize < 0) {
    return undefined;
  }
  return Math.floor(databaseSize);
}

/**
 * Agent-local scheduler wake の現在状態を読み取り、replay 応答用の安全な shape に変換します。
 *
 * @param repositories AIAgent Durable Object SQLite に閉じた repository set です。
 * @returns pending/running wake が既にある場合は coalesced=true、ない場合は新規 pending 相当の状態です。
 * @throws この関数は repository の読み取り結果を丸めるだけを行うため、例外は投げません。
 * @example
 * ```ts
 * const wake = readAgentSchedulerWakeState(repositories);
 * ```
 */
export function readAgentSchedulerWakeState(
  repositories: AgentStorageRepositories
): AgentSchedulerWakeRecord {
  const current = repositories.schedulerWakes.readWakeState();
  if (
    current !== undefined &&
    (current.wakeStatus === 'pending' || current.wakeStatus === 'running')
  ) {
    return {
      coalesced: true,
      pendingCount: current.pendingCount,
      wakeStatus: current.wakeStatus,
    };
  }
  return {
    coalesced: false,
    pendingCount: 0,
    wakeStatus: 'pending',
  };
}
