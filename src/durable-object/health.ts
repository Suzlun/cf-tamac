import type { AgentFoundationHealth, AIAgentState } from '../AIAgent.types';
import type { AgentLifecycleStatus, AgentModelExecutionCapabilityView } from '../domain';
import type { AgentStorageRepositories } from '../storage';

/**
 * Agent model execution capability を secret-free view として読む入力です。
 *
 * @remarks
 * Workers AI binding の有無だけを boolean で受け取り、binding object や secret reference は下位 view へ
 * 渡しません。default policy は Agent-owned SQLite から読み、health RPC に返してよい識別情報だけに限定します。
 *
 * @example
 * ```ts
 * const capability = readAgentModelExecutionCapability({ bindingPresent, repositories });
 * ```
 */
export interface AgentModelExecutionCapabilityInput {
  /** Agent Worker に Workers AI binding が存在するかどうかです。 */
  readonly bindingPresent: boolean;
  /** Agent-owned config/model policy repository set です。 */
  readonly repositories: AgentStorageRepositories;
  /** health 観測時刻です。未指定時は Durable Object の現在時刻を使います。 */
  readonly checkedAtMs?: number;
}

/**
 * Agent foundation health view を組み立てる入力です。
 *
 * @remarks
 * Durable Object SDK state と Agent profile repository の lifecycle status を読み、profile が存在する場合は
 * SQLite 側の aggregate 状態を優先します。返却値は storage/queue 種別と model capability だけを含む
 * Protobuf RPC 用の安全な health view です。
 *
 * @example
 * ```ts
 * const health = checkAgentFoundationHealth({ agentId, bindingPresent, repositories, state });
 * ```
 */
export interface AgentFoundationHealthInput {
  /** Durable Object instance が所有する Agent ID です。 */
  readonly agentId: string;
  /** Agent Worker に Workers AI binding が存在するかどうかです。 */
  readonly bindingPresent: boolean;
  /** Agent profile/config/model policy を読む repository set です。 */
  readonly repositories: AgentStorageRepositories;
  /** Agents SDK state に保持している lifecycle fallback です。 */
  readonly state: AIAgentState;
  /** health 観測時刻です。未指定時は Durable Object の現在時刻を使います。 */
  readonly checkedAtMs?: number;
}

/**
 * Agent model execution capability を secret-free health snapshot として読み取ります。
 *
 * @param input binding 有無、Agent-owned repository set、任意の観測時刻です。
 * @returns provider secret を含まない model execution capability view です。
 * @throws repository 読み取りが失敗した場合に呼び出し元へ伝播します。
 * @example
 * ```ts
 * const capability = readAgentModelExecutionCapability({ bindingPresent: true, repositories });
 * ```
 */
export function readAgentModelExecutionCapability(
  input: AgentModelExecutionCapabilityInput
): AgentModelExecutionCapabilityView {
  const config = input.repositories.config.getLatestConfig();
  // default model policy ref が未設定なら missing-default とし、secret や raw policy body は返しません。
  const defaultPolicy =
    config?.modelPolicyRef === null || config?.modelPolicyRef === undefined
      ? undefined
      : input.repositories.modelPolicies.getPolicy(config.modelPolicyRef);
  const modelStatus =
    input.bindingPresent && defaultPolicy?.status === 'active'
      ? 'serving'
      : input.bindingPresent
        ? 'degraded'
        : 'unavailable';
  return {
    bindingPresent: input.bindingPresent,
    checkedAtMs: input.checkedAtMs ?? Date.now(),
    defaultPolicyDigest: defaultPolicy?.policyDigest,
    defaultPolicyRef: defaultPolicy?.policyRef,
    modelId: defaultPolicy?.modelId,
    provider: defaultPolicy?.provider,
    safeDetailRef: defaultPolicy === undefined ? 'agent-model-policy://missing-default' : undefined,
    status: modelStatus,
  };
}

/**
 * Agent Durable Object の Protobuf RPC 用 health view を組み立てます。
 *
 * @param input Agent ID、binding 有無、repository set、Agents SDK state、任意の観測時刻です。
 * @returns secret-free な Agent foundation health view です。
 * @throws repository 読み取りが失敗した場合に呼び出し元へ伝播します。
 * @example
 * ```ts
 * const health = checkAgentFoundationHealth({ agentId, bindingPresent, repositories, state });
 * ```
 */
export function checkAgentFoundationHealth(
  input: AgentFoundationHealthInput
): AgentFoundationHealth {
  const profile = input.repositories.profile.getProfile();
  // profile が未初期化の間は Agents SDK state を fallback にして、health RPC を fail-open ではなく安全な状態表示に留めます。
  return {
    agentId: input.agentId,
    modelExecution: readAgentModelExecutionCapability({
      bindingPresent: input.bindingPresent,
      checkedAtMs: input.checkedAtMs,
      repositories: input.repositories,
    }),
    queue: 'agent_local',
    status: (profile?.lifecycleStatus ?? input.state.lifecycleStatus) as AgentLifecycleStatus,
    storage: 'sqlite',
  };
}
