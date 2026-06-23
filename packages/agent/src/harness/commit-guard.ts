import { assertRunStatus, isTerminalRunStatus } from '../runs';

import type { RunStatus } from '../runs';
import type { AgentRunInputSnapshotRow, AgentStorageRepositories } from '../storage';

/**
 * Interrupt causes that prevent a stale AgentRun result from committing.
 */
export const harnessRunInterruptTypes = [
  'user_cancel',
  'human_override',
  'permission_revoked',
  'integration_uninstalled',
  'generation_mismatch',
  'lifecycle_mismatch',
  'capability_version_mismatch',
] as const;

/**
 * Harness run interrupt type.
 */
export type HarnessRunInterruptType = (typeof harnessRunInterruptTypes)[number];

/**
 * Stored interrupt command for one AgentRun.
 */
export interface RecordHarnessRunInterruptInput {
  readonly interruptId: string;
  readonly interruptType: HarnessRunInterruptType;
  readonly nowMs: number;
  readonly reason: string;
  readonly repositories: AgentStorageRepositories;
  readonly requestedStatus?: Extract<RunStatus, 'cancelled' | 'interrupted'>;
  readonly runId: string;
  readonly safeAuditRef?: string;
  readonly snapshotRef?: string;
}

/**
 * Generation values expected by a returning model or downstream call result.
 */
export interface HarnessCommitExpectedGeneration {
  readonly configVersion: number;
  readonly integrationVersion: number;
  readonly snapshotRef: string;
  readonly toolSetVersion: number;
}

/**
 * Current capability generation resolved immediately before result commit.
 */
export interface HarnessCurrentCapabilityGeneration {
  readonly integrationVersion: number;
  readonly toolSetVersion: number;
}

/**
 * Result returned by the stale commit guard.
 */
export interface HarnessCommitGuardResult {
  readonly allowed: boolean;
  readonly currentStatus?: string;
  readonly reason: string;
  readonly safeAuditReason: string;
  readonly staleResultDiscarded: boolean;
}

/**
 * Store an interrupt flag and transition the Run to an observable terminal state when possible.
 */
export function recordHarnessRunInterrupt(
  input: RecordHarnessRunInterruptInput
): HarnessCommitGuardResult {
  const requestedStatus = input.requestedStatus ?? defaultInterruptStatus(input.interruptType);
  const snapshotRef =
    input.snapshotRef ??
    input.repositories.pendingRuns.findRunInputSnapshot(input.runId)?.snapshotRef;
  input.repositories.runtime.recordRunInterrupt({
    createdAtMs: input.nowMs,
    interruptId: input.interruptId,
    interruptType: input.interruptType,
    reason: input.reason,
    requestedStatus,
    runId: input.runId,
    safeAuditRef: input.safeAuditRef,
    snapshotRef,
  });
  input.repositories.audit.insertAuditEvent({
    auditId: `run-interrupt:${input.interruptId}`,
    createdAtMs: input.nowMs,
    eventType: `agent.run.${requestedStatus}`,
    principalRef: `agent-run:${input.runId}`,
    requestDigest: input.safeAuditRef ?? `interrupt:${input.interruptType}`,
  });
  transitionRunToInterruptedStatus(input.repositories, input.runId, requestedStatus, input.nowMs);
  return {
    allowed: false,
    currentStatus: requestedStatus,
    reason: input.interruptType,
    safeAuditReason: input.reason,
    staleResultDiscarded: true,
  };
}

/**
 * Enforce interrupt, cancellation, lifecycle, and generation checks before result commit.
 */
export function guardHarnessRunResultCommit(input: {
  readonly currentCapabilityGeneration: HarnessCurrentCapabilityGeneration;
  readonly expected: HarnessCommitExpectedGeneration;
  readonly nowMs: number;
  readonly repositories: AgentStorageRepositories;
  readonly runId: string;
}): HarnessCommitGuardResult {
  const run = input.repositories.pendingRuns.findRunById(input.runId);
  if (run === undefined) return blocked('run_not_found', 'Run result references an unknown Run.');
  assertRunStatus(run.status);
  const interrupt = input.repositories.runtime.findLatestRunInterrupt(input.runId);
  if (interrupt !== undefined) {
    transitionRunToInterruptedStatus(
      input.repositories,
      input.runId,
      normalizeTerminalInterruptStatus(interrupt.requestedStatus),
      input.nowMs
    );
    return blocked(interrupt.interruptType, interrupt.reason, interrupt.requestedStatus);
  }
  if (isTerminalRunStatus(run.status)) {
    return blocked(`run_${run.status}`, `Run is already terminal: ${run.status}.`, run.status);
  }
  const snapshot = input.repositories.pendingRuns.findRunInputSnapshot(input.runId);
  if (snapshot === undefined)
    return blocked('snapshot_not_found', 'Run has no immutable snapshot.');

  const generationIssue = findGenerationIssue(
    snapshot,
    input.expected,
    input.currentCapabilityGeneration,
    input.repositories
  );
  if (generationIssue !== undefined) {
    return recordHarnessRunInterrupt({
      interruptId: `generation-${input.runId}-${String(input.nowMs)}`,
      interruptType: generationIssue.type,
      nowMs: input.nowMs,
      reason: generationIssue.reason,
      repositories: input.repositories,
      requestedStatus: 'interrupted',
      runId: input.runId,
      safeAuditRef: `agent-run://${input.runId}/stale-result`,
      snapshotRef: snapshot.snapshotRef,
    });
  }

  return {
    allowed: true,
    currentStatus: run.status,
    reason: 'commit_allowed',
    safeAuditReason: 'Run result generation matches immutable snapshot.',
    staleResultDiscarded: false,
  };
}

function blocked(
  reason: string,
  safeAuditReason: string,
  currentStatus?: string
): HarnessCommitGuardResult {
  return { allowed: false, currentStatus, reason, safeAuditReason, staleResultDiscarded: true };
}

function defaultInterruptStatus(
  interruptType: HarnessRunInterruptType
): Extract<RunStatus, 'cancelled' | 'interrupted'> {
  return interruptType === 'user_cancel' ? 'cancelled' : 'interrupted';
}

function findGenerationIssue(
  snapshot: AgentRunInputSnapshotRow,
  expected: HarnessCommitExpectedGeneration,
  currentCapabilityGeneration: HarnessCurrentCapabilityGeneration,
  repositories: AgentStorageRepositories
): { readonly reason: string; readonly type: HarnessRunInterruptType } | undefined {
  const currentConfigVersion =
    repositories.config.getLatestConfig()?.configVersion ??
    repositories.profile.getProfile()?.configVersion;
  if (snapshot.snapshotRef !== expected.snapshotRef) {
    return {
      reason: 'Snapshot reference changed before result commit.',
      type: 'generation_mismatch',
    };
  }
  if (
    snapshot.configVersion !== expected.configVersion ||
    currentConfigVersion !== snapshot.configVersion
  ) {
    return {
      reason: 'Config generation changed before result commit.',
      type: 'generation_mismatch',
    };
  }
  if (
    snapshot.integrationVersion !== expected.integrationVersion ||
    snapshot.toolSetVersion !== expected.toolSetVersion ||
    currentCapabilityGeneration.integrationVersion !== snapshot.integrationVersion ||
    currentCapabilityGeneration.toolSetVersion !== snapshot.toolSetVersion
  ) {
    return {
      reason: 'Capability generation changed before result commit.',
      type: 'capability_version_mismatch',
    };
  }
  if (repositories.profile.getProfile()?.lifecycleStatus !== 'active') {
    return {
      reason: 'Agent lifecycle is not active before result commit.',
      type: 'lifecycle_mismatch',
    };
  }
  return undefined;
}

function normalizeTerminalInterruptStatus(
  status: string
): Extract<RunStatus, 'cancelled' | 'interrupted'> {
  return status === 'cancelled' ? 'cancelled' : 'interrupted';
}

function transitionRunToInterruptedStatus(
  repositories: AgentStorageRepositories,
  runId: string,
  status: Extract<RunStatus, 'cancelled' | 'interrupted'>,
  nowMs: number
): void {
  const run = repositories.pendingRuns.findRunById(runId);
  if (run === undefined) return;
  assertRunStatus(run.status);
  if (isTerminalRunStatus(run.status)) return;
  repositories.pendingRuns.transitionRunStatus({
    fromStatus: run.status,
    nowMs,
    runId,
    toStatus: status,
  });
}
