'use client';

import Link from 'next/link';
import { useState } from 'react';

import { AgentToken } from './agent-token';
import { ConfirmDialog } from './confirm-dialog';
import { ControlRoomFrame } from './control-room-frame';
import { DetailDrawer } from './detail-drawer';
import { ErrorAlert } from './error-alert';
import { generateIdempotencyKey } from './generate-idempotency-key';
import { PaginationBar } from './pagination-bar';
import { ScheduleCreateForm } from './schedule-create-form';
import { ScheduleDetailContent } from './schedule-detail-content';
import { ScheduleTable } from './schedule-table';
import { Button } from './ui/button';

import type {
  BrowserSafeAgentRpcResult,
  BrowserSafeOperationDisplayData,
} from './schemas/browser-safe-result';

interface PageInfo {
  readonly nextPageToken?: string;
  readonly resultCount: number;
  readonly cursorScope?: string;
}

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

interface ThreadSummary {
  readonly threadId: string;
  readonly threadKey: string;
  readonly status?: string;
}

interface ScheduleListProps {
  readonly agentId: string;
  readonly schedules: readonly ScheduleSummary[];
  readonly page: PageInfo;
  readonly threads: readonly ThreadSummary[];
  readonly threadFilter: string;
  readonly statusFilter: string;
  readonly actingOperatorId: string;
  readonly onCreateSchedule: (
    agentId: string,
    idempotencyKey: string,
    threadId: string,
    scheduleSpec: string,
    overlapPolicy: string
  ) => Promise<BrowserSafeScheduleActionResult>;
  readonly onCancelSchedule: (
    agentId: string,
    scheduleId: string,
    idempotencyKey: string,
    reason: string
  ) => Promise<BrowserSafeScheduleActionResult>;
}

type BrowserSafeScheduleActionResult = BrowserSafeAgentRpcResult<
  BrowserSafeOperationDisplayData & { readonly data?: ScheduleSummary }
>;

interface PendingScheduleCreate {
  readonly idempotencyKey: string;
  readonly threadId: string;
  readonly scheduleSpec: string;
  readonly overlapPolicy: string;
}

const TERMINAL_SCHEDULE_STATUSES = new Set(['cancelled', 'completed', 'failed']);

/**
 * Schedule 一覧、作成 panel、詳細 drawer、取消 confirmation を提供する。
 *
 * @param agentId - 現在表示している Agent ID。すべての Server Action 呼び出しはこの ID に scope される。
 * @param schedules - Agent RPC から server-side で取得済みの Browser-safe Schedule rows。
 * @param page - Agent-scoped cursor pagination metadata。opaque token は復号せず link にだけ渡す。
 * @param threads - Schedule 作成時に選択できる Thread rows。
 * @param threadFilter - 現在の Thread filter。pagination/filter link に維持する。
 * @param statusFilter - 現在の Schedule status filter。pagination/filter link に維持する。
 * @param actingOperatorId - mutation confirmation で表示する server-derived operator ID。
 * @param onCreateSchedule - CreateSchedule を実行する Server Action。
 * @param onCancelSchedule - CancelSchedule を実行する Server Action。
 * @returns Schedule management tab の Client Component。
 */
export function ScheduleList({
  agentId,
  schedules,
  page,
  threads,
  threadFilter,
  statusFilter,
  actingOperatorId,
  onCreateSchedule,
  onCancelSchedule,
}: ScheduleListProps) {
  // 作成 panel、詳細 drawer、mutation dialog は UI 状態だけを保持し、Agent domain data は永続化しない。
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<ScheduleSummary | undefined>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState<string | undefined>();
  const [createDraft, setCreateDraft] = useState<PendingScheduleCreate | undefined>();
  const [cancelScheduleId, setCancelScheduleId] = useState<string | undefined>();

  // 作成操作は親から渡された Server Action だけに委譲し、browser から Agent RPC を直接組み立てない。
  const handleCreate = (
    idempotencyKey: string,
    threadId: string,
    scheduleSpec: string,
    overlapPolicy: string
  ): Promise<void> => {
    setError(undefined);
    setSuccess(undefined);
    setCreateDraft({ idempotencyKey, threadId, scheduleSpec, overlapPolicy });
    return Promise.resolve();
  };

  // 作成 mutation は acting user を表示する ConfirmDialog の承認後にだけ Server Action へ送る。
  const handleConfirmCreate = () =>
    confirmScheduleCreate({
      agentId,
      createDraft,
      onCreateSchedule,
      setCreateDraft,
      setError,
      setPending,
      setShowCreate,
      setSuccess,
    });

  // 取消操作は ConfirmDialog の明示 confirmation 後だけ実行する。
  const handleCancel = () =>
    cancelScheduleFromUi({
      agentId,
      cancelScheduleId,
      onCancelSchedule,
      setCancelScheduleId,
      setError,
      setPending,
      setSelected,
      setSuccess,
    });

  return (
    <ScheduleListContent
      agentId={agentId}
      schedules={schedules}
      page={page}
      threads={threads}
      threadFilter={threadFilter}
      statusFilter={statusFilter}
      actingOperatorId={actingOperatorId}
      showCreate={showCreate}
      selected={selected}
      pending={pending}
      error={error}
      success={success}
      createDraft={createDraft}
      cancelScheduleId={cancelScheduleId}
      onToggleCreate={() => {
        setShowCreate((previous) => !previous);
      }}
      onHideCreate={() => {
        setShowCreate(false);
      }}
      onCreate={handleCreate}
      onSetError={setError}
      onClearCreateDraft={() => {
        setCreateDraft(undefined);
      }}
      onView={setSelected}
      onRequestCancel={setCancelScheduleId}
      onClearSelected={() => {
        setSelected(undefined);
      }}
      onConfirmCreate={handleConfirmCreate}
      onConfirmCancel={handleCancel}
    />
  );
}

interface ConfirmScheduleCreateInput {
  readonly agentId: string;
  readonly createDraft?: PendingScheduleCreate;
  readonly onCreateSchedule: ScheduleListProps['onCreateSchedule'];
  readonly setCreateDraft: (value: PendingScheduleCreate | undefined) => void;
  readonly setError: (value: string | undefined) => void;
  readonly setPending: (value: boolean) => void;
  readonly setShowCreate: (value: boolean) => void;
  readonly setSuccess: (value: string | undefined) => void;
}

async function confirmScheduleCreate(input: ConfirmScheduleCreateInput): Promise<void> {
  if (input.createDraft === undefined) {
    return;
  }
  input.setPending(true);
  try {
    const result = await input.onCreateSchedule(
      input.agentId,
      input.createDraft.idempotencyKey,
      input.createDraft.threadId,
      input.createDraft.scheduleSpec,
      input.createDraft.overlapPolicy
    );
    if (result.safeStatus === 'failed' || result.displayData.data === undefined) {
      input.setError(result.displayData.message);
      return;
    }
    input.setSuccess(result.displayData.message);
    input.setShowCreate(false);
    input.setCreateDraft(undefined);
  } catch {
    input.setError(
      'スケジュールの状態は直前の確定値を保持しています。時間をおいてもう一度実行してください。'
    );
  } finally {
    input.setPending(false);
  }
}

interface CancelScheduleInput {
  readonly agentId: string;
  readonly cancelScheduleId?: string;
  readonly onCancelSchedule: ScheduleListProps['onCancelSchedule'];
  readonly setCancelScheduleId: (value: string | undefined) => void;
  readonly setError: (value: string | undefined) => void;
  readonly setPending: (value: boolean) => void;
  readonly setSelected: (value: ScheduleSummary | undefined) => void;
  readonly setSuccess: (value: string | undefined) => void;
}

async function cancelScheduleFromUi(input: CancelScheduleInput): Promise<void> {
  if (input.cancelScheduleId === undefined) {
    return;
  }
  input.setPending(true);
  try {
    const result = await input.onCancelSchedule(
      input.agentId,
      input.cancelScheduleId,
      generateIdempotencyKey(),
      'cancelled from UI'
    );
    if (result.safeStatus === 'failed') {
      input.setError(result.displayData.message);
      return;
    }
    input.setSuccess(result.displayData.message);
    input.setCancelScheduleId(undefined);
    input.setSelected(undefined);
  } catch {
    input.setError(
      'スケジュールの状態は直前の確定値を保持しています。時間をおいてもう一度実行してください。'
    );
  } finally {
    input.setPending(false);
  }
}

interface ScheduleListContentProps {
  readonly agentId: string;
  readonly schedules: readonly ScheduleSummary[];
  readonly page: PageInfo;
  readonly threads: readonly ThreadSummary[];
  readonly threadFilter: string;
  readonly statusFilter: string;
  readonly actingOperatorId: string;
  readonly showCreate: boolean;
  readonly selected?: ScheduleSummary;
  readonly pending: boolean;
  readonly error?: string;
  readonly success?: string;
  readonly createDraft?: PendingScheduleCreate;
  readonly cancelScheduleId?: string;
  readonly onToggleCreate: () => void;
  readonly onHideCreate: () => void;
  readonly onCreate: (
    idempotencyKey: string,
    threadId: string,
    scheduleSpec: string,
    overlapPolicy: string
  ) => Promise<void>;
  readonly onSetError: (message: string) => void;
  readonly onClearCreateDraft: () => void;
  readonly onView: (schedule: ScheduleSummary) => void;
  readonly onRequestCancel: (scheduleId: string | undefined) => void;
  readonly onClearSelected: () => void;
  readonly onConfirmCreate: () => Promise<void>;
  readonly onConfirmCancel: () => Promise<void>;
}

function ScheduleListContent({
  agentId,
  schedules,
  page,
  threads,
  threadFilter,
  statusFilter,
  actingOperatorId,
  showCreate,
  selected,
  pending,
  error,
  success,
  createDraft,
  cancelScheduleId,
  onToggleCreate,
  onHideCreate,
  onCreate,
  onSetError,
  onClearCreateDraft,
  onView,
  onRequestCancel,
  onClearSelected,
  onConfirmCreate,
  onConfirmCancel,
}: ScheduleListContentProps) {
  return (
    <ControlRoomFrame title={`Agent registry › ${agentId}`} signalLabel="schedules">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Schedules</p>
      <h2>Agent-owned Schedules</h2>
      <AgentToken agentId={agentId} />

      <ScheduleFilterBar
        agentId={agentId}
        threadFilter={threadFilter}
        statusFilter={statusFilter}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="default"
          onClick={onToggleCreate}
          disabled={pending}
          aria-expanded={showCreate}
        >
          {showCreate ? 'Hide form' : 'New Schedule'}
        </Button>
      </div>

      {error !== undefined ? <ErrorAlert title="Schedule mutation failed" message={error} /> : null}
      {success !== undefined ? (
        <div
          className="rounded-md border border-primary/50 bg-primary/10 px-3 py-2 text-sm"
          role="status"
        >
          {success}
        </div>
      ) : null}

      {showCreate ? (
        <ScheduleCreateForm
          threads={threads}
          pending={pending}
          onCreate={onCreate}
          onCancel={onHideCreate}
          onError={onSetError}
        />
      ) : null}

      {/* ScheduleTable は Agent RPC の overlap_policy を Browser-safe overlapPolicy として表示する。 */}
      <ScheduleTable
        schedules={schedules}
        pending={pending}
        terminalStatuses={TERMINAL_SCHEDULE_STATUSES}
        onView={onView}
        onCancel={onRequestCancel}
      />

      <PaginationBar
        basePath={`/agents/${agentId}/schedules`}
        page={page}
        extraQuery={{ thread: threadFilter, status: statusFilter }}
      />

      <DetailDrawer open={selected !== undefined} title="Schedule detail" onClose={onClearSelected}>
        {selected === undefined ? null : (
          <ScheduleDetailContent
            schedule={selected}
            pending={pending}
            terminal={TERMINAL_SCHEDULE_STATUSES.has(selected.status)}
            onCancel={() => {
              onRequestCancel(selected.scheduleId);
            }}
          />
        )}
      </DetailDrawer>

      <ScheduleMutationDialogs
        createDraft={createDraft}
        cancelScheduleId={cancelScheduleId}
        actingOperatorId={actingOperatorId}
        pending={pending}
        onConfirmCreate={onConfirmCreate}
        onClearCreateDraft={onClearCreateDraft}
        onConfirmCancel={onConfirmCancel}
        onRequestCancel={onRequestCancel}
      />
    </ControlRoomFrame>
  );
}

function ScheduleMutationDialogs({
  createDraft,
  cancelScheduleId,
  actingOperatorId,
  pending,
  onConfirmCreate,
  onClearCreateDraft,
  onConfirmCancel,
  onRequestCancel,
}: {
  readonly createDraft?: PendingScheduleCreate;
  readonly cancelScheduleId?: string;
  readonly actingOperatorId: string;
  readonly pending: boolean;
  readonly onConfirmCreate: () => Promise<void>;
  readonly onClearCreateDraft: () => void;
  readonly onConfirmCancel: () => Promise<void>;
  readonly onRequestCancel: (scheduleId: string | undefined) => void;
}) {
  return (
    <>
      <ConfirmDialog
        open={createDraft !== undefined}
        heading="Create Schedule?"
        confirmLabel="Create Schedule"
        onConfirm={onConfirmCreate}
        onCancel={onClearCreateDraft}
        pending={pending}
      >
        <p>This Schedule will fire a schedule.triggered Event into the selected Thread.</p>
        <p aria-live="polite">Acting user: {actingOperatorId}.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={cancelScheduleId !== undefined}
        heading={`Cancel Schedule ${cancelScheduleId ?? ''}?`}
        confirmLabel="Cancel Schedule"
        onConfirm={onConfirmCancel}
        onCancel={() => {
          onRequestCancel(undefined);
        }}
        pending={pending}
      >
        <p>Future firings will be prevented. Already-pending Runs are not cancelled.</p>
        <p aria-live="polite">Acting user: {actingOperatorId}.</p>
      </ConfirmDialog>
    </>
  );
}

function ScheduleFilterBar({
  agentId,
  threadFilter,
  statusFilter,
}: {
  readonly agentId: string;
  readonly threadFilter: string;
  readonly statusFilter: string;
}) {
  const statuses = ['all', 'active', 'pending', 'paused', 'cancelled', 'completed', 'failed'];
  return (
    <section
      className="rounded-md border bg-card p-4 text-sm space-y-1"
      aria-label="Schedule filters"
    >
      <div className="flex flex-wrap gap-2" aria-live="polite">
        {statuses.map((status) => (
          <Link
            key={status}
            className={`inline-flex items-center rounded-md border px-3 py-1.5 text-sm hover:bg-accent ${statusFilter === status ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
            href={`/agents/${agentId}/schedules?status=${status}&thread=${threadFilter}`}
            aria-pressed={statusFilter === status}
          >
            {status}
          </Link>
        ))}
      </div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Thread filter: {threadFilter === '' ? 'all' : threadFilter}
      </p>
    </section>
  );
}
