import type { AgentScheduleCallbackPayload, CreateAgentScheduleResult } from '../schedules';

const agentScheduleCallbackName = 'handleAgentScheduleCallback' as const;

/**
 * Agents SDK runtime schedule 登録が返す最小 handle です。
 *
 * @remarks
 * Durable Object helper は SDK が返す値のうち、Agent-owned SQLite へ bind する `id` と次回発火時刻の
 * `time` だけを受け取ります。runtime 固有 object 全体を storage/domain 層へ流さないための境界型です。
 *
 * @example
 * ```ts
 * const handle: AgentDurableObjectRuntimeScheduleRegistration = { id: 'runtime-1' };
 * ```
 */
export interface AgentDurableObjectRuntimeScheduleRegistration {
  /** Agents SDK runtime schedule id です。 */
  readonly id: string;
  /** SDK が返した次回 callback 時刻です。存在しない runtime では undefined です。 */
  readonly time?: number;
}

/**
 * CreateSchedule result を Agents SDK runtime schedule へ登録する入力です。
 *
 * @remarks
 * AIAgent から `scheduleEvery` と `schedule` を注入し、この helper で callback 名と payload shape を固定します。
 * public Durable Object method 名は `handleAgentScheduleCallback` のまま維持し、RPC/tests が参照する
 * create/callback/cancel の外部挙動を変えません。
 *
 * @example
 * ```ts
 * await registerAgentRuntimeSchedule({ agentId, result, schedule, scheduleEvery });
 * ```
 */
export interface RegisterAgentRuntimeScheduleInput {
  /** Durable Object instance が所有する Agent ID です。 */
  readonly agentId: string;
  /** storage 層で作成された schedule と runtime 登録 plan です。 */
  readonly result: CreateAgentScheduleResult;
  /** Agents SDK の interval schedule 登録境界です。 */
  readonly scheduleEvery: (
    intervalSeconds: number,
    callbackName: typeof agentScheduleCallbackName,
    payload: AgentScheduleCallbackPayload,
    options: { readonly _idempotent: true }
  ) => Promise<AgentDurableObjectRuntimeScheduleRegistration>;
  /** Agents SDK の one-shot schedule 登録境界です。 */
  readonly schedule: (
    when: Date | number,
    callbackName: typeof agentScheduleCallbackName,
    payload: AgentScheduleCallbackPayload,
    options: { readonly idempotent: true }
  ) => Promise<AgentDurableObjectRuntimeScheduleRegistration>;
}

/**
 * CreateSchedule result の runtime plan を Agents SDK schedule API へ登録します。
 *
 * @param input Agent ID、CreateSchedule result、Agents SDK schedule 登録境界です。
 * @returns SQLite へ bind する runtime schedule id と次回発火時刻です。
 * @throws runtime plan が無い場合、または Agents SDK schedule 登録が失敗した場合に発生します。
 * @example
 * ```ts
 * const runtime = await registerAgentRuntimeSchedule({ agentId, result, schedule, scheduleEvery });
 * ```
 */
export async function registerAgentRuntimeSchedule(
  input: RegisterAgentRuntimeScheduleInput
): Promise<AgentDurableObjectRuntimeScheduleRegistration> {
  if (input.result.runtimePlan === undefined) {
    throw new TypeError('runtime schedule plan is required.');
  }
  const payload: AgentScheduleCallbackPayload = {
    agentId: input.agentId,
    scheduleId: input.result.schedule.scheduleId,
  };
  if (input.result.runtimePlan.kind === 'interval') {
    // interval schedule は Agents SDK の idempotent option 名が `_idempotent` であるため現行挙動を保持します。
    return input.scheduleEvery(
      input.result.runtimePlan.intervalSeconds,
      agentScheduleCallbackName,
      payload,
      {
        _idempotent: true,
      }
    );
  }
  // one-shot schedule は Date/秒 delay の `when` をそのまま SDK へ渡し、storage 側の計算済み時刻を再解釈しません。
  return input.schedule(input.result.runtimePlan.when, agentScheduleCallbackName, payload, {
    idempotent: true,
  });
}
