import { and, asc, desc, eq, gt, max } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from '../schema/agent-storage';

import type { AgentStorageDatabase } from '../database';

/**
 * `AgentEventRow` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentEventRow {
  readonly eventId: string;
  readonly threadId: string;
  readonly sectionId: string;
  readonly eventType: string;
  readonly idempotencyKey: string;
  readonly source: string;
  readonly threadKey: string;
  readonly normalizedThreadKey: string;
  readonly requestDigest: string | null;
  readonly payloadRef: string | null;
  readonly payloadContentType: string | null;
  readonly payloadByteSize: number | null;
  readonly payloadSha256: string | null;
  readonly payloadStorageClass: string | null;
  readonly payloadInlineBase64: string | null;
  readonly agentSequence: number;
  readonly threadSequence: number;
  readonly occurredAtMs: number;
  readonly correlationId: string | null;
  readonly causationId: string | null;
  readonly deliveryContextId?: string | null;
  readonly policyOverrideSource?: string | null;
  readonly requestedModelPolicyDigest?: string | null;
  readonly requestedModelPolicyRef?: string | null;
  readonly requestedModelPolicyValidationStatus?: string | null;
  readonly requestedModelPolicyVersion?: number | null;
  readonly runId: string | null;
  readonly createdAtMs: number;
}

/**
 * `AgentEventSequencePair` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentEventSequencePair {
  readonly agentSequence: number;
  readonly threadSequence: number;
}

/**
 * `AppendAgentEventInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AppendAgentEventInput {
  readonly eventId: string;
  readonly threadId: string;
  readonly sectionId: string;
  readonly idempotencyKey: string;
  readonly eventType: string;
  readonly source: string;
  readonly threadKey: string;
  readonly normalizedThreadKey: string;
  readonly requestDigest?: string;
  readonly payloadRef?: string;
  readonly payloadContentType?: string;
  readonly payloadByteSize?: number;
  readonly payloadSha256?: string;
  readonly payloadStorageClass?: string;
  readonly payloadInlineBase64?: string;
  readonly sequences: AgentEventSequencePair;
  readonly occurredAtMs: number;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly deliveryContextId?: string;
  readonly policyOverrideSource?: string;
  readonly requestedModelPolicyDigest?: string;
  readonly requestedModelPolicyRef?: string;
  readonly requestedModelPolicyValidationStatus?: string;
  readonly requestedModelPolicyVersion?: number;
  readonly runId?: string;
  readonly createdAtMs: number;
}

/**
 * `ListAgentEventsInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface ListAgentEventsInput {
  readonly threadId: string;
  readonly limit: number;
  readonly afterThreadSequence?: number;
  readonly sectionId?: string;
  readonly eventType?: string;
}

/**
 * `AgentEventsRepository` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentEventsRepository {
  readonly tableName: 'agent_events';
  appendEvent(input: AppendAgentEventInput): void;
  findByEventId(eventId: string): AgentEventRow | undefined;
  findByIdempotencyKey(idempotencyKey: string): AgentEventRow | undefined;
  findLatestForThread(threadId: string): AgentEventRow | undefined;
  getNextSequences(threadId: string): AgentEventSequencePair;
  listEvents(input: ListAgentEventsInput): AgentEventRow[];
}

/**
 * `createAgentEventsRepository` は Agent Service の内部境界で利用する exported 関数です。
 *
 * @remarks
 * この関数は Agent-owned Durable Object / storage / RPC adapter の責務内で呼び出されます。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 * @param agentId repository が所属する Agent aggregate ID です。
 * @param database Agent-owned Durable Object SQLite に接続した Drizzle adapter です。
 * @returns Event 受付・参照操作を Agent ID に束縛した repository object です。
 * 返却された method が query/transaction を実行して失敗した場合は、各 method の呼び出し元へ伝播します。
 * @throws この factory 自体は query/transaction を実行せず、repository object を組み立てるだけのため例外を投げません。
 */
export function createAgentEventsRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentEventsRepository {
  const table = agentStorageDrizzleSchema.agentEvents;
  return {
    tableName: 'agent_events',
    appendEvent(input) {
      database
        .insert(table)
        .values({
          agentId,
          agentSequence: input.sequences.agentSequence,
          causationId: input.causationId ?? null,
          correlationId: input.correlationId ?? null,
          createdAtMs: input.createdAtMs,
          deliveryContextId: input.deliveryContextId ?? null,
          eventId: input.eventId,
          eventType: input.eventType,
          idempotencyKey: input.idempotencyKey,
          normalizedThreadKey: input.normalizedThreadKey,
          occurredAtMs: input.occurredAtMs,
          payloadByteSize: input.payloadByteSize ?? null,
          payloadContentType: input.payloadContentType ?? null,
          payloadInlineBase64: input.payloadInlineBase64 ?? null,
          payloadRef: input.payloadRef ?? null,
          payloadSha256: input.payloadSha256 ?? null,
          payloadStorageClass: input.payloadStorageClass ?? null,
          policyOverrideSource: input.policyOverrideSource ?? null,
          requestedModelPolicyDigest: input.requestedModelPolicyDigest ?? null,
          requestedModelPolicyRef: input.requestedModelPolicyRef ?? null,
          requestedModelPolicyValidationStatus: input.requestedModelPolicyValidationStatus ?? null,
          requestedModelPolicyVersion: input.requestedModelPolicyVersion ?? null,
          requestDigest: input.requestDigest ?? null,
          runId: input.runId ?? null,
          sectionId: input.sectionId,
          source: input.source,
          threadId: input.threadId,
          threadKey: input.threadKey,
          threadSequence: input.sequences.threadSequence,
        })
        .run();
    },
    findByEventId(eventId) {
      return database
        .select()
        .from(table)
        .where(and(eq(table.agentId, agentId), eq(table.eventId, eventId)))
        .limit(1)
        .get();
    },
    findByIdempotencyKey(idempotencyKey) {
      return database
        .select()
        .from(table)
        .where(and(eq(table.agentId, agentId), eq(table.idempotencyKey, idempotencyKey)))
        .limit(1)
        .get();
    },
    findLatestForThread(threadId) {
      return database
        .select()
        .from(table)
        .where(and(eq(table.agentId, agentId), eq(table.threadId, threadId)))
        .orderBy(desc(table.threadSequence))
        .limit(1)
        .get();
    },
    getNextSequences(threadId) {
      const agentRow = database
        .select({ lastSequence: max(table.agentSequence) })
        .from(table)
        .where(eq(table.agentId, agentId))
        .get();
      const threadRow = database
        .select({ lastSequence: max(table.threadSequence) })
        .from(table)
        .where(and(eq(table.agentId, agentId), eq(table.threadId, threadId)))
        .get();
      return {
        agentSequence: (agentRow?.lastSequence ?? 0) + 1,
        threadSequence: (threadRow?.lastSequence ?? 0) + 1,
      };
    },
    listEvents(input) {
      return database
        .select()
        .from(table)
        .where(
          and(
            eq(table.agentId, agentId),
            eq(table.threadId, input.threadId),
            gt(table.threadSequence, input.afterThreadSequence ?? 0),
            input.sectionId === undefined ? undefined : eq(table.sectionId, input.sectionId),
            input.eventType === undefined ? undefined : eq(table.eventType, input.eventType)
          )
        )
        .orderBy(asc(table.threadSequence))
        .limit(input.limit)
        .all();
    },
  };
}
