'use client';

import { SignalBadge } from './signal-badge';

import type { BrowserSafeModelPolicyMetadata } from './schemas/model-policy';

/**
 * Default model policy summary の props です。
 *
 * @remarks
 * `metadata` は Agent RPC から server-side で安全化された値だけを受け取ります。loading/permission
 * 状態も boolean と表示 copy に限定し、Agent RPC transport や secret 解決情報は含めません。
 */
export interface ModelPolicySummaryProps {
  readonly metadata?: BrowserSafeModelPolicyMetadata;
  readonly loading: boolean;
  readonly permissionDenied: boolean;
  readonly emptyMessage?: string;
}

/**
 * Default model policy の browser-safe metadata readout を描画します。
 *
 * @param props - safe metadata、loading 状態、permission 表示状態を含む props です。
 * @returns ref/digest/provider/model/status/config version だけを表示する summary section を返します。
 * @remarks
 * digest は prompt、completion、credential、provider secret ではないことを明示し、値は `<dl>` で
 * 読み上げしやすい形にします。metadata が未取得の場合は偽の digest/version を作らず empty copy だけを表示します。
 */
export function ModelPolicySummary({
  metadata,
  loading,
  permissionDenied,
  emptyMessage = 'No default model policy is attached. Save an active Workers AI policy before publishing Events.',
}: ModelPolicySummaryProps) {
  if (loading) {
    return <ModelPolicySummarySkeleton />;
  }

  return (
    <section
      className="rounded-md border bg-card p-4 text-sm space-y-1"
      aria-labelledby="model-policy-summary-heading"
    >
      <strong id="model-policy-summary-heading">Default model policy</strong>
      <p>
        Current Agent-owned policy metadata. The policy body and credentials stay inside the Agent
        service boundary.
      </p>
      {metadata === undefined ? (
        <p className="text-xs text-muted-foreground">{emptyMessage}</p>
      ) : (
        <MetadataList metadata={metadata} />
      )}
      {metadata?.status === 'disabled' || metadata?.status === 'archived' ? (
        <p className="text-destructive" role="status">
          The referenced policy is {metadata.status}. Runs will fail until an active policy is
          saved.
        </p>
      ) : null}
      {permissionDenied ? (
        <p className="text-xs text-muted-foreground" role="status">
          You can view safe metadata, but you do not have permission to update the default model
          policy.
        </p>
      ) : null}
    </section>
  );
}

function MetadataList({ metadata }: { readonly metadata: BrowserSafeModelPolicyMetadata }) {
  return (
    <>
      <dl className="grid gap-3 md:grid-cols-2">
        <SummaryItem label="Policy ref" value={metadata.policyRef} mono />
        <SummaryItem
          label="Digest"
          value={metadata.digest}
          mono
          helper="Digest verifies the saved policy metadata. It is not a prompt, completion, credential, or provider secret."
        />
        <SummaryItem label="Provider" value={metadata.provider} />
        <SummaryItem label="Model" value={metadata.model} mono />
        <SummaryItem label="Policy version" value={`v${metadata.version}`} />
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Status
          </dt>
          <dd>
            <SignalBadge
              label={metadata.status}
              variant={metadata.status === 'active' ? 'cyan' : 'signal'}
            />
          </dd>
        </div>
        <SummaryItem
          label="Config version"
          value={
            metadata.configVersion === undefined ? 'not attached' : `v${metadata.configVersion}`
          }
          helper="Config version increments only after the saved policy ref is attached to AgentConfig.modelPolicyRef."
        />
        <SummaryItem label="Generation parameters" value={formatGenerationParameters(metadata)} />
      </dl>
      <WarningsList metadata={metadata} />
    </>
  );
}

function SummaryItem({
  label,
  value,
  helper,
  mono,
}: {
  readonly label: string;
  readonly value: string;
  readonly helper?: string;
  readonly mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={mono === true ? 'font-mono' : undefined} style={{ overflowWrap: 'anywhere' }}>
        {value === '' ? 'not returned' : value}
      </dd>
      {helper !== undefined ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

function WarningsList({ metadata }: { readonly metadata: BrowserSafeModelPolicyMetadata }) {
  if (metadata.warnings.length === 0) {
    return <p className="text-xs text-muted-foreground">Warnings: No validation warnings.</p>;
  }
  return (
    <div role="status" aria-live="polite">
      <p className="text-xs text-muted-foreground">Warnings: {metadata.warnings.length}</p>
      <ul className="mt-2 list-disc pl-5 font-mono text-xs">
        {metadata.warnings.map((warning) => (
          <li key={`${warning.code}:${warning.message}`}>{warning.message}</li>
        ))}
      </ul>
    </div>
  );
}

function ModelPolicySummarySkeleton() {
  return (
    <section
      className="rounded-md border bg-card p-4 text-sm"
      aria-labelledby="model-policy-summary-heading"
    >
      <strong id="model-policy-summary-heading">Default model policy</strong>
      <p>Loading policy metadata…</p>
      <dl className="grid gap-3 md:grid-cols-2">
        {['Policy ref', 'Digest', 'Provider', 'Model'].map((label) => (
          <div key={label}>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </dt>
            <dd className="font-mono">pending server metadata</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function formatGenerationParameters(metadata: BrowserSafeModelPolicyMetadata): string {
  const parameters = metadata.generationParameters;
  if (parameters === undefined) {
    return 'not returned';
  }
  return `temperature ${parameters.temperature} · top_p ${parameters.topP} · max_output_tokens ${parameters.maxOutputTokens}`;
}
