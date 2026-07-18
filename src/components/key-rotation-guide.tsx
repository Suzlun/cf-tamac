import Link from 'next/link';

import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

import type { ReactNode } from 'react';

/**
 * Global Settings 配下の Key Rotation / Emergency Revoke / Break-glass Recovery guidance (AGENT-MANAGEMENT-UI-S015 / S016)。
 *
 * @remarks
 * rotation 手順、emergency revoke、break-glass recovery を Global key lifecycle と per-Agent
 * assignment / Health Check sequencing と結び付けて表示する。秘密情報は一切扱わず、
 * Shadcn 既定 token と既存 Card / Alert primitive で描画する。
 */
export function KeyRotationGuide(): ReactNode {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Global Settings / Signing Keys / Rotation
        </p>
        <h1 className="text-2xl font-semibold">
          Key Rotation, Emergency Revoke And Break-glass Recovery
        </h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Global key lifecycle guidance with per-Agent assignment and Health Check sequencing before
          revoke.
        </p>
      </header>

      <section aria-label="Rotation steps" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <RotationStep
          step="1"
          title="Generate replacement key"
          body="Create the next active Ed25519 signing key under Signing Keys."
          link={{ href: '/global-settings/signing-keys', label: 'Open Signing Keys' }}
        />
        <RotationStep
          step="2"
          title="Export trust config update"
          body="Add the new key as active and mark the previous key retiring in Trust Config Export."
          link={{ href: '/global-settings/trust-config-export', label: 'Open Trust Config Export' }}
        />
        <RotationStep
          step="3"
          title="Switch managed Agent selection"
          body="For each Agent, save the new signing key selection under Agent settings."
        />
        <RotationStep
          step="4"
          title="Health verification before revoke"
          body="Run a Health Check per Agent. Only revoke the retiring key after every Agent verifies."
        />
      </section>

      <section aria-label="Risk operations" className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Emergency Revoke</CardTitle>
            <CardDescription>
              When a key is compromised, revoke it in the Agent Worker trust config first.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Alert variant="destructive" role="status">
              <AlertTitle>Compromised global key</AlertTitle>
              <AlertDescription>
                Export the key as <Badge variant="destructive">revoked</Badge> in Trust Config
                Export, then apply the JSON to the Agent Worker Variables and Secrets.
              </AlertDescription>
            </Alert>
            <p className="text-muted-foreground">
              After the revoked key is applied, JWTs signed with it are rejected at the Agent RPC
              boundary.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Break-glass Recovery</CardTitle>
            <CardDescription>
              When the Management Client is unavailable, use the ADMIN_OPERATOR issuer.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              The <Badge variant="outline">ADMIN_OPERATOR</Badge> issuer is reserved for break-glass
              recovery. Export it only for recovery and never for routine operation.
            </p>
            <p className="text-muted-foreground">
              Recovery keys live outside the Client-managed signing key store. Update the Agent
              Worker trust config from Cloudflare Dashboard, the Cloudflare API, or Wrangler when
              the Management Client cannot sign.
            </p>
            <p className="text-muted-foreground">
              Recovery key: separate management. Never import it into the Client signing key store.
            </p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Recovery key is separate from the Client store</CardTitle>
          <CardDescription>
            A recovery key generated outside the Management Client must not be imported as a managed
            signing key. Track it independently and revoke it after normal operation resumes.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/global-settings/signing-keys"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Back to Signing Keys
        </Link>
        <Link
          href="/global-settings/trust-config-export"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Open Trust Config Export
        </Link>
      </div>
    </div>
  );
}

function RotationStep({
  step,
  title,
  body,
  link,
}: {
  readonly step: string;
  readonly title: string;
  readonly body: string;
  readonly link?: { readonly href: string; readonly label: string };
}): ReactNode {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span aria-hidden className="text-muted-foreground">
            Step {step}
          </span>
          <span>{title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>{body}</p>
        {link !== undefined ? (
          <Link
            href={link.href}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {link.label}
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
