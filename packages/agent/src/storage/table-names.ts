import { agentIntegrationFoundationTables } from './schema/integration';
import { agentMemoryFoundationTables } from './schema/memory';
import { agentToolFoundationTables } from './schema/tool';

/**
 * 各 `AIAgent` Durable Object が所有する SQLite table 名の一覧です。
 *
 * @remarks
 * Agent domain snapshot、Event、Run、Schedule、Tool、Integration、Memory の source of truth を
 * Agent-owned storage に閉じるための inventory です。Client D1 や外部 Queue binding の table 名は含めません。
 */
export const agentFoundationTables = [
  'agent_profile',
  'agent_initialization_receipts',
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
 * Agent foundation SQLite table 名の union 型です。
 *
 * @remarks
 * initializer と repository factory が同じ table inventory を参照し、schema drift を文字列の重複で
 * 発生させないために `agentFoundationTables` から導出します。
 */
export type AgentFoundationTable = (typeof agentFoundationTables)[number];
