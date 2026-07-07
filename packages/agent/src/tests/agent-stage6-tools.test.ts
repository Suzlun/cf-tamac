import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { agentFoundationTables, agentStorageRepositoryNames } from '../storage';
import {
  cancelToolInvocationInStore,
  createToolInvocationInStore,
  executeToolInvocationWithProvider,
  reconcileToolInvocationInStore,
  recordToolResultInStore,
} from '../tools/operations';
import { IntegrationToolProviderCallError } from '../tools/provider-client';

import type { AgentCoreRequestContext } from '../domain';
import type {
  AgentEventRow,
  AgentGrantRow,
  AgentIdempotencyRecordRow,
  AgentProviderOperationRow,
  AgentRunInputSnapshotRow,
  AgentRunRow,
  AgentStorageRepositories,
  AgentToolDefinitionRow,
  AgentToolInvocationRow,
  AgentToolOutgoingRequestRow,
  AgentToolResultEventRow,
} from '../storage';
import type { IntegrationToolProviderClient } from '../tools/provider-client';

const catalogPath = new URL('../tools/catalog.ts', import.meta.url);
const commandsPath = new URL('../tools/commands.ts', import.meta.url);
const eventRunToolHandlersPath = new URL(
  '../durable-object/event-run-tool-handlers.ts',
  import.meta.url
);
const toolStatusPath = new URL('../tools/tool-status.ts', import.meta.url);
const guardsPath = new URL('../tools/operation-guards.ts', import.meta.url);
const operationProviderPath = new URL('../tools/operation-provider.ts', import.meta.url);
const providerOperationsPath = new URL('../tools/provider-operations.ts', import.meta.url);
const providerClientPath = new URL('../rpc/tool-provider-client.ts', import.meta.url);
const repositoryPath = new URL('../storage/repositories/tools-repository.ts', import.meta.url);
const resultsPath = new URL('../tools/results.ts', import.meta.url);
const dispatchPath = new URL('../rpc/dispatch/tools.ts', import.meta.url);
const servicePath = new URL('../rpc/services/tools.ts', import.meta.url);
const tableInitializerPath = new URL('../storage/initializers/tool.ts', import.meta.url);

describe('Agent Stage 6 Tool implementation', () => {
  it('[AGENT-TOOL-S001] ListTools returns an Agent-local versioned catalog', () => {
    const catalog = readSource(catalogPath);
    const dispatch = readSource(dispatchPath);
    const service = readSource(servicePath);

    expect(agentFoundationTables).toEqual(
      expect.arrayContaining(['agent_tool_definitions', 'agent_tool_catalog_snapshots'])
    );
    expect(agentStorageRepositoryNames).toEqual(expect.arrayContaining(['AgentToolsRepository']));
    expect(catalog).toContain('builtInToolDefinitions');
    expect(catalog).toContain('getNextToolSetVersion()');
    expect(dispatch).toContain('listTools({');
    expect(service).toContain('dispatchListTools(env, request)');
  });

  it('[AGENT-TOOL-S002] Disabled Integration Tools are excluded from new invocations', () => {
    const commands = readSource(commandsPath);
    const toolStatus = readSource(toolStatusPath);
    const guards = readSource(guardsPath);
    const repository = readSource(repositoryPath);

    expect(toolStatus).toContain("'disabled'");
    expect(repository).toContain(
      "input.includeUnavailable === true ? undefined : eq(table.status, 'active')"
    );
    expect(commands).toContain('assertInvokableDefinition(definition, input.command.toolId)');
    expect(guards).toContain("definition.status !== 'active'");
  });

  it('[AGENT-TOOL-S003] Approval-required ToolInvocation waits before Provider execution', () => {
    const commands = readSource(commandsPath);
    const dispatch = readSource(dispatchPath);
    const providerOperations = readSource(providerOperationsPath);

    expect(commands).toContain(
      "status: definition.approvalRequired ? 'pending_approval' : 'approved'"
    );
    expect(providerOperations).toContain('executeToolInvocationWithProvider');
    expect(providerOperations).toContain("assertTransition(invocation.status, 'running')");
    expect(dispatch).toContain('getToolInvocation({');
  });

  it('[AGENT-TOOL-S004] Approval RPCs capture actor, rationale, audit, and state transition', () => {
    const commands = readSource(commandsPath);
    const service = readSource(servicePath);

    expect(service).toContain('approveInvocation(request)');
    expect(service).toContain('rejectInvocation(request)');
    expect(commands).toContain('tool.approval.decide');
    // 実装の改行や Prettier 整形に依存せず、acting user を優先して actorId に記録する意図だけを検証します。
    expect(commands).toMatch(
      /actorId:\s*input\.command\.context\.principal\.actingUserId\s*\?\?\s*input\.command\.context\.principal\.principalId/u
    );
    expect(commands).toContain('reason: input.command.reason');
    expect(commands).toContain('recordToolAudit(');
  });

  it('[AGENT-TOOL-S005] Provider Tool calls use signed binary Protobuf RPC metadata', () => {
    const operationProvider = readSource(operationProviderPath);
    const providerClient = readSource(providerClientPath);

    expect(providerClient).toContain('IntegrationToolService.method.invokeTool.name');
    expect(providerClient).toContain('toBinary(InvokeToolRequestSchema');
    expect(providerClient).toContain('fromBinary(input.outputSchema');
    expect(providerClient).toContain("'Content-Type': 'application/proto'");
    expect(providerClient).toContain('buildIntegrationToolSignatureMetadata');
    expect(providerClient).toContain('rawBodyDigest');
    expect(providerClient).not.toContain('JSON.stringify');
    expect(operationProvider).toContain('insertOutgoingRequest({');
  });

  it('[AGENT-TOOL-S006] Tool result Events append to the same Thread and wake Run work', () => {
    const eventRunToolHandlers = readSource(eventRunToolHandlersPath);
    const results = readSource(resultsPath);

    expect(results).toContain('appendAgentEventToThreadInRepositories({');
    expect(results).toContain('toolInvocationSucceededEventType');
    expect(results).toContain('toolInvocationFailedEventType');
    expect(results).toContain("source: 'agent.tool'");
    expect(eventRunToolHandlers).toContain(
      'requestWakeAfterToolResult(result, command.context.requestedAtMs)'
    );
  });

  it('[AGENT-TOOL-S010] Tool result resumes waiting Run and rejects stale generations', () => {
    const guards = readSource(guardsPath);
    const results = readSource(resultsPath);

    expect(results).toContain('assertToolResultCanResumeRun(repositories, invocation)');
    expect(results).toContain("fromStatus: 'waiting'");
    expect(results).toContain("toStatus: 'pending'");
    expect(guards).toContain('Tool result catalog generation is stale.');
    expect(guards).toContain('Tool result is stale for the waiting Run.');
    expect(results).toContain('findResultEventByInvocation(invocation.invocationId)');
  });

  it('[AGENT-TOOL-S007] outcome_unknown invocations reconcile through GetOperation without duplicate results', () => {
    const operationProvider = readSource(operationProviderPath);
    const providerOperations = readSource(providerOperationsPath);
    const providerClient = readSource(providerClientPath);
    const results = readSource(resultsPath);

    expect(operationProvider).toContain("status: 'outcome_unknown'");
    expect(providerOperations).toContain('providerClient.getOperation({');
    expect(results).toContain('findResultEventByInvocation(invocation.invocationId)');
    expect(results).toContain('suppressedDuplicate: 0');
    expect(providerClient).toContain('IntegrationToolService.method.getOperation.name');
  });

  it('[AGENT-TOOL-S008] cancellation propagates to Provider CancelOperation when supported', () => {
    const operationProvider = readSource(operationProviderPath);
    const providerOperations = readSource(providerOperationsPath);
    const providerClient = readSource(providerClientPath);
    const tableInitializer = readSource(tableInitializerPath);

    expect(operationProvider).toContain('providerClient.cancelOperation({');
    expect(providerOperations).toContain('markProviderOperationCancellation({');
    expect(providerOperations).toContain("cancelled.response.cancellationStatus === 'cancelled'");
    expect(providerClient).toContain('IntegrationToolService.method.cancelOperation.name');
    expect(tableInitializer).toContain('cancellation_requested_at_ms INTEGER');
  });

  it('[AGENT-TOOL-S007] outcome_unknown invocations persist Provider identity and reconcile once', async () => {
    const harness = new Stage6ToolHarness();
    harness.addProviderTool({
      cancellationSupported: true,
      installationId: 'installation-1',
      toolId: 'provider.search',
    });
    const invocation = harness.addInvocation({
      installationId: 'installation-1',
      status: 'approved',
      toolId: 'provider.search',
    });
    const invokeRecord = createProviderRecord('InvokeTool', 'invoke-digest');
    const providerClient = createProviderClient({
      getOperation: () =>
        Promise.resolve({
          record: createProviderRecord('GetOperation', 'get-digest'),
          response: {
            operation: { operationId: `operation:${invocation.invocationId}`, status: 'succeeded' },
            outputRef: 'r2://tool-output/succeeded',
          },
        }),
      invokeTool: () =>
        Promise.reject(
          new IntegrationToolProviderCallError({
            message: 'provider timeout',
            record: invokeRecord,
          })
        ),
    });

    const executeResult = await executeToolInvocationWithProvider({
      agentId: harness.agentId,
      command: {
        context: createContext({ idempotencyKey: 'execute-key', method: 'ExecuteInvocation' }),
        invocationId: invocation.invocationId,
        providerClient,
      },
      repositories: harness.repositories,
    });

    expect(executeResult.invocation.status).toBe('outcome_unknown');
    expect(executeResult.providerOperation?.operationId).toBe(
      `operation:${invocation.invocationId}`
    );
    expect(harness.outgoingRequests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rawBodyDigest: 'invoke-digest', status: 'failed' }),
      ])
    );

    const reconcileContext = createContext({
      idempotencyKey: 'reconcile-key',
      method: 'ReconcileInvocation',
    });
    const reconcileResult = await reconcileToolInvocationInStore({
      agentId: harness.agentId,
      command: { context: reconcileContext, invocationId: invocation.invocationId, providerClient },
      repositories: harness.repositories,
    });
    const replayedReconcile = await reconcileToolInvocationInStore({
      agentId: harness.agentId,
      command: { context: reconcileContext, invocationId: invocation.invocationId, providerClient },
      repositories: harness.repositories,
    });

    expect(reconcileResult.invocation.status).toBe('succeeded');
    expect(replayedReconcile.replayed).toBe(true);
    expect(harness.events).toHaveLength(1);
    expect(harness.resultEvents).toHaveLength(1);
  });

  it('[AGENT-TOOL-S003] Tool command idempotency rejects reused keys with different digests', async () => {
    const harness = new Stage6ToolHarness();
    const firstContext = createContext({
      bodyDigestHex: 'digest-a',
      idempotencyKey: 'create-key',
      method: 'CreateInvocation',
    });
    const conflictContext = createContext({
      bodyDigestHex: 'digest-b',
      idempotencyKey: 'create-key',
      method: 'CreateInvocation',
    });

    await createToolInvocationInStore({
      agentId: harness.agentId,
      command: {
        context: firstContext,
        runId: 'run-1',
        threadId: harness.threadId,
        toolId: 'agent.thread.emit_event',
      },
      repositories: harness.repositories,
    });

    await expect(
      createToolInvocationInStore({
        agentId: harness.agentId,
        command: {
          context: conflictContext,
          runId: 'run-1',
          threadId: harness.threadId,
          toolId: 'agent.thread.emit_event',
        },
        repositories: harness.repositories,
      })
    ).rejects.toMatchObject({ kind: 'conflict' });
  });

  it('[AGENT-TOOL-S008] terminal ToolInvocations cannot be cancelled again', async () => {
    const harness = new Stage6ToolHarness();
    harness.addProviderTool({
      cancellationSupported: true,
      installationId: 'installation-1',
      toolId: 'provider.search',
    });
    const invocation = harness.addInvocation({
      installationId: 'installation-1',
      status: 'succeeded',
      toolId: 'provider.search',
    });
    harness.addProviderOperation({
      invocationId: invocation.invocationId,
      operationId: 'operation-terminal',
      status: 'succeeded',
    });

    await expect(
      cancelToolInvocationInStore({
        agentId: harness.agentId,
        command: {
          context: createContext({ idempotencyKey: 'cancel-terminal', method: 'CancelInvocation' }),
          invocationId: invocation.invocationId,
          providerClient: createProviderClient({}),
        },
        repositories: harness.repositories,
      })
    ).rejects.toMatchObject({ kind: 'precondition' });
  });

  it('[AGENT-TOOL-S006] Provider result grants must match installation or tool scope', () => {
    const harness = new Stage6ToolHarness();
    harness.addProviderTool({ installationId: 'installation-1', toolId: 'provider.search' });
    const invocation = harness.addInvocation({
      installationId: 'installation-1',
      status: 'running',
      toolId: 'provider.search',
    });
    harness.addProviderOperation({
      invocationId: invocation.invocationId,
      operationId: 'operation-running',
      status: 'running',
    });
    harness.grants.push(
      createGrant({ capability: 'integration.tool.result', scopeRef: 'installation:other' })
    );

    expect(() =>
      recordToolResultInStore({
        agentId: harness.agentId,
        command: {
          context: createContext({
            idempotencyKey: 'result-wrong-scope',
            method: 'PublishToolResult',
            principalId: 'integration-1',
            principalType: 'INTEGRATION_INSTALLATION',
            scopes: ['agent.rpc', 'agent.tool'],
          }),
          invocationId: invocation.invocationId,
          outputRef: 'r2://tool-output/result',
          providerOperationId: 'operation-running',
          status: 'succeeded',
        },
        repositories: harness.repositories,
      })
    ).toThrow(expect.objectContaining({ kind: 'authorization' }));
  });

  it('[AGENT-TOOL-S006] Provider result rejects unscoped grants and accepts matching installation scope', () => {
    const unscopedHarness = new Stage6ToolHarness();
    unscopedHarness.addProviderTool({
      installationId: 'installation-1',
      toolId: 'provider.search',
    });
    const unscopedInvocation = unscopedHarness.addInvocation({
      installationId: 'installation-1',
      status: 'running',
      toolId: 'provider.search',
    });
    unscopedHarness.addProviderOperation({
      invocationId: unscopedInvocation.invocationId,
      operationId: 'operation-unscoped',
      status: 'running',
    });
    unscopedHarness.grants.push(
      createGrant({ capability: 'integration.tool.result', scopeRef: null })
    );

    expect(() =>
      recordToolResultInStore({
        agentId: unscopedHarness.agentId,
        command: {
          context: createContext({
            idempotencyKey: 'result-unscoped',
            method: 'PublishToolResult',
            principalId: 'integration-1',
            principalType: 'INTEGRATION_INSTALLATION',
            scopes: ['agent.rpc', 'agent.tool'],
          }),
          invocationId: unscopedInvocation.invocationId,
          outputRef: 'r2://tool-output/unscoped',
          providerOperationId: 'operation-unscoped',
          status: 'succeeded',
        },
        repositories: unscopedHarness.repositories,
      })
    ).toThrow(expect.objectContaining({ kind: 'authorization' }));

    const scopedHarness = new Stage6ToolHarness();
    scopedHarness.addProviderTool({ installationId: 'installation-1', toolId: 'provider.search' });
    const scopedInvocation = scopedHarness.addInvocation({
      installationId: 'installation-1',
      status: 'running',
      toolId: 'provider.search',
    });
    scopedHarness.addProviderOperation({
      invocationId: scopedInvocation.invocationId,
      operationId: 'operation-scoped',
      status: 'running',
    });
    scopedHarness.grants.push(
      createGrant({
        capability: 'integration.tool.result',
        scopeRef: 'installation:installation-1',
      })
    );

    const result = recordToolResultInStore({
      agentId: scopedHarness.agentId,
      command: {
        context: createContext({
          idempotencyKey: 'result-scoped',
          method: 'PublishToolResult',
          principalId: 'integration-1',
          principalType: 'INTEGRATION_INSTALLATION',
          scopes: ['agent.rpc', 'agent.tool'],
        }),
        invocationId: scopedInvocation.invocationId,
        outputRef: 'r2://tool-output/scoped',
        providerOperationId: 'operation-scoped',
        status: 'succeeded',
      },
      repositories: scopedHarness.repositories,
    });

    expect(result.invocation.status).toBe('succeeded');
    expect(scopedHarness.events).toHaveLength(1);
  });
});

function readSource(url: URL): string {
  return readFileSync(fileURLToPath(url.href), 'utf8');
}

function createContext(input: {
  readonly bodyDigestHex?: string;
  readonly idempotencyKey: string;
  readonly method: string;
  readonly principalId?: string;
  readonly principalType?: AgentCoreRequestContext['principal']['principalType'];
  readonly scopes?: readonly string[];
}): AgentCoreRequestContext {
  return {
    agentId: 'agent-stage6-test',
    bodyDigest: {
      algorithm: 'sha-256',
      byteLength: 16,
      digestHex: input.bodyDigestHex ?? `${input.idempotencyKey}-digest`,
    },
    correlationId: 'correlation-stage6',
    idempotencyKey: input.idempotencyKey,
    method: input.method,
    nonce: `${input.idempotencyKey}-nonce`,
    principal: {
      agentId: 'agent-stage6-test',
      principalId: input.principalId ?? 'internal-service',
      principalType: input.principalType ?? 'INTERNAL_SERVICE',
      scopes: input.scopes ?? ['agent.rpc', 'agent.tool', 'agent.tool.approve'],
    },
    requestedAtMs: 1_700_000_000_000,
    service: 'cftamac.agent.v1.AgentToolService',
  };
}

function createProviderRecord(
  method: 'CancelOperation' | 'GetOperation' | 'InvokeTool',
  rawBodyDigestHex: string
) {
  return {
    bodyByteLength: 128,
    method,
    nonce: `${method}-nonce`,
    rawBodyDigestHex,
    requestUrl: `https://provider.example.test/${method}`,
    signatureDigestHex: `${method}-signature`,
  };
}

function createProviderClient(
  input: Partial<IntegrationToolProviderClient>
): IntegrationToolProviderClient {
  return {
    cancelOperation:
      input.cancelOperation ??
      (() =>
        Promise.resolve({
          record: createProviderRecord('CancelOperation', 'cancel-digest'),
          response: { cancellationStatus: 'cancelled' },
        })),
    getOperation:
      input.getOperation ??
      (() =>
        Promise.resolve({
          record: createProviderRecord('GetOperation', 'get-digest'),
          response: { operation: { operationId: 'operation-default', status: 'running' } },
        })),
    invokeTool:
      input.invokeTool ??
      (() =>
        Promise.resolve({
          record: createProviderRecord('InvokeTool', 'invoke-digest'),
          response: {
            invocationStatus: 'running',
            operation: { operationId: 'operation-default', status: 'running' },
          },
        })),
  };
}

function createGrant(input: {
  readonly capability: string;
  readonly scopeRef: string | null;
}): AgentGrantRow {
  return {
    capability: input.capability,
    createdAtMs: 1,
    grantId: crypto.randomUUID(),
    principalId: 'integration-1',
    scopeRef: input.scopeRef,
    status: 'active',
    updatedAtMs: 1,
  };
}

class Stage6ToolHarness {
  readonly agentId = 'agent-stage6-test';
  readonly threadId = 'thread-stage6';
  readonly definitions = new Map<string, AgentToolDefinitionRow>();
  readonly events: AgentEventRow[] = [];
  readonly grants: AgentGrantRow[] = [];
  readonly invocations = new Map<string, AgentToolInvocationRow>();
  readonly outgoingRequests: AgentToolOutgoingRequestRow[] = [];
  readonly providerOperations = new Map<string, AgentProviderOperationRow>();
  readonly resultEvents: AgentToolResultEventRow[] = [];
  readonly repositories: AgentStorageRepositories;
  private run: AgentRunRow = {
    createdAtMs: 1,
    lastServedAtMs: null,
    pendingSinceMs: 1,
    priority: 0,
    runId: 'run-stage6',
    status: 'waiting',
    threadId: this.threadId,
    triggerEventId: 'event-stage6-trigger',
    updatedAtMs: 1,
  };
  private readonly snapshot: AgentRunInputSnapshotRow = {
    configVersion: 1,
    createdAtMs: 1,
    decisionSchemaVersion: 'v1',
    integrationVersion: 1,
    latestReadyCompactionRef: null,
    modelId: '@cf/meta/llama-3.1-8b-instruct',
    modelPolicySource: 'agent_default',
    modelPolicyVersion: 1,
    modelProvider: 'workers-ai',
    requestedModelPolicyRef: null,
    resolvedModelPolicyDigest: 'd'.repeat(64),
    resolvedModelPolicyRef: 'workers-ai-default',
    runId: 'run-stage6',
    snapshotRef: 'snapshot://run-stage6',
    threadId: this.threadId,
    threadMemoryRef: null,
    threadMemoryVersion: 0,
    toolSetVersion: 1,
    triggerEventEndSequence: 1,
    triggerEventId: 'event-stage6-trigger',
    triggerEventStartSequence: 1,
    uncompactedUpperSequence: 1,
  };
  private readonly idempotencyRecords = new Map<string, AgentIdempotencyRecordRow>();
  private readonly nonces = new Set<string>();
  private section = createSectionRow(this.threadId, 'section-stage6');
  private thread = createThreadRow(this.threadId, 'stage6-thread-key', 'stage6-thread-key');

  constructor() {
    let repositories = undefined as unknown as AgentStorageRepositories;
    repositories = this.createRepositories(() => repositories);
    this.repositories = repositories;
  }

  addProviderTool(input: {
    readonly cancellationSupported?: boolean;
    readonly installationId: string;
    readonly toolId: string;
  }): AgentToolDefinitionRow {
    const row: AgentToolDefinitionRow = {
      agentId: this.agentId,
      approvalRequired: 0,
      cancellationSupported: input.cancellationSupported === true ? 1 : 0,
      createdAtMs: 1,
      description: 'Provider test tool',
      displayName: input.toolId,
      inputSchemaRef: null,
      installationId: input.installationId,
      outputSchemaRef: null,
      providerTargetRef: 'https://provider.example.test',
      status: 'active',
      toolId: input.toolId,
      toolSetVersion: 1,
      updatedAtMs: 1,
      version: '1.0.0',
    };
    this.definitions.set(row.toolId, row);
    return row;
  }

  addInvocation(input: {
    readonly installationId?: string;
    readonly status: string;
    readonly toolId: string;
  }): AgentToolInvocationRow {
    const row = createInvocationRow({
      agentId: this.agentId,
      idempotencyKey: `invocation-${String(this.invocations.size)}`,
      installationId: input.installationId ?? null,
      invocationId: `invocation-${String(this.invocations.size)}`,
      status: input.status,
      threadId: this.threadId,
      toolId: input.toolId,
    });
    this.invocations.set(row.invocationId, row);
    return row;
  }

  addProviderOperation(input: {
    readonly invocationId: string;
    readonly operationId: string;
    readonly status: string;
  }): AgentProviderOperationRow {
    const invocation = this.invocations.get(input.invocationId);
    if (invocation === undefined) throw new Error('Missing invocation in test harness.');
    const row = createProviderOperationRow({
      agentId: this.agentId,
      installationId: invocation.installationId ?? '',
      invocationId: input.invocationId,
      operationId: input.operationId,
      status: input.status,
      toolId: invocation.toolId,
    });
    this.providerOperations.set(row.operationId, row);
    this.invocations.set(invocation.invocationId, {
      ...invocation,
      providerOperationId: row.operationId,
    });
    return row;
  }

  private createRepositories(
    getRepositories: () => AgentStorageRepositories
  ): AgentStorageRepositories {
    return {
      credentials: { findCredential: () => undefined },
      events: {
        appendEvent: (input: Parameters<AgentStorageRepositories['events']['appendEvent']>[0]) => {
          this.events.push({
            agentSequence: input.sequences.agentSequence,
            causationId: input.causationId ?? null,
            correlationId: input.correlationId ?? null,
            createdAtMs: input.createdAtMs,
            eventId: input.eventId,
            eventType: input.eventType,
            idempotencyKey: input.idempotencyKey,
            normalizedThreadKey: input.normalizedThreadKey,
            occurredAtMs: input.occurredAtMs,
            payloadByteSize: input.payloadByteSize ?? null,
            payloadContentType: input.payloadContentType ?? null,
            payloadInlineBase64: input.payloadInlineBase64 ?? null,
            payloadRef: input.payloadRef ?? null,
            payloadSha256: input.payloadSha256 ?? null,
            payloadStorageClass: input.payloadStorageClass ?? null,
            requestDigest: input.requestDigest ?? null,
            runId: input.runId ?? null,
            sectionId: input.sectionId,
            source: input.source,
            threadId: input.threadId,
            threadKey: input.threadKey,
            threadSequence: input.sequences.threadSequence,
          });
        },
        findByEventId: (eventId: string) => this.events.find((event) => event.eventId === eventId),
        getNextSequences: (threadId: string) => ({
          agentSequence: this.events.length + 1,
          threadSequence: this.events.filter((event) => event.threadId === threadId).length + 1,
        }),
      },
      grants: {
        listGrantsForPrincipal: (principalId: string) =>
          this.grants.filter((grant) => grant.principalId === principalId),
      },
      idempotency: {
        findRecord: (principalId: string, idempotencyKey: string) =>
          this.idempotencyRecords.get(`${principalId}:${idempotencyKey}`),
        insertRecord: (
          input: Parameters<AgentStorageRepositories['idempotency']['insertRecord']>[0]
        ) => {
          this.idempotencyRecords.set(`${input.principalId}:${input.idempotencyKey}`, {
            ...input,
            responseRef: input.responseRef ?? null,
          });
        },
        updateRecordResponse: (
          input: Parameters<AgentStorageRepositories['idempotency']['updateRecordResponse']>[0]
        ) => {
          const key = `${input.principalId}:${input.idempotencyKey}`;
          const existing = this.idempotencyRecords.get(key);
          if (existing !== undefined)
            this.idempotencyRecords.set(key, {
              ...existing,
              responseRef: input.responseRef,
              status: input.status,
            });
        },
      },
      pendingRuns: {
        findPendingRunForThread: (threadId: string) =>
          this.run.threadId === threadId && this.run.status === 'pending' ? this.run : undefined,
        findRunById: (runId: string) => (this.run.runId === runId ? this.run : undefined),
        findRunInputSnapshot: (runId: string) =>
          this.snapshot.runId === runId ? this.snapshot : undefined,
        transitionRunStatus: (input: {
          readonly fromStatus?: string;
          readonly nowMs: number;
          readonly runId: string;
          readonly toStatus: string;
        }) => {
          if (this.run.runId !== input.runId) return;
          if (input.fromStatus !== undefined && this.run.status !== input.fromStatus) return;
          this.run = { ...this.run, status: input.toStatus, updatedAtMs: input.nowMs };
        },
        upsertPendingRunForThread: (
          input: Parameters<AgentStorageRepositories['pendingRuns']['upsertPendingRunForThread']>[0]
        ) => {
          this.run = {
            ...this.run,
            lastServedAtMs: input.lastServedAtMs ?? this.run.lastServedAtMs,
            priority: input.priority,
            runId: input.runId,
            status: 'pending',
            threadId: input.threadId,
            triggerEventId: input.triggerEventId,
            updatedAtMs: input.nowMs,
          };
          return this.run;
        },
      },
      profile: { getProfile: () => ({ lifecycleStatus: 'active' }) },
      requestNonces: {
        reserveNonce: (
          input: Parameters<AgentStorageRepositories['requestNonces']['reserveNonce']>[0]
        ) => {
          const key = `${input.principalId}:${input.nonce}`;
          if (this.nonces.has(key)) return { status: 'replay' };
          this.nonces.add(key);
          return { status: 'reserved' };
        },
      },
      sections: {
        findBySectionId: (_threadId: string, sectionId: string) =>
          sectionId === this.section.sectionId ? this.section : undefined,
        findOpenSection: () => this.section,
        incrementEventCount: () => {
          this.section = { ...this.section, eventCount: this.section.eventCount + 1 };
        },
        insertSection: (
          input: Parameters<AgentStorageRepositories['sections']['insertSection']>[0]
        ) => {
          this.section = createSectionRow(input.threadId, input.sectionId);
        },
      },
      threads: {
        findByNormalizedThreadKey: (normalizedThreadKey: string) =>
          this.thread.normalizedThreadKey === normalizedThreadKey ? this.thread : undefined,
        findByThreadId: (threadId: string) =>
          this.thread.threadId === threadId ? this.thread : undefined,
        insertThread: (
          input: Parameters<AgentStorageRepositories['threads']['insertThread']>[0]
        ) => {
          this.thread = createThreadRow(input.threadId, input.threadKey, input.normalizedThreadKey);
        },
        updateCurrentSection: (
          input: Parameters<AgentStorageRepositories['threads']['updateCurrentSection']>[0]
        ) => {
          this.thread = {
            ...this.thread,
            currentSectionId: input.currentSectionId,
            updatedAtMs: input.nowMs,
          };
        },
      },
      tools: this.createToolsRepository(),
      transaction: <T>(operation: (repositories: AgentStorageRepositories) => T): T =>
        operation(getRepositories()),
    } as unknown as AgentStorageRepositories;
  }

  private createToolsRepository(): AgentStorageRepositories['tools'] {
    return {
      approvalTableName: 'agent_tool_approvals',
      catalogSnapshotTableName: 'agent_tool_catalog_snapshots',
      definitionTableName: 'agent_tool_definitions',
      invocationTableName: 'agent_tool_invocations',
      outgoingRequestTableName: 'agent_tool_outgoing_requests',
      providerOperationTableName: 'agent_provider_operations',
      resultEventTableName: 'agent_tool_result_events',
      attachApproval: (input) =>
        this.updateInvocation(input.invocationId, {
          approvalId: input.approvalId,
          status: input.status,
          updatedAtMs: input.updatedAtMs,
        }),
      attachProviderOperation: (input) =>
        this.updateInvocation(input.invocationId, {
          providerOperationId: input.operationId,
          status: input.status,
          updatedAtMs: input.updatedAtMs,
        }),
      createCatalogSnapshot: (input) => ({ agentId: this.agentId, ...input }),
      findApprovalForInvocation: () => undefined,
      findDefinition: (toolId) => this.definitions.get(toolId),
      findInvocation: (invocationId) => this.invocations.get(invocationId),
      findInvocationByIdempotencyKey: (idempotencyKey) =>
        [...this.invocations.values()].find(
          (invocation) => invocation.idempotencyKey === idempotencyKey
        ),
      findProviderOperation: (operationId) => this.providerOperations.get(operationId),
      findProviderOperationByInvocation: (invocationId) =>
        [...this.providerOperations.values()].find(
          (operation) => operation.invocationId === invocationId
        ),
      findResultEventByInvocation: (invocationId) =>
        this.resultEvents.find((event) => event.invocationId === invocationId),
      getLatestCatalogSnapshot: () => undefined,
      getNextToolSetVersion: () => 1,
      incrementInvocationAttempt: (input) => {
        const current = this.requireInvocation(input.invocationId);
        return this.updateInvocation(input.invocationId, {
          attemptCount: current.attemptCount + 1,
          updatedAtMs: input.updatedAtMs,
        });
      },
      insertApproval: () => {
        throw new Error('Approval is not used by Stage6ToolHarness tests.');
      },
      insertInvocation: (input) => {
        const row = createInvocationRow({
          agentId: this.agentId,
          idempotencyKey: input.idempotencyKey,
          installationId: input.installationId ?? null,
          invocationId: input.invocationId,
          status: input.status,
          threadId: input.threadId,
          toolId: input.toolId,
        });
        this.invocations.set(row.invocationId, row);
        return row;
      },
      insertOutgoingRequest: (input) => {
        const row = { agentId: this.agentId, ...input };
        this.outgoingRequests.push(row);
        return row;
      },
      insertResultEvent: (input) => {
        const existing = this.resultEvents.find(
          (event) => event.invocationId === input.invocationId
        );
        if (existing !== undefined) return existing;
        const row = { agentId: this.agentId, ...input };
        this.resultEvents.push(row);
        return row;
      },
      listDefinitions: (input) =>
        [...this.definitions.values()].filter(
          (definition) =>
            (input.includeUnavailable === true || definition.status === 'active') &&
            (input.installationId === undefined ||
              definition.installationId === input.installationId)
        ),
      listInvocations: () => [...this.invocations.values()],
      markInvocationResult: (input) =>
        this.updateInvocation(input.invocationId, {
          failureReason: input.failureReason ?? null,
          outputRef: input.outputRef ?? null,
          resultEventId: input.resultEventId ?? null,
          status: input.status,
          updatedAtMs: input.updatedAtMs,
        }),
      markProviderOperationCancellation: (input) =>
        this.updateProviderOperation(input.operationId, {
          cancellationRequestedAtMs: input.requestedAtMs,
          status: input.status,
          updatedAtMs: input.requestedAtMs,
        }),
      transitionInvocationStatus: (input) =>
        this.updateInvocation(input.invocationId, {
          failureReason: input.failureReason ?? null,
          providerOperationId:
            input.providerOperationId ??
            this.requireInvocation(input.invocationId).providerOperationId,
          status: input.status,
          updatedAtMs: input.updatedAtMs,
        }),
      updateProviderOperationStatus: (input) =>
        this.updateProviderOperation(input.operationId, {
          providerOperationRef: input.providerOperationRef ?? null,
          status: input.status,
          updatedAtMs: input.updatedAtMs,
        }),
      upsertDefinition: () => {
        throw new Error('Definition upsert is not used by Stage6ToolHarness tests.');
      },
      upsertProviderOperation: (input) => {
        const row = createProviderOperationRow({
          agentId: this.agentId,
          attemptCount: input.attemptCount,
          cancellationSupported: input.cancellationSupported === true ? 1 : 0,
          idempotencyKey: input.idempotencyKey,
          installationId: input.installationId,
          invocationId: input.invocationId ?? null,
          method: input.method,
          nonce: input.nonce ?? null,
          operationId: input.operationId,
          providerOperationRef: input.providerOperationRef ?? null,
          providerTargetRef: input.providerTargetRef ?? null,
          requestDigest: input.requestDigest ?? null,
          status: input.status,
          toolId: input.toolId ?? null,
        });
        this.providerOperations.set(row.operationId, row);
        return row;
      },
    };
  }

  private requireInvocation(invocationId: string): AgentToolInvocationRow {
    const row = this.invocations.get(invocationId);
    if (row === undefined) throw new Error(`Missing invocation: ${invocationId}`);
    return row;
  }

  private updateInvocation(
    invocationId: string,
    patch: Partial<AgentToolInvocationRow>
  ): AgentToolInvocationRow {
    const row = { ...this.requireInvocation(invocationId), ...patch };
    this.invocations.set(invocationId, row);
    return row;
  }

  private updateProviderOperation(
    operationId: string,
    patch: Partial<AgentProviderOperationRow>
  ): AgentProviderOperationRow {
    const existing = this.providerOperations.get(operationId);
    if (existing === undefined) throw new Error(`Missing Provider operation: ${operationId}`);
    const row = { ...existing, ...patch };
    this.providerOperations.set(operationId, row);
    return row;
  }
}

function createInvocationRow(input: {
  readonly agentId: string;
  readonly idempotencyKey: string;
  readonly installationId: string | null;
  readonly invocationId: string;
  readonly status: string;
  readonly threadId: string;
  readonly toolId: string;
}): AgentToolInvocationRow {
  return {
    agentId: input.agentId,
    approvalId: null,
    attemptCount: 0,
    auditEventId: null,
    causationEventId: null,
    createdAtMs: 1,
    failureReason: null,
    idempotencyKey: input.idempotencyKey,
    inputRef: null,
    installationId: input.installationId,
    invocationId: input.invocationId,
    outputRef: null,
    providerOperationId: null,
    resultEventId: null,
    runId: 'run-stage6',
    status: input.status,
    threadId: input.threadId,
    toolId: input.toolId,
    toolSetVersion: 1,
    updatedAtMs: 1,
  };
}

function createProviderOperationRow(input: {
  readonly agentId: string;
  readonly attemptCount?: number;
  readonly cancellationSupported?: number;
  readonly idempotencyKey?: string;
  readonly installationId: string;
  readonly invocationId: string | null;
  readonly method?: string;
  readonly nonce?: string | null;
  readonly operationId: string;
  readonly providerOperationRef?: string | null;
  readonly providerTargetRef?: string | null;
  readonly requestDigest?: string | null;
  readonly status: string;
  readonly toolId: string | null;
}): AgentProviderOperationRow {
  return {
    agentId: input.agentId,
    attemptCount: input.attemptCount ?? 1,
    cancellationRequestedAtMs: null,
    cancellationSupported: input.cancellationSupported ?? 0,
    createdAtMs: 1,
    idempotencyKey: input.idempotencyKey ?? 'provider-operation-key',
    installationId: input.installationId,
    invocationId: input.invocationId,
    method: input.method ?? 'InvokeTool',
    nonce: input.nonce ?? null,
    operationId: input.operationId,
    providerOperationRef: input.providerOperationRef ?? null,
    providerTargetRef: input.providerTargetRef ?? null,
    requestDigest: input.requestDigest ?? null,
    status: input.status,
    timeoutAtMs: null,
    toolId: input.toolId,
    updatedAtMs: 1,
  };
}

function createThreadRow(threadId: string, threadKey: string, normalizedThreadKey: string) {
  return {
    createdAtMs: 1,
    currentSectionId: null as string | null,
    lastServedAtMs: null,
    normalizedThreadKey,
    priority: 0,
    status: 'active',
    threadId,
    threadKey,
    updatedAtMs: 1,
  };
}

function createSectionRow(threadId: string, sectionId: string) {
  return {
    createdAtMs: 1,
    endThreadSequence: null,
    eventCount: 0,
    frozenAtMs: null,
    openedAtMs: 1,
    sectionId,
    sequence: 1,
    startThreadSequence: 1,
    status: 'active',
    threadId,
  };
}
