import { and, asc, desc, eq, inArray, lte } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from '../schema/agent-storage';

import type { AgentStorageDatabase } from '../database';

/**
 * `AgentModelInvocationRow` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentModelInvocationRow {
  readonly attempt: number;
  readonly createdAtMs: number;
  readonly decisionSchemaVersion: string;
  readonly heartbeatAtMs: number | null;
  readonly inputTokenCount: number | null;
  readonly invocationId: string;
  readonly latencyMs: number | null;
  readonly leaseExpiresAtMs: number | null;
  readonly leaseOwner: string | null;
  readonly modelId: string;
  readonly outputTokenCount: number | null;
  readonly policyDigest: string;
  readonly policyRef: string;
  readonly provider: string;
  readonly providerErrorCategory: string | null;
  readonly requestDigest: string | null;
  readonly responseDigest: string | null;
  readonly runId: string;
  readonly safeMetadataRef: string | null;
  readonly status: string;
  readonly threadId: string;
  readonly updatedAtMs: number;
}

/**
 * `StartAgentModelInvocationInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface StartAgentModelInvocationInput {
  readonly attempt: number;
  readonly createdAtMs: number;
  readonly decisionSchemaVersion: string;
  readonly heartbeatAtMs?: number;
  readonly invocationId: string;
  readonly leaseExpiresAtMs?: number;
  readonly leaseOwner?: string;
  readonly modelId: string;
  readonly policyDigest: string;
  readonly policyRef: string;
  readonly provider: string;
  readonly requestDigest?: string;
  readonly runId: string;
  readonly safeMetadataRef?: string;
  readonly threadId: string;
}

/**
 * `CompleteAgentModelInvocationInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface CompleteAgentModelInvocationInput {
  readonly inputTokenCount?: number;
  readonly invocationId: string;
  readonly latencyMs?: number;
  readonly outputTokenCount?: number;
  readonly responseDigest?: string;
  readonly status: 'succeeded' | 'failed';
  readonly updatedAtMs: number;
}

/**
 * `FailAgentModelInvocationInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface FailAgentModelInvocationInput {
  readonly invocationId: string;
  readonly latencyMs?: number;
  readonly providerErrorCategory: string;
  readonly responseDigest?: string;
  readonly updatedAtMs: number;
}

/**
 * `HeartbeatAgentModelInvocationInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface HeartbeatAgentModelInvocationInput {
  readonly heartbeatAtMs: number;
  readonly invocationId: string;
  readonly leaseExpiresAtMs?: number;
  readonly leaseOwner?: string;
}

/**
 * `AgentModelInvocationRepository` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentModelInvocationRepository {
  readonly tableName: 'agent_model_invocations';
  completeInvocation(input: CompleteAgentModelInvocationInput): AgentModelInvocationRow | undefined;
  failInvocation(input: FailAgentModelInvocationInput): AgentModelInvocationRow | undefined;
  findInvocation(invocationId: string): AgentModelInvocationRow | undefined;
  findLatestForRun(runId: string): AgentModelInvocationRow | undefined;
  findRecoverableInvocation(nowMs: number): AgentModelInvocationRow | undefined;
  heartbeatInvocation(
    input: HeartbeatAgentModelInvocationInput
  ): AgentModelInvocationRow | undefined;
  listForRun(runId: string): AgentModelInvocationRow[];
  startInvocation(input: StartAgentModelInvocationInput): AgentModelInvocationRow;
}

/**
 * Model invocation ledger repository を作成します。
 *
 * @param agentId repository が所属する Agent ID です。
 * @param database Durable Object SQLite に接続する Drizzle adapter です。
 * @returns Invocation attempt/heartbeat/completion/recovery 用 repository です。
 * 返却された method が query/transaction を実行して失敗した場合は、各 method の呼び出し元へ伝播します。
 * @throws この factory 自体は query/transaction を実行せず、repository object を組み立てるだけのため例外を投げません。
 */
export function createAgentModelInvocationRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentModelInvocationRepository {
  const table = agentStorageDrizzleSchema.agentModelInvocations;
  return {
    completeInvocation(input) {
      database
        .update(table)
        .set({
          inputTokenCount: input.inputTokenCount ?? null,
          latencyMs: input.latencyMs ?? null,
          outputTokenCount: input.outputTokenCount ?? null,
          responseDigest: input.responseDigest ?? null,
          status: input.status,
          updatedAtMs: input.updatedAtMs,
        })
        .where(and(eq(table.agentId, agentId), eq(table.invocationId, input.invocationId)))
        .run();
      return findInvocation(agentId, database, input.invocationId);
    },
    failInvocation(input) {
      database
        .update(table)
        .set({
          latencyMs: input.latencyMs ?? null,
          providerErrorCategory: input.providerErrorCategory,
          responseDigest: input.responseDigest ?? null,
          status: 'failed',
          updatedAtMs: input.updatedAtMs,
        })
        .where(and(eq(table.agentId, agentId), eq(table.invocationId, input.invocationId)))
        .run();
      return findInvocation(agentId, database, input.invocationId);
    },
    findInvocation: (invocationId) => findInvocation(agentId, database, invocationId),
    findLatestForRun: (runId) => findLatestForRun(agentId, database, runId),
    findRecoverableInvocation(nowMs) {
      return database
        .select()
        .from(table)
        .where(
          and(
            eq(table.agentId, agentId),
            inArray(table.status, ['running', 'started']),
            lte(table.leaseExpiresAtMs, nowMs)
          )
        )
        .orderBy(asc(table.updatedAtMs), asc(table.invocationId))
        .limit(1)
        .get();
    },
    heartbeatInvocation(input) {
      database
        .update(table)
        .set({
          heartbeatAtMs: input.heartbeatAtMs,
          leaseExpiresAtMs: input.leaseExpiresAtMs ?? undefined,
          leaseOwner: input.leaseOwner ?? undefined,
          updatedAtMs: input.heartbeatAtMs,
        })
        .where(and(eq(table.agentId, agentId), eq(table.invocationId, input.invocationId)))
        .run();
      return findInvocation(agentId, database, input.invocationId);
    },
    listForRun(runId) {
      return database
        .select()
        .from(table)
        .where(and(eq(table.agentId, agentId), eq(table.runId, runId)))
        .orderBy(asc(table.attempt), asc(table.invocationId))
        .all();
    },
    startInvocation(input) {
      database
        .insert(table)
        .values({
          agentId,
          attempt: input.attempt,
          createdAtMs: input.createdAtMs,
          decisionSchemaVersion: input.decisionSchemaVersion,
          heartbeatAtMs: input.heartbeatAtMs ?? input.createdAtMs,
          inputTokenCount: null,
          invocationId: input.invocationId,
          latencyMs: null,
          leaseExpiresAtMs: input.leaseExpiresAtMs ?? null,
          leaseOwner: input.leaseOwner ?? null,
          modelId: input.modelId,
          outputTokenCount: null,
          policyDigest: input.policyDigest,
          policyRef: input.policyRef,
          provider: input.provider,
          providerErrorCategory: null,
          requestDigest: input.requestDigest ?? null,
          responseDigest: null,
          runId: input.runId,
          safeMetadataRef: input.safeMetadataRef ?? null,
          status: 'running',
          threadId: input.threadId,
          updatedAtMs: input.createdAtMs,
        })
        .run();
      const row = findInvocation(agentId, database, input.invocationId);
      if (row === undefined) throw new Error('model invocation insert did not return a row.');
      return row;
    },
    tableName: 'agent_model_invocations',
  };
}

function findInvocation(
  agentId: string,
  database: AgentStorageDatabase,
  invocationId: string
): AgentModelInvocationRow | undefined {
  const table = agentStorageDrizzleSchema.agentModelInvocations;
  return database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.invocationId, invocationId)))
    .limit(1)
    .get();
}

function findLatestForRun(
  agentId: string,
  database: AgentStorageDatabase,
  runId: string
): AgentModelInvocationRow | undefined {
  const table = agentStorageDrizzleSchema.agentModelInvocations;
  return database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.runId, runId)))
    .orderBy(desc(table.attempt), desc(table.createdAtMs), desc(table.invocationId))
    .limit(1)
    .get();
}
