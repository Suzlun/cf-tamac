import { eq } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from '../schema/agent-storage';

import type { AgentStorageDatabase } from '../database';

/**
 * `AgentSchedulerWakeStatus` は Agent Service の内部境界で共有する exported 型です。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export type AgentSchedulerWakeStatus = 'idle' | 'pending' | 'running';

/**
 * `AgentSchedulerWakeStateRow` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentSchedulerWakeStateRow {
  readonly wakeStatus: AgentSchedulerWakeStatus;
  readonly pendingCount: number;
}

/**
 * `AgentSchedulerWakeIntent` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentSchedulerWakeIntent {
  readonly wakeStatus: 'pending' | 'running';
  readonly coalesced: boolean;
  readonly pendingCount: number;
}

/**
 * `AgentSchedulerWakeRepository` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentSchedulerWakeRepository {
  readonly tableName: 'agent_scheduler_wake_state';
  markIdle(nowMs: number): void;
  markPending(nowMs: number, pendingCount: number): void;
  markRunning(nowMs: number): void;
  readWakeState(): AgentSchedulerWakeStateRow | undefined;
  recordWake(nowMs: number): AgentSchedulerWakeIntent;
}

/**
 * `createAgentSchedulerWakeRepository` は Agent Service の内部境界で利用する exported 関数です。
 *
 * @remarks
 * この関数は Agent-owned Durable Object / storage / RPC adapter の責務内で呼び出されます。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 * @param agentId repository が所属する Agent aggregate ID です。
 * @param database Agent-owned Durable Object SQLite に接続した Drizzle adapter です。
 * @returns scheduler wake ledger 操作を Agent ID に束縛した repository object です。
 * 返却された method が query/transaction を実行して失敗した場合は、各 method の呼び出し元へ伝播します。
 * @throws この factory 自体は query/transaction を実行せず、repository object を組み立てるだけのため例外を投げません。
 */
export function createAgentSchedulerWakeRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentSchedulerWakeRepository {
  const table = agentStorageDrizzleSchema.agentSchedulerWakeState;
  return {
    tableName: 'agent_scheduler_wake_state',
    markIdle(nowMs) {
      upsertWakeState(agentId, database, 'idle', 0, nowMs);
    },
    markPending(nowMs, pendingCount) {
      upsertWakeState(agentId, database, 'pending', pendingCount, nowMs);
    },
    markRunning(nowMs) {
      const current = this.readWakeState();
      upsertWakeState(agentId, database, 'running', current?.pendingCount ?? 0, nowMs);
    },
    readWakeState() {
      return database
        .select({ pendingCount: table.pendingCount, wakeStatus: table.wakeStatus })
        .from(table)
        .where(eq(table.agentId, agentId))
        .limit(1)
        .get();
    },
    recordWake(nowMs) {
      const current = this.readWakeState();
      if (current === undefined || current.wakeStatus === 'idle') {
        upsertWakeState(agentId, database, 'pending', 1, nowMs);
        return { wakeStatus: 'pending', coalesced: false, pendingCount: 1 };
      }
      const pendingCount = current.pendingCount + 1;
      upsertWakeState(agentId, database, current.wakeStatus, pendingCount, nowMs);
      return { wakeStatus: current.wakeStatus, coalesced: true, pendingCount };
    },
  };
}

function upsertWakeState(
  agentId: string,
  database: AgentStorageDatabase,
  wakeStatus: AgentSchedulerWakeStatus,
  pendingCount: number,
  nowMs: number
): void {
  const table = agentStorageDrizzleSchema.agentSchedulerWakeState;
  const existing = database
    .select({ agentId: table.agentId })
    .from(table)
    .where(eq(table.agentId, agentId))
    .limit(1)
    .get();
  if (existing === undefined) {
    database.insert(table).values({ agentId, pendingCount, updatedAtMs: nowMs, wakeStatus }).run();
    return;
  }
  database
    .update(table)
    .set({ pendingCount, updatedAtMs: nowMs, wakeStatus })
    .where(eq(table.agentId, agentId))
    .run();
}
