import { listSigningKeys } from '@cf-tamac/client/server/actions/signing-keys';
import { buildTrustConfigExport } from '@cf-tamac/client/server/actions/trust-config';

import { ControlRoomFrame } from '../../../src/components/control-room-frame';
import { TrustConfigExportView } from '../../../src/components/trust-config-export';

export const dynamic = 'force-dynamic';

/**
 * Global Settings > Trust Config Export 画面 (AGENT-MANAGEMENT-UI-S013 / S014 / S020)。
 *
 * 公開情報だけの `AGENT_CONTROL_PLANE_TRUST` JSON を生成する。private parameter `d` /
 * private JWK plaintext / 暗号化 private JWK / 生 JWT は一切扱わない。Agent 0 件でも利用できる。
 * feature component は server-only module を直接 import せず、page から action callback を渡す。
 */
export default async function TrustConfigExportPage() {
  const signingKeys = await listSigningKeys();
  return (
    <ControlRoomFrame
      title="Global Settings › Trust Config Export"
      signalLabel="Public-only trust export"
      description="Generate AGENT_CONTROL_PLANE_TRUST JSON from Global signing keys."
    >
      <TrustConfigExportView signingKeys={signingKeys} onBuildExport={buildTrustConfigExport} />
    </ControlRoomFrame>
  );
}
