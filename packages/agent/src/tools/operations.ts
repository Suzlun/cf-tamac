import {
  assertAgentContext,
  authorizeAgentOperation,
  checkAgentIdempotency,
  recordAgentIdempotency,
  reserveAgentNonce,
} from '../domain/agent-operation-utils';
import { createAgentDomainError } from '../domain/errors';
import { appendAgentEventToThreadInRepositories } from '../events/mailbox';

import { assembleToolCatalog, mapToolDefinitionRow } from './catalog';
import { toolInvocationFailedEventType, toolInvocationSucceededEventType } from './foundation';
import {
  assertInvokableDefinition,
  assertProviderOperationBelongsToInvocation,
  assertProviderResultIdentity,
  assertToolResultCanResumeRun,
  assertTransition,
  beginToolMutationCommand,
  createProviderNonce,
  createToolCapability,
  normalizeProviderTerminalStatus,
  recordToolMutationResult,
  requireIdempotency,
  requireInvocation,
  requireProviderDefinition,
  requireProviderOperationForInvocation,
} from './operation-guards';
import { createInvocationResult, mapInvocationRow } from './operation-mappers';
import {
  assertCursorScope,
  clampPageSize,
  createInvocationCursorScope,
  createInvocationPage,
  normalizeOptional,
  parseInvocationPageToken,
} from './operation-pagination';
import {
  cancelProviderOperation,
  commitProviderInvokeFailure,
  commitProviderInvokeResult,
  createInvokeProviderInput,
} from './operation-provider';

import type { AgentAuditView, AgentCoreRequestContext, AgentEventView } from '../domain';
import type { AgentStorageRepositories, AgentToolInvocationRow } from '../storage';
import type {
  CancelToolInvocationCommand,
  CreateToolInvocationCommand,
  DecideToolInvocationCommand,
  ExecuteToolInvocationCommand,
  GetToolInvocationQuery,
  GetToolInvocationResult,
  ListAgentToolsQuery,
  ListAgentToolsResult,
  ListToolInvocationsQuery,
  ListToolInvocationsResult,
  ReconcileToolInvocationCommand,
  RecordToolResultCommand,
  ToolInvocationMutationResult,
} from './operation-types';

const toolServiceName = 'cftamac.agent.v1.AgentToolService';
const integrationIngressServiceName = 'cftamac.agent.v1.IntegrationIngressService';
const createInvocationOperationName = 'AgentToolService.CreateInvocation';
const executeInvocationOperationName = 'AgentToolService.ExecuteInvocation';
const reconcileInvocationOperationName = 'AgentToolService.ReconcileInvocation';
const cancelInvocationOperationName = 'AgentToolService.CancelInvocation';
const publishToolResultOperationName = 'IntegrationIngressService.PublishToolResult';

/**
 * ListTools を Agent-owned Tool catalog から処理します。
 */
export async function listToolsFromStore(input: {
  readonly agentId: string;
  readonly query: ListAgentToolsQuery;
  readonly repositories: AgentStorageRepositories;
}): Promise<ListAgentToolsResult> {
  assertAgentContext(input.agentId, input.query.context);
  authorizeToolOperation(
    input.repositories,
    input.query.context,
    'tool.catalog.list',
    'ListTools',
    'read'
  );
  const pageSize = clampPageSize(input.query.pageSize);
  const catalog = await assembleToolCatalog({
    agentId: input.agentId,
    includeUnavailable: input.query.includeUnavailable,
    installationId: normalizeOptional(input.query.installationId),
    nowMs: input.query.context.requestedAtMs,
    repositories: input.repositories,
  });
  return {
    page: {
      cursorScope: `${input.agentId}:tools`,
      resultCount: Math.min(catalog.tools.length, pageSize),
    },
    tools: catalog.tools.slice(0, pageSize),
    toolSetVersion: catalog.toolSetVersion,
  };
}

/**
 * GetInvocation を Agent-owned storage から処理します。
 */
export function getToolInvocationFromStore(input: {
  readonly agentId: string;
  readonly query: GetToolInvocationQuery;
  readonly repositories: AgentStorageRepositories;
}): GetToolInvocationResult {
  assertAgentContext(input.agentId, input.query.context);
  authorizeToolOperation(
    input.repositories,
    input.query.context,
    'tool.invocation.get',
    'GetInvocation',
    'read'
  );
  return createInvocationResult(
    input.agentId,
    input.repositories,
    requireInvocation(input.repositories, input.query.invocationId)
  );
}

/**
 * ListInvocations を Agent scope と cursor scope に従って処理します。
 */
export function listToolInvocationsFromStore(input: {
  readonly agentId: string;
  readonly query: ListToolInvocationsQuery;
  readonly repositories: AgentStorageRepositories;
}): ListToolInvocationsResult {
  assertAgentContext(input.agentId, input.query.context);
  authorizeToolOperation(
    input.repositories,
    input.query.context,
    'tool.invocation.list',
    'ListInvocations',
    'read'
  );
  const cursorScope = createInvocationCursorScope(input.agentId, input.query);
  assertCursorScope(input.query.pageCursorScope, cursorScope);
  const pageSize = clampPageSize(input.query.pageSize);
  const rows = input.repositories.tools.listInvocations({
    ...parseInvocationPageToken(input.query.pageToken),
    installationId: normalizeOptional(input.query.installationId),
    limit: pageSize + 1,
    runId: normalizeOptional(input.query.runId),
    status: normalizeOptional(input.query.status),
    threadId: normalizeOptional(input.query.threadId),
  });
  const pageRows = rows.slice(0, pageSize);
  return {
    invocations: pageRows.map((row) => mapInvocationRow(input.agentId, row)),
    page: createInvocationPage(cursorScope, pageRows, rows.length > pageSize),
  };
}

/**
 * Harness decision から ToolInvocation を作成し、approval 要否に応じて待機状態へ遷移します。
 */
export async function createToolInvocationInStore(input: {
  readonly agentId: string;
  readonly command: CreateToolInvocationCommand;
  readonly repositories: AgentStorageRepositories;
}): Promise<ToolInvocationMutationResult> {
  assertAgentContext(input.agentId, input.command.context);
  const replay = beginToolMutationCommand(
    input.repositories,
    input.command.context,
    createInvocationOperationName
  );
  if (replay !== undefined) return replay;
  authorizeToolOperation(
    input.repositories,
    input.command.context,
    'tool.invocation.create',
    'CreateInvocation',
    'invoke'
  );
  const catalog = await assembleToolCatalog({
    agentId: input.agentId,
    nowMs: input.command.context.requestedAtMs,
    persistSnapshot: true,
    repositories: input.repositories,
  });
  const definition = catalog.tools.find((tool) => tool.toolId === input.command.toolId);
  assertInvokableDefinition(definition, input.command.toolId);
  const row = input.repositories.tools.insertInvocation({
    causationEventId: input.command.causationEventId,
    createdAtMs: input.command.context.requestedAtMs,
    idempotencyKey: requireIdempotency(input.command.context),
    inputRef: input.command.inputRef,
    installationId: definition.installationId,
    invocationId: crypto.randomUUID(),
    runId: input.command.runId,
    status: definition.approvalRequired ? 'pending_approval' : 'approved',
    threadId: input.command.threadId,
    toolId: definition.toolId,
    toolSetVersion: catalog.toolSetVersion,
  });
  return recordToolMutationResult(
    input.repositories,
    input.command.context,
    createInvocationOperationName,
    {
      ...createInvocationResult(input.agentId, input.repositories, row),
      replayed: false,
    }
  );
}

/**
 * ApproveInvocation command を明示 actor/rationale と状態遷移で処理します。
 */
export function approveToolInvocationInStore(input: {
  readonly agentId: string;
  readonly command: DecideToolInvocationCommand;
  readonly repositories: AgentStorageRepositories;
}): ToolInvocationMutationResult {
  return decideToolInvocation(input, 'approved');
}

/**
 * RejectInvocation command を明示 actor/rationale と状態遷移で処理します。
 */
export function rejectToolInvocationInStore(input: {
  readonly agentId: string;
  readonly command: DecideToolInvocationCommand;
  readonly repositories: AgentStorageRepositories;
}): ToolInvocationMutationResult {
  return decideToolInvocation(input, 'rejected');
}

/**
 * approved ToolInvocation を generated Provider RPC client で実行します。
 */
export async function executeToolInvocationWithProvider(input: {
  readonly agentId: string;
  readonly command: ExecuteToolInvocationCommand;
  readonly repositories: AgentStorageRepositories;
}): Promise<ToolInvocationMutationResult> {
  assertAgentContext(input.agentId, input.command.context);
  const replay = beginToolMutationCommand(
    input.repositories,
    input.command.context,
    executeInvocationOperationName
  );
  if (replay !== undefined) return replay;
  const invocation = requireInvocation(input.repositories, input.command.invocationId);
  const definition = requireProviderDefinition(input.repositories, invocation.toolId);
  authorizeToolOperation(
    input.repositories,
    input.command.context,
    'tool.provider.invoke',
    'InvokeTool',
    'provider',
    createToolCapability(input.agentId, definition)
  );
  assertTransition(invocation.status, 'running');
  input.repositories.tools.incrementInvocationAttempt({
    invocationId: invocation.invocationId,
    updatedAtMs: input.command.context.requestedAtMs,
  });
  const running = input.repositories.tools.transitionInvocationStatus({
    fromStatus: invocation.status,
    invocationId: invocation.invocationId,
    status: 'running',
    updatedAtMs: input.command.context.requestedAtMs,
  });
  try {
    const provider = await input.command.providerClient.invokeTool(
      createInvokeProviderInput(input, running, definition)
    );
    return recordToolMutationResult(
      input.repositories,
      input.command.context,
      executeInvocationOperationName,
      commitProviderInvokeResult(input, running, provider, definition, recordToolResultCore)
    );
  } catch (error) {
    return recordToolMutationResult(
      input.repositories,
      input.command.context,
      executeInvocationOperationName,
      commitProviderInvokeFailure(input, running, definition, error)
    );
  }
}

/**
 * Tool 成功/失敗 result を同じ Thread へ Event として戻します。
 */
export function recordToolResultInStore(input: {
  readonly agentId: string;
  readonly command: RecordToolResultCommand;
  readonly repositories: AgentStorageRepositories;
}): ToolInvocationMutationResult {
  assertAgentContext(input.agentId, input.command.context);
  const replay = beginToolMutationCommand(
    input.repositories,
    input.command.context,
    publishToolResultOperationName
  );
  if (replay !== undefined) return replay;
  return recordToolMutationResult(
    input.repositories,
    input.command.context,
    publishToolResultOperationName,
    recordToolResultCore(input)
  );
}

function recordToolResultCore(input: {
  readonly agentId: string;
  readonly command: RecordToolResultCommand;
  readonly repositories: AgentStorageRepositories;
}): ToolInvocationMutationResult {
  return input.repositories.transaction((repositories) => {
    const invocation = requireInvocation(repositories, input.command.invocationId);
    authorizeToolOperation(
      repositories,
      input.command.context,
      'tool.result.publish',
      'PublishToolResult',
      'result',
      {
        capabilityKind: 'tool',
        installationId: invocation.installationId ?? undefined,
        ownerAgentId: input.agentId,
        toolId: invocation.toolId,
      }
    );
    assertTransition(invocation.status, input.command.status);
    assertProviderResultIdentity(repositories, invocation, input.command.providerOperationId);
    const existingResult = repositories.tools.findResultEventByInvocation(invocation.invocationId);
    if (existingResult !== undefined)
      return { ...createInvocationResult(input.agentId, repositories, invocation), replayed: true };
    assertToolResultCanResumeRun(repositories, invocation);
    const persisted = appendToolResultEvent({ ...input, repositories }, invocation);
    const updated = repositories.tools.markInvocationResult({
      invocationId: invocation.invocationId,
      outputRef: input.command.outputRef,
      resultEventId: persisted.event.eventId,
      fromStatus: invocation.status,
      status: input.command.status,
      updatedAtMs: input.command.context.requestedAtMs,
    });
    repositories.tools.insertResultEvent({
      createdAtMs: input.command.context.requestedAtMs,
      eventId: persisted.event.eventId,
      idempotencyKey: requireIdempotency(input.command.context),
      invocationId: invocation.invocationId,
      providerOperationId: input.command.providerOperationId ?? null,
      resultStatus: input.command.status,
      suppressedDuplicate: 0,
    });
    return {
      ...createInvocationResult(input.agentId, repositories, updated),
      replayed: false,
      resultEvent: persisted.event,
    };
  });
}

/**
 * outcome_unknown の ToolInvocation を generated GetOperation で照合します。
 */
export async function reconcileToolInvocationInStore(input: {
  readonly agentId: string;
  readonly command: ReconcileToolInvocationCommand;
  readonly repositories: AgentStorageRepositories;
}): Promise<ToolInvocationMutationResult> {
  assertAgentContext(input.agentId, input.command.context);
  const replay = beginToolMutationCommand(
    input.repositories,
    input.command.context,
    reconcileInvocationOperationName
  );
  if (replay !== undefined) return replay;
  const invocation = requireInvocation(input.repositories, input.command.invocationId);
  const operation = requireProviderOperationForInvocation(
    input.repositories,
    invocation.invocationId
  );
  assertProviderOperationBelongsToInvocation(invocation, operation);
  const definition = requireProviderDefinition(input.repositories, invocation.toolId);
  authorizeToolOperation(
    input.repositories,
    input.command.context,
    'tool.provider.reconcile',
    'GetOperation',
    'provider',
    createToolCapability(input.agentId, definition)
  );
  const provider = await input.command.providerClient.getOperation({
    agentId: input.agentId,
    idempotencyKey: requireIdempotency(input.command.context),
    installationId: operation.installationId,
    invocationId: invocation.invocationId,
    nonce: createProviderNonce(input.command.context, invocation.invocationId, 'reconcile'),
    operationId: operation.providerOperationRef ?? operation.operationId,
    providerTargetRef: definition.providerTargetRef ?? '',
    timestampUnixMs: input.command.context.requestedAtMs,
    toolId: invocation.toolId,
  });
  input.repositories.tools.insertOutgoingRequest({
    attempt: operation.attemptCount + 1,
    errorCode: null,
    idempotencyKey: requireIdempotency(input.command.context),
    invocationId: invocation.invocationId,
    method: provider.record.method,
    nonce: provider.record.nonce,
    operationId: operation.operationId,
    providerTargetRef: provider.record.requestUrl,
    rawBodyDigest: provider.record.rawBodyDigestHex,
    requestId: crypto.randomUUID(),
    responseAtMs: input.command.context.requestedAtMs,
    sentAtMs: input.command.context.requestedAtMs,
    signatureDigest: provider.record.signatureDigestHex,
    status: 'succeeded',
  });
  const status = normalizeProviderTerminalStatus(
    provider.response.operation?.status ?? operation.status
  );
  input.repositories.tools.updateProviderOperationStatus({
    operationId: operation.operationId,
    providerOperationRef: provider.response.operation?.providerOperationRef,
    status,
    updatedAtMs: input.command.context.requestedAtMs,
  });
  if (status === 'succeeded' || status === 'failed') {
    return recordToolMutationResult(
      input.repositories,
      input.command.context,
      reconcileInvocationOperationName,
      recordToolResultCore({
        agentId: input.agentId,
        command: {
          context: input.command.context,
          invocationId: invocation.invocationId,
          outputRef: provider.response.outputRef,
          providerOperationId: operation.operationId,
          status,
        },
        repositories: input.repositories,
      })
    );
  }
  assertTransition(invocation.status, status);
  const row = input.repositories.tools.transitionInvocationStatus({
    fromStatus: invocation.status,
    invocationId: invocation.invocationId,
    status,
    updatedAtMs: input.command.context.requestedAtMs,
  });
  return recordToolMutationResult(
    input.repositories,
    input.command.context,
    reconcileInvocationOperationName,
    {
      ...createInvocationResult(input.agentId, input.repositories, row),
      replayed: false,
    }
  );
}

/**
 * ToolInvocation cancellation を Provider operation へ伝播します。
 */
export async function cancelToolInvocationInStore(input: {
  readonly agentId: string;
  readonly command: CancelToolInvocationCommand;
  readonly repositories: AgentStorageRepositories;
}): Promise<ToolInvocationMutationResult> {
  assertAgentContext(input.agentId, input.command.context);
  const replay = beginToolMutationCommand(
    input.repositories,
    input.command.context,
    cancelInvocationOperationName
  );
  if (replay !== undefined) return replay;
  const invocation = requireInvocation(input.repositories, input.command.invocationId);
  assertTransition(invocation.status, 'cancelled');
  const operation = input.repositories.tools.findProviderOperationByInvocation(
    invocation.invocationId
  );
  if (operation !== undefined) assertProviderOperationBelongsToInvocation(invocation, operation);
  const definition = input.repositories.tools.findDefinition(invocation.toolId);
  const capability =
    definition === undefined
      ? undefined
      : createToolCapability(input.agentId, mapToolDefinitionRow(input.agentId, definition));
  authorizeToolOperation(
    input.repositories,
    input.command.context,
    'tool.invocation.cancel',
    'CancelOperation',
    'provider',
    capability
  );
  if (
    operation !== undefined &&
    definition?.cancellationSupported === 1 &&
    input.command.providerClient !== undefined
  ) {
    const cancelled = await cancelProviderOperation(
      input,
      invocation,
      operation,
      mapToolDefinitionRow(input.agentId, definition)
    );
    input.repositories.tools.insertOutgoingRequest({
      attempt: operation.attemptCount + 1,
      errorCode: null,
      idempotencyKey: requireIdempotency(input.command.context),
      invocationId: invocation.invocationId,
      method: cancelled.record.method,
      nonce: cancelled.record.nonce,
      operationId: operation.operationId,
      providerTargetRef: cancelled.record.requestUrl,
      rawBodyDigest: cancelled.record.rawBodyDigestHex,
      requestId: crypto.randomUUID(),
      responseAtMs: input.command.context.requestedAtMs,
      sentAtMs: input.command.context.requestedAtMs,
      signatureDigest: cancelled.record.signatureDigestHex,
      status: 'succeeded',
    });
    input.repositories.tools.markProviderOperationCancellation({
      operationId: operation.operationId,
      requestedAtMs: input.command.context.requestedAtMs,
      status:
        cancelled.response.cancellationStatus === 'cancelled' ? 'cancelled' : 'outcome_unknown',
    });
  }
  const row = input.repositories.tools.transitionInvocationStatus({
    fromStatus: invocation.status,
    invocationId: invocation.invocationId,
    status: 'cancelled',
    updatedAtMs: input.command.context.requestedAtMs,
  });
  return recordToolMutationResult(
    input.repositories,
    input.command.context,
    cancelInvocationOperationName,
    {
      ...createInvocationResult(input.agentId, input.repositories, row),
      replayed: false,
    }
  );
}

function decideToolInvocation(
  input: {
    readonly agentId: string;
    readonly command: DecideToolInvocationCommand;
    readonly repositories: AgentStorageRepositories;
  },
  decision: 'approved' | 'rejected'
): ToolInvocationMutationResult {
  assertAgentContext(input.agentId, input.command.context);
  const operationName =
    decision === 'approved'
      ? 'AgentToolService.ApproveInvocation'
      : 'AgentToolService.RejectInvocation';
  const replay = checkAgentIdempotency<ToolInvocationMutationResult>({
    context: input.command.context,
    operationName,
    repositories: input.repositories,
  });
  if (replay.status === 'replay') return { ...replay.response, replayed: true };
  reserveAgentNonce(input.repositories, input.command.context);
  authorizeToolOperation(
    input.repositories,
    input.command.context,
    'tool.approval.decide',
    decision === 'approved' ? 'ApproveInvocation' : 'RejectInvocation',
    'approve'
  );
  const invocation = requireInvocation(input.repositories, input.command.invocationId);
  if (invocation.status !== 'pending_approval') {
    throw createAgentDomainError({
      kind: 'precondition',
      message: 'ToolInvocation is not pending approval.',
    });
  }
  const audit = recordToolAudit(
    input.agentId,
    input.repositories,
    input.command.context,
    `agent.tool.${decision}`,
    decision,
    invocation.invocationId
  );
  const approval = input.repositories.tools.insertApproval({
    actorId:
      input.command.context.principal.actingUserId ?? input.command.context.principal.principalId,
    approvalId: crypto.randomUUID(),
    auditEventId: audit.auditEventId,
    decidedAtMs: input.command.context.requestedAtMs,
    decision,
    invocationId: invocation.invocationId,
    principalId: input.command.context.principal.principalId,
    reason: input.command.reason,
  });
  const updated = input.repositories.tools.attachApproval({
    approvalId: approval.approvalId,
    invocationId: invocation.invocationId,
    status: decision === 'approved' ? 'approved' : 'cancelled',
    updatedAtMs: input.command.context.requestedAtMs,
  });
  const result = {
    ...createInvocationResult(input.agentId, input.repositories, updated),
    audit,
    replayed: false,
  };
  recordAgentIdempotency({
    context: input.command.context,
    operationName,
    repositories: input.repositories,
    response: result,
  });
  return result;
}

function appendToolResultEvent(
  input: {
    readonly agentId: string;
    readonly command: RecordToolResultCommand;
    readonly repositories: AgentStorageRepositories;
  },
  invocation: AgentToolInvocationRow
) {
  const thread = input.repositories.threads.findByThreadId(invocation.threadId);
  if (thread === undefined)
    throw createAgentDomainError({
      kind: 'not_found',
      message: 'ToolInvocation Thread not found.',
    });
  return input.repositories.transaction((repositories) => {
    repositories.pendingRuns.transitionRunStatus({
      fromStatus: 'waiting',
      nowMs: input.command.context.requestedAtMs,
      runId: invocation.runId,
      toStatus: 'pending',
    });
    const persisted = appendAgentEventToThreadInRepositories({
      causationId: invocation.runId,
      correlationId: input.command.context.correlationId,
      createdAtMs: input.command.context.requestedAtMs,
      eventId: crypto.randomUUID(),
      eventType:
        input.command.status === 'succeeded'
          ? toolInvocationSucceededEventType
          : toolInvocationFailedEventType,
      idempotencyKey: requireIdempotency(input.command.context),
      occurredAtMs: input.command.context.requestedAtMs,
      payloadRef: input.command.outputRef,
      repositories,
      requestDigest: input.command.context.bodyDigest.digestHex,
      source: 'agent.tool',
      target: {
        mode: 'thread_id',
        normalizedThreadKey: thread.normalizedThreadKey,
        threadId: thread.threadId,
        threadKey: thread.threadKey,
      },
    });
    return { event: mapEventRow(input.agentId, persisted.event), runId: persisted.run.runId };
  });
}

function authorizeToolOperation(
  repositories: AgentStorageRepositories,
  context: AgentCoreRequestContext,
  action: string,
  method: string,
  mode: 'approve' | 'invoke' | 'provider' | 'read' | 'result',
  capability?: Parameters<typeof authorizeAgentOperation>[0]['capability']
): void {
  authorizeAgentOperation({
    action,
    capability,
    context,
    method,
    repositories,
    requiredGrants: mode === 'result' ? ['integration.tool.result'] : ['agent.tool'],
    requiredPrincipalTypes:
      mode === 'result'
        ? ['INTEGRATION_INSTALLATION', 'INTERNAL_SERVICE']
        : ['CLIENT_SERVICE', 'ADMIN_OPERATOR', 'INTERNAL_SERVICE'],
    requiredScopes:
      mode === 'read'
        ? ['agent.rpc', 'agent.read']
        : mode === 'approve'
          ? ['agent.rpc', 'agent.tool.approve']
          : ['agent.rpc', 'agent.tool'],
    service: mode === 'result' ? integrationIngressServiceName : toolServiceName,
  });
}

function recordToolAudit(
  agentId: string,
  repositories: AgentStorageRepositories,
  context: AgentCoreRequestContext,
  operation: string,
  result: string,
  invocationId: string
): AgentAuditView {
  const auditEventId = crypto.randomUUID();
  repositories.audit.insertAuditEvent({
    auditId: auditEventId,
    createdAtMs: context.requestedAtMs,
    eventType: operation,
    principalRef: context.principal.principalId,
    requestDigest: context.bodyDigest.digestHex,
  });
  return {
    agentId,
    auditEventId,
    correlationId: context.correlationId,
    occurredAtMs: context.requestedAtMs,
    operation,
    principalId: context.principal.principalId,
    result,
    safeDetailRef: `agent-tool-invocation://${invocationId}`,
    systemThreadId: repositories.profile.getProfile()?.systemThreadId ?? '',
  };
}

function mapEventRow(
  agentId: string,
  row: {
    readonly agentSequence: number;
    readonly causationId: string | null;
    readonly correlationId: string | null;
    readonly eventId: string;
    readonly eventType: string;
    readonly idempotencyKey: string;
    readonly normalizedThreadKey: string;
    readonly occurredAtMs: number;
    readonly payloadRef: string | null;
    readonly runId: string | null;
    readonly sectionId: string;
    readonly source: string;
    readonly threadId: string;
    readonly threadKey: string;
    readonly threadSequence: number;
  }
): AgentEventView {
  return {
    agentId,
    agentSequence: row.agentSequence,
    causationId: row.causationId ?? undefined,
    correlationId: row.correlationId ?? undefined,
    eventId: row.eventId,
    eventType: row.eventType,
    idempotencyKey: row.idempotencyKey,
    normalizedThreadKey: row.normalizedThreadKey,
    occurredAtMs: row.occurredAtMs,
    payloadRef: row.payloadRef ?? undefined,
    runId: row.runId ?? undefined,
    sectionId: row.sectionId,
    source: row.source,
    threadId: row.threadId,
    threadKey: row.threadKey,
    threadSequence: row.threadSequence,
  };
}
