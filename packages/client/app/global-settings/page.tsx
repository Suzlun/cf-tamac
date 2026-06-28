import { ControlRoomFrame } from '../../src/components/control-room-frame';

export const dynamic = 'force-dynamic';

/**
 * Global Settings 画面（MANAGEMENT-CLIENT-SHELL-S013）。
 *
 * Client 全体設定のみを扱い、selected-Agent identity や Agent scoped actions は含まない。
 * Agent RPC・credential・server-only module には依存しない静的な Client-wide 設定表示である。
 */
export default function GlobalSettingsPage() {
  return (
    <ControlRoomFrame
      title="Global Settings"
      signalLabel="Global Settings"
      description="Client-wide preferences. Agent-scoped contexts live under each Agent."
    >
      <div className="space-y-6">
        {/* workspace preferences: locale/timezone/theme など Client 全体設定。 */}
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

        {/* credential vault references: Client 全体の credential vault 参照のみ。Agent secret は扱わない。 */}
        <section aria-labelledby="credential-vault-heading" className="space-y-3">
          <h2 id="credential-vault-heading" className="text-lg font-semibold">
            Credential vault references
          </h2>
          <p className="text-sm text-muted-foreground">
            Agent credentials are resolved server-side from the configured vault. No secret material
            is exposed here.
          </p>
        </section>

        {/* operational settings: Management Client 全体の運用設定。 */}
        <section aria-labelledby="operational-settings-heading" className="space-y-3">
          <h2 id="operational-settings-heading" className="text-lg font-semibold">
            Operational settings
          </h2>
          <p className="text-sm text-muted-foreground">
            Display and security preferences apply across the Management Client.
          </p>
        </section>
      </div>
    </ControlRoomFrame>
  );
}
