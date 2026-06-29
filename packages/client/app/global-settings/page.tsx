import Link from 'next/link';

import { ControlRoomFrame } from '../../src/components/control-room-frame';

export const dynamic = 'force-dynamic';

/**
 * Global Settings index 画面。
 *
 * Client-wide 設定と Ed25519 signing key lifecycle / trust config export / rotation guidance への
 * 導線を置く。Agent scoped contexts は各 Agent 画面配下に残す。
 */
export default function GlobalSettingsPage() {
  return (
    <ControlRoomFrame
      title="Global Settings"
      signalLabel="Global Settings"
      description="Client-wide preferences and Client Service signing operations. Agent-scoped contexts live under each Agent."
    >
      <div className="space-y-6">
        <nav aria-label="Client Service signing operations" className="space-y-3">
          <h2 className="text-lg font-semibold">Client Service signing</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <li>
              <Link
                href="/global-settings/signing-keys"
                className="block rounded-md border bg-card p-4 text-sm hover:bg-accent"
              >
                <span className="font-medium">Signing Keys</span>
                <span className="mt-1 block text-muted-foreground">
                  Generate, list, disable, delete, and select the default Ed25519 signing key.
                  Available before any Agent is registered.
                </span>
              </Link>
            </li>
            <li>
              <Link
                href="/global-settings/trust-config-export"
                className="block rounded-md border bg-card p-4 text-sm hover:bg-accent"
              >
                <span className="font-medium">Trust Config Export</span>
                <span className="mt-1 block text-muted-foreground">
                  Generate public-only AGENT_CONTROL_PLANE_TRUST JSON for the Agent Worker.
                </span>
              </Link>
            </li>
            <li>
              <Link
                href="/global-settings/key-rotation"
                className="block rounded-md border bg-card p-4 text-sm hover:bg-accent"
              >
                <span className="font-medium">Rotation, Revoke, Recovery</span>
                <span className="mt-1 block text-muted-foreground">
                  Key lifecycle, emergency revoke, and break-glass recovery guidance.
                </span>
              </Link>
            </li>
          </ul>
        </nav>

        <section aria-labelledby="workspace-preferences-heading" className="space-y-3">
          <h2 id="workspace-preferences-heading" className="text-lg font-semibold">
            Workspace preferences
          </h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Default locale</dt>
              <dd>ja-JP</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Default timezone</dt>
              <dd>Asia/Tokyo</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Theme</dt>
              <dd>System</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="credential-vault-heading" className="space-y-3">
          <h2 id="credential-vault-heading" className="text-lg font-semibold">
            Credential vault references
          </h2>
          <p className="text-sm text-muted-foreground">
            Provider and external credential references are resolved server-side. No secret material
            is exposed here, and Agent RPC signing keys live in the encrypted Client signing key
            store.
          </p>
        </section>
      </div>
    </ControlRoomFrame>
  );
}
