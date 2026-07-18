'use client';

import { useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';

import type {
  BrowserSafeSigningKey,
  TrustConfigExport,
  TrustConfigExportResult,
} from '../lib/signing-key-types';
import type { SyntheticEvent, ReactNode } from 'react';

const SCOPE_CHOICES = [
  'agent:read',
  'agent:write',
  'agent:tool:approve',
  'agent:integration:admin',
  'agent:admin',
  '*',
] as const;

type TrustStatus = 'active' | 'retiring' | 'revoked';
type TrustStatusByKey = ReadonlyMap<string, TrustStatus>;

/**
 * trust config export を server-only で実行する action callback。
 *
 * @remarks server action 参照は直列化可能なため、Server Component である page から props 経由で渡す。
 */
export interface TrustConfigExportActionInput {
  readonly issuer: string;
  readonly principalType: 'CLIENT_SERVICE';
  readonly allowedAgentIds: readonly string[];
  readonly allowedScopes: readonly string[];
  readonly selections: readonly {
    readonly issuer: string;
    readonly kid: string;
    readonly trustStatus: TrustStatus;
  }[];
}

/**
 * Global Settings > Trust Config Export 画面の表示用 props。
 *
 * @remarks private material を含まない browser-safe signing key 一覧と、
 * page から渡される trust config export server action callback を扱う。
 */
export interface TrustConfigExportViewProps {
  readonly signingKeys: readonly BrowserSafeSigningKey[];
  readonly onBuildExport: (input: TrustConfigExportActionInput) => Promise<TrustConfigExportResult>;
}

/**
 * Trust Config Export 画面の本体 (AGENT-MANAGEMENT-UI-S013 / S014 / S020)。
 *
 * @remarks 公開情報だけの `AGENT_CONTROL_PLANE_TRUST` JSON を生成・表示する。private parameter `d` /
 * private JWK plaintext / 暗号化 private JWK / 生 JWT は一切扱わない。Agent 0 件でも利用できる。
 * interactive form は別 component (`TrustConfigExportForm`) に分離し、表示部と state を分ける。
 */
export function TrustConfigExportView({ signingKeys, onBuildExport }: TrustConfigExportViewProps) {
  const [result, setResult] = useState<TrustConfigExportResult | undefined>(undefined);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Global Settings / Trust Config Export
        </p>
        <h1 className="text-2xl font-semibold">Public-only Trust Config Export</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Generate the <code className="font-mono">AGENT_CONTROL_PLANE_TRUST</code> JSON from Global
          signing keys. Works with zero managed Agents to prepare Agent Worker trust before
          registration.
        </p>
      </header>

      <TrustConfigExportForm
        signingKeys={signingKeys}
        onBuildExport={onBuildExport}
        onResult={setResult}
      />

      <ExportPreview result={result} signingKeys={signingKeys} />
      <ExportResultAlerts result={result} />
      <ClientStatusToTrustStatusMapping />
    </div>
  );
}

function ExportResultAlerts({
  result,
}: {
  readonly result: TrustConfigExportResult | undefined;
}): ReactNode {
  if (result === undefined) {
    return null;
  }
  // wireframe/spec は broad permission warning と schema validation result を同時に表示することを要求する。
  // 両者は互いに排他ではなく、ok:true + broadPermissionWarning の組み合わせも発生するため独立して描画する。
  return (
    <div className="space-y-4">
      {result.broadPermissionWarning !== undefined ? (
        <Alert role="status">
          <AlertTitle>Broad permission warning</AlertTitle>
          <AlertDescription>{result.broadPermissionWarning}</AlertDescription>
        </Alert>
      ) : null}
      {!result.ok ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Schema validation</AlertTitle>
          <AlertDescription>{result.validationError}</AlertDescription>
        </Alert>
      ) : (
        <Alert role="status">
          <AlertTitle>Schema validation passed</AlertTitle>
          <AlertDescription>
            Public-only JSON generated. Record the fingerprint before applying.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function TrustConfigExportForm({
  signingKeys,
  onBuildExport,
  onResult,
}: {
  readonly signingKeys: readonly BrowserSafeSigningKey[];
  readonly onBuildExport: (input: TrustConfigExportActionInput) => Promise<TrustConfigExportResult>;
  readonly onResult: (result: TrustConfigExportResult) => void;
}): ReactNode {
  const issuers = uniqueIssuers(signingKeys);
  const [issuer, setIssuer] = useState(issuers[0] ?? '');
  const [allowedScopes, setAllowedScopes] = useState<readonly string[]>(['agent:read']);
  const [allowedAgentIds, setAllowedAgentIds] = useState('*');
  const [trustStatusByKey, setTrustStatusByKey] = useState<TrustStatusByKey>(() =>
    initialTrustStatuses(signingKeys)
  );
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    void runBuild();
  }

  async function runBuild(): Promise<void> {
    setSubmitting(true);
    try {
      const selections = signingKeys
        .filter((key) => key.issuer === issuer)
        .map((key) => ({
          issuer: key.issuer,
          kid: key.keyId,
          trustStatus: resolveTrustStatus(key, trustStatusByKey),
        }));
      const agentIds =
        allowedAgentIds.trim() === '*'
          ? ['*']
          : allowedAgentIds
              .split(',')
              .map((value) => value.trim())
              .filter((value) => value !== '');
      const built = await onBuildExport({
        issuer,
        principalType: 'CLIENT_SERVICE',
        allowedAgentIds: agentIds,
        allowedScopes,
        selections,
      });
      onResult(built);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <section aria-label="Policy controls" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Issuer</CardTitle>
            <CardDescription>Choose the Global signing key issuer.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <IssuerRadios issuers={issuers} issuer={issuer} onChange={setIssuer} />
            <div className="space-y-1">
              <p className="text-sm font-medium">Principal type</p>
              <p className="text-xs text-muted-foreground">
                CLIENT_SERVICE (fixed). ADMIN_OPERATOR is break-glass only and is not exported from
                the Client signing key store.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Allowed scope / agents</CardTitle>
            <CardDescription>
              Explicit selections only. Wildcard agents and admin scopes show a warning.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ScopeCheckboxes selected={allowedScopes} onChange={setAllowedScopes} />
            <AgentIdInput value={allowedAgentIds} onChange={setAllowedAgentIds} />
          </CardContent>
        </Card>

        <SigningKeyStatusSelection
          keys={signingKeys.filter((key) => key.issuer === issuer)}
          trustStatusByKey={trustStatusByKey}
          onChange={(ref, status) => {
            setTrustStatusByKey((current) => {
              // 動的な key 参照を object property として扱わず、Map の明示 API で更新して
              // lint の object-injection 警告と意図しない prototype property 参照を同時に避ける。
              const next = new Map(current);
              next.set(ref, status);
              return next;
            });
          }}
        />

        <Button type="submit" disabled={submitting || signingKeys.length === 0}>
          {submitting ? 'Generating…' : 'Generate public-only JSON'}
        </Button>
      </section>

      <section aria-label="Public JSON preview" className="space-y-4">
        <PublicJwkSummary signingKeys={signingKeys} />
      </section>
    </form>
  );
}

function ExportPreview({
  result,
  signingKeys,
}: {
  readonly result: TrustConfigExportResult | undefined;
  readonly signingKeys: readonly BrowserSafeSigningKey[];
}): ReactNode {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Copyable AGENT_CONTROL_PLANE_TRUST JSON</CardTitle>
        <CardDescription>Paste into the Agent Worker Variables and Secrets.</CardDescription>
      </CardHeader>
      <CardContent>
        <pre
          aria-label="Generated trust config JSON"
          className="min-h-[280px] overflow-auto rounded-md bg-muted p-3 font-mono text-xs"
        >
          {serializeExport(result?.export, signingKeys)}
        </pre>
        <p className="mt-2 text-xs text-muted-foreground">
          No private parameter <code className="font-mono">d</code>, no encrypted private JWK, no
          JWT in this output.
        </p>
      </CardContent>
    </Card>
  );
}

function serializeExport(
  exportValue: TrustConfigExport | undefined,
  signingKeys: readonly BrowserSafeSigningKey[]
): string {
  if (exportValue === undefined) {
    return signingKeys.length === 0
      ? 'No active signing keys. Generate one under Signing Keys first.'
      : 'No export generated yet.';
  }
  return JSON.stringify(exportValue, null, 2);
}

function PublicJwkSummary({
  signingKeys,
}: {
  readonly signingKeys: readonly BrowserSafeSigningKey[];
}): ReactNode {
  const activeKeys = signingKeys.filter((key) => key.status === 'active');
  return (
    <Card>
      <CardHeader>
        <CardTitle>Public JWK summary</CardTitle>
        <CardDescription>
          Only <code className="font-mono">kty</code> / <code className="font-mono">crv</code> /
          <code className="font-mono">x</code> / <code className="font-mono">status</code> /
          <code className="font-mono">fingerprint</code>. No private parameter{' '}
          <code className="font-mono">d</code>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {activeKeys.slice(0, 2).map((key) => (
            <div key={`${key.issuer}:${key.keyId}`} className="space-y-1">
              <dt className="font-medium">
                {key.issuer} / {key.keyId}
              </dt>
              <dd className="font-mono text-xs text-muted-foreground break-all">
                {key.publicFingerprint}
              </dd>
            </div>
          ))}
          {activeKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active signing keys. Generate one under Signing Keys first.
            </p>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}

function IssuerRadios({
  issuers,
  issuer,
  onChange,
}: {
  readonly issuers: readonly string[];
  readonly issuer: string;
  readonly onChange: (value: string) => void;
}): ReactNode {
  if (issuers.length === 0) {
    return (
      <div className="space-y-2">
        <Label>Issuer</Label>
        <p className="text-xs text-muted-foreground">
          No active signing keys. Generate one under Signing Keys first.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Label>Issuer</Label>
      <RadioGroup value={issuer} onValueChange={onChange} className="space-y-1">
        {issuers.map((value) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <RadioGroupItem value={value} id={`issuer-${value}`} />
            <span>{value}</span>
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}

function ScopeCheckboxes({
  selected,
  onChange,
}: {
  readonly selected: readonly string[];
  readonly onChange: (scopes: readonly string[]) => void;
}): ReactNode {
  return (
    <div className="space-y-2">
      <Label>Allowed scopes</Label>
      <div className="grid gap-2 sm:grid-cols-2">
        {SCOPE_CHOICES.map((scope) => (
          <label key={scope} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={selected.includes(scope)}
              onCheckedChange={(checked) => {
                onChange(
                  checked === true
                    ? [...selected, scope]
                    : selected.filter((value) => value !== scope)
                );
              }}
            />
            <span>{scope}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function AgentIdInput({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}): ReactNode {
  return (
    <div className="space-y-2">
      <Label htmlFor="allowedAgentIds">Allowed agent IDs (comma separated, or *)</Label>
      <Input
        id="allowedAgentIds"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      <p className="text-xs text-muted-foreground">
        Use explicit agent IDs in production. Wildcard <code className="font-mono">*</code> triggers
        a warning.
      </p>
    </div>
  );
}

function SigningKeyStatusSelection({
  keys,
  trustStatusByKey,
  onChange,
}: {
  readonly keys: readonly BrowserSafeSigningKey[];
  readonly trustStatusByKey: TrustStatusByKey;
  readonly onChange: (key: string, status: TrustStatus) => void;
}): ReactNode {
  if (keys.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Signing key selection</CardTitle>
          <CardDescription>No signing keys for the selected issuer.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Signing key selection</CardTitle>
        <CardDescription>
          Choose trust status per key. Non-active keys are revoked only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {keys.map((key) => {
          const ref = `${key.issuer}:${key.keyId}`;
          const isActive = key.status === 'active';
          const effectiveStatus = isActive ? (trustStatusByKey.get(ref) ?? 'active') : 'revoked';
          return (
            <SigningKeyStatusRow
              key={ref}
              signingKey={key}
              ref={ref}
              isActive={isActive}
              effectiveStatus={effectiveStatus}
              onChange={onChange}
            />
          );
        })}
      </CardContent>
    </Card>
  );
}

function SigningKeyStatusRow({
  signingKey,
  ref,
  isActive,
  effectiveStatus,
  onChange,
}: {
  readonly signingKey: BrowserSafeSigningKey;
  readonly ref: string;
  readonly isActive: boolean;
  readonly effectiveStatus: TrustStatus;
  readonly onChange: (key: string, status: TrustStatus) => void;
}): ReactNode {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">
          {signingKey.issuer} / {signingKey.keyId}
        </span>
        <Badge
          variant={
            isActive ? 'outline' : signingKey.status === 'deleted' ? 'destructive' : 'secondary'
          }
        >
          {signingKey.status}
        </Badge>
      </div>
      <p className="font-mono text-xs text-muted-foreground break-all">
        {signingKey.publicFingerprint}
      </p>
      <RadioGroup
        value={effectiveStatus}
        onValueChange={(value) => {
          if (isActive) {
            onChange(ref, value as TrustStatus);
          }
        }}
        className="flex flex-wrap gap-4"
      >
        {(['active', 'retiring', 'revoked'] as const).map((option) => (
          <label
            key={option}
            className={`flex items-center gap-2 text-xs ${isActive ? '' : 'opacity-60'}`}
          >
            <RadioGroupItem value={option} id={`${ref}-${option}`} disabled={!isActive} />
            <span>{option}</span>
          </label>
        ))}
      </RadioGroup>
      {!isActive ? (
        <p className="text-xs text-muted-foreground">
          Client status {signingKey.status} can only be exported as revoked.
        </p>
      ) : null}
    </div>
  );
}

function ClientStatusToTrustStatusMapping(): ReactNode {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Client key status to trust status mapping</CardTitle>
        <CardDescription>
          Active keys can be exported as active or retiring. Disabled or deleted keys are revoked
          only.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>
            Client <Badge variant="outline">active</Badge> → trust active / retiring
          </li>
          <li>
            Client <Badge variant="secondary">disabled</Badge> → trust revoked
          </li>
          <li>
            Client <Badge variant="destructive">deleted</Badge> → trust revoked
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}

function uniqueIssuers(keys: readonly BrowserSafeSigningKey[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const key of keys) {
    if (!seen.has(key.issuer)) {
      seen.add(key.issuer);
      result.push(key.issuer);
    }
  }
  return result;
}

function initialTrustStatuses(keys: readonly BrowserSafeSigningKey[]): TrustStatusByKey {
  const entries = keys.map((key) => {
    const ref = `${key.issuer}:${key.keyId}`;
    const status: TrustStatus = key.status === 'active' ? 'active' : 'revoked';
    return [ref, status] as const;
  });
  return new Map(entries);
}

function resolveTrustStatus(
  key: BrowserSafeSigningKey,
  trustStatusByKey: TrustStatusByKey
): TrustStatus {
  const ref = `${key.issuer}:${key.keyId}`;
  if (key.status === 'active') {
    return trustStatusByKey.get(ref) ?? 'active';
  }
  return 'revoked';
}
