import { assertAgentRunStatusTransition, assertRunStatus, isActiveRunStatus } from './foundation';

import type {
  AgentEventRow,
  AgentRunInputSnapshotRow,
  AgentRunRow,
  AgentStorageRepositories,
} from '../storage';

/**
 * Input for one bounded AgentRun scheduler batch.
 */
export interface AgentRunSchedulerBatchInput {
  readonly agentId: string;
  readonly maxRuns: number;
  readonly nowMs: number;
  readonly repositories: AgentStorageRepositories;
}

/**
 * AgentRun started by one scheduler batch.
 */
export interface AgentRunSchedulerStartedRun {
  readonly runId: string;
  readonly snapshot: AgentRunInputSnapshotRow;
  readonly threadId: string;
}

/**
 * Result of one bounded AgentRun scheduler batch.
 */
export interface AgentRunSchedulerBatchResult {
  readonly activeRunId?: string;
  readonly agentId: string;
  readonly pendingCount: number;
  readonly processedCount: number;
  readonly reenqueue: boolean;
  readonly remainingPendingCount: number;
  readonly requestedMaxRuns: number;
  readonly startedRuns: readonly AgentRunSchedulerStartedRun[];
  readonly status: 'active_blocked' | 'idle' | 'processed';
}

/**
 * Process pending AgentRun work with one active Run slot and bounded batch size.
 */
export function processAgentRunSchedulerBatch(
  input: AgentRunSchedulerBatchInput
): AgentRunSchedulerBatchResult {
  const requestedMaxRuns = normalizeMaxRuns(input.maxRuns);
  input.repositories.schedulerWakes.markRunning(input.nowMs);
  const pendingCount = input.repositories.pendingRuns.countPendingRuns();
  if (pendingCount === 0) {
    input.repositories.schedulerWakes.markIdle(input.nowMs);
    return createBatchResult(
      input.agentId,
      requestedMaxRuns,
      pendingCount,
      0,
      [],
      'idle',
      undefined
    );
  }
  const activeRun = input.repositories.pendingRuns.findActiveRun();
  if (activeRun !== undefined) {
    assertRunStatus(activeRun.status);
    if (isActiveRunStatus(activeRun.status)) {
      input.repositories.schedulerWakes.markPending(input.nowMs, pendingCount);
      return createBatchResult(
        input.agentId,
        requestedMaxRuns,
        pendingCount,
        pendingCount,
        [],
        'active_blocked',
        activeRun.runId
      );
    }
  }

  const startedRuns: AgentRunSchedulerStartedRun[] = [];
  while (startedRuns.length < requestedMaxRuns) {
    const blockingRun = input.repositories.pendingRuns.findActiveRun();
    if (blockingRun !== undefined) break;
    const nextRun = input.repositories.pendingRuns.selectNextPendingRun();
    if (nextRun === undefined) break;
    const snapshot = createImmutableRunSnapshot({ ...input, run: nextRun });
    startPendingRun(input.repositories, nextRun, input.nowMs);
    startedRuns.push({ runId: nextRun.runId, snapshot, threadId: nextRun.threadId });
  }

  const status = startedRuns.length === 0 ? 'idle' : 'processed';
  const remainingPendingCount = input.repositories.pendingRuns.countPendingRuns();
  if (remainingPendingCount > 0) {
    input.repositories.schedulerWakes.markPending(input.nowMs, remainingPendingCount);
  } else {
    input.repositories.schedulerWakes.markIdle(input.nowMs);
  }
  return createBatchResult(
    input.agentId,
    requestedMaxRuns,
    pendingCount,
    remainingPendingCount,
    startedRuns,
    status,
    undefined
  );
}

/**
 * pending AgentRun の immutable input snapshot を作成、または既存 snapshot を返します。
 *
 * @param input Agent ID、現在時刻、repository set、対象 Run を含む入力です。
 * @returns trigger Event 範囲、latest ready Compaction、active ThreadMemory version を固定した snapshot を返します。
 */
export function createImmutableRunSnapshot(input: {
  readonly agentId: string;
  readonly nowMs: number;
  readonly repositories: AgentStorageRepositories;
  readonly run: AgentRunRow;
}): AgentRunInputSnapshotRow {
  const existing = input.repositories.pendingRuns.findRunInputSnapshot(input.run.runId);
  if (existing !== undefined) return existing;

  const triggerEvent = input.repositories.events.findByEventId(input.run.triggerEventId);
  if (triggerEvent === undefined) {
    throw new Error('Cannot create AgentRun snapshot without the trigger Event.');
  }
  const latestEvent =
    input.repositories.events.findLatestForThread(input.run.threadId) ?? triggerEvent;
  const previousSnapshot = input.repositories.pendingRuns.findLatestRunInputSnapshotForThread(
    input.run.threadId
  );
  const triggerEventEndSequence = Math.max(triggerEvent.threadSequence, latestEvent.threadSequence);
  const triggerEventStartSequence = Math.min(
    (previousSnapshot?.uncompactedUpperSequence ?? 0) + 1,
    triggerEvent.threadSequence
  );
  // Run 開始時点の latest ready Compaction と active ThreadMemory を固定し、rebase 後の Memory version を future Run が選べるようにします。
  const latestReadyCompaction = input.repositories.compactions.findLatestReadyCompaction(
    input.run.threadId
  );
  const activeThreadMemory = input.repositories.memory.findActiveThreadMemoryVersion(
    input.run.threadId
  );
  const modelPolicy = resolveRunModelPolicy(input.repositories, triggerEvent);
  return input.repositories.pendingRuns.createRunInputSnapshot({
    configVersion: modelPolicy.configVersion,
    createdAtMs: input.nowMs,
    decisionSchemaVersion: modelPolicy.decisionSchemaVersion,
    generationMaxOutputTokens: modelPolicy.generationMaxOutputTokens,
    generationTemperature: modelPolicy.generationTemperature,
    generationTopP: modelPolicy.generationTopP,
    integrationVersion: 0,
    latestReadyCompactionRef:
      latestReadyCompaction?.outputRef ?? latestReadyCompaction?.historyRef ?? null,
    modelId: modelPolicy.modelId,
    modelPolicySource: modelPolicy.source,
    modelPolicyVersion: modelPolicy.version,
    modelProvider: modelPolicy.provider,
    requestedModelPolicyRef: modelPolicy.requestedPolicyRef,
    resolvedModelPolicyDigest: modelPolicy.policyDigest,
    resolvedModelPolicyRef: modelPolicy.policyRef,
    runId: input.run.runId,
    snapshotRef: createRunSnapshotRef(input.agentId, input.run.runId),
    threadId: input.run.threadId,
    threadMemoryRef: activeThreadMemory?.memoryRef ?? null,
    threadMemoryVersion: activeThreadMemory?.version ?? 0,
    toolSetVersion: 0,
    triggerEventEndSequence,
    triggerEventId: input.run.triggerEventId,
    triggerEventStartSequence,
    uncompactedUpperSequence: triggerEventEndSequence,
  });
}

function resolveRunModelPolicy(
  repositories: AgentStorageRepositories,
  triggerEvent: AgentEventRow
): {
  readonly configVersion: number;
  readonly decisionSchemaVersion?: string;
  readonly generationMaxOutputTokens?: number;
  readonly generationTemperature?: string;
  readonly generationTopP?: string;
  readonly modelId?: string;
  readonly policyDigest?: string;
  readonly policyRef?: string;
  readonly provider?: string;
  readonly requestedPolicyRef?: string;
  readonly source?: 'agent_default' | 'event_override';
  readonly version?: number;
} {
  const config = repositories.config.getLatestConfig();
  const requestedPolicyRef = triggerEvent.requestedModelPolicyRef ?? undefined;
  const eventPolicy =
    requestedPolicyRef === undefined
      ? undefined
      : repositories.modelPolicies.getActivePolicy(requestedPolicyRef);
  const defaultPolicyRef = config?.modelPolicyRef ?? undefined;
  const defaultPolicy =
    requestedPolicyRef === undefined && defaultPolicyRef !== undefined
      ? repositories.modelPolicies.getActivePolicy(defaultPolicyRef)
      : undefined;
  const selected = eventPolicy ?? defaultPolicy;
  return {
    configVersion: config?.configVersion ?? resolveConfigVersion(repositories),
    decisionSchemaVersion: selected?.decisionSchemaVersion,
    generationMaxOutputTokens: selected?.generationMaxOutputTokens ?? undefined,
    generationTemperature: selected?.generationTemperature ?? undefined,
    generationTopP: selected?.generationTopP ?? undefined,
    modelId: selected?.modelId,
    policyDigest: selected?.policyDigest,
    policyRef: selected?.policyRef,
    provider: selected?.provider,
    requestedPolicyRef,
    source: requestedPolicyRef === undefined ? 'agent_default' : 'event_override',
    version: selected?.version,
  };
}

function startPendingRun(
  repositories: AgentStorageRepositories,
  run: AgentRunRow,
  nowMs: number
): void {
  assertRunStatus(run.status);
  assertAgentRunStatusTransition({ from: run.status, to: 'running' });
  repositories.pendingRuns.transitionRunStatus({
    fromStatus: run.status,
    lastServedAtMs: nowMs,
    nowMs,
    runId: run.runId,
    toStatus: 'running',
  });
  repositories.threads.markThreadServed({ nowMs, threadId: run.threadId });
}

function createBatchResult(
  agentId: string,
  requestedMaxRuns: number,
  pendingCount: number,
  remainingPendingCount: number,
  startedRuns: readonly AgentRunSchedulerStartedRun[],
  status: AgentRunSchedulerBatchResult['status'],
  activeRunId: string | undefined
): AgentRunSchedulerBatchResult {
  return {
    activeRunId,
    agentId,
    pendingCount,
    processedCount: startedRuns.length,
    reenqueue: remainingPendingCount > 0,
    remainingPendingCount,
    requestedMaxRuns,
    startedRuns,
    status,
  };
}

function createRunSnapshotRef(agentId: string, runId: string): string {
  return `agent-run-snapshot://${encodeURIComponent(agentId)}/${encodeURIComponent(runId)}`;
}

function normalizeMaxRuns(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(Math.trunc(value), 10);
}

function resolveConfigVersion(repositories: AgentStorageRepositories): number {
  return (
    repositories.config.getLatestConfig()?.configVersion ??
    repositories.profile.getProfile()?.configVersion ??
    0
  );
}
