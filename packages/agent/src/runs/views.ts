import { mapAgentRunRow } from '../domain/agent-operation-utils';
import { computeSha256Hex } from '../domain/security';

import { assertRunStatus, isTerminalRunStatus } from './run-status';

import type { AgentAuditView, AgentPageView, AgentRunView } from '../domain';
import type {
  AgentRunBudgetLedgerRow,
  AgentRunInputSnapshotRow,
  AgentRunInterruptRow,
  AgentRunRow,
  AgentStorageRepositories,
} from '../storage';

/**
 * AgentRun に添付する secret-free な error metadata です。
 *
 * @remarks
 * Provider の raw error body や credential ではなく、RPC view に返してよい code、message、retryable、
 * correlation 情報だけを保持します。
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
 * Run query と cancellation operation が返す詳細な AgentRun view です。
 *
 * @remarks
 * storage row に model policy snapshot、safe error、interrupt、invocation summary を合成します。
 * raw payload、Provider secret、model 入出力 body は含めません。
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
 * GetRun で公開する immutable AgentRun input snapshot view です。
 *
 * @remarks
 * Run 開始時点で固定した Event 範囲と policy/tool/memory 世代を示します。snapshot body そのものではなく、
 * 参照や version metadata だけを返します。
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
 *
 * @remarks
 * resolved policy ref/digest、provider、model ID、version だけを返します。credential reference や
 * provider secret は含めず、Run replay / audit に必要な policy identity に限定します。
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
 *
 * @remarks
 * token count、latency、status、digest だけを返し、prompt/response の raw body は返しません。
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
 *
 * @remarks
 * byte length と SHA-256 digest だけを公開し、model request/response body を RPC payload へ載せません。
 */
export interface AgentRunDigestView {
  readonly algorithm: 'sha-256';
  readonly byteLength: number;
  readonly digestHex: string;
}

/**
 * GetRun が返す immutable Run snapshot の参照 metadata です。
 *
 * @remarks
 * snapshotRef、digest、作成時刻、Agent/Thread/Run identity だけを公開し、snapshot body は blob 参照に閉じます。
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
 * GetRun operation の domain result です。
 *
 * @remarks
 * 詳細 Run view に、存在する場合だけ immutable input view と snapshot reference を添えて返します。
 */
export interface GetAgentRunResult {
  readonly input?: AgentRunInputView;
  readonly run: AgentRunDetailView;
  readonly snapshot?: RunSnapshotReferenceView;
}

/**
 * ListRuns operation の domain result です。
 *
 * @remarks
 * Agent-scoped cursor page と safe Run detail view の配列だけを含みます。
 */
export interface ListAgentRunsResult {
  readonly page: AgentPageView;
  readonly runs: readonly AgentRunDetailView[];
}

/**
 * CancelRun operation の domain result です。
 *
 * @remarks
 * 取消後の Run view、任意の audit、idempotency replay 有無を返します。
 */
export interface CancelAgentRunResult {
  readonly audit?: AgentAuditView;
  readonly replayed: boolean;
  readonly run: AgentRunDetailView;
}

/**
 * Run row と immutable snapshot row から GetRun 用の安全な response view を組み立てます。
 *
 * @param input Agent ID、Agent-owned repository set、対象 Run row です。
 * @returns Run detail、任意の input snapshot view、任意の snapshot reference を含む GetRun result です。
 * @throws snapshot digest 計算または repository 読み取りで失敗した場合に呼び出し元へ伝播します。
 * @example
 * ```ts
 * const result = await createGetRunResult({ agentId, repositories, run });
 * ```
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
 * Run row を RPC handler が返す詳細な safe Run view へ変換します。
 *
 * @param agentId Durable Object instance が所有する Agent ID です。
 * @param repositories snapshot、interrupt、Event、budget ledger を読む Agent-owned repository set です。
 * @param row 変換対象の Run row です。
 * @returns secret-free な AgentRunDetailView です。
 * @throws 保存済み Run status が未知の場合、または repository 読み取りが失敗した場合に発生します。
 * @example
 * ```ts
 * const view = mapAgentRunDetailRow(agentId, repositories, row);
 * ```
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
