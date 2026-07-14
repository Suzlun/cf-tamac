import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { authorizeAgentOperation } from '../domain/agent-operation-utils';

import type { AgentCoreRequestContext } from '../domain';
import type { AgentStorageRepositories } from '../storage';

const aiAgentPath = new URL('../AIAgent.ts', import.meta.url);
const blobPayloadWriterPath = new URL('../durable-object/blob-payload-writer.ts', import.meta.url);
const eventRunToolHandlersPath = new URL(
  '../durable-object/event-run-tool-handlers.ts',
  import.meta.url
);
const foundationEventsPath = new URL('../AIAgent.foundation-events.ts', import.meta.url);
const tableInitializerPath = new URL('../storage/initializers/agent-storage.ts', import.meta.url);
const lifecycleAuditPath = new URL('../domain/lifecycle-audit.ts', import.meta.url);
const lifecycleOperationsPath = new URL('../domain/lifecycle-operations.ts', import.meta.url);
const eventPublishOperationsPath = new URL('../events/operations-publish.ts', import.meta.url);
const eventQueryOperationsPath = new URL('../events/operations-query.ts', import.meta.url);
const eventMailboxPath = new URL('../events/mailbox.ts', import.meta.url);
const finalAuthorizationPath = new URL('../domain/final-authorization.ts', import.meta.url);
const operationUtilsPath = new URL('../domain/agent-operation-utils.ts', import.meta.url);
const lifecycleDispatchPath = new URL('../rpc/dispatch/lifecycle.ts', import.meta.url);
const messageMappersPath = new URL('../rpc/mappers/core.ts', import.meta.url);

function readSource(path: URL): string {
  return readFileSync(fileURLToPath(path.href), 'utf8');
}

describe('Agent Stage 2 core implementation', () => {
  it('[AGENT-LIFECYCLE-S001] [AGENT-LIFECYCLE-S002] [AGENT-LIFECYCLE-S003] [AGENT-LIFECYCLE-S004] persists lifecycle config credential and audit seams', () => {
    const aiAgent = readSource(aiAgentPath);
    const lifecycleAudit = readSource(lifecycleAuditPath);
    const lifecycle = readSource(lifecycleOperationsPath);
    const schema = readSource(tableInitializerPath);
    const lifecycleDispatch = readSource(lifecycleDispatchPath);

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
    expect(lifecycleDispatch).toContain('dispatchInitializeAgent');
    expect(lifecycleDispatch).toContain('dispatchRotateAgentCredential');
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

  it('[AGENT-MODEL-POLICY-S005] [AGENT-LIFECYCLE-S008] InitializeAgent stores default model policy ref and digest', () => {
    const lifecycle = readSource(lifecycleOperationsPath);
    const modelPolicy = readSource(
      new URL('../domain/model-policy-operations.ts', import.meta.url)
    );
    const mapper = readSource(messageMappersPath);

    expect(lifecycle).toContain('seedInitialAgentModelPolicy({');
    expect(lifecycle).toContain('createInitialConfigWithPolicyRef(');
    expect(lifecycle).toContain('requireActiveAgentModelPolicy({');
    expect(lifecycle).toContain('defaultModelPolicy');
    expect(modelPolicy).toContain('policyRef: defaultPolicyRef');
    expect(modelPolicy).toContain('policyDigest');
    expect(mapper).toContain('defaultModelPolicy');
    expect(`${lifecycle}\n${modelPolicy}\n${mapper}`).not.toMatch(
      /secretValue|providerToken|rawPrompt|rawCompletion/
    );
  });

  it('[AGENT-LIFECYCLE-S009] UpdateConfig accepts only active model policy refs', () => {
    const lifecycle = readSource(lifecycleOperationsPath);

    expect(lifecycle).toContain('mergeConfigWithLatest(');
    expect(lifecycle).toContain(
      'mergeConfigWithLatest(input.agentId, input.repositories, input.command.config)'
    );
    expect(lifecycle).toContain(
      'modelPolicyRef: config.modelPolicyRef ?? latest?.modelPolicyRef ?? undefined'
    );
    expect(lifecycle).toContain('requireActiveAgentModelPolicy({');
  });

  it('[AGENT-EVENTING-S001] [AGENT-EVENTING-S002] [AGENT-EVENTING-S004] [AGENT-EVENTING-S005] appends Events after Thread and Section resolution', () => {
    const events = readSource(eventPublishOperationsPath);
    const mailbox = readSource(eventMailboxPath);
    const eventRunToolHandlers = readSource(eventRunToolHandlersPath);
    const blobPayloadWriter = readSource(blobPayloadWriterPath);
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
    expect(eventRunToolHandlers).toContain('if (!result.replayed)');
    expect(eventRunToolHandlers).toContain(
      'blobWriter: createAgentBlobPayloadWriter(context.env.AGENT_BLOBS)'
    );
    expect(blobPayloadWriter).toContain('input.bucket.put(');
    expect(blobPayloadWriter).toContain('customMetadata: { sha256: input.blob.sha256 }');
    expect(blobPayloadWriter).toContain('httpMetadata: { contentType: input.blob.contentType }');
    expect(eventRunToolHandlers).toContain("reason: 'event_accepted'");
    expect(foundationEvents.indexOf('appendEvent(')).toBeLessThan(
      foundationEvents.indexOf('createPendingRun(')
    );
    expect(schema).toContain('start_thread_sequence INTEGER NOT NULL DEFAULT 1');
    expect(schema).toContain('correlation_id TEXT');
    expect(schema).toContain('causation_id TEXT');
  });

  it('[AGENT-EVENTING-S006] [AGENT-EVENTING-S007] [AGENT-EVENTING-S008] stores replay responses payload metadata and scoped pagination', () => {
    const eventPublishOperations = readSource(eventPublishOperationsPath);
    const eventQueryOperations = readSource(eventQueryOperationsPath);
    const payload = readSource(new URL('../events/payload.ts', import.meta.url));
    const schema = readSource(tableInitializerPath);

    expect(eventPublishOperations).toContain('checkAgentIdempotency<PublishAgentEventResult>');
    expect(eventPublishOperations).toContain('input.repositories.transaction((repositories) => {');
    expect(eventPublishOperations).toContain('reserveAgentIdempotencyRecord({');
    expect(eventPublishOperations).toContain('completeAgentIdempotencyRecord({');
    expect(eventPublishOperations).toContain('failAgentIdempotencyRecord({');
    expect(eventPublishOperations.indexOf('reserveAgentIdempotencyRecord({')).toBeLessThan(
      eventPublishOperations.indexOf('await appendEvent(input)')
    );
    expect(eventQueryOperations).toContain('pageSize + 1');
    expect(eventQueryOperations).toContain('cursorScope: `${agentId}:${threadId}`');
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

  it('[AGENT-INTEGRATION-S009] Integration ingress final authorization treats trust key ID separately from Agent credentials', () => {
    const repositories = {
      credentials: { findCredential: () => undefined },
      grants: {
        listGrantsForPrincipal: () => [
          {
            capability: 'agent.event',
            createdAtMs: 1,
            grantId: 'grant-integration-event',
            principalId: 'inst-1',
            scopeRef: 'installation:inst-1',
            status: 'active',
            updatedAtMs: 1,
          },
        ],
      },
      profile: {
        getProfile: () => ({
          configVersion: 1,
          credentialGeneration: 1,
          lifecycleStatus: 'active',
        }),
      },
    } as unknown as AgentStorageRepositories;
    const context = {
      agentId: 'agent-alpha',
      bodyDigest: { algorithm: 'sha-256', byteLength: 32, digestHex: 'a'.repeat(64) },
      method: 'PublishEvent',
      principal: {
        agentId: 'agent-alpha',
        installationId: 'inst-1',
        keyId: 'provider-trust-key-1',
        principalId: 'inst-1',
        principalType: 'INTEGRATION_INSTALLATION',
        scopes: [],
      },
      requestedAtMs: 2,
      service: 'cftamac.agent.v1.IntegrationIngressService',
    } satisfies AgentCoreRequestContext;

    expect(() =>
      authorizeAgentOperation({
        action: 'integration.ingress.event',
        capability: {
          capabilityKind: 'integration',
          installationId: 'inst-1',
          ownerAgentId: 'agent-alpha',
        },
        context,
        method: 'PublishEvent',
        repositories,
        requiredGrants: ['agent.event'],
        requiredPrincipalTypes: ['INTEGRATION_INSTALLATION'],
        requiredScopes: ['agent.rpc', 'agent.integration'],
        service: 'cftamac.agent.v1.IntegrationIngressService',
      })
    ).not.toThrow();
  });
});
