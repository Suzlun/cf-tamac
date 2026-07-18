import { authorizeAgentOperation } from '../domain/agent-operation-utils';

import type { AgentAuditView, AgentCoreRequestContext } from '../domain';
import type { AgentStorageRepositories } from '../storage';

const scheduleServiceName = 'cftamac.agent.v1.AgentScheduleService';

/**
 * Schedule operation の監査 row と system Thread Event を保存します。
 *
 * @param input Agent ID、任意の request context、Agent-owned repository set です。
 * @param operation 保存する Schedule lifecycle event type です。
 * @param result 監査 view に返す operation result です。
 * @returns Agent RPC 応答へ含める監査 view です。
 * @throws audit repository または Event append が失敗した場合に呼び出し元へ伝播します。
 * @example
 * ```ts
 * const audit = recordScheduleAudit(input, 'agent.schedule.cancelled', 'cancelled');
 * ```
 */
export function recordScheduleAudit(
  input: {
    readonly agentId: string;
    readonly command?: { readonly context: AgentCoreRequestContext };
    readonly repositories: AgentStorageRepositories;
  },
  operation: string,
  result: string
): AgentAuditView {
  const context = input.command?.context;
  const nowMs = context?.requestedAtMs ?? Date.now();
  const auditId = crypto.randomUUID();
  input.repositories.audit.insertAuditEvent({
    auditId,
    createdAtMs: nowMs,
    eventType: operation,
    principalRef: context?.principal.principalId,
    requestDigest: context?.bodyDigest.digestHex,
  });
  appendScheduleAuditEvent(input.repositories, auditId, operation, nowMs, context);
  const profile = input.repositories.profile.getProfile();
  return {
    agentId: input.agentId,
    auditEventId: auditId,
    correlationId: context?.correlationId,
    occurredAtMs: nowMs,
    operation,
    principalId: context?.principal.principalId ?? 'system',
    result,
    systemThreadId: profile?.systemThreadId ?? '',
  };
}

function appendScheduleAuditEvent(
  repositories: AgentStorageRepositories,
  auditId: string,
  operation: string,
  nowMs: number,
  context: AgentCoreRequestContext | undefined
): void {
  const profile = repositories.profile.getProfile();
  const systemThread = repositories.threads.findByThreadId(profile?.systemThreadId ?? '');
  if (systemThread === undefined) return;
  const section = repositories.sections.findOpenSection(systemThread.threadId);
  if (section === undefined) return;
  repositories.events.appendEvent({
    createdAtMs: nowMs,
    eventId: crypto.randomUUID(),
    eventType: operation,
    idempotencyKey: `audit:${auditId}`,
    normalizedThreadKey: systemThread.normalizedThreadKey,
    occurredAtMs: nowMs,
    requestDigest: context?.bodyDigest.digestHex,
    sectionId: section.sectionId,
    sequences: repositories.events.getNextSequences(systemThread.threadId),
    source: 'agent.schedule',
    threadId: systemThread.threadId,
    threadKey: systemThread.threadKey,
  });
  repositories.sections.incrementEventCount(systemThread.threadId, section.sectionId);
}

/**
 * Schedule RPC operation に共通する権限を検証します。
 *
 * @param repositories 権限・principal 情報を読む Agent-owned repository set です。
 * @param context request principal、scope、digest を含む Agent core context です。
 * @param action 検証対象の Agent schedule action 名です。
 * @param method 呼び出し元 RPC method 名です。
 * @returns 認可に成功した場合は値を返さず、呼び出し元の Schedule operation を継続させます。
 * @throws AgentDomainError principal type または scope が不足している場合に発生します。
 * @example
 * ```ts
 * authorizeScheduleOperation(repositories, context, 'schedule.get', 'GetSchedule');
 * ```
 */
export function authorizeScheduleOperation(
  repositories: AgentStorageRepositories,
  context: AgentCoreRequestContext,
  action: string,
  method: string
): void {
  authorizeAgentOperation({
    action,
    context,
    method,
    repositories,
    requiredPrincipalTypes: [
      'CLIENT_SERVICE',
      'ADMIN_OPERATOR',
      'INTERNAL_SERVICE',
      'INTEGRATION_INSTALLATION',
    ],
    requiredScopes: ['agent.rpc', 'agent.schedule'],
    service: scheduleServiceName,
  });
}
