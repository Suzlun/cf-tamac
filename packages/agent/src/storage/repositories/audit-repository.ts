import { agentStorageDrizzleSchema } from '../schema/agent-storage';

import type { AgentStorageDatabase } from '../database';

/**
 * `InsertAgentAuditEventInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface InsertAgentAuditEventInput {
  readonly auditId: string;
  readonly eventType: string;
  readonly principalRef?: string;
  readonly requestDigest?: string;
  readonly createdAtMs: number;
}

/**
 * `AgentAuditRepository` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentAuditRepository {
  readonly tableName: 'agent_audit_events';
  insertAuditEvent(input: InsertAgentAuditEventInput): void;
}

/**
 * `createAgentAuditRepository` は Agent Service の内部境界で利用する exported 関数です。
 *
 * @remarks
 * この関数は Agent-owned Durable Object / storage / RPC adapter の責務内で呼び出されます。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 * @param agentId repository が所属する Agent aggregate ID です。
 * @param database Agent-owned Durable Object SQLite に接続した Drizzle adapter です。
 * @returns audit event の追記操作を Agent ID に束縛した repository object です。
 * 返却された method が query/transaction を実行して失敗した場合は、各 method の呼び出し元へ伝播します。
 * @throws この factory 自体は query/transaction を実行せず、repository object を組み立てるだけのため例外を投げません。
 */
export function createAgentAuditRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentAuditRepository {
  const table = agentStorageDrizzleSchema.agentAuditEvents;
  return {
    tableName: 'agent_audit_events',
    insertAuditEvent(input) {
      database
        .insert(table)
        .values({
          agentId,
          auditId: input.auditId,
          createdAtMs: input.createdAtMs,
          eventType: input.eventType,
          principalRef: input.principalRef ?? null,
          requestDigest: input.requestDigest ?? null,
        })
        .run();
    },
  };
}
