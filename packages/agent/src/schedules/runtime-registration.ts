import {
  bindScheduleRuntimeInStore,
  completeCreateScheduleIdempotencyInStore,
  createScheduleInStore,
} from './operations';

import type { AgentStorageRepositories } from '../storage';
import type { CreateAgentScheduleCommand, CreateAgentScheduleResult } from './types';

/**
 * Agents SDK へ登録済みの runtime schedule 情報です。
 */
export interface AgentRuntimeScheduleRegistration {
  readonly id: string;
  readonly time?: number;
}

/**
 * CreateSchedule の Agent-owned storage 更新と runtime callback 登録を一貫して行う入力です。
 */
export interface CreateAndRegisterAgentScheduleInput {
  readonly agentId: string;
  readonly cancelRuntimeSchedule: (runtimeScheduleId: string) => Promise<void>;
  readonly command: CreateAgentScheduleCommand;
  readonly registerRuntimeSchedule: (
    result: CreateAgentScheduleResult
  ) => Promise<AgentRuntimeScheduleRegistration>;
  readonly repositories: AgentStorageRepositories;
}

/**
 * CreateSchedule を storage insert、runtime 登録、runtime ID bind、idempotency 完了の順に実行します。
 *
 * @param input Agent ID、command、repository set、runtime 登録/cancel 関数です。
 * @returns runtime ID bind と replay response 保存が完了した CreateSchedule result です。
 * @throws AgentDomainError validation/authorization/storage/idempotency エラーで発生します。
 * @throws Error runtime schedule 登録または runtime ID bind に失敗した場合に発生します。
 * @example
 * ```ts
 * const result = await createAndRegisterAgentSchedule(input);
 * ```
 */
export async function createAndRegisterAgentSchedule(
  input: CreateAndRegisterAgentScheduleInput
): Promise<CreateAgentScheduleResult> {
  const result = createScheduleInStore(input);
  if (result.replayed) return result;
  if (result.runtimePlan === undefined) {
    // runtime 登録済みの再開結果は追加登録せず、応答保存だけを完了する。
    completeCreateScheduleIdempotencyInStore(inputWithResult(input, result));
    return result;
  }
  const runtime = await input.registerRuntimeSchedule(result);
  let bound: CreateAgentScheduleResult;
  try {
    // bind 失敗時だけ runtime 側を取り消し、DB 未反映の外部予約を残さない。
    bound = bindScheduleRuntimeInStore({
      agentId: input.agentId,
      repositories: input.repositories,
      result,
      runtimeNextFireAtMs: runtime.time,
      runtimeScheduleId: runtime.id,
    });
  } catch (error) {
    await input.cancelRuntimeSchedule(runtime.id).catch(() => undefined);
    throw error;
  }
  // bind 成功後の completion 失敗では runtime を残し、retry が応答保存だけを再開できるようにする。
  completeCreateScheduleIdempotencyInStore(inputWithResult(input, bound));
  return bound;
}

function inputWithResult(
  input: CreateAndRegisterAgentScheduleInput,
  result: CreateAgentScheduleResult
) {
  return { command: input.command, repositories: input.repositories, result };
}
