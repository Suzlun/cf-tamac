import {
  assertAgentContext,
  completeAgentIdempotencyRecord,
  requireAgentIdempotencyKey,
  reserveAgentNonce,
  reserveAgentIdempotencyRecord,
} from '../domain/agent-operation-utils';
import { createAgentDomainError } from '../domain/errors';
import { createThreadKeyIdentity } from '../threads';

import { authorizeScheduleOperation, recordScheduleAudit } from './operations-shared';
import { normalizeScheduleOverlapPolicy } from './overlap';
import { parseAgentScheduleSpec } from './spec';
import { mapScheduleRow, normalizeOptionalFilter } from './views';

import type { AgentCoreRequestContext } from '../domain';
import type { AgentScheduleRow, AgentStorageRepositories, AgentThreadRow } from '../storage';
import type {
  AgentScheduleRuntimePlan,
  AgentScheduleView,
  CreateAgentScheduleCommand,
  CreateAgentScheduleResult,
} from './types';

const createScheduleOperationName = 'AgentScheduleService.CreateSchedule';
const defaultScheduleCallbackIdentity = 'handleAgentScheduleCallback';

type CreateScheduleIdempotencyState =
  | { readonly status: 'new_command' }
  | { readonly response: CreateAgentScheduleResult; readonly status: 'replay' }
  | { readonly schedule: AgentScheduleRow; readonly status: 'resume' };

/**
 * Agents SDK へ登録済みの runtime schedule 情報です。
 *
 * @remarks
 * Durable Object helper が SDK から受け取った ID と次回発火時刻だけを storage bind 用に渡します。
 * SDK 固有 object は domain 層へ流さないため、この境界型に最小化します。
 */
export interface AgentRuntimeScheduleRegistration {
  readonly id: string;
  readonly time?: number;
}

/**
 * CreateSchedule の Agent-owned storage 更新と runtime callback 登録を一貫して行う入力です。
 *
 * @remarks
 * storage insert、Agents SDK runtime 登録、runtime ID bind、idempotency completion を同じ helper で扱うため、
 * Durable Object から runtime 登録/cancel 関数を注入します。
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

/**
 * CreateSchedule command を Agent-owned storage に保存します。
 *
 * @param input Agent ID、command、repository set を含む入力です。
 * @returns 作成済み Schedule と SDK 登録用 runtime plan を返します。
 * @throws AgentDomainError Thread context 不在、権限不足、不正 schedule_spec の場合に発生します。
 * @example
 * ```ts
 * const result = createScheduleInStore({ agentId, command, repositories });
 * ```
 */
export function createScheduleInStore(input: {
  readonly agentId: string;
  readonly command: CreateAgentScheduleCommand;
  readonly repositories: AgentStorageRepositories;
}): CreateAgentScheduleResult {
  assertAgentContext(input.agentId, input.command.context);
  assertScheduleThreadContext(input.command);
  // 既存の成功応答だけは validation 前に返し、再送が副作用なく完了できるようにする。
  const idempotency = checkCreateScheduleIdempotency(input);
  if (idempotency.status === 'replay') return { ...idempotency.response, replayed: true };
  // 認可・所有権・schedule_spec 検証を予約前に済ませ、失敗した key を汚染しない。
  authorizeScheduleOperation(
    input.repositories,
    input.command.context,
    'schedule.create',
    'CreateSchedule'
  );
  assertInstallationOwnership(input.command.context, input.command.installationId);

  const nowMs = input.command.context.requestedAtMs;
  const parsedSpec = parseAgentScheduleSpec(input.command.scheduleSpec, nowMs);
  if (idempotency.status === 'resume') {
    // 予約済みだが応答未保存の command は、既存 Schedule row から安全に再開する。
    return createResumedScheduleResult(
      input.agentId,
      input.repositories,
      idempotency.schedule,
      parsedSpec.runtimePlan
    );
  }
  // nonce、idempotency record、Thread 解決、監査、Schedule row を同一 transaction に閉じる。
  const persisted = input.repositories.transaction((repositories) => {
    reserveAgentNonce(repositories, input.command.context);
    reserveAgentIdempotencyRecord({
      context: input.command.context,
      operationName: createScheduleOperationName,
      repositories,
    });
    const thread = resolveScheduleThread(input.agentId, repositories, input.command, nowMs);
    const audit = recordScheduleAudit(
      { ...input, repositories },
      'agent.schedule.created',
      'succeeded'
    );
    const schedule = insertSchedule(
      { ...input, repositories },
      thread,
      parsedSpec.runtimePlan,
      audit.auditEventId
    );
    return { audit, schedule };
  });
  return {
    audit: persisted.audit,
    replayed: false,
    runtimePlan: parsedSpec.runtimePlan,
    schedule: persisted.schedule,
  };
}

/**
 * runtime registration と bind が完了した CreateSchedule response を冪等 replay 用に保存します。
 *
 * @param input command、repository set、runtime 登録済み result です。
 * @returns 保存完了時は値を返しません。
 * @throws AgentDomainError idempotency key が欠落している場合に発生します。
 * @example
 * ```ts
 * completeCreateScheduleIdempotencyInStore({ command, repositories, result });
 * ```
 */
export function completeCreateScheduleIdempotencyInStore(input: {
  readonly command: CreateAgentScheduleCommand;
  readonly repositories: AgentStorageRepositories;
  readonly result: CreateAgentScheduleResult;
}): void {
  const replayable = { ...input.result, runtimePlan: undefined };
  completeAgentIdempotencyRecord({
    context: input.command.context,
    repositories: input.repositories,
    response: replayable,
  });
}

/**
 * SDK runtime schedule の ID を Agent-owned Schedule row に bind します。
 *
 * @param input Agent ID、CreateSchedule result、runtime schedule ID、任意の次回発火時刻、repository set です。
 * @returns runtimeScheduleId が反映された CreateSchedule result です。
 * @throws repository 更新が失敗した場合に発生します。
 * @example
 * ```ts
 * const bound = bindScheduleRuntimeInStore({ agentId, result, runtimeScheduleId, repositories });
 * ```
 */
export function bindScheduleRuntimeInStore(input: {
  readonly agentId: string;
  readonly result: CreateAgentScheduleResult;
  readonly runtimeScheduleId: string;
  readonly runtimeNextFireAtMs?: number;
  readonly repositories: AgentStorageRepositories;
}): CreateAgentScheduleResult {
  const row = input.repositories.schedules.bindRuntimeSchedule({
    nextFireAtMs: input.runtimeNextFireAtMs,
    runtimeScheduleId: input.runtimeScheduleId,
    scheduleId: input.result.schedule.scheduleId,
    updatedAtMs: input.result.schedule.createdAtMs,
  });
  return {
    ...input.result,
    runtimeScheduleId: input.runtimeScheduleId,
    schedule: mapScheduleRow(input.agentId, row),
  };
}

function checkCreateScheduleIdempotency(input: {
  readonly command: CreateAgentScheduleCommand;
  readonly repositories: AgentStorageRepositories;
}): CreateScheduleIdempotencyState {
  const idempotencyKey = requireAgentIdempotencyKey(input.command.context);
  const existing = input.repositories.idempotency.findRecord(
    input.command.context.principal.principalId,
    idempotencyKey
  );
  if (existing === undefined) return { status: 'new_command' };
  if (existing.requestDigest !== input.command.context.bodyDigest.digestHex) {
    throw createAgentDomainError({
      kind: 'conflict',
      message: 'Idempotency key was already used with a different request digest.',
    });
  }
  if (existing.operationName !== createScheduleOperationName) {
    throw createAgentDomainError({
      kind: 'conflict',
      message: 'Idempotency key was already used for a different Agent operation.',
    });
  }
  if (existing.responseRef !== null) {
    return {
      response: JSON.parse(existing.responseRef) as CreateAgentScheduleResult,
      status: 'replay',
    };
  }
  const schedule = input.repositories.schedules.findByIdempotencyKey(idempotencyKey);
  if (schedule === undefined) {
    throw createAgentDomainError({
      kind: 'concurrency',
      message: 'Idempotent CreateSchedule command is still being recorded.',
    });
  }
  return { schedule, status: 'resume' };
}

function createResumedScheduleResult(
  agentId: string,
  repositories: AgentStorageRepositories,
  row: AgentScheduleRow,
  runtimePlan: AgentScheduleRuntimePlan
): CreateAgentScheduleResult {
  const profile = repositories.profile.getProfile();
  return {
    audit: {
      agentId,
      auditEventId: row.auditEventId ?? '',
      occurredAtMs: row.createdAtMs,
      operation: 'agent.schedule.created',
      principalId: row.createdByPrincipalId ?? 'system',
      result: 'succeeded',
      systemThreadId: profile?.systemThreadId ?? '',
    },
    replayed: false,
    runtimePlan: row.runtimeScheduleId === null ? runtimePlan : undefined,
    runtimeScheduleId: row.runtimeScheduleId ?? undefined,
    schedule: mapScheduleRow(agentId, row),
  };
}

function insertSchedule(
  input: {
    readonly agentId: string;
    readonly command: CreateAgentScheduleCommand;
    readonly repositories: AgentStorageRepositories;
  },
  thread: AgentThreadRow,
  runtimePlan: AgentScheduleRuntimePlan,
  auditEventId: string
): AgentScheduleView {
  const row = input.repositories.schedules.insertSchedule({
    auditEventId,
    callbackIdentity: input.command.callbackIdentity ?? defaultScheduleCallbackIdentity,
    createdAtMs: input.command.context.requestedAtMs,
    createdByPrincipalId: input.command.context.principal.principalId,
    idempotencyKey: input.command.context.idempotencyKey ?? '',
    installationId: normalizeOptionalFilter(input.command.installationId),
    intervalSeconds: runtimePlan.kind === 'interval' ? runtimePlan.intervalSeconds : undefined,
    nextFireAtMs: runtimePlan.nextFireAtMs,
    normalizedThreadKey: thread.normalizedThreadKey,
    overlapPolicy: normalizeScheduleOverlapPolicy(input.command.overlapPolicy),
    scheduleId: crypto.randomUUID(),
    scheduleKind: runtimePlan.kind,
    scheduleSpec: input.command.scheduleSpec,
    status: 'active',
    threadId: thread.threadId,
    threadKey: thread.threadKey,
    updatedAtMs: input.command.context.requestedAtMs,
  });
  return mapScheduleRow(input.agentId, row);
}

function resolveScheduleThread(
  agentId: string,
  repositories: AgentStorageRepositories,
  command: CreateAgentScheduleCommand,
  nowMs: number
): AgentThreadRow {
  const threadId = normalizeOptionalFilter(command.threadId);
  if (threadId !== undefined) {
    const thread = repositories.threads.findByThreadId(threadId);
    if (thread === undefined)
      throw createAgentDomainError({ kind: 'not_found', message: 'Thread not found.' });
    return thread;
  }
  const identity = createThreadKeyIdentity(agentId, command.threadKey ?? '');
  const existing = repositories.threads.findByNormalizedThreadKey(identity.normalizedThreadKey);
  if (existing !== undefined) return existing;
  const createdThreadId = crypto.randomUUID();
  repositories.threads.insertThread({
    normalizedThreadKey: identity.normalizedThreadKey,
    nowMs,
    threadId: createdThreadId,
    threadKey: identity.threadKey,
  });
  const created = repositories.threads.findByThreadId(createdThreadId);
  if (created === undefined)
    throw createAgentDomainError({ kind: 'internal', message: 'Thread write failed.' });
  return created;
}

function assertScheduleThreadContext(command: CreateAgentScheduleCommand): void {
  if (normalizeOptionalFilter(command.threadId) !== undefined) return;
  if (normalizeOptionalFilter(command.threadKey) !== undefined) return;
  throw createAgentDomainError({
    kind: 'validation',
    message: 'CreateSchedule requires thread_id or thread_key.',
  });
}

function assertInstallationOwnership(
  context: AgentCoreRequestContext,
  installationId: string | undefined
): void {
  if (
    installationId === undefined ||
    context.principal.principalType !== 'INTEGRATION_INSTALLATION'
  )
    return;
  if (context.principal.principalId === installationId) return;
  throw createAgentDomainError({
    kind: 'authorization',
    message: 'Installation-owned Schedule principal mismatch.',
  });
}

function inputWithResult(
  input: CreateAndRegisterAgentScheduleInput,
  result: CreateAgentScheduleResult
) {
  return { command: input.command, repositories: input.repositories, result };
}
