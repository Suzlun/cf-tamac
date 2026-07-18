import Link from 'next/link';

import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

import type { BrowserSafeSigningKey } from '../lib/signing-key-types';
import type { ReactNode } from 'react';

/**
 * signing key lifecycle 操作を server-only で実行する form action callback。
 *
 * @remarks 各 callback は Next.js form action 形式 `(formData: FormData) => Promise<void>` を満たす。
 * server action 参照は直列化可能なため、Server Component である page から props 経由で渡せる。
 */
export interface SigningKeyManagementActions {
  readonly generate: () => Promise<void>;
  readonly setDefault: (formData: FormData) => Promise<void>;
  readonly disable: (formData: FormData) => Promise<void>;
  readonly enable: (formData: FormData) => Promise<void>;
  readonly delete: (formData: FormData) => Promise<void>;
}

/**
 * Global Settings 配下の署名鍵管理 UI に渡す表示用 props。
 *
 * @remarks private JWK / 暗号化 envelope / 生 JWT を一切含まず、browser-safe な公開情報だけを扱う。
 */
export interface SigningKeyManagementProps {
  readonly signingKeys: readonly BrowserSafeSigningKey[];
  readonly managedAgentCount: number;
  readonly actions: SigningKeyManagementActions;
}

/**
 * Global Settings > Signing Keys 画面の本体 (AGENT-MANAGEMENT-UI-S010 / S020)。
 *
 * @remarks
 * Agent が 0 件でも利用できる Client-wide signing key lifecycle 画面。Key 一覧、生成、既定選択、
 * disable / delete 操作を Server Action 経由で実行する。private material は絶対に表示せず、
 * public fingerprint / status / timestamps だけを Shadcn 既定 token で描画する。
 */
export function SigningKeyManagement({
  signingKeys,
  managedAgentCount,
  actions,
}: SigningKeyManagementProps) {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Global Settings / Signing Keys
        </p>
        <h1 className="text-2xl font-semibold">Client Service Signing Keys</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Client-wide Ed25519 signing keys. Available before any Agent is registered. Private
          material never leaves the server.
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          <form action={actions.generate}>
            <Button type="submit">Generate Key</Button>
          </form>
          <Button asChild variant="outline">
            <Link href="/global-settings/trust-config-export">Trust Config Export</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/global-settings/key-rotation">Rotation Guide</Link>
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Agent-zero availability</CardTitle>
          <CardDescription>
            {managedAgentCount === 0
              ? 'No managed Agents are registered. Signing keys can still be generated and exported.'
              : `${String(managedAgentCount)} managed Agent(s) registered. Per-Agent key selection lives under each Agent settings.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Signing keys are Client-wide resources. Per-Agent assignment chooses from these keys and
            verifies the assignment with a Health Check.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Secret boundary</CardTitle>
          <CardDescription>
            Private JWK plaintext, encrypted private JWK, and raw JWT never appear in this UI,
            network responses, or storage.
          </CardDescription>
        </CardHeader>
      </Card>

      <Alert role="status">
        <AlertTitle>Disable and delete require a trust config update</AlertTitle>
        <AlertDescription>
          Disabling or deleting a key stops new JWT signing immediately, but the Agent Worker keeps
          accepting the public key until the trust config is updated. Export the key as{' '}
          <Badge variant="destructive">revoked</Badge> in{' '}
          <Link
            href="/global-settings/trust-config-export"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Trust Config Export
          </Link>{' '}
          and apply the JSON to the Agent Worker before revoking in production.
        </AlertDescription>
      </Alert>

      {signingKeys.length === 0 ? (
        <EmptySigningKeys generateAction={actions.generate} />
      ) : (
        <SigningKeyTable signingKeys={signingKeys} actions={actions} />
      )}
    </div>
  );
}

function EmptySigningKeys({
  generateAction,
}: {
  readonly generateAction: () => Promise<void>;
}): ReactNode {
  return (
    <Card className="text-center" role="status">
      <CardContent className="pt-6">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          No signing keys yet
        </p>
        <h2 className="mb-2 text-xl font-semibold">
          Generate the first Client Service signing key
        </h2>
        <p className="mx-auto mb-4 max-w-prose text-sm text-muted-foreground">
          Agent-zero safe. Generate a key here, then export a public-only trust config for the Agent
          Worker.
        </p>
        <div className="flex justify-center">
          <form action={generateAction}>
            <Button type="submit">Generate Key</Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}

function SigningKeyTable({
  signingKeys,
  actions,
}: {
  readonly signingKeys: readonly BrowserSafeSigningKey[];
  readonly actions: SigningKeyManagementActions;
}): ReactNode {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Signing keys</CardTitle>
        <CardDescription>
          issuer / kid / public fingerprint / status / default selection / last used.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Issuer / kid</TableHead>
                <TableHead>Public fingerprint</TableHead>
                <TableHead>Default</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {signingKeys.map((key) => (
                <TableRow key={`${key.issuer}:${key.keyId}`}>
                  <TableCell className="font-medium">
                    <div className="space-y-1">
                      <span>{key.issuer}</span>
                      <span className="block font-mono text-xs text-muted-foreground">
                        {key.keyId}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs break-all">{key.publicFingerprint}</span>
                  </TableCell>
                  <TableCell>
                    {key.isDefault ? <Badge>Default</Badge> : <span aria-hidden>—</span>}
                  </TableCell>
                  <TableCell>
                    <SigningKeyStatusBadge status={key.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {key.lastUsedAtMs === undefined
                      ? 'Never'
                      : new Date(key.lastUsedAtMs).toISOString()}
                  </TableCell>
                  <TableCell>
                    <SigningKeyRowActions signingKey={key} actions={actions} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Client signing key の status を Shadcn 既定 Badge variant へ mapping する。
 */
function SigningKeyStatusBadge({ status }: { readonly status: string }): ReactNode {
  if (status === 'active') {
    return <Badge variant="outline">active</Badge>;
  }
  if (status === 'disabled') {
    return <Badge variant="secondary">disabled</Badge>;
  }
  return <Badge variant="destructive">deleted</Badge>;
}

function SigningKeyRowActions({
  signingKey,
  actions,
}: {
  readonly signingKey: BrowserSafeSigningKey;
  readonly actions: SigningKeyManagementActions;
}): ReactNode {
  return (
    <div className="flex flex-wrap gap-2">
      {/* active かつ non-default の key だけを既定 key に昇格でき、既定化すると署名 fallback の選択先が切り替わる。 */}
      {signingKey.status === 'active' && !signingKey.isDefault ? (
        <form action={actions.setDefault}>
          <SigningKeyFields signingKey={signingKey} />
          <Button type="submit" variant="outline" size="sm">
            Set default
          </Button>
        </form>
      ) : null}
      {/* default key は常に署名可能な退避先として残すため、active かつ non-default の key だけ無効化を許可する。 */}
      {signingKey.status === 'active' && !signingKey.isDefault ? (
        <form action={actions.disable}>
          <SigningKeyFields signingKey={signingKey} />
          <Button type="submit" variant="outline" size="sm">
            Disable
          </Button>
        </form>
      ) : null}
      {/* disabled key の再有効化は署名候補へ戻す副作用があるため、disabled 状態の行だけに限定する。 */}
      {signingKey.status === 'disabled' ? (
        <form action={actions.enable}>
          <SigningKeyFields signingKey={signingKey} />
          <Button type="submit" variant="outline" size="sm">
            Re-enable
          </Button>
        </form>
      ) : null}
      {/* default key の削除は server action 側でも拒否されるが、誤操作を避けるため UI でも non-default に限定する。 */}
      {!signingKey.isDefault ? (
        <form action={actions.delete}>
          <SigningKeyFields signingKey={signingKey} />
          <Button type="submit" variant="destructive" size="sm">
            Delete (revoke in trust config)
          </Button>
        </form>
      ) : null}
    </div>
  );
}

/**
 * 行ごとに issuer / keyId を hidden input として送信する。
 *
 * @remarks Server Action 側で選択行と一致することを検証し、不整合は安全側へ落とす。
 */
function SigningKeyFields({
  signingKey,
}: {
  readonly signingKey: BrowserSafeSigningKey;
}): ReactNode {
  return (
    <>
      <input type="hidden" name="issuer" value={signingKey.issuer} />
      <input type="hidden" name="keyId" value={signingKey.keyId} />
    </>
  );
}
