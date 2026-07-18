import { and, asc, eq, gt, lte } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from '../schema/agent-storage';

import type { AgentStorageDatabase } from '../database';

/**
 * `AgentSectionRow` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentSectionRow {
  readonly threadId: string;
  readonly sectionId: string;
  readonly sequence: number;
  readonly status: string;
  readonly startThreadSequence: number;
  readonly endThreadSequence: number | null;
  readonly openedAtMs: number | null;
  readonly frozenAtMs: number | null;
  readonly eventCount: number;
  readonly createdAtMs: number;
}

/**
 * `InsertAgentSectionInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface InsertAgentSectionInput {
  readonly threadId: string;
  readonly sectionId: string;
  readonly sequence: number;
  readonly status: string;
  readonly startThreadSequence?: number;
  readonly createdAtMs: number;
}

/**
 * `FreezeAgentSectionInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface FreezeAgentSectionInput {
  readonly threadId: string;
  readonly sectionId: string;
  readonly endThreadSequence: number;
  readonly frozenAtMs: number;
}

/**
 * `AgentSectionsRepository` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentSectionsRepository {
  readonly tableName: 'agent_thread_sections';
  findBySectionId(threadId: string, sectionId: string): AgentSectionRow | undefined;
  findOpenSection(threadId: string): AgentSectionRow | undefined;
  freezeSection(input: FreezeAgentSectionInput): void;
  incrementEventCount(threadId: string, sectionId: string): void;
  insertSection(input: InsertAgentSectionInput): void;
  listSections(input: {
    readonly afterSectionOrdinal?: number;
    readonly endSectionOrdinal?: number;
    readonly limit: number;
    readonly startSectionOrdinal?: number;
    readonly threadId: string;
  }): AgentSectionRow[];
}

/**
 * `createAgentSectionsRepository` は Agent Service の内部境界で利用する exported 関数です。
 *
 * @remarks
 * この関数は Agent-owned Durable Object / storage / RPC adapter の責務内で呼び出されます。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 * @param agentId repository が所属する Agent aggregate ID です。
 * @param database Agent-owned Durable Object SQLite に接続した Drizzle adapter です。
 * @returns Thread section 操作を Agent ID に束縛した repository object です。
 * 返却された method が query/transaction を実行して失敗した場合は、各 method の呼び出し元へ伝播します。
 * @throws この factory 自体は query/transaction を実行せず、repository object を組み立てるだけのため例外を投げません。
 */
export function createAgentSectionsRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentSectionsRepository {
  const table = agentStorageDrizzleSchema.agentThreadSections;
  return {
    tableName: 'agent_thread_sections',
    findBySectionId(threadId, sectionId) {
      return database
        .select()
        .from(table)
        .where(
          and(
            eq(table.agentId, agentId),
            eq(table.threadId, threadId),
            eq(table.sectionId, sectionId)
          )
        )
        .limit(1)
        .get();
    },
    findOpenSection(threadId) {
      return database
        .select()
        .from(table)
        .where(
          and(eq(table.agentId, agentId), eq(table.threadId, threadId), eq(table.status, 'active'))
        )
        .orderBy(asc(table.sequence))
        .limit(1)
        .get();
    },
    freezeSection(input) {
      database
        .update(table)
        .set({
          endThreadSequence: input.endThreadSequence,
          frozenAtMs: input.frozenAtMs,
          status: 'frozen',
        })
        .where(
          and(
            eq(table.agentId, agentId),
            eq(table.threadId, input.threadId),
            eq(table.sectionId, input.sectionId)
          )
        )
        .run();
    },
    incrementEventCount(threadId, sectionId) {
      const section = this.findBySectionId(threadId, sectionId);
      database
        .update(table)
        .set({ eventCount: (section?.eventCount ?? 0) + 1 })
        .where(
          and(
            eq(table.agentId, agentId),
            eq(table.threadId, threadId),
            eq(table.sectionId, sectionId)
          )
        )
        .run();
    },
    insertSection(input) {
      database
        .insert(table)
        .values({
          agentId,
          createdAtMs: input.createdAtMs,
          endThreadSequence: null,
          eventCount: 0,
          frozenAtMs: null,
          openedAtMs: input.createdAtMs,
          sectionId: input.sectionId,
          sequence: input.sequence,
          startThreadSequence: input.startThreadSequence ?? 1,
          status: input.status,
          threadId: input.threadId,
        })
        .run();
    },
    listSections(input) {
      return listAgentSectionRows(agentId, database, input);
    },
  };
}

type ListAgentSectionsInput = Parameters<AgentSectionsRepository['listSections']>[0];

function listAgentSectionRows(
  agentId: string,
  database: AgentStorageDatabase,
  input: ListAgentSectionsInput
): AgentSectionRow[] {
  const table = agentStorageDrizzleSchema.agentThreadSections;
  const afterSectionOrdinal = input.afterSectionOrdinal ?? 0;
  const endSectionOrdinal = input.endSectionOrdinal ?? Number.MAX_SAFE_INTEGER;
  const startSectionOrdinal = input.startSectionOrdinal ?? 1;
  return database
    .select()
    .from(table)
    .where(
      and(
        eq(table.agentId, agentId),
        eq(table.threadId, input.threadId),
        gt(table.sequence, afterSectionOrdinal),
        gt(table.sequence, startSectionOrdinal - 1),
        lte(table.sequence, endSectionOrdinal)
      )
    )
    .orderBy(asc(table.sequence))
    .limit(input.limit)
    .all();
}
