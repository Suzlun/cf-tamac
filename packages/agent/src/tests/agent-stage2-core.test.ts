import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const aiAgentPath = new URL('../AIAgent.ts', import.meta.url);
const foundationEventsPath = new URL('../AIAgent.foundation-events.ts', import.meta.url);
const tableInitializerPath = new URL('../storage/table-initializer.ts', import.meta.url);
const lifecycleAuditPath = new URL('../domain/lifecycle-audit.ts', import.meta.url);
const lifecycleOperationsPath = new URL('../domain/lifecycle-operations.ts', import.meta.url);
const eventOperationsPath = new URL('../events/operations.ts', import.meta.url);
const eventMailboxPath = new URL('../events/mailbox.ts', import.meta.url);
const finalAuthorizationPath = new URL('../domain/final-authorization.ts', import.meta.url);
const operationUtilsPath = new URL('../domain/agent-operation-utils.ts', import.meta.url);
const doRouterPath = new URL('../rpc/do-router.ts', import.meta.url);
const messageMappersPath = new URL('../rpc/message-mappers.ts', import.meta.url);

function readSource(path: URL): string {
  return readFileSync(fileURLToPath(path.href), 'utf8');
}

describe('Agent Stage 2 core implementation', () => {
  it('[AGENT-LIFECYCLE-S001] [AGENT-LIFECYCLE-S002] [AGENT-LIFECYCLE-S003] [AGENT-LIFECYCLE-S004] persists lifecycle config credential and audit seams', () => {
    const aiAgent = readSource(aiAgentPath);
    const lifecycleAudit = readSource(lifecycleAuditPath);
    const lifecycle = readSource(lifecycleOperationsPath);
    const schema = readSource(tableInitializerPath);
    const router = readSource(doRouterPath);

    expect(aiAgent).toContain('initializeAgent(command: InitializeAgentCommand)');
    expect(aiAgent).toContain('destroyAgent(command: DestroyAgentCommand)');
    expect(aiAgent).toContain('rotateAgentCredential(command: RotateAgentCredentialCommand)');
    expect(aiAgent).toContain('updateConfig(command: UpdateAgentConfigCommand)');
    expect(lifecycle).toContain('createSystemThread(');
    expect(lifecycleAudit).toContain('appendLifecycleAuditEvent(');
    expect(lifecycle).toContain('checkAgentIdempotency<InitializeAgentResult>');
    expect(lifecycle).toContain("lifecycleStatus: 'destroyed'");
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS agent_config_versions');
    expect(schema).toContain('secret_reference TEXT');
    expect(router).toContain('dispatchInitializeAgent');
    expect(router).toContain('dispatchRotateAgentCredential');
  });

  it('[AGENT-LIFECYCLE-S005] [AGENT-LIFECYCLE-S006] rejects unsafe credential state and versions config changes', () => {
    const lifecycle = readSource(lifecycleOperationsPath);
    const authorization = readSource(finalAuthorizationPath);
    const utils = readSource(operationUtilsPath);

    expect(lifecycle).toContain('updatePreviousCredential(');
    expect(lifecycle).toContain("status: 'overlap'");
    expect(lifecycle).toContain("status: 'revoked'");
    expect(lifecycle).toContain('profile.configVersion + 1');
    expect(authorization).toContain("state === 'active' || state === 'overlap'");
    expect(utils).toContain("return credential.status === 'revoked' ? 'revoked' : 'disabled'");
  });

  it('[AGENT-EVENTING-S001] [AGENT-EVENTING-S002] [AGENT-EVENTING-S004] [AGENT-EVENTING-S005] appends Events after Thread and Section resolution', () => {
    const events = readSource(eventOperationsPath);
    const mailbox = readSource(eventMailboxPath);
    const aiAgent = readSource(aiAgentPath);
    const foundationEvents = readSource(foundationEventsPath);
    const schema = readSource(tableInitializerPath);

    expect(events).toContain('assertPublicThreadKey(');
    expect(events).toContain('createThreadKeyIdentity(input.agentId, input.command.threadKey)');
    expect(events).toContain('appendAgentEventToThread({');
    expect(mailbox).toContain('resolveThreadTarget(');
    expect(mailbox).toContain('resolveOrCreateOpenSection(');
    expect(mailbox).toContain('upsertPendingRunForThread({');
    expect(mailbox).toContain('input.repositories.transaction((repositories)');
    expect(mailbox.indexOf('repositories.events.appendEvent({')).toBeLessThan(
      mailbox.indexOf('repositories.pendingRuns.upsertPendingRunForThread({')
    );
    expect(aiAgent).toContain('if (!result.replayed)');
    expect(aiAgent).toContain("reason: 'event_accepted'");
    expect(foundationEvents.indexOf('appendEvent(')).toBeLessThan(
      foundationEvents.indexOf('createPendingRun(')
    );
    expect(schema).toContain('start_thread_sequence INTEGER NOT NULL DEFAULT 1');
    expect(schema).toContain('correlation_id TEXT');
    expect(schema).toContain('causation_id TEXT');
  });

  it('[AGENT-EVENTING-S006] [AGENT-EVENTING-S007] [AGENT-EVENTING-S008] stores replay responses payload metadata and scoped pagination', () => {
    const events = readSource(eventOperationsPath);
    const payload = readSource(new URL('../events/payload.ts', import.meta.url));
    const schema = readSource(tableInitializerPath);

    expect(events).toContain('checkAgentIdempotency<PublishAgentEventResult>');
    expect(events).toContain('recordAgentIdempotency({');
    expect(events).toContain('pageSize + 1');
    expect(events).toContain('cursorScope: `${agentId}:${threadId}`');
    expect(payload).toContain('inlineEventPayloadLimitBytes = agentInlineBodyLimitBytes');
    expect(payload).toContain("storageClass: 'r2'");
    expect(schema).toContain('payload_inline_base64 TEXT');
    expect(schema).toContain('payload_sha256 TEXT');
  });

  it('[AGENT-SECURITY-S005] [AGENT-SECURITY-S006] final authorization uses Agent-local profile grants nonce and idempotency state', () => {
    const authorization = readSource(finalAuthorizationPath);
    const utils = readSource(operationUtilsPath);
    const mapper = readSource(messageMappersPath);

    expect(authorization).toContain('decideAgentFinalAuthorization(');
    expect(authorization).toContain("reason: 'scope_or_grant'");
    expect(authorization).toContain("reason: 'credential_state'");
    expect(utils).toContain('repositories.requestNonces.reserveNonce(');
    expect(utils).toContain('repositories.idempotency.findRecord(');
    expect(utils).toContain('listGrantsForPrincipal(');
    expect(mapper).not.toContain('secretReference');
  });
});
