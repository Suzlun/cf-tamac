import { sql } from 'drizzle-orm';

import { ensureAgentIntegrationTables } from './integration-table-initializer';
import { ensureAgentToolTables } from './tool-table-initializer';

import type { AgentStorageDatabase } from './database';

/**
 * Ensure all Agent foundation SQLite tables exist for an AIAgent instance.
 *
 * Durable Object SQLite schema creation is the single narrow handwritten SQL exception for
 * Agent storage: Drizzle 0.45's Durable Object adapter supplies typed query execution, but
 * does not apply table definitions as migrations at runtime. Repository methods must keep
 * using Drizzle query builders rather than handwritten SQL strings.
 */
export function ensureAgentFoundationTables(database: AgentStorageDatabase): void {
  ensureIdentityAndSecurityTables(database);
  ensureThreadAndEventTables(database);
  ensureRunAndWakeTables(database);
  ensureModelPolicyTables(database);
  ensureModelInvocationTables(database);
  ensureScheduleTables(database);
  ensureAgentToolTables(database);
  ensureAgentIntegrationTables(database);
  ensureCompactionAndHistoryTables(database);
  ensureThreadMemoryTables(database);
  ensureAgentMemoryTables(database);
  ensureArchiveAndObjectReferenceTables(database);
  ensureStage4StorageIndexes(database);
}

function ensureIdentityAndSecurityTables(database: AgentStorageDatabase): void {
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_profile (
    agent_id TEXT PRIMARY KEY,
    lifecycle_status TEXT NOT NULL,
    display_name TEXT,
    config_version INTEGER NOT NULL,
    credential_generation INTEGER NOT NULL,
    system_thread_id TEXT,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
  )`);
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_credentials (
    agent_id TEXT NOT NULL,
    credential_id TEXT NOT NULL,
    generation INTEGER NOT NULL,
    status TEXT NOT NULL,
    verifier_ref TEXT,
    public_fingerprint TEXT,
    secret_reference TEXT,
    not_before_ms INTEGER,
    expires_at_ms INTEGER,
    revoked_at_ms INTEGER,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, credential_id),
    UNIQUE (agent_id, generation)
  )`);
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_config_versions (
    agent_id TEXT NOT NULL,
    config_version INTEGER NOT NULL,
    display_name TEXT,
    model_policy_ref TEXT,
    budget_policy_ref TEXT,
    memory_policy_ref TEXT,
    tool_policy_ref TEXT,
    schedule_policy_ref TEXT,
    config_body_ref TEXT,
    updated_by_principal_id TEXT,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, config_version)
  )`);
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_principals (
    agent_id TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    principal_type TEXT NOT NULL,
    display_name TEXT,
    status TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, principal_id)
  )`);
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_grants (
    agent_id TEXT NOT NULL,
    grant_id TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    capability TEXT NOT NULL,
    scope_ref TEXT,
    status TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, grant_id)
  )`);
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_request_nonces (
    agent_id TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    nonce TEXT NOT NULL,
    expires_at_ms INTEGER NOT NULL,
    created_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, principal_id, nonce)
  )`);
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_idempotency_records (
    agent_id TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    operation_name TEXT NOT NULL,
    request_digest TEXT NOT NULL,
    response_ref TEXT,
    status TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    expires_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, principal_id, idempotency_key)
  )`);
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_audit_events (
    agent_id TEXT NOT NULL,
    audit_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    principal_ref TEXT,
    request_digest TEXT,
    created_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, audit_id)
  )`);
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_rate_limit_buckets (
    agent_id TEXT NOT NULL,
    bucket_key TEXT NOT NULL,
    window_start_ms INTEGER NOT NULL,
    used INTEGER NOT NULL,
    PRIMARY KEY (agent_id, bucket_key)
  )`);
}

function ensureThreadAndEventTables(database: AgentStorageDatabase): void {
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_threads (
    agent_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    thread_key TEXT NOT NULL,
    normalized_thread_key TEXT NOT NULL CHECK (normalized_thread_key <> ''),
    status TEXT NOT NULL DEFAULT 'active',
    current_section_id TEXT,
    priority INTEGER NOT NULL DEFAULT 0,
    last_served_at_ms INTEGER,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, thread_id),
    UNIQUE (agent_id, normalized_thread_key),
    CHECK (length(CAST(normalized_thread_key AS BLOB)) <= 512)
  )`);
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_thread_sections (
    agent_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    section_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    status TEXT NOT NULL,
    start_thread_sequence INTEGER NOT NULL DEFAULT 1,
    end_thread_sequence INTEGER,
    opened_at_ms INTEGER,
    frozen_at_ms INTEGER,
    event_count INTEGER NOT NULL DEFAULT 0,
    created_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, thread_id, section_id),
    UNIQUE (agent_id, thread_id, sequence)
  )`);
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_events (
    agent_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    section_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    event_type TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'unknown',
    thread_key TEXT NOT NULL DEFAULT '',
    normalized_thread_key TEXT NOT NULL DEFAULT '',
    request_digest TEXT,
    payload_ref TEXT,
    payload_content_type TEXT,
    payload_byte_size INTEGER,
    payload_sha256 TEXT,
    payload_storage_class TEXT,
    payload_inline_base64 TEXT,
    occurred_at_ms INTEGER NOT NULL DEFAULT 0,
    correlation_id TEXT,
    causation_id TEXT,
    delivery_context_id TEXT,
    requested_model_policy_ref TEXT,
    requested_model_policy_digest TEXT,
    requested_model_policy_version INTEGER,
    requested_model_policy_validation_status TEXT,
    policy_override_source TEXT,
    run_id TEXT,
    agent_sequence INTEGER NOT NULL,
    thread_sequence INTEGER NOT NULL,
    created_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, event_id),
    UNIQUE (agent_id, idempotency_key),
    UNIQUE (agent_id, agent_sequence),
    UNIQUE (agent_id, thread_id, thread_sequence)
  )`);
}

function ensureRunAndWakeTables(database: AgentStorageDatabase): void {
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_runs (
    agent_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    trigger_event_id TEXT NOT NULL,
    status TEXT NOT NULL,
    priority INTEGER NOT NULL,
    pending_since_ms INTEGER NOT NULL,
    last_served_at_ms INTEGER,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, run_id)
  )`);
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_run_inputs (
    agent_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    snapshot_ref TEXT NOT NULL,
    trigger_event_id TEXT NOT NULL,
    trigger_event_start_sequence INTEGER NOT NULL DEFAULT 0,
    trigger_event_end_sequence INTEGER NOT NULL DEFAULT 0,
    thread_memory_version INTEGER NOT NULL DEFAULT 0,
    thread_memory_ref TEXT,
    latest_ready_compaction_ref TEXT,
    uncompacted_upper_sequence INTEGER NOT NULL DEFAULT 0,
    config_version INTEGER NOT NULL DEFAULT 0,
    tool_set_version INTEGER NOT NULL DEFAULT 0,
    integration_version INTEGER NOT NULL DEFAULT 0,
    requested_model_policy_ref TEXT,
    resolved_model_policy_ref TEXT,
    resolved_model_policy_digest TEXT,
    model_provider TEXT,
    model_id TEXT,
    model_policy_version INTEGER,
    model_policy_source TEXT,
    decision_schema_version TEXT,
    generation_max_output_tokens INTEGER,
    generation_temperature TEXT,
    generation_top_p TEXT,
    created_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, run_id)
  )`);
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_run_interrupts (
    agent_id TEXT NOT NULL,
    interrupt_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    interrupt_type TEXT NOT NULL,
    requested_status TEXT NOT NULL,
    reason TEXT NOT NULL,
    snapshot_ref TEXT,
    safe_audit_ref TEXT,
    created_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, interrupt_id)
  )`);
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_harness_decision_records (
    agent_id TEXT NOT NULL,
    decision_record_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    decision_id TEXT NOT NULL,
    decision_type TEXT NOT NULL,
    status TEXT NOT NULL,
    seam TEXT NOT NULL,
    reason TEXT,
    created_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, decision_record_id)
  )`);
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_run_budget_ledger (
    agent_id TEXT NOT NULL,
    budget_record_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    budget_scope TEXT NOT NULL,
    budget_dimension TEXT NOT NULL,
    status TEXT NOT NULL,
    used_value INTEGER NOT NULL,
    limit_value INTEGER,
    reason TEXT,
    created_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, budget_record_id)
  )`);
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_scheduler_wake_state (
    agent_id TEXT PRIMARY KEY,
    wake_status TEXT NOT NULL,
    pending_count INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
  )`);
}

function ensureModelPolicyTables(database: AgentStorageDatabase): void {
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_model_policies (
    agent_id TEXT NOT NULL,
    policy_ref TEXT NOT NULL,
    version INTEGER NOT NULL,
    status TEXT NOT NULL,
    provider TEXT NOT NULL,
    model_id TEXT NOT NULL,
    decision_schema_version TEXT NOT NULL,
    policy_digest TEXT NOT NULL,
    generation_max_output_tokens INTEGER,
    generation_parameters_ref TEXT,
    generation_parameters_sha256 TEXT,
    generation_temperature TEXT,
    generation_top_p TEXT,
    budget_metadata_ref TEXT,
    budget_metadata_sha256 TEXT,
    safety_metadata_ref TEXT,
    safety_metadata_sha256 TEXT,
    safe_metadata_ref TEXT,
    safe_metadata_sha256 TEXT,
    credential_ref TEXT,
    created_by_principal_id TEXT,
    updated_by_principal_id TEXT,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    archived_at_ms INTEGER,
    validated_at_ms INTEGER,
    PRIMARY KEY (agent_id, policy_ref),
    UNIQUE (agent_id, policy_digest)
  )`);
}

function ensureModelInvocationTables(database: AgentStorageDatabase): void {
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_model_invocations (
    agent_id TEXT NOT NULL,
    invocation_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    status TEXT NOT NULL,
    provider TEXT NOT NULL,
    model_id TEXT NOT NULL,
    policy_ref TEXT NOT NULL,
    policy_digest TEXT NOT NULL,
    decision_schema_version TEXT NOT NULL,
    request_digest TEXT,
    response_digest TEXT,
    provider_error_category TEXT,
    input_token_count INTEGER,
    output_token_count INTEGER,
    latency_ms INTEGER,
    attempt INTEGER NOT NULL,
    lease_owner TEXT,
    lease_expires_at_ms INTEGER,
    heartbeat_at_ms INTEGER,
    safe_metadata_ref TEXT,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, invocation_id),
    UNIQUE (agent_id, run_id, attempt)
  )`);
  void database.run(sql`CREATE INDEX IF NOT EXISTS agent_model_invocations_run_status_idx
    ON agent_model_invocations (agent_id, run_id, status)`);
}

function ensureScheduleTables(database: AgentStorageDatabase): void {
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_schedules (
    agent_id TEXT NOT NULL,
    schedule_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    thread_key TEXT,
    normalized_thread_key TEXT,
    installation_id TEXT,
    callback_identity TEXT,
    runtime_schedule_id TEXT,
    schedule_spec TEXT NOT NULL,
    schedule_kind TEXT NOT NULL,
    interval_seconds INTEGER,
    overlap_policy TEXT NOT NULL,
    status TEXT NOT NULL,
    next_fire_at_ms INTEGER,
    last_fire_at_ms INTEGER,
    last_fire_tick_id TEXT,
    last_fire_status TEXT,
    last_event_id TEXT,
    last_run_id TEXT,
    idempotency_key TEXT NOT NULL,
    created_by_principal_id TEXT,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    cancelled_at_ms INTEGER,
    cancel_reason TEXT,
    cancelled_by_principal_id TEXT,
    audit_event_id TEXT,
    active_fire_started_at_ms INTEGER,
    queued_fire_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (agent_id, schedule_id),
    UNIQUE (agent_id, idempotency_key),
    UNIQUE (agent_id, runtime_schedule_id)
  )`);
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_schedule_fires (
    agent_id TEXT NOT NULL,
    schedule_id TEXT NOT NULL,
    tick_id TEXT NOT NULL,
    fire_at_ms INTEGER NOT NULL,
    idempotency_key TEXT NOT NULL,
    status TEXT NOT NULL,
    event_id TEXT,
    run_id TEXT,
    reason TEXT,
    observed_at_ms INTEGER NOT NULL,
    completed_at_ms INTEGER,
    PRIMARY KEY (agent_id, schedule_id, tick_id),
    UNIQUE (agent_id, idempotency_key)
  )`);
  void database.run(sql`CREATE INDEX IF NOT EXISTS agent_schedules_thread_status_next_fire_idx
    ON agent_schedules (agent_id, thread_id, status, next_fire_at_ms)`);
  void database.run(sql`CREATE INDEX IF NOT EXISTS agent_schedules_installation_status_idx
    ON agent_schedules (agent_id, installation_id, status)`);
}

function ensureCompactionAndHistoryTables(database: AgentStorageDatabase): void {
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_thread_compactions (
    agent_id TEXT NOT NULL,
    compaction_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    section_id TEXT NOT NULL,
    compaction_ordinal INTEGER NOT NULL,
    section_ordinal INTEGER NOT NULL,
    status TEXT NOT NULL,
    start_thread_sequence INTEGER NOT NULL,
    end_thread_sequence INTEGER NOT NULL,
    handoff_ref TEXT,
    history_ref TEXT,
    memory_delta_ref TEXT,
    output_ref TEXT,
    digest_sha256 TEXT,
    provenance_ref TEXT,
    archive_ref TEXT,
    r2_object_ref TEXT,
    error_code TEXT,
    error_message TEXT,
    started_at_ms INTEGER,
    completed_at_ms INTEGER,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, compaction_id),
    UNIQUE (agent_id, thread_id, section_id),
    UNIQUE (agent_id, thread_id, compaction_ordinal)
  )`);
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_history_indexes (
    agent_id TEXT NOT NULL,
    history_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    section_id TEXT,
    compaction_id TEXT,
    history_ref TEXT NOT NULL,
    summary TEXT,
    body_ref TEXT,
    body_content_type TEXT,
    body_byte_size INTEGER,
    body_sha256 TEXT,
    body_storage_class TEXT,
    provenance_ref TEXT,
    query_text TEXT,
    start_thread_sequence INTEGER NOT NULL,
    end_thread_sequence INTEGER NOT NULL,
    retention_status TEXT NOT NULL DEFAULT 'active',
    created_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, history_id),
    UNIQUE (agent_id, history_ref)
  )`);
}

function ensureThreadMemoryTables(database: AgentStorageDatabase): void {
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_thread_memory_versions (
    agent_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    memory_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    status TEXT NOT NULL,
    memory_ref TEXT,
    snapshot_ref TEXT,
    latest_compaction_id TEXT,
    rebase_status TEXT,
    item_count INTEGER NOT NULL DEFAULT 0,
    provenance_ref TEXT,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, thread_id, memory_id),
    UNIQUE (agent_id, thread_id, version)
  )`);
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_thread_memory_items (
    agent_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    memory_id TEXT NOT NULL,
    memory_item_id TEXT NOT NULL,
    status TEXT NOT NULL,
    content_ref TEXT,
    content_text TEXT,
    content_sha256 TEXT,
    provenance_ref TEXT,
    source_compaction_id TEXT,
    source_history_id TEXT,
    source_event_id TEXT,
    supersedes_item_id TEXT,
    invalidates_item_id TEXT,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, thread_id, memory_id, memory_item_id)
  )`);
}

function ensureAgentMemoryTables(database: AgentStorageDatabase): void {
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_memory_versions (
    agent_id TEXT NOT NULL,
    memory_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    status TEXT NOT NULL,
    memory_ref TEXT,
    snapshot_ref TEXT,
    latest_compaction_id TEXT,
    rebase_status TEXT,
    item_count INTEGER NOT NULL DEFAULT 0,
    provenance_ref TEXT,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, memory_id),
    UNIQUE (agent_id, version)
  )`);
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_memory_items (
    agent_id TEXT NOT NULL,
    memory_id TEXT NOT NULL,
    memory_item_id TEXT NOT NULL,
    status TEXT NOT NULL,
    content_ref TEXT,
    content_text TEXT,
    content_sha256 TEXT,
    provenance_ref TEXT,
    source_compaction_id TEXT,
    source_history_id TEXT,
    source_event_id TEXT,
    supersedes_item_id TEXT,
    invalidates_item_id TEXT,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, memory_id, memory_item_id)
  )`);
}

function ensureArchiveAndObjectReferenceTables(database: AgentStorageDatabase): void {
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_archive_segments (
    agent_id TEXT NOT NULL,
    archive_id TEXT NOT NULL,
    archive_type TEXT NOT NULL,
    thread_id TEXT,
    section_id TEXT,
    start_thread_sequence INTEGER,
    end_thread_sequence INTEGER,
    summary TEXT,
    r2_object_ref TEXT NOT NULL,
    digest_sha256 TEXT NOT NULL,
    byte_size INTEGER,
    retention_status TEXT NOT NULL,
    provenance_ref TEXT,
    created_at_ms INTEGER NOT NULL,
    expires_at_ms INTEGER,
    PRIMARY KEY (agent_id, archive_id)
  )`);
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_r2_object_references (
    agent_id TEXT NOT NULL,
    object_ref TEXT NOT NULL,
    object_key TEXT NOT NULL,
    bucket_binding TEXT NOT NULL,
    owner_kind TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    thread_id TEXT,
    content_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
    sha256 TEXT NOT NULL,
    storage_class TEXT NOT NULL,
    status TEXT NOT NULL,
    retention_status TEXT NOT NULL,
    provenance_ref TEXT,
    created_at_ms INTEGER NOT NULL,
    deleted_at_ms INTEGER,
    PRIMARY KEY (agent_id, object_ref),
    UNIQUE (agent_id, object_key)
  )`);
}

function ensureStage4StorageIndexes(database: AgentStorageDatabase): void {
  void database.run(sql`CREATE INDEX IF NOT EXISTS agent_thread_compactions_thread_status_ordinal_idx
    ON agent_thread_compactions (agent_id, thread_id, status, compaction_ordinal)`);
  void database.run(sql`CREATE INDEX IF NOT EXISTS agent_history_indexes_thread_created_idx
    ON agent_history_indexes (agent_id, thread_id, created_at_ms)`);
  void database.run(sql`CREATE INDEX IF NOT EXISTS agent_history_indexes_compaction_idx
    ON agent_history_indexes (agent_id, compaction_id)`);
  void database.run(sql`CREATE INDEX IF NOT EXISTS agent_thread_memory_versions_active_idx
    ON agent_thread_memory_versions (agent_id, thread_id, status)`);
  void database.run(sql`CREATE INDEX IF NOT EXISTS agent_thread_memory_items_active_idx
    ON agent_thread_memory_items (agent_id, thread_id, memory_id, status)`);
  void database.run(sql`CREATE INDEX IF NOT EXISTS agent_memory_versions_status_idx
    ON agent_memory_versions (agent_id, status)`);
  void database.run(sql`CREATE INDEX IF NOT EXISTS agent_memory_items_active_idx
    ON agent_memory_items (agent_id, memory_id, status)`);
  void database.run(sql`CREATE INDEX IF NOT EXISTS agent_archive_segments_thread_range_idx
    ON agent_archive_segments (agent_id, thread_id, start_thread_sequence)`);
  void database.run(sql`CREATE INDEX IF NOT EXISTS agent_r2_object_references_owner_idx
    ON agent_r2_object_references (agent_id, owner_kind, owner_id)`);
}
