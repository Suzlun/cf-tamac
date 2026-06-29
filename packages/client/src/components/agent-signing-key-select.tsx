'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';

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
  readonly runHealthCheckAction: (agentId: string) => Promise<BrowserSafeHealthVerificationResult>;
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
    if (!selectionState.selectedRef.includes(':')) {
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
    setSelectionState((current) => ({ ...current, verifying: true }));
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
        />
      </div>
    </section>
  );
}

interface SelectionState {
  readonly selectedRef: string;
  readonly saving: boolean;
  readonly verifying: boolean;
  readonly healthResult?: BrowserSafeHealthVerificationResult;
}

function initialSelectionState(
  activeKeys: readonly BrowserSafeSigningKey[],
  selectedIssuer?: string,
  selectedKeyId?: string
): SelectionState {
  const ref =
    selectedIssuer !== undefined && selectedKeyId !== undefined
      ? activeKeys.find((key) => key.issuer === selectedIssuer && key.keyId === selectedKeyId) !==
        undefined
        ? `${selectedIssuer}:${selectedKeyId}`
        : ''
      : '';
  return { selectedRef: ref, saving: false, verifying: false };
}

function findSelectedKey(
  activeKeys: readonly BrowserSafeSigningKey[],
  selectedRef: string
): BrowserSafeSigningKey | undefined {
  const [issuer, ...kidParts] = selectedRef.split(':');
  const keyId = kidParts.join(':');
  return activeKeys.find((key) => key.issuer === issuer && key.keyId === keyId);
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
      <form onSubmit={onRunHealthCheck}>
        <input type="hidden" name="agentId" value={agentId} />
        <Button type="submit" disabled={noGlobalKeys || !hasSelection || selectionState.verifying}>
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
        <Button asChild variant="outline">
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
            {activeKeys.map((key) => {
              const ref = `${key.issuer}:${key.keyId}`;
              return (
                <label key={ref} className="flex items-start gap-2 text-sm">
                  <RadioGroupItem value={ref} id={`agent-key-${ref}`} />
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
          <Button type="submit" disabled={saving || selectedRef === ''}>
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
}: {
  readonly selectedIssuer?: string;
  readonly selectedKeyId?: string;
  readonly selectedPublicFingerprint?: string;
  readonly lastVerifiedAtMs?: number;
  readonly healthResult?: BrowserSafeHealthVerificationResult;
  readonly hasSelection: boolean;
}): ReactNode {
  return (
    <div className="space-y-4">
      <SelectedKeySummary
        selectedIssuer={selectedIssuer}
        selectedKeyId={selectedKeyId}
        selectedPublicFingerprint={selectedPublicFingerprint}
      />
      <CurrentTrustMatch healthResult={healthResult} />
      <LastVerifiedCard lastVerifiedAtMs={lastVerifiedAtMs} healthResult={healthResult} />
      <DiagnosticCard diagnostic={healthResult?.diagnostic} />
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
  readonly healthResult?: BrowserSafeHealthVerificationResult;
}): ReactNode {
  const matched = healthResult?.ok === true;
  const mismatched = healthResult?.ok === false && healthResult.diagnostic !== undefined;
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
  readonly healthResult?: BrowserSafeHealthVerificationResult;
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
        ) : healthResult?.ok === true ? (
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
