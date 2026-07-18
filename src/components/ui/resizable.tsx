'use client';

import { GripVertical } from 'lucide-react';
import {
  Group,
  Panel,
  Separator,
  type GroupProps,
  type SeparatorProps,
} from 'react-resizable-panels';

import { cn } from '@cf-tamac/client/lib/utils';

/**
 * Shadcn 互換の Resizable ラッパー群。
 *
 * `react-resizable-panels` v4 はコンポーネント名として `Group` / `Panel` / `Separator`
 * を公開している。本ファイルは Shadcn の慣習的な export 名（`ResizablePanelGroup` /
 * `ResizablePanel` / `ResizableHandle`）を維持しつつ、v4 の API に委譲する。
 * これらは表示・レイアウト用の primitive であり、Agent RPC や credential には触れない。
 */

/**
 * resizable なパネルグループの外枠。
 * v4 の `Group` に Tailwind の flex レイアウトと縦横切り替えを追加する薄いラッパー。
 */
const ResizablePanelGroup = ({ className, ...props }: GroupProps) => (
  <Group
    className={cn('flex h-full w-full data-[orientation=vertical]:flex-col', className)}
    {...props}
  />
);

/**
 * サイズ変更可能な単一パネル。v4 の `Panel` をそのまま再エクスポートする。
 */
const ResizablePanel = Panel;

/**
 * パネル間のドラッグ可能な区切り線。
 * v4 の `Separator` を装飾し、オプションで grip handle を表示する。
 */
const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: SeparatorProps & {
  /** `true` の場合、区切り線の中央に grip アイコンを表示する。 */
  withHandle?: boolean;
}) => (
  <Separator
    className={cn(
      'relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 data-[orientation=vertical]:h-px data-[orientation=vertical]:w-full data-[orientation=vertical]:after:left-0 data-[orientation=vertical]:after:h-1 data-[orientation=vertical]:after:w-full data-[orientation=vertical]:after:-translate-y-1/2 data-[orientation=vertical]:after:translate-x-0 [&[data-orientation=vertical]>div]:rotate-90',
      className
    )}
    {...props}
  >
    {withHandle === true && (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
        <GripVertical className="h-2.5 w-2.5" />
      </div>
    )}
  </Separator>
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
