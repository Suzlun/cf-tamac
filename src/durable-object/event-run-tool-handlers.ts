import { readDurableObjectSqlDatabaseSizeBytes } from '../agent-foundation-state';
import { getEventFromStore, listEventsFromStore, publishEventInStore } from '../events';
import {
  cancelRunInStore,
  getRunFromStore,
  listRunsFromStore,
  type CancelAgentRunCommand,
  type CancelAgentRunResult,
  type GetAgentRunQuery,
  type GetAgentRunResult,
  type ListAgentRunsQuery,
  type ListAgentRunsResult,
} from '../runs';
import { createAgentStorageThresholdSnapshot, type AgentStorageRepositories } from '../storage';
import {
  approveToolInvocationInStore,
  cancelToolInvocationInStore,
  createToolInvocationInStore,
  executeToolInvocationWithProvider,
  getToolInvocationFromStore,
  listToolInvocationsFromStore,
  listToolsFromStore,
  reconcileToolInvocationInStore,
  recordToolResultInStore,
  rejectToolInvocationInStore,
  type CancelToolInvocationCommand,
  type CreateToolInvocationCommand,
  type DecideToolInvocationCommand,
  type ExecuteToolInvocationCommand,
  type GetToolInvocationQuery,
  type GetToolInvocationResult,
  type ListAgentToolsQuery,
  type ListAgentToolsResult,
  type ListToolInvocationsQuery,
  type ListToolInvocationsResult,
  type ReconcileToolInvocationCommand,
  type RecordToolResultCommand,
  type ToolInvocationMutationResult,
} from '../tools';

import { createAgentBlobPayloadWriter } from './blob-payload-writer';

import type { AgentLocalQueueWakePayload } from '../AIAgent.types';
import type {
  AgentEventView,
  GetAgentEventQuery,
  ListAgentEventsQuery,
  ListAgentEventsResult,
  PublishAgentEventCommand,
  PublishAgentEventResult,
} from '../domain';
import type { AgentWorkerEnv } from '../env';

/**
 * `AIAgent` の Event/Run/Tool facade handler が共有する Durable Object 実行 context です。
 *
 * @remarks
 * `AIAgent` だけが保持する Agent ID、Agent-owned repository、Durable Object SQLite storage、
 * Agent-owned R2 binding、scheduler wake callback を一つに集約します。handler は public Durable Object
 * method を増やさず、既存の domain/runtime operation と Phase 3a の side-effect seam へだけ委譲します。
 *
 * @property agentId Durable Object 名から得た Agent aggregate ID です。
 * @property durableObjectStorage SQLite 使用量の snapshot を読むための Durable Object storage です。
 * @property env Agent Worker binding 群です。Event blob offload では Agent-owned R2 だけを使用します。
 * @property repositories Agent-owned SQLite repository 集約です。
 * @property requestSchedulerWake 新規 Event append 後に Agent-local Queue wake を要求する callback です。
 * @property requestWakeAfterToolResult Tool result Event が生成された場合だけ scheduler wake を要求する callback です。
 * @example
 * ```ts
 * const result = await agentEventRunToolHandlers.events.publishEvent(context, command);
 * ```
 */
export interface AIAgentEventRunToolHandlerContext {
  readonly agentId: string;
  readonly durableObjectStorage: DurableObjectStorage;
  readonly env: AgentWorkerEnv;
  readonly repositories: AgentStorageRepositories;
  readonly requestSchedulerWake: (payload: AgentLocalQueueWakePayload) => void;
  readonly requestWakeAfterToolResult: (
    result: ToolInvocationMutationResult,
    requestedAtMs: number
  ) => void;
}

/**
 * `AIAgent` の Event/Run/Tool public methods から呼び出す facade handler 群です。
 *
 * @remarks
 * Event publish の blob writer 注入と non-replay wake、Run query/mutation、ToolInvocation の Provider 実行と
 * result wake を Durable Object adapter 層にまとめます。公開 API は引き続き Protobuf RPC dispatcher から
 * `AIAgent` の既存 method 名へ到達し、ここでは REST/JSON/public Durable Object fetch surface を追加しません。
 *
 * @example
 * ```ts
 * const listed = await agentEventRunToolHandlers.tools.listTools(context, query);
 * ```
 */
export const agentEventRunToolHandlers = {
  events: {
    getEvent,
    listEvents,
    publishEvent,
  },
  runs: {
    cancelRun,
    getRun,
    listRuns,
  },
  tools: {
    approveToolInvocation,
    cancelToolInvocation,
    createToolInvocation,
    executeToolInvocation,
    getToolInvocation,
    listToolInvocations,
    listTools,
    reconcileToolInvocation,
    recordToolResult,
    rejectToolInvocation,
  },
} as const;

async function publishEvent(
  context: AIAgentEventRunToolHandlerContext,
  command: PublishAgentEventCommand
): Promise<PublishAgentEventResult> {
  // Blob payload writer は Phase 3a の Durable Object seam を利用し、Agent-owned R2 binding だけを注入します。
  const result = await publishEventInStore({
    agentId: context.agentId,
    blobWriter: createAgentBlobPayloadWriter(context.env.AGENT_BLOBS),
    command,
    repositories: context.repositories,
    storageUsagePercent: createAgentStorageThresholdSnapshot({
      currentBytes: readDurableObjectSqlDatabaseSizeBytes(context.durableObjectStorage),
    }).currentPercent,
  });
  // Idempotency replay では pending Run wake を重複作成せず、新規 Event append の場合だけ scheduler を起こします。
  if (!result.replayed) {
    context.requestSchedulerWake({
      reason: 'event_accepted',
      requestedAtMs: command.context.requestedAtMs,
    });
  }
  return result;
}

function getEvent(
  context: AIAgentEventRunToolHandlerContext,
  query: GetAgentEventQuery
): AgentEventView {
  // Event query は Agent scope と認可 context を domain operation へ渡し、cross-Agent 読み取りを提供しません。
  return getEventFromStore({ agentId: context.agentId, query, repositories: context.repositories });
}

function listEvents(
  context: AIAgentEventRunToolHandlerContext,
  query: ListAgentEventsQuery
): ListAgentEventsResult {
  // Cursor/page 条件は Event store に閉じ、Durable Object adapter は Agent ID だけを明示します。
  return listEventsFromStore({
    agentId: context.agentId,
    query,
    repositories: context.repositories,
  });
}

function getRun(
  context: AIAgentEventRunToolHandlerContext,
  query: GetAgentRunQuery
): Promise<GetAgentRunResult> {
  // Run snapshot の取得は Run store に委譲し、Provider/queue side effect は起こしません。
  return getRunFromStore({ agentId: context.agentId, query, repositories: context.repositories });
}

function listRuns(
  context: AIAgentEventRunToolHandlerContext,
  query: ListAgentRunsQuery
): ListAgentRunsResult {
  // Thread/status/time filter と cursor の整合性は Run store の既存 validation に任せます。
  return listRunsFromStore({ agentId: context.agentId, query, repositories: context.repositories });
}

function cancelRun(
  context: AIAgentEventRunToolHandlerContext,
  command: CancelAgentRunCommand
): CancelAgentRunResult {
  // Run cancel は Agent-owned ledger の状態遷移だけに閉じ、Queue や external provider は直接触りません。
  return cancelRunInStore({
    agentId: context.agentId,
    command,
    repositories: context.repositories,
  });
}

function listTools(
  context: AIAgentEventRunToolHandlerContext,
  query: ListAgentToolsQuery
): Promise<ListAgentToolsResult> {
  // Built-in と Integration-backed Tool catalog の統合は Tool operation に閉じます。
  return listToolsFromStore({
    agentId: context.agentId,
    query,
    repositories: context.repositories,
  });
}

function getToolInvocation(
  context: AIAgentEventRunToolHandlerContext,
  query: GetToolInvocationQuery
): GetToolInvocationResult {
  // Payload 参照表示条件と final authorization は Tool operation へ渡し、DO layer では再実装しません。
  return getToolInvocationFromStore({
    agentId: context.agentId,
    query,
    repositories: context.repositories,
  });
}

function listToolInvocations(
  context: AIAgentEventRunToolHandlerContext,
  query: ListToolInvocationsQuery
): ListToolInvocationsResult {
  // ToolInvocation の filter/cursor pagination は repository-backed operation の既存規則を使います。
  return listToolInvocationsFromStore({
    agentId: context.agentId,
    query,
    repositories: context.repositories,
  });
}

function createToolInvocation(
  context: AIAgentEventRunToolHandlerContext,
  command: CreateToolInvocationCommand
): Promise<ToolInvocationMutationResult> {
  // AgentRun harness からの作成要求を Tool operation へ渡し、idempotency と audit は同じ seam で処理します。
  return createToolInvocationInStore({
    agentId: context.agentId,
    command,
    repositories: context.repositories,
  });
}

function approveToolInvocation(
  context: AIAgentEventRunToolHandlerContext,
  command: DecideToolInvocationCommand
): ToolInvocationMutationResult {
  // 承認 actor と rationale の記録は Tool operation に閉じ、handler は Agent scope だけを注入します。
  return approveToolInvocationInStore({
    agentId: context.agentId,
    command,
    repositories: context.repositories,
  });
}

function rejectToolInvocation(
  context: AIAgentEventRunToolHandlerContext,
  command: DecideToolInvocationCommand
): ToolInvocationMutationResult {
  // 却下による状態遷移と audit は Tool operation に集約し、Provider side effect は発生させません。
  return rejectToolInvocationInStore({
    agentId: context.agentId,
    command,
    repositories: context.repositories,
  });
}

async function executeToolInvocation(
  context: AIAgentEventRunToolHandlerContext,
  command: ExecuteToolInvocationCommand
): Promise<ToolInvocationMutationResult> {
  // Provider client 構築、署名、binary Protobuf 呼び出しは既存 Tool operation の seam をそのまま利用します。
  const result = await executeToolInvocationWithProvider({
    agentId: context.agentId,
    command,
    repositories: context.repositories,
  });
  // 同期 result Event が生成された場合だけ、AIAgent 側の既存 wake 判定 callback に委譲します。
  context.requestWakeAfterToolResult(result, command.context.requestedAtMs);
  return result;
}

function recordToolResult(
  context: AIAgentEventRunToolHandlerContext,
  command: RecordToolResultCommand
): ToolInvocationMutationResult {
  // Provider callback の result 記録は Tool operation に集約し、重複 result 抑止を再実装しません。
  const result = recordToolResultInStore({
    agentId: context.agentId,
    command,
    repositories: context.repositories,
  });
  // 新規 result Event の wake 判定は既存 callback を通して一箇所に保ちます。
  context.requestWakeAfterToolResult(result, command.context.requestedAtMs);
  return result;
}

async function reconcileToolInvocation(
  context: AIAgentEventRunToolHandlerContext,
  command: ReconcileToolInvocationCommand
): Promise<ToolInvocationMutationResult> {
  // outcome_unknown の Provider operation 照合は既存 Tool operation に任せ、transport side effect を重複させません。
  const result = await reconcileToolInvocationInStore({
    agentId: context.agentId,
    command,
    repositories: context.repositories,
  });
  // terminal result Event が確定した場合だけ scheduler wake 判定へ進めます。
  context.requestWakeAfterToolResult(result, command.context.requestedAtMs);
  return result;
}

function cancelToolInvocation(
  context: AIAgentEventRunToolHandlerContext,
  command: CancelToolInvocationCommand
): Promise<ToolInvocationMutationResult> {
  // Provider CancelOperation を含む cancel flow は Tool operation の side-effect seam をそのまま利用します。
  return cancelToolInvocationInStore({
    agentId: context.agentId,
    command,
    repositories: context.repositories,
  });
}
