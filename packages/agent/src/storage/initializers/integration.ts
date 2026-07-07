import { sql } from 'drizzle-orm';

import type { AgentStorageDatabase } from '../database';

/**
 * Stage 7 Integration / Adapter / Delivery 用の Agent-owned SQLite tables を作成します。
 *
 * @param database AIAgent Durable Object の Drizzle Durable SQLite database です。
 * @remarks
 * Durable Object 起動時の table creation だけは SQL を直接記述します。通常の読み書きは
 * `AgentIntegrationsRepository` の Drizzle query builder に閉じ、上位 layer へ Drizzle import を漏らしません。
 * @returns 作成処理に成功した場合は値を返しません。
 * @throws SQLite table creation が失敗した場合に呼び出し元へ伝播します。
 * @example
 * ```ts
 * ensureAgentIntegrationTables(database);
 * ```
 */
export function ensureAgentIntegrationTables(database: AgentStorageDatabase): void {
  ensureInstallationTables(database);
  ensureAdapterTables(database);
  ensureDeliveryTables(database);
}

function ensureInstallationTables(database: AgentStorageDatabase): void {
  // Installation 本体は manifest 検証後の lifecycle と trust 参照を保持します。
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_integration_installations (
    agent_id TEXT NOT NULL,
    installation_id TEXT NOT NULL,
    integration_id TEXT NOT NULL,
    status TEXT NOT NULL,
    provider_id TEXT,
    manifest_ref TEXT,
    manifest_digest_sha256 TEXT,
    allowed_model_policy_refs TEXT,
    model_policy_grant_ref TEXT,
    schema_version TEXT,
    provider_base_url TEXT,
    public_key_ref TEXT,
    grant_summary_ref TEXT,
    setup_instructions_ref TEXT,
    installed_at_ms INTEGER,
    updated_at_ms INTEGER,
    PRIMARY KEY (agent_id, installation_id),
    UNIQUE (agent_id, integration_id)
  )`);
  // Definition summary は UI と final authorization が外部 payload を読まずに概要確認できるよう保存します。
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_integration_definitions (
    agent_id TEXT NOT NULL,
    integration_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    manifest_ref TEXT,
    adapter_count INTEGER NOT NULL,
    tool_count INTEGER NOT NULL,
    delivery_capability_count INTEGER NOT NULL,
    PRIMARY KEY (agent_id, integration_id)
  )`);
  // Integration grants は Agent-local grant と別に manifest provenance を保持する監査用 ledger です。
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_integration_grants (
    agent_id TEXT NOT NULL,
    grant_id TEXT NOT NULL,
    installation_id TEXT NOT NULL,
    grant_type TEXT NOT NULL,
    scope TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, grant_id),
    UNIQUE (agent_id, installation_id, scope)
  )`);
  // Provider trust key は detached signature 検証に必要な公開鍵 material または参照を保持します。
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_installation_trust_keys (
    agent_id TEXT NOT NULL,
    trust_key_id TEXT NOT NULL,
    installation_id TEXT NOT NULL,
    key_id TEXT NOT NULL,
    algorithm TEXT NOT NULL,
    public_key_ref TEXT NOT NULL,
    public_key_material TEXT,
    status TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    revoked_at_ms INTEGER,
    PRIMARY KEY (agent_id, trust_key_id),
    UNIQUE (agent_id, installation_id, key_id)
  )`);
}

function ensureAdapterTables(database: AgentStorageDatabase): void {
  // Adapter definition は Provider protocol を持ち込まず、正規化済み ingress capability だけを保存します。
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_integration_adapters (
    agent_id TEXT NOT NULL,
    installation_id TEXT NOT NULL,
    adapter_id TEXT NOT NULL,
    integration_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    ingress_grant TEXT NOT NULL,
    delivery_capability_id TEXT,
    allowed_model_policy_refs TEXT,
    model_policy_grant_ref TEXT,
    schema_ref TEXT,
    status TEXT NOT NULL,
    PRIMARY KEY (agent_id, installation_id, adapter_id)
  )`);
  // Connection は Agent-local に有効化・無効化され、future ingress rejection の根拠になります。
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_adapter_connections (
    agent_id TEXT NOT NULL,
    connection_id TEXT NOT NULL,
    installation_id TEXT NOT NULL,
    adapter_id TEXT NOT NULL,
    status TEXT NOT NULL,
    connection_key TEXT,
    external_subject TEXT,
    grant_summary_ref TEXT,
    delivery_capability_id TEXT,
    allowed_model_policy_refs TEXT,
    model_policy_grant_ref TEXT,
    metadata_ref TEXT,
    created_at_ms INTEGER NOT NULL,
    disabled_at_ms INTEGER,
    PRIMARY KEY (agent_id, connection_id)
  )`);
  void database.run(sql`CREATE INDEX IF NOT EXISTS agent_adapter_connections_installation_status_idx
    ON agent_adapter_connections (agent_id, installation_id, status)`);
}

function ensureDeliveryTables(database: AgentStorageDatabase): void {
  // DeliveryContext は ingress Event と Connection へ bind された応答 capability です。
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_delivery_contexts (
    agent_id TEXT NOT NULL,
    delivery_context_id TEXT NOT NULL,
    installation_id TEXT NOT NULL,
    connection_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    capability TEXT NOT NULL,
    status TEXT NOT NULL,
    metadata_ref TEXT,
    model_policy_ref TEXT,
    model_policy_digest TEXT,
    created_at_ms INTEGER NOT NULL,
    expires_at_ms INTEGER,
    PRIMARY KEY (agent_id, delivery_context_id)
  )`);
  // AdapterDelivery は Agent-to-Provider Delivery RPC の digest、因果 link、結果 callback を追跡します。
  void database.run(sql`CREATE TABLE IF NOT EXISTS agent_adapter_deliveries (
    agent_id TEXT NOT NULL,
    delivery_id TEXT NOT NULL,
    installation_id TEXT NOT NULL,
    connection_id TEXT NOT NULL,
    delivery_context_id TEXT NOT NULL,
    run_id TEXT,
    event_id TEXT,
    status TEXT NOT NULL,
    request_payload_ref TEXT,
    request_digest TEXT,
    provider_operation_id TEXT,
    provider_target_ref TEXT,
    idempotency_key TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (agent_id, delivery_id)
  )`);
  void database.run(sql`CREATE INDEX IF NOT EXISTS agent_delivery_contexts_installation_status_idx
    ON agent_delivery_contexts (agent_id, installation_id, status)`);
  void database.run(sql`CREATE INDEX IF NOT EXISTS agent_adapter_deliveries_context_idx
    ON agent_adapter_deliveries (agent_id, delivery_context_id, status)`);
}
