import { and, eq } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from './schema';

import type { AgentStorageDatabase } from './database';
import type {
  AgentToolOutgoingRequestRow,
  AgentToolResultEventRow,
} from './tools-repository-types';

/**
 * Agent-to-Provider Tool request ledger へ送信記録を挿入します。
 *
 * @param agentId Durable Object が所有する Agent ID です。
 * @param database Agent-owned Durable SQLite database です。
 * @param input request ID、digest、signature、Provider target を含む送信記録です。
 * @returns 永続化後に読み戻した outgoing request 行です。
 * @throws insert 後に同じ request ID を読み戻せない場合に Error を投げます。
 * @example
 * ```ts
 * const row = insertOutgoingRequest(agentId, database, input);
 * ```
 */
export function insertOutgoingRequest(
  agentId: string,
  database: AgentStorageDatabase,
  input: Omit<AgentToolOutgoingRequestRow, 'agentId'>
): AgentToolOutgoingRequestRow {
  const table = agentStorageDrizzleSchema.agentToolOutgoingRequests;
  database
    .insert(table)
    .values({ agentId, ...input })
    .run();
  const row = database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.requestId, input.requestId)))
    .limit(1)
    .get();
  if (row === undefined) throw new Error('Tool outgoing request write failed.');
  return row;
}

/**
 * Tool result Event ledger へ result Event の重複抑止記録を挿入します。
 *
 * @param agentId Durable Object が所有する Agent ID です。
 * @param database Agent-owned Durable SQLite database です。
 * @param input invocation ID、Event ID、result status、idempotency key を含む ledger 入力です。
 * @returns 既存行、または新規挿入後に読み戻した result Event ledger 行です。
 * @throws insert 後に同じ invocation ID を読み戻せない場合に Error を投げます。
 * @example
 * ```ts
 * const row = insertResultEvent(agentId, database, input);
 * ```
 */
export function insertResultEvent(
  agentId: string,
  database: AgentStorageDatabase,
  input: Omit<AgentToolResultEventRow, 'agentId'>
): AgentToolResultEventRow {
  const existing = findResultEventByInvocation(agentId, database, input.invocationId);
  if (existing !== undefined) return existing;
  const table = agentStorageDrizzleSchema.agentToolResultEvents;
  database
    .insert(table)
    .values({ agentId, ...input })
    .run();
  const row = findResultEventByInvocation(agentId, database, input.invocationId);
  if (row === undefined) throw new Error('Tool result Event ledger write failed.');
  return row;
}

/**
 * invocation ID から Tool result Event ledger を一件取得します。
 *
 * @param agentId Durable Object が所有する Agent ID です。
 * @param database Agent-owned Durable SQLite database です。
 * @param invocationId 検索対象の ToolInvocation ID です。
 * @returns 該当する ledger 行、存在しない場合は undefined です。
 * @throws この関数は読み取りのみで、Drizzle が失敗した場合を除き例外を投げません。
 * @example
 * ```ts
 * const row = findResultEventByInvocation(agentId, database, invocationId);
 * ```
 */
export function findResultEventByInvocation(
  agentId: string,
  database: AgentStorageDatabase,
  invocationId: string
): AgentToolResultEventRow | undefined {
  const table = agentStorageDrizzleSchema.agentToolResultEvents;
  return database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.invocationId, invocationId)))
    .limit(1)
    .get();
}
