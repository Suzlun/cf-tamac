import { ControlRoomFrame } from '../../../src/components/control-room-frame';
import { KeyRotationGuide } from '../../../src/components/key-rotation-guide';

export const dynamic = 'force-dynamic';

/**
 * Global Settings > Rotation, Revoke, Recovery 画面 (AGENT-MANAGEMENT-UI-S015 / S016)。
 *
 * Global key lifecycle / rotation / emergency revoke / break-glass recovery guidance を表示する。
 * 秘密情報は一切扱わず、Client-wide 設計で Agent 0 件でも参照できる。
 */
export default function KeyRotationPage() {
  return (
    <ControlRoomFrame
      title="Global Settings › Rotation Guide"
      signalLabel="Rotation revoke recovery"
      description="Global signing key lifecycle, emergency revoke, and break-glass recovery."
    >
      <KeyRotationGuide />
    </ControlRoomFrame>
  );
}
