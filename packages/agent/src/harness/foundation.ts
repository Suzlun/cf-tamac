/**
 * Foundation harness stage names before model execution is implemented.
 */
export const harnessStages = [
  'accept_event',
  'schedule_run',
  'process_pending_runs',
  'build_context',
  'guard_commit',
  'interpret_decisions',
  'enforce_budget',
] as const;

/**
 * Harness stage value.
 */
export type HarnessStage = (typeof harnessStages)[number];
