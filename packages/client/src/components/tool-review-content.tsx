import { SignalBadge } from './signal-badge';
import { Button } from './ui/button';

interface PayloadReference {
  readonly ref: string;
  readonly contentType: string;
  readonly byteSize: string;
  readonly sha256: string;
  readonly storageClass: string;
}

interface ToolSummary {
  readonly toolId: string;
  readonly displayName: string;
  readonly approvalRequired?: boolean;
}

interface ToolApproval {
  readonly approvalId: string;
  readonly decision?: string;
  readonly principalId?: string;
  readonly reason?: string;
  readonly auditEventId?: string;
}

interface ProviderOperation {
  readonly operationId: string;
  readonly installationId?: string;
  readonly status?: string;
}

interface InvocationDetail {
  readonly invocationId: string;
  readonly status: string;
  readonly approvalId?: string;
  readonly attemptCount?: number;
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
  readonly approval?: ToolApproval;
  readonly providerOperation?: ProviderOperation;
}

interface ToolReviewContentProps {
  readonly invocation: InvocationDetail;
  readonly tools: readonly ToolSummary[];
  readonly actingOperatorId: string;
  readonly pending: boolean;
  readonly terminal: boolean;
  readonly onReject: () => void;
  readonly onApprove: () => void;
}

/**
 * ToolInvocation の explicit approval/rejection drawer 本文を表示する。
 *
 * @param invocation - Browser-safe な ToolInvocation detail。input/output は metadata projection のみを持つ。
 * @param tools - Tool catalog。toolId から表示名と approval requirement を補完する。
 * @param actingOperatorId - Server-derived acting user ID。confirmation の前に操作者へ表示する。
 * @param pending - Server Action 実行中に destructive controls を無効化する flag。
 * @param terminal - すでに terminal status の invocation かどうか。true の場合 approve/reject を無効化する。
 * @param onReject - Reject button click を親へ通知する callback。直接 Agent RPC は呼ばない。
 * @param onApprove - Approve button click を親へ通知する callback。直接 Agent RPC は呼ばない。
 * @returns Drawer 内に表示する ToolInvocation review UI。
 */
export function ToolReviewContent({
  invocation,
  tools,
  actingOperatorId,
  pending,
  terminal,
  onReject,
  onApprove,
}: ToolReviewContentProps) {
  // Tool catalog は Browser-safe summary のみを受け取り、toolId に対応する表示名と approval policy だけを補完する。
  const tool = tools.find((item) => item.toolId === invocation.toolId);
  return (
    <>
      <p
        className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        tabIndex={-1}
      >
        TOOL INVOCATION REVIEW
      </p>
      <p tabIndex={-1} data-drawer-initial-focus="true">
        invocation_id: {invocation.invocationId}
      </p>
      <p>
        tool: {invocation.toolId ?? '—'} — {tool?.displayName ?? '—'}
      </p>
      <p>status: {invocation.status}</p>
      <p>approval_status: {invocation.approval?.decision ?? invocation.approvalId ?? '—'}</p>
      <p>attempts: {invocation.attemptCount ?? 0}</p>
      <p>thread_id: {invocation.threadId ?? '—'}</p>
      <p>run_id: {invocation.runId ?? '—'}</p>
      <p>
        installation_id:{' '}
        {invocation.installationId ?? invocation.providerOperation?.installationId ?? '—'}
      </p>

      {/* input は payload 本文ではなく safe projection と blob reference metadata だけを表示し、秘密値を drawer に載せない。 */}
      <section
        className="rounded-md border bg-card p-4 text-sm space-y-1"
        aria-live="polite"
        aria-label="Input summary"
      >
        <strong>INPUT SUMMARY (safe projection)</strong>
        <p>{invocation.inputSummary ?? 'No input summary available.'}</p>
        <PayloadReferenceView label="input ref" reference={invocation.inputRef} />
      </section>

      {/* risk / approval は操作者が approve/reject 前に判断するための metadata で、Agent mutation はここでは実行しない。 */}
      <section
        className="rounded-md border bg-card p-4 text-sm space-y-1"
        aria-label="Risk and approval metadata"
      >
        <strong>RISK / APPROVAL METADATA</strong>
        <p>
          <SignalBadge
            label={`risk: ${invocation.riskLevel ?? 'unknown'}`}
            variant={riskVariant(invocation.riskLevel)}
          />
        </p>
        <p>requires_approval: {tool?.approvalRequired === false ? 'false' : 'true'}</p>
        <p>approval_id: {invocation.approval?.approvalId ?? invocation.approvalId ?? '—'}</p>
        <p>approval_reason: {invocation.approval?.reason ?? '—'}</p>
        <p>approval_audit_event: {invocation.approval?.auditEventId ?? '—'}</p>
      </section>

      {/* acting user は server-derived の操作者文脈を確認する欄で、Browser 入力から principal を作らない。 */}
      <section
        className="rounded-md border bg-card p-4 text-sm space-y-1"
        aria-label="Acting user context"
      >
        <strong>ACTING USER</strong>
        <p>{invocation.approval?.principalId ?? actingOperatorId}</p>
      </section>

      {/* result links は Event/provider operation の識別子だけを示し、output payload 本文は metadata projection に閉じる。 */}
      <section
        className="rounded-md border bg-card p-4 text-sm space-y-1"
        aria-label="Result links"
      >
        <strong>RESULT LINKS</strong>
        <p>result Event: {invocation.resultEventId ?? '—'}</p>
        <p>
          provider operation:{' '}
          {invocation.providerOperation?.operationId ?? invocation.providerOperationId ?? '—'}
        </p>
        <p>provider operation status: {invocation.providerOperation?.status ?? '—'}</p>
        <PayloadReferenceView label="output ref" reference={invocation.outputRef} />
      </section>

      <ToolReviewActions
        pending={pending}
        terminal={terminal}
        onReject={onReject}
        onApprove={onApprove}
      />
    </>
  );
}

function ToolReviewActions({
  pending,
  terminal,
  onReject,
  onApprove,
}: {
  readonly pending: boolean;
  readonly terminal: boolean;
  readonly onReject: () => void;
  readonly onApprove: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {/* Reject は親 component の Server Action wrapper へ委譲し、この表示 component 自体は Agent RPC を直接呼ばない。 */}
      <Button
        type="button"
        variant="destructive"
        onClick={onReject}
        disabled={pending || terminal}
        aria-disabled={pending || terminal}
        title={terminal ? 'Invocation is already terminal.' : undefined}
      >
        Reject
      </Button>
      {/* Approve も同じく親へ通知するだけにし、pending/terminal 中は二重送信と完了済み変更を防ぐ。 */}
      <Button
        type="button"
        variant="default"
        onClick={onApprove}
        disabled={pending || terminal}
        aria-disabled={pending || terminal}
        title={terminal ? 'Invocation is already terminal.' : undefined}
      >
        Approve
      </Button>
    </div>
  );
}

function PayloadReferenceView({
  label,
  reference,
}: {
  readonly label: string;
  readonly reference?: PayloadReference;
}) {
  if (reference === undefined) {
    // payload reference が無い場合も「本文が無い」のではなく metadata-only projection であることを明示する。
    return <p>{label}: metadata only</p>;
  }
  return (
    <p>
      {label}: {reference.ref} · digest {reference.sha256} · {reference.byteSize} bytes ·{' '}
      {reference.storageClass}
    </p>
  );
}

function riskVariant(riskLevel: string | undefined): 'signal' | 'cyan' | 'muted' | 'error' {
  if (riskLevel === 'high' || riskLevel === 'critical') {
    return 'error';
  }
  if (riskLevel === 'medium') {
    return 'signal';
  }
  if (riskLevel === 'low') {
    return 'cyan';
  }
  return 'muted';
}
