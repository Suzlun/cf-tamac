interface ScheduleSummary {
  readonly scheduleId: string;
  readonly status: string;
  readonly threadId?: string;
  readonly threadKey?: string;
  readonly scheduleSpec?: string;
  readonly overlapPolicy?: string;
  readonly nextFireAtUnixMs?: string;
  readonly lastFireAtUnixMs?: string;
  readonly cancelledAtUnixMs?: string;
  readonly callbackIdentity?: string;
  readonly createdByPrincipalId?: string;
  readonly auditEventId?: string;
  readonly installationId?: string;
}

interface ScheduleDetailContentProps {
  readonly schedule: ScheduleSummary;
  readonly pending: boolean;
  readonly terminal: boolean;
  readonly onCancel: () => void;
}

/**
 * Schedule detail drawer の本文を表示する。
 *
 * @param schedule - Browser-safe Schedule summary。
 * @param pending - cancel Server Action 実行中に destructive control を無効化する flag。
 * @param terminal - cancel 対象外 status かどうか。
 * @param onCancel - Cancel button click を親へ通知する callback。直接 Agent RPC は呼ばない。
 * @returns Schedule detail drawer content。
 */
export function ScheduleDetailContent({
  schedule,
  pending,
  terminal,
  onCancel,
}: ScheduleDetailContentProps) {
  return (
    <>
      <p className="eyebrow">SCHEDULE DETAIL</p>
      <p>schedule_id: {schedule.scheduleId}</p>
      <p>thread: {schedule.threadKey ?? schedule.threadId ?? '—'}</p>
      <p>status: {schedule.status}</p>
      <p>type: {describeScheduleType(schedule.scheduleSpec)}</p>
      <p>overlap_policy: {schedule.overlapPolicy ?? '—'}</p>
      <p>next_fire_at: {schedule.nextFireAtUnixMs ?? '—'}</p>
      <p>last_fire_at: {schedule.lastFireAtUnixMs ?? '—'}</p>
      <p>cancelled_at: {schedule.cancelledAtUnixMs ?? '—'}</p>
      <section className="readout" aria-label="Schedule server metadata">
        <strong>SERVER METADATA</strong>
        <p>callback_identity: {schedule.callbackIdentity ?? '—'}</p>
        <p>installation_id: {schedule.installationId ?? '—'}</p>
        <p>created_by: {schedule.createdByPrincipalId ?? 'server-derived operator'}</p>
        <p>audit_event_id: {schedule.auditEventId ?? '—'}</p>
      </section>
      <details>
        <summary>View schedule_spec</summary>
        <pre className="form-control">{formatScheduleSpec(schedule.scheduleSpec)}</pre>
      </details>
      <button
        type="button"
        className="nav-link state-error"
        onClick={onCancel}
        disabled={pending || terminal}
        aria-disabled={pending || terminal}
      >
        Cancel Schedule
      </button>
    </>
  );
}

/**
 * Schedule spec JSON から表示用の trigger type label を推定する。
 *
 * @param scheduleSpec - Agent RPC から返る Browser-safe schedule spec string。
 * @returns `interval`、`one-shot`、`custom`、または未設定時の em dash。
 */
export function describeScheduleType(scheduleSpec: string | undefined): string {
  if (scheduleSpec === undefined || scheduleSpec === '') {
    return '—';
  }
  if (scheduleSpec.includes('interval')) {
    return 'interval';
  }
  if (scheduleSpec.includes('one-shot')) {
    return 'one-shot';
  }
  return 'custom';
}

function formatScheduleSpec(scheduleSpec: string | undefined): string {
  if (scheduleSpec === undefined || scheduleSpec === '') {
    return 'metadata only';
  }
  try {
    return JSON.stringify(JSON.parse(scheduleSpec), null, 2);
  } catch {
    return scheduleSpec;
  }
}
