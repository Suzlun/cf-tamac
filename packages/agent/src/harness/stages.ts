/**
 * Agent harness が Run 処理を段階的に監査する stage 名一覧です。
 *
 * @remarks
 * Event acceptance から decision 解釈、budget enforcement までの内部工程を stable な文字列で表します。
 * 公開 RPC surface ではなく Agent-owned audit / runtime 観測用の分類です。
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
 * Agent harness stage の union 型です。
 *
 * @remarks
 * `harnessStages` から導出し、runtime record と test fixture が同じ stage 名だけを扱うようにします。
 */
export type HarnessStage = (typeof harnessStages)[number];
