import type { AgentLocalQueueWakePayload } from '../AIAgent.types';
import type { AgentModelExecutionCapabilityView } from '../domain';
import type { AgentWorkerEnv } from '../env';
import type { CreateAgentScheduleResult } from '../schedules';
import type { AgentStorageRepositories } from '../storage';
import type { ToolInvocationMutationResult } from '../tools';
import type { AIAgentCoreHandlerContext } from './core-handlers';
import type { AIAgentEventRunToolHandlerContext } from './event-run-tool-handlers';
import type { AIAgentIntegrationHandlerContext } from './integration-handlers';
import type { AgentDurableObjectRuntimeScheduleRegistration } from './runtime-schedule';
import type { AIAgentScheduleHandlerContext } from './schedule-handlers';

/**
 * `AIAgent` 本体から handler context factory へ渡す Durable Object 境界の依存一式です。
 *
 * @remarks
 * `AIAgent` class が保持する Agent ID、Agent-owned repository、Durable Object storage、Worker binding、
 * Agents SDK schedule API、scheduler wake callback を明示的な値として束ねます。handler context の組み立てを
 * class 本体から分離しつつ、public Durable Object method の名前・引数・返却型は `AIAgent` 側に残します。
 *
 * @property agentId Durable Object 名から得た Agent aggregate ID です。
 * @property cancelRuntimeSchedule Agents SDK runtime schedule を取り消す Durable Object 境界 callback です。
 * @property durableObjectStorage SQLite 使用量 snapshot を読む Durable Object storage です。
 * @property env Agent Worker binding 群です。handler では Agent-owned R2 だけを利用します。
 * @property readModelExecutionCapability provider secret を含まない model execution capability を読む callback です。
 * @property readNowMs schedule callback と wake 要求時刻を読む現在時刻 provider です。
 * @property registerRuntimeSchedule storage 作成後の runtime schedule 登録境界 callback です。
 * @property repositories Agent-owned SQLite repository 集約です。
 * @property requestSchedulerWake Event append 後に Agent-local Queue wake を要求する callback です。
 * @property requestWakeAfterToolResult Tool result Event 作成後に scheduler wake を要求する callback です。
 * @example
 * ```ts
 * const factory = createAIAgentHandlerContextFactory(source);
 * agentCoreHandlers.getAgent(factory.core(), query);
 * ```
 */
export interface AIAgentHandlerContextSource {
  readonly agentId: string;
  readonly cancelRuntimeSchedule: (runtimeScheduleId: string) => Promise<void>;
  readonly durableObjectStorage: DurableObjectStorage;
  readonly env: AgentWorkerEnv;
  readonly readModelExecutionCapability: () => AgentModelExecutionCapabilityView;
  readonly readNowMs: () => number;
  readonly registerRuntimeSchedule: (
    result: CreateAgentScheduleResult
  ) => Promise<AgentDurableObjectRuntimeScheduleRegistration>;
  readonly repositories: AgentStorageRepositories;
  readonly requestSchedulerWake: (payload: AgentLocalQueueWakePayload) => void;
  readonly requestWakeAfterToolResult: (
    result: ToolInvocationMutationResult,
    requestedAtMs: number
  ) => void;
}

/**
 * Event/Run/Tool handler と Integration handler が共有する side-effect context です。
 *
 * @remarks
 * 両 handler は Agent ID、storage、Worker binding、scheduler wake callback を同じ形で必要とします。
 * intersection type によって共通 seam を一箇所で表し、`AIAgent` class 側で handler ごとの context 型 import を
 * 重複させないようにします。
 *
 * @example
 * ```ts
 * const context: AIAgentSideEffectHandlerContext = factory.sideEffect();
 * ```
 */
export type AIAgentSideEffectHandlerContext = AIAgentEventRunToolHandlerContext &
  AIAgentIntegrationHandlerContext;

/**
 * `AIAgent` public methods から handler へ渡す context を必要時に生成する factory です。
 *
 * @remarks
 * context object は各 public method 呼び出し時に作成し、既存 callback の評価タイミングを保ちます。
 * 動的 method 生成や prototype 書き換えは行わず、`AIAgent` の public method が明示的に handler へ委譲する形を
 * 維持します。
 *
 * @example
 * ```ts
 * const scheduleContext = factory.schedule();
 * ```
 */
export interface AIAgentHandlerContextFactory {
  /** Core/query handler 用 context を生成します。 */
  readonly core: () => AIAgentCoreHandlerContext;
  /** Event/Run/Tool と Integration handler 用 side-effect context を生成します。 */
  readonly sideEffect: () => AIAgentSideEffectHandlerContext;
  /** Schedule handler 用 context を生成します。 */
  readonly schedule: () => AIAgentScheduleHandlerContext;
}

/**
 * `AIAgent` の handler context 生成処理を Durable Object helper として構築します。
 *
 * @param source `AIAgent` が保持する Agent ID、repository、storage、binding、副作用 callback の集合です。
 * @returns Core、side-effect、schedule の各 handler context を作る factory です。
 * @throws この関数自体は例外を投げません。渡された callback の例外は各 handler 実行時に呼び出し元へ伝播します。
 * @example
 * ```ts
 * const contexts = createAIAgentHandlerContextFactory(source);
 * return agentScheduleHandlers.listAgentSchedules(contexts.schedule(), query);
 * ```
 */
export function createAIAgentHandlerContextFactory(
  source: AIAgentHandlerContextSource
): AIAgentHandlerContextFactory {
  return {
    // Core/query context は storage 使用量と model capability の読み取り境界だけを公開します。
    core: () => createCoreHandlerContext(source),
    // Event/Run/Tool と Integration は同じ side-effect seam を共有し、wake callback の意味を揃えます。
    sideEffect: () => createSideEffectHandlerContext(source),
    // Schedule context は runtime schedule 登録/cancel と scheduler wake の副作用だけを追加します。
    schedule: () => createScheduleHandlerContext(source),
  };
}

function createCoreHandlerContext(source: AIAgentHandlerContextSource): AIAgentCoreHandlerContext {
  // Agent-owned query handler に必要な共通値だけを渡し、Worker binding や schedule side effect は隠します。
  return {
    agentId: source.agentId,
    durableObjectStorage: source.durableObjectStorage,
    readModelExecutionCapability: source.readModelExecutionCapability,
    repositories: source.repositories,
  };
}

function createSideEffectHandlerContext(
  source: AIAgentHandlerContextSource
): AIAgentSideEffectHandlerContext {
  // Event publish、Tool result、Integration delivery が共有する storage/R2/wake seam を一つに揃えます。
  return {
    agentId: source.agentId,
    durableObjectStorage: source.durableObjectStorage,
    env: source.env,
    repositories: source.repositories,
    requestSchedulerWake: source.requestSchedulerWake,
    requestWakeAfterToolResult: source.requestWakeAfterToolResult,
  };
}

function createScheduleHandlerContext(
  source: AIAgentHandlerContextSource
): AIAgentScheduleHandlerContext {
  // Schedule handler には Agents SDK runtime schedule の副作用境界と現在時刻 provider だけを追加します。
  return {
    agentId: source.agentId,
    cancelRuntimeSchedule: source.cancelRuntimeSchedule,
    readNowMs: source.readNowMs,
    registerRuntimeSchedule: source.registerRuntimeSchedule,
    repositories: source.repositories,
    requestSchedulerWake: source.requestSchedulerWake,
  };
}
