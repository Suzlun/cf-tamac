import { and, asc, desc, eq, gt, max } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from '../schema/agent-storage';

import {
  findResultEventByInvocation,
  insertOutgoingRequest,
  insertResultEvent,
} from './tools-repository-ledger';
import {
  assertConditionalUpdateAffected,
  toDefinitionUpdateValues,
  toDefinitionValues,
  toInvocationValues,
  toProviderOperationUpdateValues,
  toProviderOperationValues,
} from './tools-repository-values';

import type { AgentStorageDatabase } from '../database';
import type {
  AgentProviderOperationRow,
  AgentToolApprovalRow,
  AgentToolCatalogSnapshotRow,
  AgentToolDefinitionRow,
  AgentToolInvocationRow,
  AgentToolsRepository,
  InsertAgentToolInvocationInput,
  UpsertAgentProviderOperationInput,
  UpsertAgentToolDefinitionInput,
} from './tools-repository-types';

export type {
  AgentProviderOperationRow,
  AgentToolApprovalRow,
  AgentToolCatalogSnapshotRow,
  AgentToolDefinitionRow,
  AgentToolInvocationRow,
  AgentToolOutgoingRequestRow,
  AgentToolResultEventRow,
  AgentToolsRepository,
  InsertAgentToolInvocationInput,
  UpsertAgentProviderOperationInput,
  UpsertAgentToolDefinitionInput,
} from './tools-repository-types';

/**
 * 一つの AIAgent Durable Object に閉じた Tool repository を作成します。
 *
 * @param agentId Durable Object identity と一致する Agent ID です。
 * @param database Agent-owned Durable SQLite database です。
 * @returns Tool catalog / invocation / Provider operation を扱う repository です。
 * 返却された method が query/transaction を実行して失敗した場合は、各 method の呼び出し元へ伝播します。
 * @throws この factory 自体は query/transaction を実行せず、repository object を組み立てるだけのため例外を投げません。
 */
export function createAgentToolsRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentToolsRepository {
  return {
    approvalTableName: 'agent_tool_approvals',
    catalogSnapshotTableName: 'agent_tool_catalog_snapshots',
    definitionTableName: 'agent_tool_definitions',
    invocationTableName: 'agent_tool_invocations',
    outgoingRequestTableName: 'agent_tool_outgoing_requests',
    providerOperationTableName: 'agent_provider_operations',
    resultEventTableName: 'agent_tool_result_events',
    attachApproval: (input) => attachApproval(agentId, database, input),
    attachProviderOperation: (input) => attachProviderOperation(agentId, database, input),
    createCatalogSnapshot: (input) => createCatalogSnapshot(agentId, database, input),
    findApprovalForInvocation: (invocationId) =>
      findApprovalForInvocation(agentId, database, invocationId),
    findDefinition: (toolId) => findDefinition(agentId, database, toolId),
    findInvocation: (invocationId) => findInvocation(agentId, database, invocationId),
    findInvocationByIdempotencyKey: (idempotencyKey) =>
      findInvocationByIdempotencyKey(agentId, database, idempotencyKey),
    findProviderOperation: (operationId) => findProviderOperation(agentId, database, operationId),
    findProviderOperationByInvocation: (invocationId) =>
      findProviderOperationByInvocation(agentId, database, invocationId),
    findResultEventByInvocation: (invocationId) =>
      findResultEventByInvocation(agentId, database, invocationId),
    getLatestCatalogSnapshot: () => getLatestCatalogSnapshot(agentId, database),
    getNextToolSetVersion: () => getNextToolSetVersion(agentId, database),
    incrementInvocationAttempt: (input) => incrementInvocationAttempt(agentId, database, input),
    insertApproval: (input) => insertApproval(agentId, database, input),
    insertInvocation: (input) => insertInvocation(agentId, database, input),
    insertOutgoingRequest: (input) => insertOutgoingRequest(agentId, database, input),
    insertResultEvent: (input) => insertResultEvent(agentId, database, input),
    listDefinitions: (input) => listDefinitions(agentId, database, input),
    listInvocations: (input) => listInvocations(agentId, database, input),
    markInvocationResult: (input) => markInvocationResult(agentId, database, input),
    markProviderOperationCancellation: (input) =>
      markProviderOperationCancellation(agentId, database, input),
    transitionInvocationStatus: (input) => transitionInvocationStatus(agentId, database, input),
    updateProviderOperationStatus: (input) =>
      updateProviderOperationStatus(agentId, database, input),
    upsertDefinition: (input) => upsertDefinition(agentId, database, input),
    upsertProviderOperation: (input) => upsertProviderOperation(agentId, database, input),
  };
}

function upsertDefinition(
  agentId: string,
  database: AgentStorageDatabase,
  input: UpsertAgentToolDefinitionInput
): AgentToolDefinitionRow {
  const table = agentStorageDrizzleSchema.agentToolDefinitions;
  const existing = findDefinition(agentId, database, input.toolId);
  if (existing === undefined) {
    database.insert(table).values(toDefinitionValues(agentId, input)).run();
  } else {
    database
      .update(table)
      .set(toDefinitionUpdateValues(input))
      .where(and(eq(table.agentId, agentId), eq(table.toolId, input.toolId)))
      .run();
  }
  return requireDefinition(agentId, database, input.toolId);
}

function listDefinitions(
  agentId: string,
  database: AgentStorageDatabase,
  input: {
    readonly includeUnavailable?: boolean;
    readonly installationId?: string;
    readonly limit: number;
  }
): AgentToolDefinitionRow[] {
  const table = agentStorageDrizzleSchema.agentToolDefinitions;
  return database
    .select()
    .from(table)
    .where(
      and(
        eq(table.agentId, agentId),
        input.includeUnavailable === true ? undefined : eq(table.status, 'active'),
        input.installationId === undefined
          ? undefined
          : eq(table.installationId, input.installationId)
      )
    )
    .orderBy(asc(table.toolId))
    .limit(input.limit)
    .all();
}

function findDefinition(
  agentId: string,
  database: AgentStorageDatabase,
  toolId: string
): AgentToolDefinitionRow | undefined {
  const table = agentStorageDrizzleSchema.agentToolDefinitions;
  return database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.toolId, toolId)))
    .limit(1)
    .get();
}

function createCatalogSnapshot(
  agentId: string,
  database: AgentStorageDatabase,
  input: {
    readonly createdAtMs: number;
    readonly definitionCount: number;
    readonly digestSha256: string;
    readonly snapshotRef: string;
    readonly toolSetVersion: number;
  }
): AgentToolCatalogSnapshotRow {
  const table = agentStorageDrizzleSchema.agentToolCatalogSnapshots;
  database
    .insert(table)
    .values({ agentId, ...input })
    .run();
  return requireCatalogSnapshot(agentId, database, input.toolSetVersion);
}

function getLatestCatalogSnapshot(
  agentId: string,
  database: AgentStorageDatabase
): AgentToolCatalogSnapshotRow | undefined {
  const table = agentStorageDrizzleSchema.agentToolCatalogSnapshots;
  return database
    .select()
    .from(table)
    .where(eq(table.agentId, agentId))
    .orderBy(desc(table.toolSetVersion))
    .limit(1)
    .get();
}

function getNextToolSetVersion(agentId: string, database: AgentStorageDatabase): number {
  const table = agentStorageDrizzleSchema.agentToolCatalogSnapshots;
  const row = database
    .select({ latestVersion: max(table.toolSetVersion) })
    .from(table)
    .where(eq(table.agentId, agentId))
    .get();
  return (row?.latestVersion ?? 0) + 1;
}

function insertInvocation(
  agentId: string,
  database: AgentStorageDatabase,
  input: InsertAgentToolInvocationInput
): AgentToolInvocationRow {
  const table = agentStorageDrizzleSchema.agentToolInvocations;
  database.insert(table).values(toInvocationValues(agentId, input)).run();
  return requireInvocation(agentId, database, input.invocationId);
}

function findInvocation(
  agentId: string,
  database: AgentStorageDatabase,
  invocationId: string
): AgentToolInvocationRow | undefined {
  const table = agentStorageDrizzleSchema.agentToolInvocations;
  return database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.invocationId, invocationId)))
    .limit(1)
    .get();
}

function findInvocationByIdempotencyKey(
  agentId: string,
  database: AgentStorageDatabase,
  idempotencyKey: string
): AgentToolInvocationRow | undefined {
  const table = agentStorageDrizzleSchema.agentToolInvocations;
  return database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.idempotencyKey, idempotencyKey)))
    .limit(1)
    .get();
}

function listInvocations(
  agentId: string,
  database: AgentStorageDatabase,
  input: {
    readonly afterCreatedAtMs?: number;
    readonly afterInvocationId?: string;
    readonly installationId?: string;
    readonly limit: number;
    readonly runId?: string;
    readonly status?: string;
    readonly threadId?: string;
  }
): AgentToolInvocationRow[] {
  const table = agentStorageDrizzleSchema.agentToolInvocations;
  return database
    .select()
    .from(table)
    .where(
      and(
        eq(table.agentId, agentId),
        input.threadId === undefined ? undefined : eq(table.threadId, input.threadId),
        input.runId === undefined ? undefined : eq(table.runId, input.runId),
        input.status === undefined ? undefined : eq(table.status, input.status),
        input.installationId === undefined
          ? undefined
          : eq(table.installationId, input.installationId),
        input.afterCreatedAtMs === undefined
          ? undefined
          : gt(table.createdAtMs, input.afterCreatedAtMs)
      )
    )
    .orderBy(asc(table.createdAtMs), asc(table.invocationId))
    .limit(input.limit)
    .all();
}

function transitionInvocationStatus(
  agentId: string,
  database: AgentStorageDatabase,
  input: {
    readonly failureReason?: string;
    readonly fromStatus?: string;
    readonly invocationId: string;
    readonly providerOperationId?: string;
    readonly status: string;
    readonly updatedAtMs: number;
  }
): AgentToolInvocationRow {
  const table = agentStorageDrizzleSchema.agentToolInvocations;
  const result = database
    .update(table)
    .set({
      failureReason: input.failureReason ?? undefined,
      providerOperationId: input.providerOperationId ?? undefined,
      status: input.status,
      updatedAtMs: input.updatedAtMs,
    })
    .where(
      and(
        eq(table.agentId, agentId),
        eq(table.invocationId, input.invocationId),
        input.fromStatus === undefined ? undefined : eq(table.status, input.fromStatus)
      )
    )
    .run();
  assertConditionalUpdateAffected(result, 'ToolInvocation conditional status update failed.');
  return requireInvocation(agentId, database, input.invocationId);
}

function incrementInvocationAttempt(
  agentId: string,
  database: AgentStorageDatabase,
  input: { readonly invocationId: string; readonly updatedAtMs: number }
): AgentToolInvocationRow {
  const current = requireInvocation(agentId, database, input.invocationId);
  const table = agentStorageDrizzleSchema.agentToolInvocations;
  database
    .update(table)
    .set({ attemptCount: current.attemptCount + 1, updatedAtMs: input.updatedAtMs })
    .where(and(eq(table.agentId, agentId), eq(table.invocationId, input.invocationId)))
    .run();
  return requireInvocation(agentId, database, input.invocationId);
}

function attachApproval(
  agentId: string,
  database: AgentStorageDatabase,
  input: {
    readonly approvalId: string;
    readonly invocationId: string;
    readonly status: string;
    readonly updatedAtMs: number;
  }
): AgentToolInvocationRow {
  const table = agentStorageDrizzleSchema.agentToolInvocations;
  database
    .update(table)
    .set({ approvalId: input.approvalId, status: input.status, updatedAtMs: input.updatedAtMs })
    .where(and(eq(table.agentId, agentId), eq(table.invocationId, input.invocationId)))
    .run();
  return requireInvocation(agentId, database, input.invocationId);
}

function attachProviderOperation(
  agentId: string,
  database: AgentStorageDatabase,
  input: {
    readonly invocationId: string;
    readonly operationId: string;
    readonly status: string;
    readonly updatedAtMs: number;
  }
): AgentToolInvocationRow {
  const table = agentStorageDrizzleSchema.agentToolInvocations;
  database
    .update(table)
    .set({
      providerOperationId: input.operationId,
      status: input.status,
      updatedAtMs: input.updatedAtMs,
    })
    .where(and(eq(table.agentId, agentId), eq(table.invocationId, input.invocationId)))
    .run();
  return requireInvocation(agentId, database, input.invocationId);
}

function markInvocationResult(
  agentId: string,
  database: AgentStorageDatabase,
  input: {
    readonly failureReason?: string;
    readonly fromStatus?: string;
    readonly invocationId: string;
    readonly outputRef?: string;
    readonly resultEventId?: string;
    readonly status: string;
    readonly updatedAtMs: number;
  }
): AgentToolInvocationRow {
  const table = agentStorageDrizzleSchema.agentToolInvocations;
  const result = database
    .update(table)
    .set({
      failureReason: input.failureReason ?? undefined,
      outputRef: input.outputRef ?? undefined,
      resultEventId: input.resultEventId ?? undefined,
      status: input.status,
      updatedAtMs: input.updatedAtMs,
    })
    .where(
      and(
        eq(table.agentId, agentId),
        eq(table.invocationId, input.invocationId),
        input.fromStatus === undefined ? undefined : eq(table.status, input.fromStatus)
      )
    )
    .run();
  assertConditionalUpdateAffected(result, 'ToolInvocation conditional result update failed.');
  return requireInvocation(agentId, database, input.invocationId);
}

function insertApproval(
  agentId: string,
  database: AgentStorageDatabase,
  input: {
    readonly actorId: string;
    readonly approvalId: string;
    readonly auditEventId?: string;
    readonly decidedAtMs: number;
    readonly decision: string;
    readonly invocationId: string;
    readonly principalId: string;
    readonly reason?: string;
  }
): AgentToolApprovalRow {
  const table = agentStorageDrizzleSchema.agentToolApprovals;
  database
    .insert(table)
    .values({
      agentId,
      auditEventId: input.auditEventId ?? null,
      reason: input.reason ?? null,
      ...input,
    })
    .run();
  const row = findApprovalForInvocation(agentId, database, input.invocationId);
  if (row === undefined) throw new Error('Tool approval write failed.');
  return row;
}

function findApprovalForInvocation(
  agentId: string,
  database: AgentStorageDatabase,
  invocationId: string
): AgentToolApprovalRow | undefined {
  const table = agentStorageDrizzleSchema.agentToolApprovals;
  return database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.invocationId, invocationId)))
    .limit(1)
    .get();
}

function upsertProviderOperation(
  agentId: string,
  database: AgentStorageDatabase,
  input: UpsertAgentProviderOperationInput
): AgentProviderOperationRow {
  const table = agentStorageDrizzleSchema.agentProviderOperations;
  const existing = findProviderOperation(agentId, database, input.operationId);
  if (existing === undefined) {
    database.insert(table).values(toProviderOperationValues(agentId, input)).run();
  } else {
    database
      .update(table)
      .set(toProviderOperationUpdateValues(input))
      .where(and(eq(table.agentId, agentId), eq(table.operationId, input.operationId)))
      .run();
  }
  return requireProviderOperation(agentId, database, input.operationId);
}

function findProviderOperation(
  agentId: string,
  database: AgentStorageDatabase,
  operationId: string
): AgentProviderOperationRow | undefined {
  const table = agentStorageDrizzleSchema.agentProviderOperations;
  return database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.operationId, operationId)))
    .limit(1)
    .get();
}

function findProviderOperationByInvocation(
  agentId: string,
  database: AgentStorageDatabase,
  invocationId: string
): AgentProviderOperationRow | undefined {
  const table = agentStorageDrizzleSchema.agentProviderOperations;
  return database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.invocationId, invocationId)))
    .limit(1)
    .get();
}

function updateProviderOperationStatus(
  agentId: string,
  database: AgentStorageDatabase,
  input: {
    readonly operationId: string;
    readonly providerOperationRef?: string;
    readonly status: string;
    readonly updatedAtMs: number;
  }
): AgentProviderOperationRow {
  const table = agentStorageDrizzleSchema.agentProviderOperations;
  database
    .update(table)
    .set({
      providerOperationRef: input.providerOperationRef ?? undefined,
      status: input.status,
      updatedAtMs: input.updatedAtMs,
    })
    .where(and(eq(table.agentId, agentId), eq(table.operationId, input.operationId)))
    .run();
  return requireProviderOperation(agentId, database, input.operationId);
}

function markProviderOperationCancellation(
  agentId: string,
  database: AgentStorageDatabase,
  input: { readonly operationId: string; readonly requestedAtMs: number; readonly status: string }
): AgentProviderOperationRow {
  const table = agentStorageDrizzleSchema.agentProviderOperations;
  database
    .update(table)
    .set({
      cancellationRequestedAtMs: input.requestedAtMs,
      status: input.status,
      updatedAtMs: input.requestedAtMs,
    })
    .where(and(eq(table.agentId, agentId), eq(table.operationId, input.operationId)))
    .run();
  return requireProviderOperation(agentId, database, input.operationId);
}

function requireDefinition(
  agentId: string,
  database: AgentStorageDatabase,
  toolId: string
): AgentToolDefinitionRow {
  const row = findDefinition(agentId, database, toolId);
  if (row === undefined) throw new Error('ToolDefinition write failed.');
  return row;
}

function requireInvocation(
  agentId: string,
  database: AgentStorageDatabase,
  invocationId: string
): AgentToolInvocationRow {
  const row = findInvocation(agentId, database, invocationId);
  if (row === undefined) throw new Error('ToolInvocation write failed.');
  return row;
}

function requireCatalogSnapshot(
  agentId: string,
  database: AgentStorageDatabase,
  toolSetVersion: number
): AgentToolCatalogSnapshotRow {
  const table = agentStorageDrizzleSchema.agentToolCatalogSnapshots;
  const row = database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.toolSetVersion, toolSetVersion)))
    .limit(1)
    .get();
  if (row === undefined) throw new Error('Tool catalog snapshot write failed.');
  return row;
}

function requireProviderOperation(
  agentId: string,
  database: AgentStorageDatabase,
  operationId: string
): AgentProviderOperationRow {
  const row = findProviderOperation(agentId, database, operationId);
  if (row === undefined) throw new Error('Provider operation write failed.');
  return row;
}
