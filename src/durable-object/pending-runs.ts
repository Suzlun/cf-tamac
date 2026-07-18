import { createWorkersAiModelProvider } from '../model-provider-workers-ai';
import { executeStartedAgentRun, processAgentRunSchedulerBatch } from '../runs';

import type { AgentLocalQueueProcessPayload, AgentLocalQueueProcessResult } from '../AIAgent.types';
import type { AgentWorkersAiBinding } from '../env';
import type { AgentStorageRepositories } from '../storage';

/**
 * Agent-local Queue callback から pending Run scheduler batch を処理する入力です。
 *
 * @remarks
 * Durable Object 境界で Workers AI binding を provider adapter へ変換し、Run scheduler の source of truth は
 * Agent-owned SQLite repository set に閉じます。reenqueue は AIAgent から注入された scheduler wake 境界だけを
 * 呼び、Cloudflare Queues や Client runtime へ依存しません。
 *
 * @example
 * ```ts
 * await processAgentLocalQueuePendingRuns({ agentId, ai, enqueueSchedulerWake, payload, repositories });
 * ```
 */
export interface AgentLocalQueuePendingRunProcessorInput {
  /** Durable Object instance が所有する Agent ID です。 */
  readonly agentId: string;
  /** Workers AI binding。未設定の場合は provider adapter が安全な missing_binding 結果にします。 */
  readonly ai: AgentWorkersAiBinding | undefined;
  /** reenqueue が必要な場合に Agent-local Queue wake を再要求する境界関数です。 */
  readonly enqueueSchedulerWake: (maxRuns: number | undefined) => void;
  /** Queue callback payload です。 */
  readonly payload: AgentLocalQueueProcessPayload;
  /** pending Run、Run snapshot、model invocation を読む Agent-owned repository set です。 */
  readonly repositories: AgentStorageRepositories;
  /** batch 内の状態遷移へ使う現在時刻です。未指定時は Durable Object の現在時刻を使います。 */
  readonly nowMs?: number;
}

/**
 * Agent-local Queue callback として pending Run を bounded batch で処理します。
 *
 * @param input Agent ID、Workers AI binding、repository set、Queue payload、reenqueue 境界、任意の現在時刻です。
 * @returns callback 観測用の処理件数、pending 数、reenqueue 要否、queue 種別を含む結果です。
 * @throws repository 操作または Run 実行処理が失敗した場合に呼び出し元へ伝播します。
 * @example
 * ```ts
 * const result = await processAgentLocalQueuePendingRuns(input);
 * ```
 */
export async function processAgentLocalQueuePendingRuns(
  input: AgentLocalQueuePendingRunProcessorInput
): Promise<AgentLocalQueueProcessResult> {
  const nowMs = input.nowMs ?? Date.now();
  const result = processAgentRunSchedulerBatch({
    agentId: input.agentId,
    maxRuns: input.payload.maxRuns ?? 1,
    nowMs,
    repositories: input.repositories,
  });
  const modelProvider = createWorkersAiModelProvider(input.ai);
  for (const startedRun of result.startedRuns) {
    // Run execution は開始済み snapshot だけを受け取り、pending queue の読み直しや Client storage へ触れません。
    await executeStartedAgentRun({
      agentId: input.agentId,
      modelProvider,
      nowMs,
      repositories: input.repositories,
      startedRun,
    });
  }
  if (result.reenqueue && input.repositories.pendingRuns.findActiveRun() === undefined) {
    // active Run が無い場合だけ bounded reenqueue し、同時実行中 Run への重複 wake を避けます。
    input.enqueueSchedulerWake(result.requestedMaxRuns);
  }
  return {
    agentId: result.agentId,
    pendingCount: result.pendingCount,
    processedCount: result.processedCount,
    queue: 'agent_local',
    reason: input.payload.reason,
    reenqueue: result.reenqueue,
    remainingPendingCount: result.remainingPendingCount,
    requestedMaxRuns: result.requestedMaxRuns,
    status: result.status,
  };
}
