import { ManagementSidebarContent } from './management-shell-nav';
import { Sidebar, SidebarInset, SidebarProvider, SidebarTrigger } from './ui/sidebar';

import type { ReactNode } from 'react';

interface ManagementShellProps {
  readonly children: ReactNode;
}

/**
 * Management Client の root layout shell。
 *
 * @remarks
 * タスク 2.1 / MANAGEMENT-CLIENT-SHELL-S009: desktop では persistent な左サイドメニューを表示し、
 * narrow viewport では accessible な `Sheet` navigation（focus trap / Escape close / focus return 付き）を表示する。
 * 最初の skip link で main 内容へ直接移動でき、focus を戻せる。
 * Server Component として描画し、Agent RPC・credential・server-only module には一切依存しない。
 *
 * @example
 * ```tsx
 * // app/layout.tsx
 * <ManagementShell>{children}</ManagementShell>
 * ```
 */
export function ManagementShell({ children }: ManagementShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* skip link: focus されるまで視覚的に隠し、main への直接移動を許可する。 */}
      <a
        href="#management-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:shadow"
      >
        Skip to main content
      </a>
      <SidebarProvider defaultOpen>
        {/* Shadcn Sidebar primitive を使い、desktop では永続表示、mobile では Sheet として表示する。 */}
        <Sidebar aria-label="Management navigation" collapsible="none">
          <ManagementSidebarContent />
        </Sidebar>
        <SidebarInset id="management-main" className="min-w-0">
          {/* mobile では SidebarTrigger から Shadcn Sheet sidebar を開く。desktop では永続 sidebar が見える。 */}
          <div className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background px-4 md:hidden">
            <SidebarTrigger aria-label="Open navigation" />
            <span className="text-sm font-semibold">cf-tamac Management</span>
          </div>
          {children}
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
