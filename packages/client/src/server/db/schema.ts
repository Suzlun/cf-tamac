/**
 * Client-owned D1 table metadata.
 */
export interface ClientD1TableDefinition {
  readonly tableName: string;
  readonly purpose: string;
  readonly columns: readonly string[];
}

/**
 * Client D1 table for management registry records.
 */
export const clientManagedAgentsTable = {
  tableName: 'client_managed_agents',
  purpose: 'Client-owned managed Agent registry metadata',
  columns: [
    'agent_id',
    'agent_rpc_origin',
    'display_name',
    'display_order',
    'last_opened_at_ms',
    'created_at_ms',
    'updated_at_ms',
  ],
} as const satisfies ClientD1TableDefinition;

/**
 * Client D1 table for credential secret references only.
 */
export const clientAgentCredentialRefsTable = {
  tableName: 'client_agent_credential_refs',
  purpose: 'Client-owned credential references without secret bodies',
  columns: [
    'agent_id',
    'credential_ref',
    'key_id',
    'public_fingerprint',
    'masked_hint',
    'status',
    'created_at_ms',
    'updated_at_ms',
  ],
} as const satisfies ClientD1TableDefinition;

/**
 * Complete Client D1 management ledger table list.
 */
export const clientD1Tables = [clientManagedAgentsTable, clientAgentCredentialRefsTable] as const;

/**
 * Agent-domain snapshot table names intentionally excluded from Client D1.
 */
export const forbiddenClientAgentSnapshotTables = [
  'agent_events',
  'agent_threads',
  'agent_runs',
  'agent_schedules',
  'agent_tool_invocations',
  'agent_extension_installations',
  'agent_adapter_connections',
  'agent_compactions',
] as const;
