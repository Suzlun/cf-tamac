/**
 * Agent DO SQLite table definition metadata used by tests and governance checks.
 */
export interface AgentFoundationTableDefinition {
  readonly tableName: string;
  readonly purpose: string;
  readonly uniqueKeys: readonly string[];
}

/**
 * Agent DO SQLite foundation table definitions.
 */
export const agentFoundationTableDefinitions = [
  {
    tableName: 'agent_profile',
    purpose: 'Agent aggregate lifecycle profile',
    uniqueKeys: ['agent_id'],
  },
  {
    tableName: 'agent_credentials',
    purpose: 'Agent access credential references and status',
    uniqueKeys: ['agent_id, credential_id'],
  },
  {
    tableName: 'agent_principals',
    purpose: 'Agent principal grants and authorization seeds',
    uniqueKeys: ['agent_id, principal_id'],
  },
  {
    tableName: 'agent_request_nonces',
    purpose: 'Replay protection nonce ledger',
    uniqueKeys: ['agent_id, nonce'],
  },
  {
    tableName: 'agent_idempotency_records',
    purpose: 'Command idempotency ledger',
    uniqueKeys: ['agent_id, idempotency_key'],
  },
  {
    tableName: 'agent_audit_events',
    purpose: 'Agent audit event ledger',
    uniqueKeys: ['agent_id, audit_id'],
  },
  {
    tableName: 'agent_rate_limit_buckets',
    purpose: 'Agent scoped rate-limit counters',
    uniqueKeys: ['agent_id, bucket_key'],
  },
  {
    tableName: 'agent_threads',
    purpose: 'Agent scoped normalized thread identity',
    uniqueKeys: ['agent_id, normalized_thread_key'],
  },
  {
    tableName: 'agent_thread_sections',
    purpose: 'Thread section ordering foundation',
    uniqueKeys: ['agent_id, thread_id, section_id'],
  },
  {
    tableName: 'agent_events',
    purpose: 'Accepted Agent event source of truth',
    uniqueKeys: ['agent_id, event_id'],
  },
  {
    tableName: 'agent_runs',
    purpose: 'Pending and processed Agent run state',
    uniqueKeys: ['agent_id, run_id'],
  },
  {
    tableName: 'agent_run_inputs',
    purpose: 'Run input snapshot metadata',
    uniqueKeys: ['agent_id, run_id'],
  },
  {
    tableName: 'agent_scheduler_wake_state',
    purpose: 'Agent-local Queue wake coalescing state',
    uniqueKeys: ['agent_id'],
  },
] as const satisfies readonly AgentFoundationTableDefinition[];

/**
 * Thread identity table contract used by schema and tests.
 */
export const agentThreadsTableContract = {
  tableName: 'agent_threads',
  rawThreadKeyColumn: 'thread_key',
  normalizedThreadKeyColumn: 'normalized_thread_key',
  normalizedThreadKeyMaxUtf8Bytes: 512,
  uniqueAgentThreadKey: 'agent_id, normalized_thread_key',
} as const;
