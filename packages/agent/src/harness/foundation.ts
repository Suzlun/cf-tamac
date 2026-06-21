/**
 * Foundation harness stage names before model execution is implemented.
 */
export const harnessStages = ['accept_event', 'schedule_run', 'process_pending_runs'] as const;

/**
 * Harness stage value.
 */
export type HarnessStage = (typeof harnessStages)[number];
