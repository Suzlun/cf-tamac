import { and, desc, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from '../schema/agent-storage';

import type { AgentStorageDatabase } from '../database';

/**
 * `AgentCredentialRow` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentCredentialRow {
  readonly credentialId: string;
  readonly generation: number;
  readonly status: string;
  readonly verifierRef: string | null;
  readonly publicFingerprint: string | null;
  readonly secretReference: string | null;
  readonly notBeforeMs: number | null;
  readonly expiresAtMs: number | null;
  readonly revokedAtMs: number | null;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

/**
 * `InsertAgentCredentialInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface InsertAgentCredentialInput {
  readonly credentialId: string;
  readonly generation: number;
  readonly status: string;
  readonly verifierRef?: string;
  readonly publicFingerprint?: string;
  readonly secretReference?: string;
  readonly notBeforeMs?: number;
  readonly expiresAtMs?: number;
  readonly revokedAtMs?: number;
  readonly nowMs: number;
}

/**
 * `UpdateAgentCredentialStatusInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface UpdateAgentCredentialStatusInput {
  readonly credentialId: string;
  readonly status: string;
  readonly expiresAtMs?: number;
  readonly revokedAtMs?: number;
  readonly nowMs: number;
}

/**
 * `AgentCredentialsRepository` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentCredentialsRepository {
  readonly tableName: 'agent_credentials';
  findActiveCredential(nowMs: number): AgentCredentialRow | undefined;
  findCredential(credentialId: string): AgentCredentialRow | undefined;
  findCredentialByGeneration(generation: number): AgentCredentialRow | undefined;
  insertCredential(input: InsertAgentCredentialInput): void;
  listCredentials(): AgentCredentialRow[];
  updateCredentialStatus(input: UpdateAgentCredentialStatusInput): void;
}

/**
 * `createAgentCredentialsRepository` は Agent Service の内部境界で利用する exported 関数です。
 *
 * @remarks
 * この関数は Agent-owned Durable Object / storage / RPC adapter の責務内で呼び出されます。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 * @param agentId repository が所属する Agent aggregate ID です。
 * @param database Agent-owned Durable Object SQLite に接続した Drizzle adapter です。
 * @returns Agent credential 操作を Agent ID に束縛した repository object です。
 * 返却された method が query/transaction を実行して失敗した場合は、各 method の呼び出し元へ伝播します。
 * @throws この factory 自体は query/transaction を実行せず、repository object を組み立てるだけのため例外を投げません。
 */
export function createAgentCredentialsRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentCredentialsRepository {
  const table = agentStorageDrizzleSchema.agentCredentials;
  return {
    tableName: 'agent_credentials',
    findActiveCredential(nowMs) {
      return database
        .select()
        .from(table)
        .where(
          and(
            eq(table.agentId, agentId),
            inArray(table.status, ['active', 'overlap']),
            or(isNull(table.notBeforeMs), lte(table.notBeforeMs, nowMs)),
            or(isNull(table.expiresAtMs), gt(table.expiresAtMs, nowMs))
          )
        )
        .orderBy(desc(table.generation))
        .limit(1)
        .get();
    },
    findCredential(credentialId) {
      return database
        .select()
        .from(table)
        .where(and(eq(table.agentId, agentId), eq(table.credentialId, credentialId)))
        .limit(1)
        .get();
    },
    findCredentialByGeneration(generation) {
      return database
        .select()
        .from(table)
        .where(and(eq(table.agentId, agentId), eq(table.generation, generation)))
        .limit(1)
        .get();
    },
    insertCredential(input) {
      database
        .insert(table)
        .values({
          agentId,
          createdAtMs: input.nowMs,
          credentialId: input.credentialId,
          expiresAtMs: input.expiresAtMs ?? null,
          generation: input.generation,
          notBeforeMs: input.notBeforeMs ?? null,
          publicFingerprint: input.publicFingerprint ?? null,
          revokedAtMs: input.revokedAtMs ?? null,
          secretReference: input.secretReference ?? null,
          status: input.status,
          updatedAtMs: input.nowMs,
          verifierRef: input.verifierRef ?? null,
        })
        .run();
    },
    listCredentials() {
      return database
        .select()
        .from(table)
        .where(eq(table.agentId, agentId))
        .orderBy(table.generation)
        .all();
    },
    updateCredentialStatus(input) {
      database
        .update(table)
        .set({
          expiresAtMs: input.expiresAtMs ?? null,
          revokedAtMs: input.revokedAtMs ?? null,
          status: input.status,
          updatedAtMs: input.nowMs,
        })
        .where(and(eq(table.agentId, agentId), eq(table.credentialId, input.credentialId)))
        .run();
    },
  };
}
