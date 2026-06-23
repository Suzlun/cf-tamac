import { and, asc, desc, eq } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from './schema';

import type { AgentStorageDatabase } from './database';

/**
 * Stored interrupt flag for a running AgentRun.
 */
export interface AgentRunInterruptRow {
  readonly interruptId: string;
  readonly interruptType: string;
  readonly reason: string;
  readonly requestedStatus: string;
  readonly runId: string;
  readonly safeAuditRef: string | null;
  readonly snapshotRef: string | null;
  readonly createdAtMs: number;
}

/**
 * Input used to store an AgentRun interrupt flag.
 */
export interface InsertAgentRunInterruptInput {
  readonly interruptId: string;
  readonly interruptType: string;
  readonly reason: string;
  readonly requestedStatus: string;
  readonly runId: string;
  readonly safeAuditRef?: string;
  readonly snapshotRef?: string;
  readonly createdAtMs: number;
}

/**
 * Stored harness decision seam or applied decision record.
 */
export interface AgentHarnessDecisionRecordRow {
  readonly decisionId: string;
  readonly decisionRecordId: string;
  readonly decisionType: string;
  readonly reason: string | null;
  readonly runId: string;
  readonly seam: string;
  readonly status: string;
  readonly threadId: string;
  readonly createdAtMs: number;
}

/**
 * Input used to persist a harness decision record.
 */
export interface InsertAgentHarnessDecisionRecordInput {
  readonly decisionId: string;
  readonly decisionRecordId: string;
  readonly decisionType: string;
  readonly reason?: string;
  readonly runId: string;
  readonly seam: string;
  readonly status: string;
  readonly threadId: string;
  readonly createdAtMs: number;
}

/**
 * Stored budget ledger entry for Run-level or aggregate enforcement.
 */
export interface AgentRunBudgetLedgerRow {
  readonly budgetDimension: string;
  readonly budgetRecordId: string;
  readonly budgetScope: string;
  readonly limitValue: number | null;
  readonly reason: string | null;
  readonly runId: string;
  readonly status: string;
  readonly usedValue: number;
  readonly createdAtMs: number;
}

/**
 * Input used to persist a budget check ledger entry.
 */
export interface InsertAgentRunBudgetLedgerInput {
  readonly budgetDimension: string;
  readonly budgetRecordId: string;
  readonly budgetScope: string;
  readonly limitValue?: number;
  readonly reason?: string;
  readonly runId: string;
  readonly status: string;
  readonly usedValue: number;
  readonly createdAtMs: number;
}

/**
 * Repository for Agent Stage 3 runtime/harness persistence seams.
 */
export interface AgentRuntimeRepository {
  readonly budgetLedgerTableName: 'agent_run_budget_ledger';
  readonly decisionTableName: 'agent_harness_decision_records';
  readonly interruptTableName: 'agent_run_interrupts';
  findLatestRunInterrupt(runId: string): AgentRunInterruptRow | undefined;
  listBudgetLedgerEntries(runId: string): AgentRunBudgetLedgerRow[];
  listHarnessDecisionRecords(runId: string): AgentHarnessDecisionRecordRow[];
  recordBudgetLedgerEntry(input: InsertAgentRunBudgetLedgerInput): AgentRunBudgetLedgerRow;
  recordHarnessDecision(
    input: InsertAgentHarnessDecisionRecordInput
  ): AgentHarnessDecisionRecordRow;
  recordRunInterrupt(input: InsertAgentRunInterruptInput): AgentRunInterruptRow;
}

/**
 * Create the Stage 3 runtime repository for one Agent aggregate.
 */
export function createAgentRuntimeRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentRuntimeRepository {
  return {
    budgetLedgerTableName: 'agent_run_budget_ledger',
    decisionTableName: 'agent_harness_decision_records',
    findLatestRunInterrupt: (runId) => findLatestRunInterrupt(agentId, database, runId),
    interruptTableName: 'agent_run_interrupts',
    listBudgetLedgerEntries: (runId) => listBudgetLedgerEntries(agentId, database, runId),
    listHarnessDecisionRecords: (runId) => listHarnessDecisionRecords(agentId, database, runId),
    recordBudgetLedgerEntry: (input) => recordBudgetLedgerEntry(agentId, database, input),
    recordHarnessDecision: (input) => recordHarnessDecision(agentId, database, input),
    recordRunInterrupt: (input) => recordRunInterrupt(agentId, database, input),
  };
}

function findLatestRunInterrupt(
  agentId: string,
  database: AgentStorageDatabase,
  runId: string
): AgentRunInterruptRow | undefined {
  const table = agentStorageDrizzleSchema.agentRunInterrupts;
  return database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.runId, runId)))
    .orderBy(desc(table.createdAtMs), desc(table.interruptId))
    .limit(1)
    .get();
}

function listBudgetLedgerEntries(
  agentId: string,
  database: AgentStorageDatabase,
  runId: string
): AgentRunBudgetLedgerRow[] {
  const table = agentStorageDrizzleSchema.agentRunBudgetLedger;
  return database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.runId, runId)))
    .orderBy(asc(table.createdAtMs), asc(table.budgetRecordId))
    .all();
}

function listHarnessDecisionRecords(
  agentId: string,
  database: AgentStorageDatabase,
  runId: string
): AgentHarnessDecisionRecordRow[] {
  const table = agentStorageDrizzleSchema.agentHarnessDecisionRecords;
  return database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.runId, runId)))
    .orderBy(asc(table.createdAtMs), asc(table.decisionRecordId))
    .all();
}

function recordBudgetLedgerEntry(
  agentId: string,
  database: AgentStorageDatabase,
  input: InsertAgentRunBudgetLedgerInput
): AgentRunBudgetLedgerRow {
  const table = agentStorageDrizzleSchema.agentRunBudgetLedger;
  database
    .insert(table)
    .values({
      agentId,
      budgetDimension: input.budgetDimension,
      budgetRecordId: input.budgetRecordId,
      budgetScope: input.budgetScope,
      createdAtMs: input.createdAtMs,
      limitValue: input.limitValue ?? null,
      reason: input.reason ?? null,
      runId: input.runId,
      status: input.status,
      usedValue: input.usedValue,
    })
    .run();
  return readBudgetLedgerEntry(agentId, database, input.budgetRecordId);
}

function recordHarnessDecision(
  agentId: string,
  database: AgentStorageDatabase,
  input: InsertAgentHarnessDecisionRecordInput
): AgentHarnessDecisionRecordRow {
  const table = agentStorageDrizzleSchema.agentHarnessDecisionRecords;
  database
    .insert(table)
    .values({
      agentId,
      createdAtMs: input.createdAtMs,
      decisionId: input.decisionId,
      decisionRecordId: input.decisionRecordId,
      decisionType: input.decisionType,
      reason: input.reason ?? null,
      runId: input.runId,
      seam: input.seam,
      status: input.status,
      threadId: input.threadId,
    })
    .run();
  return readHarnessDecisionRecord(agentId, database, input.decisionRecordId);
}

function recordRunInterrupt(
  agentId: string,
  database: AgentStorageDatabase,
  input: InsertAgentRunInterruptInput
): AgentRunInterruptRow {
  const table = agentStorageDrizzleSchema.agentRunInterrupts;
  database
    .insert(table)
    .values({
      agentId,
      createdAtMs: input.createdAtMs,
      interruptId: input.interruptId,
      interruptType: input.interruptType,
      reason: input.reason,
      requestedStatus: input.requestedStatus,
      runId: input.runId,
      safeAuditRef: input.safeAuditRef ?? null,
      snapshotRef: input.snapshotRef ?? null,
    })
    .run();
  return readRunInterrupt(agentId, database, input.interruptId);
}

function readBudgetLedgerEntry(
  agentId: string,
  database: AgentStorageDatabase,
  budgetRecordId: string
): AgentRunBudgetLedgerRow {
  const table = agentStorageDrizzleSchema.agentRunBudgetLedger;
  const row = database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.budgetRecordId, budgetRecordId)))
    .limit(1)
    .get();
  if (row === undefined) throw new Error('Budget ledger insert did not return a row.');
  return row;
}

function readHarnessDecisionRecord(
  agentId: string,
  database: AgentStorageDatabase,
  decisionRecordId: string
): AgentHarnessDecisionRecordRow {
  const table = agentStorageDrizzleSchema.agentHarnessDecisionRecords;
  const row = database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.decisionRecordId, decisionRecordId)))
    .limit(1)
    .get();
  if (row === undefined) throw new Error('Harness decision insert did not return a row.');
  return row;
}

function readRunInterrupt(
  agentId: string,
  database: AgentStorageDatabase,
  interruptId: string
): AgentRunInterruptRow {
  const table = agentStorageDrizzleSchema.agentRunInterrupts;
  const row = database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.interruptId, interruptId)))
    .limit(1)
    .get();
  if (row === undefined) throw new Error('Run interrupt insert did not return a row.');
  return row;
}
