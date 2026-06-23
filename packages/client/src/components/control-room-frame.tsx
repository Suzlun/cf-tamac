import { SectionNav } from './section-nav';
import { Card } from './ui/card';
import { cn } from './ui/cn';

import type { ReactNode } from 'react';

interface ControlRoomFrameProps {
  readonly title: string;
  readonly signalLabel: string;
  readonly agentId?: string;
  readonly currentSection?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Management Client の各 route shell を包む共通 control-room chrome です。
 *
 * @param title - topline に表示する breadcrumb/title です。
 * @param signalLabel - topline の signal 表示に使う短い状態 label です。
 * @param agentId - Agent detail route の場合に section navigation link へ埋め込む Agent ID です。
 * @param currentSection - 現在選択中の section ID です。未指定時は section navigation が active 状態を持ちません。
 * @param children - page-band 内に描画する route 固有 content です。
 * @param className - `Card` wrapper に追加する任意 CSS class です。
 * @returns shadcn/ui `Card` primitive を使い、topline、section navigation、content slot を含む frame を返します。
 *
 * @remarks
 * wireframe §4.2 の layered paper gradient と control-room token を適用します。表示専用 component であり、navigation link の
 * 生成は `SectionNav` に委譲し、この component 自体は Server Action、Agent RPC、credential に触れません。
 *
 * @example
 * ```tsx
 * <ControlRoomFrame title="Agent registry › agent-01" signalLabel="threads" agentId="agent-01" currentSection="threads">
 *   <ThreadList {...props} />
 * </ControlRoomFrame>
 * ```
 */
export function ControlRoomFrame({
  title,
  signalLabel,
  agentId,
  currentSection,
  children,
  className,
}: ControlRoomFrameProps) {
  return (
    <Card className={cn('control-room overflow-hidden', className)}>
      <div className="topline">
        <span>{title}</span>
        <span className="signal">{signalLabel}</span>
      </div>
      <div className="page-band">
        <SectionNav agentId={agentId} current={currentSection} />
        {children}
      </div>
    </Card>
  );
}
