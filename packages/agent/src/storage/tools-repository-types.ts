/**
 * ToolDefinition の永続行です。
 */
export interface AgentToolDefinitionRow {
  readonly agentId: string;
  readonly approvalRequired: number;
  readonly cancellationSupported: number;
  readonly createdAtMs: number;
  readonly description: string | null;
  readonly displayName: string;
  readonly inputSchemaRef: string | null;
  readonly installationId: string | null;
  readonly outputSchemaRef: string | null;
  readonly providerTargetRef: string | null;
  readonly status: string;
  readonly toolId: string;
  readonly toolSetVersion: number;
  readonly updatedAtMs: number;
  readonly version: string;
}

/**
 * Tool catalog snapshot の永続行です。
 */
export interface AgentToolCatalogSnapshotRow {
  readonly agentId: string;
  readonly createdAtMs: number;
  readonly definitionCount: number;
  readonly digestSha256: string;
  readonly snapshotRef: string;
  readonly toolSetVersion: number;
}

/**
 * ToolInvocation の永続行です。
 */
export interface AgentToolInvocationRow {
  readonly agentId: string;
  readonly approvalId: string | null;
  readonly attemptCount: number;
  readonly auditEventId: string | null;
  readonly causationEventId: string | null;
  readonly createdAtMs: number;
  readonly failureReason: string | null;
  readonly idempotencyKey: string;
  readonly inputRef: string | null;
  readonly installationId: string | null;
  readonly invocationId: string;
  readonly outputRef: string | null;
  readonly providerOperationId: string | null;
  readonly resultEventId: string | null;
  readonly runId: string;
  readonly status: string;
  readonly threadId: string;
  readonly toolId: string;
  readonly toolSetVersion: number;
  readonly updatedAtMs: number;
}

/**
 * Tool approval / rejection の永続行です。
 */
export interface AgentToolApprovalRow {
  readonly actorId: string;
  readonly agentId: string;
  readonly approvalId: string;
  readonly auditEventId: string | null;
  readonly decidedAtMs: number;
  readonly decision: string;
  readonly invocationId: string;
  readonly principalId: string;
  readonly reason: string | null;
}

/**
 * Provider operation の永続行です。
 */
export interface AgentProviderOperationRow {
  readonly agentId: string;
  readonly attemptCount: number;
  readonly cancellationRequestedAtMs: number | null;
  readonly cancellationSupported: number;
  readonly createdAtMs: number;
  readonly idempotencyKey: string;
  readonly installationId: string;
  readonly invocationId: string | null;
  readonly method: string;
  readonly nonce: string | null;
  readonly operationId: string;
  readonly providerOperationRef: string | null;
  readonly providerTargetRef: string | null;
  readonly requestDigest: string | null;
  readonly status: string;
  readonly timeoutAtMs: number | null;
  readonly toolId: string | null;
  readonly updatedAtMs: number;
}

/**
 * Provider へ送った Tool RPC request ledger の永続行です。
 */
export interface AgentToolOutgoingRequestRow {
  readonly agentId: string;
  readonly attempt: number;
  readonly errorCode: string | null;
  readonly idempotencyKey: string;
  readonly invocationId: string;
  readonly method: string;
  readonly nonce: string;
  readonly operationId: string | null;
  readonly providerTargetRef: string;
  readonly rawBodyDigest: string;
  readonly requestId: string;
  readonly responseAtMs: number | null;
  readonly sentAtMs: number;
  readonly signatureDigest: string | null;
  readonly status: string;
}

/**
 * Tool result Event ledger の永続行です。
 */
export interface AgentToolResultEventRow {
  readonly agentId: string;
  readonly createdAtMs: number;
  readonly eventId: string;
  readonly idempotencyKey: string;
  readonly invocationId: string;
  readonly providerOperationId: string | null;
  readonly resultStatus: string;
  readonly suppressedDuplicate: number;
}

/**
 * ToolDefinition upsert の入力です。
 */
export interface UpsertAgentToolDefinitionInput {
  readonly approvalRequired: boolean;
  readonly cancellationSupported?: boolean;
  readonly createdAtMs: number;
  readonly description?: string;
  readonly displayName: string;
  readonly inputSchemaRef?: string;
  readonly installationId?: string;
  readonly outputSchemaRef?: string;
  readonly providerTargetRef?: string;
  readonly status: string;
  readonly toolId: string;
  readonly toolSetVersion: number;
  readonly updatedAtMs: number;
  readonly version: string;
}

/**
 * ToolInvocation insert の入力です。
 */
export interface InsertAgentToolInvocationInput {
  readonly auditEventId?: string;
  readonly causationEventId?: string;
  readonly createdAtMs: number;
  readonly idempotencyKey: string;
  readonly inputRef?: string;
  readonly installationId?: string;
  readonly invocationId: string;
  readonly runId: string;
  readonly status: string;
  readonly threadId: string;
  readonly toolId: string;
  readonly toolSetVersion: number;
}

/**
 * Provider operation upsert の入力です。
 */
export interface UpsertAgentProviderOperationInput {
  readonly attemptCount: number;
  readonly cancellationSupported?: boolean;
  readonly createdAtMs: number;
  readonly idempotencyKey: string;
  readonly installationId: string;
  readonly invocationId?: string;
  readonly method: string;
  readonly nonce?: string;
  readonly operationId: string;
  readonly providerOperationRef?: string;
  readonly providerTargetRef?: string;
  readonly requestDigest?: string;
  readonly status: string;
  readonly timeoutAtMs?: number;
  readonly toolId?: string;
  readonly updatedAtMs: number;
}

/**
 * Tool storage を扱う Agent-scoped Drizzle repository です。
 */
export interface AgentToolsRepository {
  readonly approvalTableName: 'agent_tool_approvals';
  readonly catalogSnapshotTableName: 'agent_tool_catalog_snapshots';
  readonly definitionTableName: 'agent_tool_definitions';
  readonly invocationTableName: 'agent_tool_invocations';
  readonly outgoingRequestTableName: 'agent_tool_outgoing_requests';
  readonly providerOperationTableName: 'agent_provider_operations';
  readonly resultEventTableName: 'agent_tool_result_events';
  attachApproval(input: {
    readonly approvalId: string;
    readonly invocationId: string;
    readonly status: string;
    readonly updatedAtMs: number;
  }): AgentToolInvocationRow;
  attachProviderOperation(input: {
    readonly invocationId: string;
    readonly operationId: string;
    readonly status: string;
    readonly updatedAtMs: number;
  }): AgentToolInvocationRow;
  createCatalogSnapshot(input: {
    readonly createdAtMs: number;
    readonly definitionCount: number;
    readonly digestSha256: string;
    readonly snapshotRef: string;
    readonly toolSetVersion: number;
  }): AgentToolCatalogSnapshotRow;
  findApprovalForInvocation(invocationId: string): AgentToolApprovalRow | undefined;
  findDefinition(toolId: string): AgentToolDefinitionRow | undefined;
  findInvocation(invocationId: string): AgentToolInvocationRow | undefined;
  findInvocationByIdempotencyKey(idempotencyKey: string): AgentToolInvocationRow | undefined;
  findProviderOperation(operationId: string): AgentProviderOperationRow | undefined;
  findProviderOperationByInvocation(invocationId: string): AgentProviderOperationRow | undefined;
  findResultEventByInvocation(invocationId: string): AgentToolResultEventRow | undefined;
  getLatestCatalogSnapshot(): AgentToolCatalogSnapshotRow | undefined;
  getNextToolSetVersion(): number;
  incrementInvocationAttempt(input: {
    readonly invocationId: string;
    readonly updatedAtMs: number;
  }): AgentToolInvocationRow;
  insertApproval(input: {
    readonly actorId: string;
    readonly approvalId: string;
    readonly auditEventId?: string;
    readonly decidedAtMs: number;
    readonly decision: string;
    readonly invocationId: string;
    readonly principalId: string;
    readonly reason?: string;
  }): AgentToolApprovalRow;
  insertInvocation(input: InsertAgentToolInvocationInput): AgentToolInvocationRow;
  insertOutgoingRequest(
    input: Omit<AgentToolOutgoingRequestRow, 'agentId'>
  ): AgentToolOutgoingRequestRow;
  insertResultEvent(input: Omit<AgentToolResultEventRow, 'agentId'>): AgentToolResultEventRow;
  listDefinitions(input: {
    readonly includeUnavailable?: boolean;
    readonly installationId?: string;
    readonly limit: number;
  }): AgentToolDefinitionRow[];
  listInvocations(input: {
    readonly afterCreatedAtMs?: number;
    readonly afterInvocationId?: string;
    readonly installationId?: string;
    readonly limit: number;
    readonly runId?: string;
    readonly status?: string;
    readonly threadId?: string;
  }): AgentToolInvocationRow[];
  markInvocationResult(input: {
    readonly failureReason?: string;
    readonly fromStatus?: string;
    readonly invocationId: string;
    readonly outputRef?: string;
    readonly resultEventId?: string;
    readonly status: string;
    readonly updatedAtMs: number;
  }): AgentToolInvocationRow;
  markProviderOperationCancellation(input: {
    readonly operationId: string;
    readonly requestedAtMs: number;
    readonly status: string;
  }): AgentProviderOperationRow;
  transitionInvocationStatus(input: {
    readonly failureReason?: string;
    readonly fromStatus?: string;
    readonly invocationId: string;
    readonly providerOperationId?: string;
    readonly status: string;
    readonly updatedAtMs: number;
  }): AgentToolInvocationRow;
  updateProviderOperationStatus(input: {
    readonly operationId: string;
    readonly providerOperationRef?: string;
    readonly status: string;
    readonly updatedAtMs: number;
  }): AgentProviderOperationRow;
  upsertDefinition(input: UpsertAgentToolDefinitionInput): AgentToolDefinitionRow;
  upsertProviderOperation(input: UpsertAgentProviderOperationInput): AgentProviderOperationRow;
}
