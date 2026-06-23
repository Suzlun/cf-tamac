import { agentIntegrationFoundationTables } from './integration-schema';
import { agentMemoryFoundationTables } from './memory-schema';
import { agentToolFoundationTables } from './tool-schema';

/**
 * SQLite table names owned by each AIAgent Durable Object foundation.
 */
export const agentFoundationTables = [
  'agent_profile',
  'agent_credentials',
  'agent_config_versions',
  'agent_principals',
  'agent_grants',
  'agent_request_nonces',
  'agent_idempotency_records',
  'agent_audit_events',
  'agent_rate_limit_buckets',
  'agent_threads',
  'agent_thread_sections',
  'agent_events',
  'agent_runs',
  'agent_run_inputs',
  'agent_run_interrupts',
  'agent_harness_decision_records',
  'agent_run_budget_ledger',
  'agent_schedules',
  'agent_schedule_fires',
  'agent_scheduler_wake_state',
  ...agentToolFoundationTables,
  ...agentIntegrationFoundationTables,
  ...agentMemoryFoundationTables,
] as const;

/**
 * Agent foundation table name.
 */
export type AgentFoundationTable = (typeof agentFoundationTables)[number];
