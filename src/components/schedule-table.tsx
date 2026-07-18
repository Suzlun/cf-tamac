import { DataTable } from './data-table';
import { EmptyState } from './empty-state';
import { describeScheduleType } from './schedule-detail-content';
import { Button } from './ui/button';

interface ScheduleSummary {
  readonly scheduleId: string;
  readonly status: string;
  readonly threadId?: string;
  readonly threadKey?: string;
  readonly scheduleSpec?: string;
  readonly overlapPolicy?: string;
  readonly nextFireAtUnixMs?: string;
}

interface ScheduleTableProps {
  readonly schedules: readonly ScheduleSummary[];
  readonly pending: boolean;
  readonly terminalStatuses: ReadonlySet<string>;
  readonly onView: (schedule: ScheduleSummary) => void;
  readonly onCancel: (scheduleId: string) => void;
}

/**
 * Schedule list table を表示する。
 *
 * @param schedules - Browser-safe Schedule rows。
 * @param pending - mutation 中に action controls を無効化する flag。
 * @param terminalStatuses - cancel を許可しない terminal status set。
 * @param onView - View button click を親へ通知する callback。
 * @param onCancel - Cancel button click を親へ通知する callback。
 * @returns Schedule table または empty state。
 */
export function ScheduleTable({
  schedules,
  pending,
  terminalStatuses,
  onView,
  onCancel,
}: ScheduleTableProps) {
  if (schedules.length === 0) {
    return (
      <EmptyState
        eyebrow="NO SCHEDULES"
        heading="No Schedules yet."
        lead="Create a Schedule to fire future schedule.triggered Events into a Thread."
      />
    );
  }

  return (
    <DataTable
      ariaLabel="Schedules"
      headers={['Schedule ID', 'Thread', 'Type', 'Overlap', 'Next fire', 'Status', 'Actions']}
      rows={schedules.map((schedule) => [
        schedule.scheduleId,
        schedule.threadKey ?? schedule.threadId ?? '—',
        describeScheduleType(schedule.scheduleSpec),
        schedule.overlapPolicy ?? '—',
        schedule.nextFireAtUnixMs ?? '—',
        schedule.status,
        <div key={`actions-${schedule.scheduleId}`} className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onView(schedule);
            }}
          >
            View
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              onCancel(schedule.scheduleId);
            }}
            disabled={pending || terminalStatuses.has(schedule.status)}
            aria-disabled={pending || terminalStatuses.has(schedule.status)}
          >
            Cancel
          </Button>
        </div>,
      ])}
    />
  );
}
