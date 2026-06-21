/**
 * SQL tag executor exposed by the Cloudflare Agents SDK.
 */
export type AgentSqlExecutor = <T = Record<string, string | number | boolean | null>>(
  strings: TemplateStringsArray,
  ...values: (string | number | boolean | null)[]
) => T[];

/**
 * Ensure all Agent foundation SQLite tables exist for an AIAgent instance.
 */
export function ensureAgentFoundationTables(sql: AgentSqlExecutor): void {
  ensureIdentityAndSecurityTables(sql);
  ensureThreadAndEventTables(sql);
  ensureRunAndWakeTables(sql);
}

function ensureIdentityAndSecurityTables(sql: AgentSqlExecutor): void {
  void sql`CREATE TABLE IF NOT EXISTS agent_profile (
    agent_id TEXT PRIMARY KEY,
    lifecycle_status TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
  )`;
  void sql`CREATE TABLE IF NOT EXISTS agent_credentials (
    agent_id TEXT NOT NULL,
    credential_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, credential_id)
  )`;
  void sql`CREATE TABLE IF NOT EXISTS agent_principals (
    agent_id TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    principal_type TEXT NOT NULL,
    grants_ref TEXT,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, principal_id)
  )`;
  void sql`CREATE TABLE IF NOT EXISTS agent_request_nonces (
    agent_id TEXT NOT NULL,
    nonce TEXT NOT NULL,
    expires_at_ms INTEGER NOT NULL,
    created_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, nonce)
  )`;
  void sql`CREATE TABLE IF NOT EXISTS agent_idempotency_records (
    agent_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_digest TEXT NOT NULL,
    response_ref TEXT,
    created_at_ms INTEGER NOT NULL,
    expires_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, idempotency_key)
  )`;
  void sql`CREATE TABLE IF NOT EXISTS agent_audit_events (
    agent_id TEXT NOT NULL,
    audit_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    principal_ref TEXT,
    request_digest TEXT,
    created_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, audit_id)
  )`;
  void sql`CREATE TABLE IF NOT EXISTS agent_rate_limit_buckets (
    agent_id TEXT NOT NULL,
    bucket_key TEXT NOT NULL,
    window_start_ms INTEGER NOT NULL,
    used INTEGER NOT NULL,
    PRIMARY KEY (agent_id, bucket_key)
  )`;
}

function ensureThreadAndEventTables(sql: AgentSqlExecutor): void {
  void sql`CREATE TABLE IF NOT EXISTS agent_threads (
    agent_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    thread_key TEXT NOT NULL,
    normalized_thread_key TEXT NOT NULL CHECK (normalized_thread_key <> ''),
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, thread_id),
    UNIQUE (agent_id, normalized_thread_key),
    CHECK (length(CAST(normalized_thread_key AS BLOB)) <= 512)
  )`;
  void sql`CREATE TABLE IF NOT EXISTS agent_thread_sections (
    agent_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    section_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, thread_id, section_id),
    UNIQUE (agent_id, thread_id, sequence)
  )`;
  void sql`CREATE TABLE IF NOT EXISTS agent_events (
    agent_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    section_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload_ref TEXT,
    sequence INTEGER NOT NULL,
    created_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, event_id),
    UNIQUE (agent_id, idempotency_key)
  )`;
}

function ensureRunAndWakeTables(sql: AgentSqlExecutor): void {
  void sql`CREATE TABLE IF NOT EXISTS agent_runs (
    agent_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    trigger_event_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, run_id)
  )`;
  void sql`CREATE TABLE IF NOT EXISTS agent_run_inputs (
    agent_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    snapshot_ref TEXT,
    trigger_event_id TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, run_id)
  )`;
  void sql`CREATE TABLE IF NOT EXISTS agent_scheduler_wake_state (
    agent_id TEXT PRIMARY KEY,
    wake_status TEXT NOT NULL,
    pending_count INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
  )`;
}
