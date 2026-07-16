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
  emptyMessage = '既定モデルポリシーを設定すると、EventsからのRunsでactiveなWorkers AI policyを利用できます。',
}: ModelPolicySummaryProps) {
  if (loading) {
    return <ModelPolicySummarySkeleton />;
  }

  return (
    <section
      className="rounded-md border bg-card p-4 text-sm space-y-1"
      aria-labelledby="model-policy-summary-heading"
    >
      <strong id="model-policy-summary-heading">既定モデルポリシー</strong>
      <p>
        Agent所有ポリシーの安全なメタデータを表示します。ポリシー本体とcredentialはAgentサービス境界内に保持します。
      </p>
      {metadata === undefined ? (
        <p className="text-xs text-muted-foreground">{emptyMessage}</p>
      ) : (
        <MetadataList metadata={metadata} />
      )}
      {metadata?.status === 'disabled' || metadata?.status === 'archived' ? (
        <p className="text-destructive" role="status">
          参照ポリシーは{metadata.status}
          状態です。active状態のポリシーを保存するまでRunsは失敗します。
        </p>
      ) : null}
      {permissionDenied ? (
        <p className="text-xs text-muted-foreground" role="status">
          安全なメタデータは表示できますが、既定モデルポリシーを更新する権限がありません。
        </p>
      ) : null}
    </section>
  );
}

function MetadataList({ metadata }: { readonly metadata: BrowserSafeModelPolicyMetadata }) {
  return (
    <>
      <dl className="grid gap-3 md:grid-cols-2">
        <SummaryItem label="ポリシー参照" value={metadata.policyRef} mono />
        <SummaryItem
          label="ダイジェスト"
          value={metadata.digest}
          mono
          helper="ダイジェストは保存済みポリシーのメタデータを検証します。prompt、completion、credential、provider secretではありません。"
        />
        <SummaryItem label="プロバイダー" value={metadata.provider} />
        <SummaryItem label="モデル" value={metadata.model} mono />
        <SummaryItem label="ポリシーバージョン" value={`v${metadata.version}`} />
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            状態
          </dt>
          <dd>
            <SignalBadge
              label={metadata.status}
              variant={metadata.status === 'active' ? 'cyan' : 'signal'}
            />
          </dd>
        </div>
        <SummaryItem
          label="設定バージョン"
          value={metadata.configVersion === undefined ? '未適用' : `v${metadata.configVersion}`}
          helper="保存済みポリシー参照がAgentConfig.modelPolicyRefへ適用された後だけ設定バージョンが増加します。"
        />
        <SummaryItem label="生成パラメーター" value={formatGenerationParameters(metadata)} />
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
        {value === '' ? '未返却' : value}
      </dd>
      {helper !== undefined ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

function WarningsList({ metadata }: { readonly metadata: BrowserSafeModelPolicyMetadata }) {
  if (metadata.warnings.length === 0) {
    return <p className="text-xs text-muted-foreground">検証警告: ありません。</p>;
  }
  return (
    <div role="status" aria-live="polite">
      <p className="text-xs text-muted-foreground">検証警告: {metadata.warnings.length}件</p>
      <ul className="mt-2 list-disc pl-5 text-xs">
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
      <strong id="model-policy-summary-heading">既定モデルポリシー</strong>
      <p>ポリシーメタデータを読み込んでいます…</p>
      <dl className="grid gap-3 md:grid-cols-2">
        {['ポリシー参照', 'ダイジェスト', 'プロバイダー', 'モデル'].map((label) => (
          <div key={label}>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </dt>
            <dd>サーバーメタデータを待機しています</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function formatGenerationParameters(metadata: BrowserSafeModelPolicyMetadata): string {
  const parameters = metadata.generationParameters;
  if (parameters === undefined) {
    return '未返却';
  }
  return `温度 ${parameters.temperature} · top_p ${parameters.topP} · max_output_tokens ${parameters.maxOutputTokens}`;
}
