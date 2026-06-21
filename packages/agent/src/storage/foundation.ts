/**
 * SQLite table names owned by each AIAgent Durable Object foundation.
 */
export const agentFoundationTables = [
  'agent_profile',
  'agent_credentials',
  'agent_principals',
  'agent_request_nonces',
  'agent_idempotency_records',
  'agent_audit_events',
  'agent_rate_limit_buckets',
  'agent_threads',
  'agent_thread_sections',
  'agent_events',
  'agent_runs',
  'agent_run_inputs',
  'agent_scheduler_wake_state',
] as const;

/**
 * Agent foundation table name.
 */
export type AgentFoundationTable = (typeof agentFoundationTables)[number];
