import { mapAgentRunRow } from '../domain/agent-operation-utils';
import { computeSha256Hex } from '../domain/security';

import { assertRunStatus, isTerminalRunStatus } from './foundation';

import type { AgentAuditView, AgentPageView, AgentRunView } from '../domain';
import type {
  AgentRunBudgetLedgerRow,
  AgentRunInputSnapshotRow,
  AgentRunInterruptRow,
  AgentRunRow,
  AgentStorageRepositories,
} from '../storage';

/**
 * Safe error metadata attached to an AgentRun without exposing secrets.
 */
export interface AgentRunSafeErrorView {
  readonly code: string;
  readonly correlationId?: string;
  readonly domainReason?: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly target?: string;
}

/**
 * Detailed AgentRun view returned by Run query and cancellation operations.
 */
export interface AgentRunDetailView extends AgentRunView {
  readonly configVersion?: number;
  readonly finishedAtMs?: number;
  readonly integrationVersion?: number;
  readonly interruptReason?: string;
  readonly invocationSummary?: AgentModelInvocationSummaryView;
  readonly modelPolicySnapshot?: AgentRunModelPolicySnapshotView;
  readonly runInputId?: string;
  readonly safeError?: AgentRunSafeErrorView;
  readonly sectionId?: string;
  readonly snapshotRef?: string;
  readonly startedAtMs?: number;
  readonly toolSetVersion?: number;
}

/**
 * Immutable AgentRun input snapshot exposed through GetRun.
 */
export interface AgentRunInputView {
  readonly agentId: string;
  readonly configVersion: number;
  readonly integrationInstallationVersion?: number;
  readonly latestReadyCompactionId?: string;
  readonly modelPolicySnapshot?: AgentRunModelPolicySnapshotView;
  readonly runId: string;
  readonly runInputId: string;
  readonly snapshotRef?: string;
  readonly stateSnapshotRef?: string;
  readonly threadId: string;
  readonly threadMemoryVersion?: number;
  readonly toolSetVersion?: number;
  readonly triggerEndThreadSequence: number;
  readonly triggerEventId: string;
  readonly triggerStartThreadSequence: number;
  readonly uncompactedUpperThreadSequence?: number;
}

/**
 * Run snapshot に固定された model policy identity の安全な view です。
 */
export interface AgentRunModelPolicySnapshotView {
  readonly configVersion: string;
  readonly decisionSchemaVersion: string;
  readonly integrationCapabilityGeneration?: string;
  readonly modelId: string;
  readonly policySource: string;
  readonly policyVersion: number;
  readonly provider: string;
  readonly requestedPolicyRef?: string;
  readonly resolvedPolicyDigest: string;
  readonly resolvedPolicyRef: string;
  readonly threadMemoryVersion?: string;
  readonly toolCatalogGeneration?: string;
  readonly triggerEndThreadSequence?: number;
  readonly triggerStartThreadSequence?: number;
}

/**
 * Model invocation ledger の安全な summary view です。
 */
export interface AgentModelInvocationSummaryView {
  readonly attempt: number;
  readonly decisionSchemaVersion: string;
  readonly inputTokenCount?: number;
  readonly invocationId: string;
  readonly latencyMs?: number;
  readonly modelId: string;
  readonly outputTokenCount?: number;
  readonly policyDigest: string;
  readonly policyRef: string;
  readonly provider: string;
  readonly providerErrorCategory?: string;
  readonly requestDigest?: AgentRunDigestView;
  readonly responseDigest?: AgentRunDigestView;
  readonly runId: string;
  readonly status: string;
}

/**
 * Run query が返す raw body を含まない digest view です。
 */
export interface AgentRunDigestView {
  readonly algorithm: 'sha-256';
  readonly byteLength: number;
  readonly digestHex: string;
}

/**
 * Immutable Run snapshot reference metadata returned by GetRun.
 */
export interface RunSnapshotReferenceView {
  readonly agentId: string;
  readonly createdAtMs: number;
  readonly digestSha256: string;
  readonly runId: string;
  readonly snapshotRef: string;
  readonly threadId: string;
}

/**
 * GetRun result with immutable input and snapshot reference metadata.
 */
export interface GetAgentRunResult {
  readonly input?: AgentRunInputView;
  readonly run: AgentRunDetailView;
  readonly snapshot?: RunSnapshotReferenceView;
}

/**
 * ListRuns result with Agent-scoped pagination metadata.
 */
export interface ListAgentRunsResult {
  readonly page: AgentPageView;
  readonly runs: readonly AgentRunDetailView[];
}

/**
 * CancelRun result with idempotency replay status.
 */
export interface CancelAgentRunResult {
  readonly audit?: AgentAuditView;
  readonly replayed: boolean;
  readonly run: AgentRunDetailView;
}

/**
 * Build a GetRun response view from Run and immutable snapshot rows.
 */
export async function createGetRunResult(input: {
  readonly agentId: string;
  readonly repositories: AgentStorageRepositories;
  readonly run: AgentRunRow;
}): Promise<GetAgentRunResult> {
  const snapshot = input.repositories.pendingRuns.findRunInputSnapshot(input.run.runId);
  return {
    input: snapshot === undefined ? undefined : mapRunInput(input.agentId, snapshot),
    run: mapAgentRunDetailRow(input.agentId, input.repositories, input.run),
    snapshot:
      snapshot === undefined ? undefined : await mapSnapshotReference(input.agentId, snapshot),
  };
}

/**
 * Convert a Run row into the detailed safe Run view used by RPC handlers.
 */
export function mapAgentRunDetailRow(
  agentId: string,
  repositories: AgentStorageRepositories,
  row: AgentRunRow
): AgentRunDetailView {
  const snapshot = repositories.pendingRuns.findRunInputSnapshot(row.runId);
  const interrupt = repositories.runtime.findLatestRunInterrupt(row.runId);
  const event = repositories.events.findByEventId(row.triggerEventId);
  const budget = repositories.runtime.listBudgetLedgerEntries(row.runId).at(-1);
  assertRunStatus(row.status);
  return {
    ...mapAgentRunRow(agentId, row),
    configVersion: snapshot?.configVersion,
    finishedAtMs: isTerminalRunStatus(row.status) ? row.updatedAtMs : undefined,
    integrationVersion: snapshot?.integrationVersion,
    interruptReason: interrupt?.reason,
    invocationSummary: mapInvocationSummary(repositories, row.runId),
    modelPolicySnapshot: snapshot === undefined ? undefined : mapModelPolicySnapshot(snapshot),
    runInputId: snapshot === undefined ? undefined : createRunInputId(row.runId),
    safeError: createRunSafeError(row, interrupt, budget),
    sectionId: event?.sectionId,
    snapshotRef: snapshot?.snapshotRef,
    startedAtMs: row.status === 'pending' ? undefined : (row.lastServedAtMs ?? row.updatedAtMs),
    toolSetVersion: snapshot?.toolSetVersion,
  };
}

function mapRunInput(agentId: string, snapshot: AgentRunInputSnapshotRow): AgentRunInputView {
  return {
    agentId,
    configVersion: snapshot.configVersion,
    integrationInstallationVersion: snapshot.integrationVersion,
    latestReadyCompactionId: snapshot.latestReadyCompactionRef ?? undefined,
    modelPolicySnapshot: mapModelPolicySnapshot(snapshot),
    runId: snapshot.runId,
    runInputId: createRunInputId(snapshot.runId),
    snapshotRef: snapshot.snapshotRef,
    stateSnapshotRef: snapshot.snapshotRef,
    threadId: snapshot.threadId,
    threadMemoryVersion: snapshot.threadMemoryVersion,
    toolSetVersion: snapshot.toolSetVersion,
    triggerEndThreadSequence: snapshot.triggerEventEndSequence,
    triggerEventId: snapshot.triggerEventId,
    triggerStartThreadSequence: snapshot.triggerEventStartSequence,
    uncompactedUpperThreadSequence: snapshot.uncompactedUpperSequence,
  };
}

function mapModelPolicySnapshot(
  snapshot: AgentRunInputSnapshotRow
): AgentRunModelPolicySnapshotView | undefined {
  if (
    snapshot.resolvedModelPolicyRef === undefined ||
    snapshot.resolvedModelPolicyRef === null ||
    snapshot.resolvedModelPolicyDigest === undefined ||
    snapshot.resolvedModelPolicyDigest === null ||
    snapshot.modelProvider === undefined ||
    snapshot.modelProvider === null ||
    snapshot.modelId === undefined ||
    snapshot.modelId === null ||
    snapshot.modelPolicyVersion === undefined ||
    snapshot.modelPolicyVersion === null ||
    snapshot.modelPolicySource === undefined ||
    snapshot.modelPolicySource === null ||
    snapshot.decisionSchemaVersion === undefined ||
    snapshot.decisionSchemaVersion === null
  ) {
    return undefined;
  }
  return {
    configVersion: String(snapshot.configVersion),
    decisionSchemaVersion: snapshot.decisionSchemaVersion,
    integrationCapabilityGeneration: String(snapshot.integrationVersion),
    modelId: snapshot.modelId,
    policySource: snapshot.modelPolicySource,
    policyVersion: snapshot.modelPolicyVersion,
    provider: snapshot.modelProvider,
    requestedPolicyRef: snapshot.requestedModelPolicyRef ?? undefined,
    resolvedPolicyDigest: snapshot.resolvedModelPolicyDigest,
    resolvedPolicyRef: snapshot.resolvedModelPolicyRef,
    threadMemoryVersion: String(snapshot.threadMemoryVersion),
    toolCatalogGeneration: String(snapshot.toolSetVersion),
    triggerEndThreadSequence: snapshot.triggerEventEndSequence,
    triggerStartThreadSequence: snapshot.triggerEventStartSequence,
  };
}

function mapInvocationSummary(
  repositories: AgentStorageRepositories,
  runId: string
): AgentModelInvocationSummaryView | undefined {
  const invocation = repositories.modelInvocations.findLatestForRun(runId);
  if (invocation === undefined) return undefined;
  return {
    attempt: invocation.attempt,
    decisionSchemaVersion: invocation.decisionSchemaVersion,
    inputTokenCount: invocation.inputTokenCount ?? undefined,
    invocationId: invocation.invocationId,
    latencyMs: invocation.latencyMs ?? undefined,
    modelId: invocation.modelId,
    outputTokenCount: invocation.outputTokenCount ?? undefined,
    policyDigest: invocation.policyDigest,
    policyRef: invocation.policyRef,
    provider: invocation.provider,
    providerErrorCategory: invocation.providerErrorCategory ?? undefined,
    requestDigest: mapDigest(invocation.requestDigest),
    responseDigest: mapDigest(invocation.responseDigest),
    runId: invocation.runId,
    status: invocation.status,
  };
}

function mapDigest(digestHex: string | null): AgentRunDigestView | undefined {
  if (digestHex === null) return undefined;
  return { algorithm: 'sha-256', byteLength: 0, digestHex };
}

async function mapSnapshotReference(
  agentId: string,
  snapshot: AgentRunInputSnapshotRow
): Promise<RunSnapshotReferenceView> {
  return {
    agentId,
    createdAtMs: snapshot.createdAtMs,
    digestSha256: await computeSnapshotDigest(snapshot),
    runId: snapshot.runId,
    snapshotRef: snapshot.snapshotRef,
    threadId: snapshot.threadId,
  };
}

function createRunSafeError(
  run: AgentRunRow,
  interrupt: AgentRunInterruptRow | undefined,
  budget: AgentRunBudgetLedgerRow | undefined
): AgentRunSafeErrorView | undefined {
  if (run.status === 'cancelled' || run.status === 'interrupted') {
    return {
      code: run.status === 'cancelled' ? 'cancelled' : 'aborted',
      domainReason: interrupt?.interruptType ?? run.status,
      message: interrupt?.reason ?? `Run ended as ${run.status}.`,
      retryable: false,
      target: run.runId,
    };
  }
  if (run.status === 'failed') {
    return {
      code: 'failed_precondition',
      domainReason: budget?.budgetDimension ?? 'run_failed',
      message: budget?.reason ?? 'Run failed before completion.',
      retryable: false,
      target: run.runId,
    };
  }
  return undefined;
}

function createRunInputId(runId: string): string {
  return `run-input:${runId}`;
}

async function computeSnapshotDigest(snapshot: AgentRunInputSnapshotRow): Promise<string> {
  return computeSha256Hex(new TextEncoder().encode(stableStringify(snapshot)));
}

function stableStringify(value: AgentRunInputSnapshotRow): string {
  return JSON.stringify({
    configVersion: value.configVersion,
    createdAtMs: value.createdAtMs,
    integrationVersion: value.integrationVersion,
    latestReadyCompactionRef: value.latestReadyCompactionRef,
    runId: value.runId,
    snapshotRef: value.snapshotRef,
    threadId: value.threadId,
    threadMemoryRef: value.threadMemoryRef,
    threadMemoryVersion: value.threadMemoryVersion,
    toolSetVersion: value.toolSetVersion,
    triggerEventEndSequence: value.triggerEventEndSequence,
    triggerEventId: value.triggerEventId,
    triggerEventStartSequence: value.triggerEventStartSequence,
    uncompactedUpperSequence: value.uncompactedUpperSequence,
  });
}
