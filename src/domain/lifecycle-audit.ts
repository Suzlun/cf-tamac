import { createAgentDomainError } from './errors';

import type { AgentCoreRequestContext } from './agent-core';
import type { AgentProfileRow, AgentStorageRepositories } from '../storage';

/**
 * Agent lifecycle 系操作の audit record と system Thread Event を保存します。
 *
 * @param input Agent ID、任意の command context、Agent-owned repository set です。
 * @param operation audit/event に保存する lifecycle operation 名です。
 * @param result 操作結果を表す安全な文字列です。
 * @returns RPC 応答へ含める audit view を返します。
 * @throws AgentDomainError Agent profile が存在しない場合に発生します。
 * @example
 * ```ts
 * const audit = recordLifecycleAudit(input, 'agent.lifecycle.initialized', 'succeeded');
 * ```
 */
export function recordLifecycleAudit(
  input: {
    readonly agentId: string;
    readonly command?: { readonly context: AgentCoreRequestContext };
    readonly repositories: AgentStorageRepositories;
  },
  operation: string,
  result: string
) {
  const context = input.command?.context;
  const now = context?.requestedAtMs ?? Date.now();
  const profile = requireLifecycleProfile(input.repositories);
  const auditId = crypto.randomUUID();
  input.repositories.audit.insertAuditEvent({
    auditId,
    createdAtMs: now,
    eventType: operation,
    principalRef: context?.principal.principalId,
    requestDigest: context?.bodyDigest.digestHex,
  });
  appendLifecycleAuditEvent(input, auditId, operation, now);
  return {
    agentId: input.agentId,
    auditEventId: auditId,
    correlationId: context?.correlationId,
    occurredAtMs: now,
    operation,
    principalId: context?.principal.principalId ?? 'system',
    result,
    systemThreadId: profile.systemThreadId ?? '',
  };
}

function appendLifecycleAuditEvent(
  input: {
    readonly command?: { readonly context: AgentCoreRequestContext };
    readonly repositories: AgentStorageRepositories;
  },
  auditId: string,
  operation: string,
  now: number
): void {
  const profile = requireLifecycleProfile(input.repositories);
  const systemThread = input.repositories.threads.findByThreadId(profile.systemThreadId ?? '');
  if (systemThread === undefined) return;
  const section = input.repositories.sections.findOpenSection(systemThread.threadId);
  if (section === undefined) return;
  const sequences = input.repositories.events.getNextSequences(systemThread.threadId);
  input.repositories.events.appendEvent({
    createdAtMs: now,
    eventId: crypto.randomUUID(),
    eventType: operation,
    idempotencyKey: `audit:${auditId}`,
    normalizedThreadKey: systemThread.normalizedThreadKey,
    occurredAtMs: now,
    requestDigest: input.command?.context.bodyDigest.digestHex,
    sectionId: section.sectionId,
    sequences,
    source: 'agent.lifecycle',
    threadId: systemThread.threadId,
    threadKey: systemThread.threadKey,
  });
  input.repositories.sections.incrementEventCount(systemThread.threadId, section.sectionId);
}

function requireLifecycleProfile(repositories: AgentStorageRepositories): AgentProfileRow {
  const profile = repositories.profile.getProfile();
  if (profile === undefined) {
    throw createAgentDomainError({ kind: 'not_found', message: 'Agent not found.' });
  }
  return profile;
}
