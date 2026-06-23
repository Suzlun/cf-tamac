'use client';

import Link from 'next/link';
import { useState } from 'react';

import { AgentToken } from './agent-token';
import { ConfirmDialog } from './confirm-dialog';
import { ControlRoomFrame } from './control-room-frame';
import { DataTable } from './data-table';
import { DetailDrawer } from './detail-drawer';
import { EmptyState } from './empty-state';
import { generateIdempotencyKey } from './generate-idempotency-key';
import { PaginationBar } from './pagination-bar';
import { ToolReviewContent } from './tool-review-content';

interface PayloadReference {
  readonly ref: string;
  readonly contentType: string;
  readonly byteSize: string;
  readonly sha256: string;
  readonly storageClass: string;
}

interface PageInfo {
  readonly nextPageToken?: string;
  readonly resultCount: number;
  readonly cursorScope?: string;
}

interface ToolSummary {
  readonly toolId: string;
  readonly displayName: string;
  readonly status: string;
  readonly description?: string;
  readonly installationId?: string;
  readonly approvalRequired?: boolean;
  readonly version?: string;
  readonly toolSetVersion?: string;
  readonly providerTargetRef?: string;
}

interface ToolApproval {
  readonly approvalId: string;
  readonly decision?: string;
  readonly principalId?: string;
  readonly reason?: string;
  readonly auditEventId?: string;
  readonly decidedAtUnixMs?: string;
}

interface ProviderOperation {
  readonly operationId: string;
  readonly installationId?: string;
  readonly providerOperationRef?: string;
  readonly status?: string;
  readonly timeoutAtUnixMs?: string;
}

interface InvocationSummary {
  readonly invocationId: string;
  readonly status: string;
  readonly approvalId?: string;
  readonly attemptCount?: number;
  readonly createdAtUnixMs?: string;
  readonly inputRef?: PayloadReference;
  readonly inputSummary?: string;
  readonly installationId?: string;
  readonly outputRef?: PayloadReference;
  readonly providerOperationId?: string;
  readonly resultEventId?: string;
  readonly riskLevel?: string;
  readonly runId?: string;
  readonly threadId?: string;
  readonly toolId?: string;
  readonly updatedAtUnixMs?: string;
}

interface InvocationDetail extends InvocationSummary {
  readonly approval?: ToolApproval;
  readonly providerOperation?: ProviderOperation;
}

interface ToolViewProps {
  readonly agentId: string;
  readonly tools: readonly ToolSummary[];
  readonly invocations: readonly InvocationSummary[];
  readonly invocationPage: PageInfo;
  readonly statusFilter: string;
  readonly actingOperatorId: string;
  readonly onGetInvocation: (agentId: string, invocationId: string) => Promise<InvocationDetail>;
  readonly onApprove: (
    agentId: string,
    invocationId: string,
    idempotencyKey: string,
    reason: string
  ) => Promise<InvocationSummary>;
  readonly onReject: (
    agentId: string,
    invocationId: string,
    idempotencyKey: string,
    reason: string
  ) => Promise<InvocationSummary>;
}

const TERMINAL_INVOCATION_STATUSES = new Set([
  'approved',
  'rejected',
  'completed',
  'failed',
  'cancelled',
]);

/**
 * Tool catalog と ToolInvocation approval queue を表示する。
 *
 * @param agentId - 現在表示している Agent ID。すべての Tool Server Action はこの ID に scope される。
 * @param tools - Agent RPC から取得済みの Browser-safe Tool catalog。
 * @param invocations - Agent RPC から取得済みの Browser-safe ToolInvocation rows。
 * @param invocationPage - ToolInvocation queue の scoped cursor pagination metadata。
 * @param statusFilter - 現在の invocation status filter。
 * @param actingOperatorId - approve/reject confirmation に表示する server-derived operator ID。
 * @param onGetInvocation - detail drawer 用に invocation detail を取得する Server Action。
 * @param onApprove - explicit confirmation 後に approve を送る Server Action。
 * @param onReject - explicit confirmation 後に reject を送る Server Action。
 * @returns Tool catalog と approval/rejection UI。
 */
export function ToolView({
  agentId,
  tools,
  invocations,
  invocationPage,
  statusFilter,
  actingOperatorId,
  onGetInvocation,
  onApprove,
  onReject,
}: ToolViewProps) {
  // drawer には Browser-safe projection だけを保持し、raw input/output payload を browser へ取得しない。
  const [selected, setSelected] = useState<InvocationDetail | undefined>();
  const [dialogAction, setDialogAction] = useState<'approve' | 'reject' | undefined>();
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  // row click 時に detail Server Action を呼び、input summary/risk/result metadata を drawer に投影する。
  const openInvocation = async (invocation: InvocationSummary) => {
    setPending(true);
    setError(undefined);
    try {
      const detail = await onGetInvocation(agentId, invocation.invocationId);
      setSelected(detail);
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : 'Tool invocation detail failed.');
      setSelected(invocation);
    } finally {
      setPending(false);
    }
  };

  // approve/reject は final ConfirmDialog の後だけ Server Action へ委譲する。
  const handleConfirm = async () => {
    if (selected === undefined || dialogAction === undefined) {
      return;
    }
    setPending(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      await executeApprovalAction(
        dialogAction,
        agentId,
        selected.invocationId,
        onApprove,
        onReject
      );
      setSuccess(`Invocation ${selected.invocationId} ${dialogAction}d.`);
      setDialogAction(undefined);
      setSelected(undefined);
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : `${dialogAction} failed.`);
    } finally {
      setPending(false);
    }
  };

  return (
    <ToolViewContent
      agentId={agentId}
      tools={tools}
      invocations={invocations}
      invocationPage={invocationPage}
      statusFilter={statusFilter}
      actingOperatorId={actingOperatorId}
      selected={selected}
      dialogAction={dialogAction}
      pending={pending}
      success={success}
      error={error}
      onReview={(invocation) => {
        void openInvocation(invocation);
      }}
      onClearSelected={() => {
        setSelected(undefined);
      }}
      onSetDialogAction={setDialogAction}
      onConfirm={handleConfirm}
    />
  );
}

interface ToolViewContentProps {
  readonly agentId: string;
  readonly tools: readonly ToolSummary[];
  readonly invocations: readonly InvocationSummary[];
  readonly invocationPage: PageInfo;
  readonly statusFilter: string;
  readonly actingOperatorId: string;
  readonly selected?: InvocationDetail;
  readonly dialogAction?: 'approve' | 'reject';
  readonly pending: boolean;
  readonly success?: string;
  readonly error?: string;
  readonly onReview: (invocation: InvocationSummary) => void;
  readonly onClearSelected: () => void;
  readonly onSetDialogAction: (action: 'approve' | 'reject' | undefined) => void;
  readonly onConfirm: () => Promise<void>;
}

function ToolViewContent({
  agentId,
  tools,
  invocations,
  invocationPage,
  statusFilter,
  actingOperatorId,
  selected,
  dialogAction,
  pending,
  success,
  error,
  onReview,
  onClearSelected,
  onSetDialogAction,
  onConfirm,
}: ToolViewContentProps) {
  return (
    <ControlRoomFrame
      title={`Agent registry › ${agentId}`}
      signalLabel="tools"
      agentId={agentId}
      currentSection="tools"
    >
      <p className="eyebrow">Tools</p>
      <h2>Tool catalog and approval queue</h2>
      <AgentToken agentId={agentId} />

      <InvocationFilterBar agentId={agentId} statusFilter={statusFilter} />

      {success !== undefined ? <div className="state-success readout">{success}</div> : null}
      {error !== undefined ? <div className="state-error readout">{error}</div> : null}

      <ToolCatalogSection tools={tools} />
      <ApprovalQueueSection invocations={invocations} pending={pending} onReview={onReview} />
      <PaginationBar
        basePath={`/agents/${agentId}/tools`}
        page={invocationPage}
        extraQuery={{ status: statusFilter }}
      />

      <DetailDrawer
        open={selected !== undefined}
        title="Tool invocation review"
        onClose={onClearSelected}
        initialFocusSelector="[data-drawer-initial-focus='true']"
      >
        {selected !== undefined ? (
          <ToolReviewContent
            invocation={selected}
            tools={tools}
            actingOperatorId={actingOperatorId}
            pending={pending}
            terminal={TERMINAL_INVOCATION_STATUSES.has(selected.status)}
            onReject={() => {
              onSetDialogAction('reject');
            }}
            onApprove={() => {
              onSetDialogAction('approve');
            }}
          />
        ) : null}
      </DetailDrawer>

      <ConfirmDialog
        open={dialogAction !== undefined}
        heading={`${dialogAction === 'approve' ? 'Approve' : 'Reject'} Tool invocation ${selected?.invocationId ?? ''}?`}
        confirmLabel={dialogAction === 'approve' ? 'Approve' : 'Reject'}
        onConfirm={onConfirm}
        onCancel={() => {
          onSetDialogAction(undefined);
        }}
        pending={pending}
        confirmDisabled={
          selected === undefined || TERMINAL_INVOCATION_STATUSES.has(selected.status)
        }
      >
        <p>
          {dialogAction === 'approve'
            ? `The Agent will execute ${selected?.toolId ?? 'this Tool'}. This action is recorded with acting user ${actingOperatorId}. It cannot be undone.`
            : `The invocation will transition to rejected. The Agent harness will receive a rejection result Event. Acting user: ${actingOperatorId}.`}
        </p>
      </ConfirmDialog>
    </ControlRoomFrame>
  );
}

async function executeApprovalAction(
  action: 'approve' | 'reject',
  agentId: string,
  invocationId: string,
  onApprove: ToolViewProps['onApprove'],
  onReject: ToolViewProps['onReject']
): Promise<InvocationSummary> {
  const reason = `${action}d from UI`;
  return action === 'approve'
    ? onApprove(agentId, invocationId, generateIdempotencyKey(), reason)
    : onReject(agentId, invocationId, generateIdempotencyKey(), reason);
}

function InvocationFilterBar({
  agentId,
  statusFilter,
}: {
  readonly agentId: string;
  readonly statusFilter: string;
}) {
  const statuses = [
    'pending_approval',
    'approved',
    'rejected',
    'completed',
    'failed',
    'cancelled',
    'all',
  ];
  return (
    <section className="readout" aria-label="Tool invocation filters">
      <div className="action-row" aria-live="polite">
        {statuses.map((status) => (
          <Link
            key={status}
            className={`nav-link${statusFilter === status ? ' state-pending' : ''}`}
            href={`/agents/${agentId}/tools?status=${status}`}
            aria-pressed={statusFilter === status}
          >
            {status}
          </Link>
        ))}
      </div>
    </section>
  );
}

function ToolCatalogSection({ tools }: { readonly tools: readonly ToolSummary[] }) {
  return (
    <section className="readout" aria-labelledby="catalog-heading">
      <strong id="catalog-heading">Catalog</strong>
      {tools.length === 0 ? (
        <EmptyState
          eyebrow="NO TOOLS"
          heading="No Tools in the catalog."
          lead="Tools appear when Integrations are installed or built-in Tools are enabled."
        />
      ) : (
        <DataTable
          ariaLabel="Tool catalog"
          headers={['Tool ID', 'Name', 'Status', 'Installation', 'Requires approval', 'Version']}
          rows={tools.map((tool) => [
            tool.toolId,
            tool.displayName,
            tool.status,
            tool.installationId ?? '—',
            tool.approvalRequired === true ? 'requires_approval' : '—',
            tool.version ?? tool.toolSetVersion ?? '—',
          ])}
        />
      )}
    </section>
  );
}

function ApprovalQueueSection({
  invocations,
  pending,
  onReview,
}: {
  readonly invocations: readonly InvocationSummary[];
  readonly pending: boolean;
  readonly onReview: (invocation: InvocationSummary) => void;
}) {
  return (
    <section className="readout" aria-labelledby="queue-heading">
      <strong id="queue-heading">Approval queue</strong>
      {invocations.length === 0 ? (
        <EmptyState
          eyebrow="NO PENDING APPROVALS"
          heading="No pending approvals."
          lead="The queue updates when the harness requests approval."
        />
      ) : (
        <DataTable
          ariaLabel="Approval queue"
          headers={[
            'Invocation ID',
            'Tool',
            'Status',
            'Approval',
            'Attempts',
            'Risk',
            'Result',
            'Actions',
          ]}
          rows={invocations.map((invocation) => [
            invocation.invocationId,
            invocation.toolId ?? '—',
            invocation.status,
            invocation.approvalId ?? '—',
            invocation.attemptCount ?? 0,
            invocation.riskLevel ?? '—',
            invocation.resultEventId ?? invocation.outputRef?.ref ?? '—',
            <button
              key={`review-${invocation.invocationId}`}
              type="button"
              className="nav-link"
              onClick={() => {
                onReview(invocation);
              }}
              disabled={pending}
            >
              {TERMINAL_INVOCATION_STATUSES.has(invocation.status) ? 'View result' : 'Review'}
            </button>,
          ])}
        />
      )}
    </section>
  );
}
