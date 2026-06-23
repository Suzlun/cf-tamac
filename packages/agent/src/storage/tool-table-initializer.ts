import { sql } from 'drizzle-orm';

import type { AgentStorageDatabase } from './database';

/**
 * Stage 6 Tool 用の Agent-owned SQLite tables を作成します。
 *
 * @param database AIAgent Durable Object の Drizzle Durable SQLite database です。
 * @remarks
 * handwritten SQL は runtime table creation のためだけに限定し、通常の読み書きは
 * `AgentToolsRepository` の Drizzle query builder に閉じます。
 */
export function ensureAgentToolTables(database: AgentStorageDatabase): void {
  ensureToolCatalogTables(database);
  ensureToolInvocationTables(database);
  ensureToolProviderTables(database);
}

function ensureToolCatalogTables(database: AgentStorageDatabase): void {
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_tool_definitions (
    agent_id TEXT NOT NULL,
    tool_id TEXT NOT NULL,
    installation_id TEXT,
    version TEXT NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    input_schema_ref TEXT,
    output_schema_ref TEXT,
    approval_required INTEGER NOT NULL,
    status TEXT NOT NULL,
    provider_target_ref TEXT,
    cancellation_supported INTEGER NOT NULL DEFAULT 0,
    tool_set_version INTEGER NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, tool_id)
  )`);
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_tool_catalog_snapshots (
    agent_id TEXT NOT NULL,
    tool_set_version INTEGER NOT NULL,
    snapshot_ref TEXT NOT NULL,
    digest_sha256 TEXT NOT NULL,
    definition_count INTEGER NOT NULL,
    created_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, tool_set_version)
  )`);
}

function ensureToolInvocationTables(database: AgentStorageDatabase): void {
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_tool_invocations (
    agent_id TEXT NOT NULL,
    invocation_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    tool_id TEXT NOT NULL,
    installation_id TEXT,
    idempotency_key TEXT NOT NULL,
    input_ref TEXT,
    output_ref TEXT,
    status TEXT NOT NULL,
    approval_id TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    provider_operation_id TEXT,
    result_event_id TEXT,
    causation_event_id TEXT,
    audit_event_id TEXT,
    failure_reason TEXT,
    tool_set_version INTEGER NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, invocation_id),
    UNIQUE (agent_id, idempotency_key)
  )`);
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_tool_approvals (
    agent_id TEXT NOT NULL,
    approval_id TEXT NOT NULL,
    invocation_id TEXT NOT NULL,
    decision TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    reason TEXT,
    audit_event_id TEXT,
    decided_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, approval_id),
    UNIQUE (agent_id, invocation_id)
  )`);
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_tool_result_events (
    agent_id TEXT NOT NULL,
    invocation_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    result_status TEXT NOT NULL,
    provider_operation_id TEXT,
    suppressed_duplicate INTEGER NOT NULL DEFAULT 0,
    created_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, invocation_id),
    UNIQUE (agent_id, event_id),
    UNIQUE (agent_id, idempotency_key)
  )`);
}

function ensureToolProviderTables(database: AgentStorageDatabase): void {
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_provider_operations (
    agent_id TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    installation_id TEXT NOT NULL,
    invocation_id TEXT,
    tool_id TEXT,
    method TEXT NOT NULL,
    status TEXT NOT NULL,
    provider_operation_ref TEXT,
    provider_target_ref TEXT,
    request_digest TEXT,
    nonce TEXT,
    idempotency_key TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    cancellation_supported INTEGER NOT NULL DEFAULT 0,
    cancellation_requested_at_ms INTEGER,
    timeout_at_ms INTEGER,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, operation_id),
    UNIQUE (agent_id, invocation_id)
  )`);
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_tool_outgoing_requests (
    agent_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    invocation_id TEXT NOT NULL,
    operation_id TEXT,
    method TEXT NOT NULL,
    provider_target_ref TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    nonce TEXT NOT NULL,
    raw_body_digest TEXT NOT NULL,
    signature_digest TEXT,
    attempt INTEGER NOT NULL,
    status TEXT NOT NULL,
    sent_at_ms INTEGER NOT NULL,
    response_at_ms INTEGER,
    error_code TEXT,
    PRIMARY KEY (agent_id, request_id)
  )`);
  void database.run(sql`CREATE INDEX IF NOT EXISTS agent_tool_invocations_thread_status_idx
    ON agent_tool_invocations (agent_id, thread_id, status, created_at_ms)`);
  void database.run(sql`CREATE INDEX IF NOT EXISTS agent_tool_definitions_installation_status_idx
    ON agent_tool_definitions (agent_id, installation_id, status)`);
}
