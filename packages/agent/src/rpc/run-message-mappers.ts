import type {
  CancelRunResponseSchema,
  GetRunResponseSchema,
  ListRunsResponseSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import type {
  AgentRunDetailView,
  AgentRunInputView,
  CancelAgentRunResult,
  GetAgentRunResult,
  ListAgentRunsResult,
  RunSnapshotReferenceView,
} from '../runs';
import type { MessageInitShape } from '@bufbuild/protobuf';

/**
 * Map GetRun domain result to the generated RPC response shape.
 */
export function mapGetRunResponse(
  result: GetAgentRunResult
): MessageInitShape<typeof GetRunResponseSchema> {
  return {
    input: result.input === undefined ? undefined : mapRunInput(result.input),
    run: mapRun(result.run),
    snapshot: result.snapshot === undefined ? undefined : mapSnapshot(result.snapshot),
  };
}

/**
 * Map ListRuns domain result to the generated RPC response shape.
 */
export function mapListRunsResponse(
  result: ListAgentRunsResult
): MessageInitShape<typeof ListRunsResponseSchema> {
  return {
    page: {
      cursorScope: result.page.cursorScope,
      nextPageToken: result.page.nextPageToken,
      resultCount: result.page.resultCount,
    },
    runs: result.runs.map(mapRun),
  };
}

/**
 * Map CancelRun domain result to the generated RPC response shape.
 */
export function mapCancelRunResponse(
  result: CancelAgentRunResult
): MessageInitShape<typeof CancelRunResponseSchema> {
  return {
    audit: result.audit === undefined ? undefined : mapAudit(result.audit),
    replayed: result.replayed,
    run: mapRun(result.run),
  };
}

function mapRun(run: AgentRunDetailView) {
  return {
    agentId: run.agentId,
    configVersion: optionalString(run.configVersion),
    finishedAtUnixMs: optionalBigInt(run.finishedAtMs),
    integrationVersion: optionalString(run.integrationVersion),
    interruptReason: run.interruptReason,
    pendingSinceUnixMs: optionalBigInt(run.pendingSinceMs),
    runId: run.runId,
    runInputId: run.runInputId,
    safeError:
      run.safeError === undefined
        ? undefined
        : {
            code: run.safeError.code,
            correlationId: run.safeError.correlationId,
            domainReason: run.safeError.domainReason,
            message: run.safeError.message,
            retryable: run.safeError.retryable,
            target: run.safeError.target,
          },
    sectionId: run.sectionId,
    snapshotRef: run.snapshotRef,
    startedAtUnixMs: optionalBigInt(run.startedAtMs),
    status: run.status,
    threadId: run.threadId,
    toolSetVersion: optionalString(run.toolSetVersion),
    triggerEventId: run.triggerEventId,
  };
}

function mapRunInput(input: AgentRunInputView) {
  return {
    agentId: input.agentId,
    configVersion: String(input.configVersion),
    integrationInstallationVersion: optionalString(input.integrationInstallationVersion),
    latestReadyCompactionId: input.latestReadyCompactionId,
    runId: input.runId,
    runInputId: input.runInputId,
    snapshotRef: input.snapshotRef,
    stateSnapshotRef: input.stateSnapshotRef,
    threadId: input.threadId,
    threadMemoryVersion: optionalString(input.threadMemoryVersion),
    toolSetVersion: optionalString(input.toolSetVersion),
    triggerEndThreadSequence: BigInt(input.triggerEndThreadSequence),
    triggerEventId: input.triggerEventId,
    triggerStartThreadSequence: BigInt(input.triggerStartThreadSequence),
    uncompactedUpperThreadSequence: optionalBigInt(input.uncompactedUpperThreadSequence),
  };
}

function mapSnapshot(snapshot: RunSnapshotReferenceView) {
  return {
    agentId: snapshot.agentId,
    createdAtUnixMs: BigInt(snapshot.createdAtMs),
    digestSha256: snapshot.digestSha256,
    runId: snapshot.runId,
    snapshotRef: snapshot.snapshotRef,
    threadId: snapshot.threadId,
  };
}

function mapAudit(audit: NonNullable<CancelAgentRunResult['audit']>) {
  return {
    agentId: audit.agentId,
    auditEventId: audit.auditEventId,
    correlationId: audit.correlationId,
    occurredAtUnixMs: BigInt(audit.occurredAtMs),
    operation: audit.operation,
    principalId: audit.principalId,
    result: audit.result,
    safeDetailRef: audit.safeDetailRef,
    systemThreadId: audit.systemThreadId,
  };
}

function optionalBigInt(value: number | undefined): bigint | undefined {
  return value === undefined ? undefined : BigInt(value);
}

function optionalString(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}
