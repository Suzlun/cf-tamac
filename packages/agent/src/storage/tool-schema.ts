import { integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

/**
 * Agent-owned ToolDefinition の Drizzle table 定義です。
 *
 * @remarks
 * Agent が実行時に参照する Tool catalog の正本を Durable Object SQLite に保持します。
 * Integration 由来 Tool は `installation_id` と provider target 参照を持ち、disabled / uninstalled
 * 状態の Tool を新しい Run の snapshot から除外できるようにします。
 */
export const agentToolDefinitions = sqliteTable(
  'agent_tool_definitions',
  {
    agentId: text('agent_id').notNull(),
    approvalRequired: integer('approval_required').notNull(),
    cancellationSupported: integer('cancellation_supported').notNull().default(0),
    createdAtMs: integer('created_at_ms').notNull(),
    description: text('description'),
    displayName: text('display_name').notNull(),
    inputSchemaRef: text('input_schema_ref'),
    installationId: text('installation_id'),
    outputSchemaRef: text('output_schema_ref'),
    providerTargetRef: text('provider_target_ref'),
    status: text('status').notNull(),
    toolId: text('tool_id').notNull(),
    toolSetVersion: integer('tool_set_version').notNull(),
    updatedAtMs: integer('updated_at_ms').notNull(),
    version: text('version').notNull(),
  },
  (table) => [primaryKey({ columns: [table.agentId, table.toolId] })]
);

/**
 * Tool catalog snapshot の Drizzle table 定義です。
 *
 * @remarks
 * Run snapshot が「どの Tool 集合を見たか」を説明できるよう、組み立て済み Tool set の version、
 * digest、参照を Agent scope で保存します。
 */
export const agentToolCatalogSnapshots = sqliteTable(
  'agent_tool_catalog_snapshots',
  {
    agentId: text('agent_id').notNull(),
    createdAtMs: integer('created_at_ms').notNull(),
    definitionCount: integer('definition_count').notNull(),
    digestSha256: text('digest_sha256').notNull(),
    snapshotRef: text('snapshot_ref').notNull(),
    toolSetVersion: integer('tool_set_version').notNull(),
  },
  (table) => [primaryKey({ columns: [table.agentId, table.toolSetVersion] })]
);

/**
 * ToolInvocation の Drizzle table 定義です。
 *
 * @remarks
 * 一回の Tool 実行について Thread / Run ownership、approval、Provider operation、結果 Event を
 * 追跡し、外部作用の監査可能性と重複抑止を保証します。
 */
export const agentToolInvocations = sqliteTable(
  'agent_tool_invocations',
  {
    agentId: text('agent_id').notNull(),
    approvalId: text('approval_id'),
    attemptCount: integer('attempt_count').notNull().default(0),
    auditEventId: text('audit_event_id'),
    causationEventId: text('causation_event_id'),
    createdAtMs: integer('created_at_ms').notNull(),
    failureReason: text('failure_reason'),
    idempotencyKey: text('idempotency_key').notNull(),
    inputRef: text('input_ref'),
    installationId: text('installation_id'),
    invocationId: text('invocation_id').notNull(),
    outputRef: text('output_ref'),
    providerOperationId: text('provider_operation_id'),
    resultEventId: text('result_event_id'),
    runId: text('run_id').notNull(),
    status: text('status').notNull(),
    threadId: text('thread_id').notNull(),
    toolId: text('tool_id').notNull(),
    toolSetVersion: integer('tool_set_version').notNull(),
    updatedAtMs: integer('updated_at_ms').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.invocationId] }),
    unique('agent_tool_invocations_agent_id_idempotency_key_unique').on(
      table.agentId,
      table.idempotencyKey
    ),
  ]
);

/**
 * Tool approval / rejection の Drizzle table 定義です。
 */
export const agentToolApprovals = sqliteTable(
  'agent_tool_approvals',
  {
    actorId: text('actor_id').notNull(),
    agentId: text('agent_id').notNull(),
    approvalId: text('approval_id').notNull(),
    auditEventId: text('audit_event_id'),
    decidedAtMs: integer('decided_at_ms').notNull(),
    decision: text('decision').notNull(),
    invocationId: text('invocation_id').notNull(),
    principalId: text('principal_id').notNull(),
    reason: text('reason'),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.approvalId] }),
    unique('agent_tool_approvals_agent_id_invocation_id_unique').on(
      table.agentId,
      table.invocationId
    ),
  ]
);

/**
 * Provider operation の Drizzle table 定義です。
 */
export const agentProviderOperations = sqliteTable(
  'agent_provider_operations',
  {
    agentId: text('agent_id').notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    cancellationRequestedAtMs: integer('cancellation_requested_at_ms'),
    cancellationSupported: integer('cancellation_supported').notNull().default(0),
    createdAtMs: integer('created_at_ms').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    installationId: text('installation_id').notNull(),
    invocationId: text('invocation_id'),
    method: text('method').notNull(),
    nonce: text('nonce'),
    operationId: text('operation_id').notNull(),
    providerOperationRef: text('provider_operation_ref'),
    providerTargetRef: text('provider_target_ref'),
    requestDigest: text('request_digest'),
    status: text('status').notNull(),
    timeoutAtMs: integer('timeout_at_ms'),
    toolId: text('tool_id'),
    updatedAtMs: integer('updated_at_ms').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.operationId] }),
    unique('agent_provider_operations_agent_id_invocation_id_unique').on(
      table.agentId,
      table.invocationId
    ),
  ]
);

/**
 * Agent から Provider へ送った Tool RPC request の Drizzle table 定義です。
 */
export const agentToolOutgoingRequests = sqliteTable(
  'agent_tool_outgoing_requests',
  {
    agentId: text('agent_id').notNull(),
    attempt: integer('attempt').notNull(),
    errorCode: text('error_code'),
    idempotencyKey: text('idempotency_key').notNull(),
    invocationId: text('invocation_id').notNull(),
    method: text('method').notNull(),
    nonce: text('nonce').notNull(),
    operationId: text('operation_id'),
    providerTargetRef: text('provider_target_ref').notNull(),
    rawBodyDigest: text('raw_body_digest').notNull(),
    requestId: text('request_id').notNull(),
    responseAtMs: integer('response_at_ms'),
    sentAtMs: integer('sent_at_ms').notNull(),
    signatureDigest: text('signature_digest'),
    status: text('status').notNull(),
  },
  (table) => [primaryKey({ columns: [table.agentId, table.requestId] })]
);

/**
 * Tool result Event の重複抑止 ledger 用 Drizzle table 定義です。
 */
export const agentToolResultEvents = sqliteTable(
  'agent_tool_result_events',
  {
    agentId: text('agent_id').notNull(),
    createdAtMs: integer('created_at_ms').notNull(),
    eventId: text('event_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    invocationId: text('invocation_id').notNull(),
    providerOperationId: text('provider_operation_id'),
    resultStatus: text('result_status').notNull(),
    suppressedDuplicate: integer('suppressed_duplicate').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.invocationId] }),
    unique('agent_tool_result_events_agent_id_event_id_unique').on(table.agentId, table.eventId),
    unique('agent_tool_result_events_agent_id_idempotency_key_unique').on(
      table.agentId,
      table.idempotencyKey
    ),
  ]
);

/**
 * Tool storage table 定義 metadata です。
 */
export const agentToolFoundationTableDefinitions = [
  {
    purpose: 'Agent-local Tool catalog definitions and availability state',
    repositoryName: 'AgentToolsRepository',
    tableName: 'agent_tool_definitions',
    uniqueKeys: ['agent_id, tool_id'],
  },
  {
    purpose: 'Versioned Tool catalog snapshots captured by AgentRun inputs',
    repositoryName: 'AgentToolsRepository',
    tableName: 'agent_tool_catalog_snapshots',
    uniqueKeys: ['agent_id, tool_set_version'],
  },
  {
    purpose: 'ToolInvocation lifecycle, ownership, approval, and result state',
    repositoryName: 'AgentToolsRepository',
    tableName: 'agent_tool_invocations',
    uniqueKeys: ['agent_id, invocation_id', 'agent_id, idempotency_key'],
  },
  {
    purpose: 'Explicit Tool approval and rejection decisions',
    repositoryName: 'AgentToolsRepository',
    tableName: 'agent_tool_approvals',
    uniqueKeys: ['agent_id, approval_id', 'agent_id, invocation_id'],
  },
  {
    purpose: 'Provider operation identity, reconciliation, and cancellation state',
    repositoryName: 'AgentToolsRepository',
    tableName: 'agent_provider_operations',
    uniqueKeys: ['agent_id, operation_id', 'agent_id, invocation_id'],
  },
  {
    purpose: 'Signed outgoing IntegrationToolService request ledger',
    repositoryName: 'AgentToolsRepository',
    tableName: 'agent_tool_outgoing_requests',
    uniqueKeys: ['agent_id, request_id'],
  },
  {
    purpose: 'Tool result Event duplicate suppression ledger',
    repositoryName: 'AgentToolsRepository',
    tableName: 'agent_tool_result_events',
    uniqueKeys: ['agent_id, invocation_id', 'agent_id, idempotency_key'],
  },
] as const;

/**
 * Tool storage の Drizzle schema map です。
 */
export const agentToolStorageDrizzleSchema = {
  agentProviderOperations,
  agentToolApprovals,
  agentToolCatalogSnapshots,
  agentToolDefinitions,
  agentToolInvocations,
  agentToolOutgoingRequests,
  agentToolResultEvents,
} as const;

/**
 * Tool storage table 名の一覧です。
 */
export const agentToolFoundationTables = [
  'agent_tool_definitions',
  'agent_tool_catalog_snapshots',
  'agent_tool_invocations',
  'agent_tool_approvals',
  'agent_provider_operations',
  'agent_tool_outgoing_requests',
  'agent_tool_result_events',
] as const;

/**
 * Tool storage repository 名の一覧です。
 */
export const agentToolStorageRepositoryNames = ['AgentToolsRepository'] as const;
