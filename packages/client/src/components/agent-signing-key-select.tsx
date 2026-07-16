'use client';

import Link from 'next/link';
import { useState } from 'react';

import { OperationResultRegion } from './operation-result-region';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';

import type {
  BrowserSafeAgentRpcResult,
  BrowserSafeOperationDisplayData,
} from './schemas/browser-safe-result';
import type {
  BrowserSafeHealthVerificationResult,
  BrowserSafeSigningKey,
} from '../lib/signing-key-types';
import type { SyntheticEvent, ReactNode } from 'react';

/**
 * Agent settings の署名鍵選択 + Health Check 画面に渡す props。
 *
 * @remarks private material を含まず、選択可能な既存 global signing key 一覧と、
 * page から渡される server action callback を扱う。
 */
export interface AgentSigningKeySelectProps {
  readonly agentId: string;
  readonly signingKeys: readonly BrowserSafeSigningKey[];
  readonly selectedIssuer?: string;
  readonly selectedKeyId?: string;
  readonly selectedPublicFingerprint?: string;
  readonly lastVerifiedAtMs?: number;
  readonly saveSelectionAction: (input: {
    readonly agentId: string;
    readonly issuer: string;
    readonly keyId: string;
    readonly publicFingerprint: string;
  }) => Promise<unknown>;
  readonly runHealthCheckAction: (agentId: string) => Promise<BrowserSafeHealthActionResult>;
}

/**
 * Agent settings 配下の署名鍵選択 + Health Check UI (AGENT-MANAGEMENT-UI-S012)。
 *
 * @remarks 既存 Global signing key から issuer/kid/fingerprint を選び、Health Check を実行する。
 * issuer/kid/fingerprint は read-only summary として表示し、自由入力欄は持たない。
 * Global signing key が 0 件の場合は Global Settings への導線を表示し、Health Check を無効化する。
 */
export function AgentSigningKeySelect(props: AgentSigningKeySelectProps): ReactNode {
  const {
    agentId,
    signingKeys,
    selectedIssuer,
    selectedKeyId,
    selectedPublicFingerprint,
    lastVerifiedAtMs,
    saveSelectionAction,
    runHealthCheckAction,
  } = props;
  const activeKeys = signingKeys.filter((key) => key.status === 'active');
  const noGlobalKeys = activeKeys.length === 0;
  const hasSelection =
    selectedIssuer !== undefined &&
    selectedKeyId !== undefined &&
    selectedPublicFingerprint !== undefined;
  const [selectionState, setSelectionState] = useState<SelectionState>(() =>
    initialSelectionState(activeKeys, selectedIssuer, selectedKeyId)
  );

  function handleSaveSelection(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    void runSaveSelection();
  }

  async function runSaveSelection(): Promise<void> {
    if (selectionState.selectedRef === '') {
      return;
    }
    setSelectionState((current) => ({ ...current, saving: true }));
    try {
      const match = findSelectedKey(activeKeys, selectionState.selectedRef);
      if (match === undefined) {
        return;
      }
      await saveSelectionAction({
        agentId,
        issuer: match.issuer,
        keyId: match.keyId,
        publicFingerprint: match.publicFingerprint,
      });
    } finally {
      setSelectionState((current) => ({ ...current, saving: false }));
    }
  }

  function handleRunHealthCheck(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    void runHealthCheck();
  }

  async function runHealthCheck(): Promise<void> {
    // 新しい Health Check 開始時に前回の結果を消し、pending 表示と最終結果が一つの ResultRegion を共有するようにする。
    setSelectionState((current) => ({ ...current, healthResult: undefined, verifying: true }));
    try {
      const result = await runHealthCheckAction(agentId);
      setSelectionState((current) => ({ ...current, healthResult: result }));
    } finally {
      setSelectionState((current) => ({ ...current, verifying: false }));
    }
  }

  return (
    <section aria-label="Signing key selection and health" className="space-y-6">
      <AgentSelectionHeader />
      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <AgentSelectionControls
          agentId={agentId}
          activeKeys={activeKeys}
          noGlobalKeys={noGlobalKeys}
          hasSelection={hasSelection}
          selectionState={selectionState}
          onSelect={setSelectionState}
          onSaveSelection={handleSaveSelection}
          onRunHealthCheck={handleRunHealthCheck}
        />
        <AgentVerificationPanel
          selectedIssuer={selectedIssuer}
          selectedKeyId={selectedKeyId}
          selectedPublicFingerprint={selectedPublicFingerprint}
          lastVerifiedAtMs={lastVerifiedAtMs}
          healthResult={selectionState.healthResult}
          hasSelection={hasSelection}
          verifying={selectionState.verifying}
        />
      </div>
    </section>
  );
}

interface SelectionState {
  readonly selectedRef: string;
  readonly saving: boolean;
  readonly verifying: boolean;
  readonly healthResult?: BrowserSafeHealthActionResult;
}

type BrowserSafeHealthActionResult = BrowserSafeAgentRpcResult<
  BrowserSafeOperationDisplayData & { readonly data?: BrowserSafeHealthVerificationResult }
>;

function initialSelectionState(
  activeKeys: readonly BrowserSafeSigningKey[],
  selectedIssuer?: string,
  selectedKeyId?: string
): SelectionState {
  const ref =
    selectedIssuer !== undefined && selectedKeyId !== undefined
      ? activeKeys.find((key) => key.issuer === selectedIssuer && key.keyId === selectedKeyId) !==
        undefined
        ? encodeSigningKeyRef({ issuer: selectedIssuer, keyId: selectedKeyId })
        : ''
      : '';
  return { selectedRef: ref, saving: false, verifying: false };
}

function findSelectedKey(
  activeKeys: readonly BrowserSafeSigningKey[],
  selectedRef: string
): BrowserSafeSigningKey | undefined {
  const parsed = decodeSigningKeyRef(selectedRef);
  if (parsed === undefined) {
    return undefined;
  }
  return activeKeys.find((key) => key.issuer === parsed.issuer && key.keyId === parsed.keyId);
}

function encodeSigningKeyRef(input: { readonly issuer: string; readonly keyId: string }): string {
  return encodeURIComponent(JSON.stringify(input));
}

function decodeSigningKeyRef(
  selectedRef: string
): { readonly issuer: string; readonly keyId: string } | undefined {
  try {
    const parsed = JSON.parse(decodeURIComponent(selectedRef)) as Record<string, unknown>;
    if (typeof parsed.issuer !== 'string' || typeof parsed.keyId !== 'string') {
      return undefined;
    }
    return { issuer: parsed.issuer, keyId: parsed.keyId };
  } catch {
    return undefined;
  }
}

function AgentSelectionHeader(): ReactNode {
  return (
    <header className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Agent / Settings
      </p>
      <h2 className="text-xl font-semibold">Signing Key Selection And Health</h2>
      <p className="max-w-prose text-sm text-muted-foreground">
        Select an existing Global signing key for this Agent and verify it against the Agent Worker
        trust config. Keys are managed under Global Settings.
      </p>
    </header>
  );
}

function AgentSelectionControls({
  agentId,
  activeKeys,
  noGlobalKeys,
  hasSelection,
  selectionState,
  onSelect,
  onSaveSelection,
  onRunHealthCheck,
}: {
  readonly agentId: string;
  readonly activeKeys: readonly BrowserSafeSigningKey[];
  readonly noGlobalKeys: boolean;
  readonly hasSelection: boolean;
  readonly selectionState: SelectionState;
  readonly onSelect: (next: SelectionState) => void;
  readonly onSaveSelection: (event: SyntheticEvent<HTMLFormElement>) => void;
  readonly onRunHealthCheck: (event: SyntheticEvent<HTMLFormElement>) => void;
}): ReactNode {
  return (
    <div className="space-y-4">
      {noGlobalKeys ? (
        <NoGlobalKeysCard />
      ) : (
        <SelectionFormCard
          activeKeys={activeKeys}
          selectedRef={selectionState.selectedRef}
          saving={selectionState.saving}
          onSelect={(ref) => {
            onSelect({ ...selectionState, selectedRef: ref });
          }}
          onSubmit={onSaveSelection}
        />
      )}
      <form onSubmit={onRunHealthCheck} aria-busy={selectionState.verifying}>
        <input type="hidden" name="agentId" value={agentId} />
        <Button
          type="submit"
          className="min-h-11"
          disabled={noGlobalKeys || !hasSelection || selectionState.verifying}
        >
          {selectionState.verifying ? 'Verifying…' : 'Run Health Check'}
        </Button>
        {noGlobalKeys || !hasSelection ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {noGlobalKeys
              ? 'Generate and select a Global signing key first.'
              : 'Select a Global signing key for this Agent before running a Health Check.'}
          </p>
        ) : null}
      </form>
    </div>
  );
}

function NoGlobalKeysCard(): ReactNode {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No Global signing keys</CardTitle>
        <CardDescription>
          Generate a key in Global Settings before assigning one to this Agent.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/global-settings/signing-keys">Open Global Settings / Signing Keys</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function SelectionFormCard({
  activeKeys,
  selectedRef,
  saving,
  onSelect,
  onSubmit,
}: {
  readonly activeKeys: readonly BrowserSafeSigningKey[];
  readonly selectedRef: string;
  readonly saving: boolean;
  readonly onSelect: (ref: string) => void;
  readonly onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
}): ReactNode {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Select an existing Global signing key</CardTitle>
        <CardDescription>
          issuer / kid / fingerprint are read-only summary values derived from the selected key.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-3">
          <RadioGroup value={selectedRef} onValueChange={onSelect} className="space-y-2">
            {activeKeys.map((key, index) => {
              const ref = encodeSigningKeyRef({ issuer: key.issuer, keyId: key.keyId });
              const inputId = `agent-key-${String(index)}`;
              return (
                <label key={ref} className="flex min-h-11 items-center gap-2 text-sm">
                  <RadioGroupItem value={ref} id={inputId} />
                  <span>
                    <span className="font-medium">
                      {key.issuer} / {key.keyId}
                    </span>
                    <span className="mt-1 block font-mono text-xs text-muted-foreground break-all">
                      {key.publicFingerprint}
                    </span>
                  </span>
                </label>
              );
            })}
          </RadioGroup>
          <Button type="submit" className="min-h-11" disabled={saving || selectedRef === ''}>
            {saving ? 'Saving…' : 'Save Agent Selection'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function AgentVerificationPanel({
  selectedIssuer,
  selectedKeyId,
  selectedPublicFingerprint,
  lastVerifiedAtMs,
  healthResult,
  hasSelection,
  verifying,
}: {
  readonly selectedIssuer?: string;
  readonly selectedKeyId?: string;
  readonly selectedPublicFingerprint?: string;
  readonly lastVerifiedAtMs?: number;
  readonly healthResult?: BrowserSafeHealthActionResult;
  readonly hasSelection: boolean;
  readonly verifying: boolean;
}): ReactNode {
  return (
    <div className="space-y-4">
      <OperationResultRegion
        result={healthResult}
        pending={verifying}
        pendingTitle="Health Check を実行しています"
        pendingMessage="Agent Worker の信頼設定と選択済み署名鍵を照合しています…"
      />
      <SelectedKeySummary
        selectedIssuer={selectedIssuer}
        selectedKeyId={selectedKeyId}
        selectedPublicFingerprint={selectedPublicFingerprint}
      />
      <CurrentTrustMatch healthResult={healthResult} />
      <LastVerifiedCard
        lastVerifiedAtMs={lastVerifiedAtMs}
        healthResult={
          healthResult?.safeStatus === 'succeeded' ? healthResult.displayData.data : undefined
        }
      />
      <DiagnosticCard
        diagnostic={
          healthResult?.safeStatus === 'succeeded'
            ? healthResult.displayData.data?.diagnostic
            : undefined
        }
      />
      {!hasSelection ? (
        <Card>
          <CardHeader>
            <CardTitle>Blocked until Global key selected</CardTitle>
            <CardDescription>
              Agent RPC routes stay on safe fallback until a signing key is selected and verified.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
      <NextStepGuidance healthResult={healthResult} hasSelection={hasSelection} />
    </div>
  );
}

function SelectedKeySummary({
  selectedIssuer,
  selectedKeyId,
  selectedPublicFingerprint,
}: {
  readonly selectedIssuer?: string;
  readonly selectedKeyId?: string;
  readonly selectedPublicFingerprint?: string;
}): ReactNode {
  if (
    selectedIssuer === undefined ||
    selectedKeyId === undefined ||
    selectedPublicFingerprint === undefined
  ) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Selected key</CardTitle>
          <CardDescription>No Global signing key is assigned to this Agent yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Selected issuer / kid / fingerprint (read-only)</CardTitle>
        <CardDescription>Derived from the selected Global signing key.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="font-medium">Issuer</dt>
            <dd>{selectedIssuer}</dd>
          </div>
          <div>
            <dt className="font-medium">Key id</dt>
            <dd className="font-mono text-xs">{selectedKeyId}</dd>
          </div>
          <div>
            <dt className="font-medium">Public fingerprint</dt>
            <dd className="font-mono text-xs break-all">{selectedPublicFingerprint}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function CurrentTrustMatch({
  healthResult,
}: {
  readonly healthResult?: BrowserSafeHealthActionResult;
}): ReactNode {
  if (healthResult?.safeStatus === 'failed') {
    // failure の通知・focus・support ID は共通 ResultRegion が担当し、この card は trust 未確認を未登録と誤認させない補足だけを示す。
    return (
      <Card>
        <CardHeader>
          <CardTitle>Current Trust Match</CardTitle>
          <CardDescription>
            最新のHealth
            Check結果を確認できませんでした。上の安全な結果を確認してから再実行してください。
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const displayData = healthResult?.displayData.data;
  const matched = displayData?.ok === true;
  const mismatched = displayData?.ok === false && displayData.diagnostic !== undefined;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Current Trust Match</CardTitle>
        <CardDescription>
          Whether the Agent Worker trust config accepts the selected signing key.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm">
        {matched ? (
          <Badge variant="outline">verified</Badge>
        ) : mismatched ? (
          <Badge variant="destructive">mismatch</Badge>
        ) : (
          <span className="text-muted-foreground">Not yet verified.</span>
        )}
      </CardContent>
    </Card>
  );
}

function LastVerifiedCard({
  lastVerifiedAtMs,
  healthResult,
}: {
  readonly lastVerifiedAtMs?: number;
  readonly healthResult?: BrowserSafeHealthVerificationResult;
}): ReactNode {
  const verified = healthResult?.lastVerifiedAtMs ?? lastVerifiedAtMs;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Last Verified At</CardTitle>
        <CardDescription>Updated only on successful Health Check.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {verified === undefined ? 'Never' : new Date(verified).toISOString()}
      </CardContent>
    </Card>
  );
}

function DiagnosticCard({
  diagnostic,
}: {
  readonly diagnostic?: BrowserSafeHealthVerificationResult['diagnostic'];
}): ReactNode {
  if (diagnostic === undefined) {
    return null;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Safe diagnostic codes</CardTitle>
        <CardDescription>Public identifiers only. No key material or token body.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <DiagnosticTerm
            label="Trust config fingerprint"
            value={diagnostic.trustConfigFingerprint}
          />
          <DiagnosticTerm label="Trust config version" value={diagnostic.trustConfigVersion} />
          <DiagnosticTerm label="Principal issuer" value={diagnostic.principalIssuer} />
          <DiagnosticTerm label="Principal kid" value={diagnostic.principalKid} />
          <DiagnosticTerm label="Principal fingerprint" value={diagnostic.principalFingerprint} />
          <DiagnosticTerm label="Principal key status" value={diagnostic.principalKeyStatus} />
        </dl>
      </CardContent>
    </Card>
  );
}

function DiagnosticTerm({
  label,
  value,
}: {
  readonly label: string;
  readonly value?: string;
}): ReactNode {
  if (value === undefined) {
    return null;
  }
  return (
    <div>
      <dt className="font-medium">{label}</dt>
      <dd className="font-mono text-xs break-all text-muted-foreground">{value}</dd>
    </div>
  );
}

function NextStepGuidance({
  healthResult,
  hasSelection,
}: {
  readonly healthResult?: BrowserSafeHealthActionResult;
  readonly hasSelection: boolean;
}): ReactNode {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Next step guidance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm text-muted-foreground">
        {!hasSelection ? (
          <p>Save a Global signing key selection for this Agent.</p>
        ) : healthResult?.safeStatus === 'failed' ? (
          <p>
            安全な結果を確認してから、選択済みの署名鍵と Agent RPC
            接続設定を見直し、ヘルスチェックを再実行してください。
          </p>
        ) : healthResult?.displayData.data?.ok === true ? (
          <p>
            Verification passed. Overview, Threads, Events, Runs, Schedules, Integrations, and
            Settings show live Agent data.
          </p>
        ) : (
          <p>
            Run a Health Check. If the Agent rejects the key, export and apply the public trust
            config, then retry.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
