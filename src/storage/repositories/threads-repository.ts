import { and, asc, eq, gt, like } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from '../schema/agent-storage';

import type { AgentStorageDatabase } from '../database';

/**
 * `AgentThreadRow` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentThreadRow {
  readonly threadId: string;
  readonly threadKey: string;
  readonly normalizedThreadKey: string;
  readonly status: string;
  readonly currentSectionId: string | null;
  readonly priority: number;
  readonly lastServedAtMs: number | null;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

/**
 * `InsertAgentThreadInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface InsertAgentThreadInput {
  readonly threadId: string;
  readonly threadKey: string;
  readonly normalizedThreadKey: string;
  readonly status?: string;
  readonly currentSectionId?: string;
  readonly priority?: number;
  readonly nowMs: number;
}

/**
 * `UpdateAgentThreadSectionInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface UpdateAgentThreadSectionInput {
  readonly threadId: string;
  readonly currentSectionId: string;
  readonly nowMs: number;
}

/**
 * `MarkAgentThreadServedInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface MarkAgentThreadServedInput {
  readonly nowMs: number;
  readonly threadId: string;
}

/**
 * `AgentThreadsRepository` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentThreadsRepository {
  readonly tableName: 'agent_threads';
  findByThreadId(threadId: string): AgentThreadRow | undefined;
  findByNormalizedThreadKey(normalizedThreadKey: string): AgentThreadRow | undefined;
  insertThread(input: InsertAgentThreadInput): void;
  listThreads(input: {
    readonly afterCreatedAtMs?: number;
    readonly limit: number;
    readonly normalizedThreadKeyPrefix?: string;
    readonly status?: string;
  }): AgentThreadRow[];
  markThreadServed(input: MarkAgentThreadServedInput): void;
  updateCurrentSection(input: UpdateAgentThreadSectionInput): void;
}

/**
 * `createAgentThreadsRepository` は Agent Service の内部境界で利用する exported 関数です。
 *
 * @remarks
 * この関数は Agent-owned Durable Object / storage / RPC adapter の責務内で呼び出されます。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 * @param agentId repository が所属する Agent aggregate ID です。
 * @param database Agent-owned Durable Object SQLite に接続した Drizzle adapter です。
 * @returns Thread identity と mailbox 操作を Agent ID に束縛した repository object です。
 * 返却された method が query/transaction を実行して失敗した場合は、各 method の呼び出し元へ伝播します。
 * @throws この factory 自体は query/transaction を実行せず、repository object を組み立てるだけのため例外を投げません。
 */
export function createAgentThreadsRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentThreadsRepository {
  const table = agentStorageDrizzleSchema.agentThreads;
  return {
    tableName: 'agent_threads',
    findByThreadId(threadId) {
      return database
        .select()
        .from(table)
        .where(and(eq(table.agentId, agentId), eq(table.threadId, threadId)))
        .limit(1)
        .get();
    },
    findByNormalizedThreadKey(normalizedThreadKey) {
      return database
        .select()
        .from(table)
        .where(and(eq(table.agentId, agentId), eq(table.normalizedThreadKey, normalizedThreadKey)))
        .limit(1)
        .get();
    },
    insertThread(input) {
      database
        .insert(table)
        .values({
          agentId,
          createdAtMs: input.nowMs,
          currentSectionId: input.currentSectionId ?? null,
          lastServedAtMs: null,
          normalizedThreadKey: input.normalizedThreadKey,
          priority: input.priority ?? 0,
          status: input.status ?? 'active',
          threadId: input.threadId,
          threadKey: input.threadKey,
          updatedAtMs: input.nowMs,
        })
        .run();
    },
    listThreads(input) {
      const afterCreatedAtMs = input.afterCreatedAtMs ?? -1;
      return database
        .select()
        .from(table)
        .where(
          and(
            eq(table.agentId, agentId),
            gt(table.createdAtMs, afterCreatedAtMs),
            input.status === undefined ? undefined : eq(table.status, input.status),
            input.normalizedThreadKeyPrefix === undefined
              ? undefined
              : like(table.normalizedThreadKey, `${input.normalizedThreadKeyPrefix}%`)
          )
        )
        .orderBy(asc(table.createdAtMs), asc(table.threadId))
        .limit(input.limit)
        .all();
    },
    markThreadServed(input) {
      database
        .update(table)
        .set({ lastServedAtMs: input.nowMs, updatedAtMs: input.nowMs })
        .where(and(eq(table.agentId, agentId), eq(table.threadId, input.threadId)))
        .run();
    },
    updateCurrentSection(input) {
      database
        .update(table)
        .set({ currentSectionId: input.currentSectionId, updatedAtMs: input.nowMs })
        .where(and(eq(table.agentId, agentId), eq(table.threadId, input.threadId)))
        .run();
    },
  };
}
