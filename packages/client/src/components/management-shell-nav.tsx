'use client';

import { usePathname } from 'next/navigation';

import { AgentScopeNav } from './agent-scope-nav';
import { GLOBAL_NAV_ITEMS, SidebarNavLink } from './section-nav';
import {
  SidebarContent as ShadcnSidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarSeparator,
} from './ui/sidebar';

/**
 * sidebar に表示する永続的なブランド header。
 * footer を同じ Fragment 内に混ぜないことで、`mt-auto` が nav を画面外へ押し出す退行を防ぐ。
 */
function SidebarBrandHeader() {
  return (
    <SidebarHeader className="px-3 py-4">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground"
        >
          cf
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-sidebar-foreground">
            cf-tamac Management
          </p>
          <p className="text-xs text-sidebar-foreground/60">Management Client</p>
        </div>
      </div>
    </SidebarHeader>
  );
}

/**
 * sidebar 下部の補助情報。必ず nav content の後に置き、`mt-auto` で footer だけを下へ送る。
 */
function SidebarStatusFooter() {
  return (
    <SidebarFooter className="mt-auto px-3 py-4 text-xs text-sidebar-foreground/60">
      <p>Server-side management shell</p>
      <p>Agent RPC stays server-only</p>
    </SidebarFooter>
  );
}

/**
 * global navigation。現在の pathname で active 状態を判定する。
 */
function GlobalNav({ pathname }: { readonly pathname: string }) {
  return (
    <SidebarGroup role="navigation" aria-label="Global navigation">
      <SidebarGroupLabel>Global</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {GLOBAL_NAV_ITEMS.map((item) => {
            // Agents は `/agents` 配下、Global Settings は `/global-settings` で active にする。
            const active =
              item.slug === 'agents'
                ? pathname === '/agents' || pathname.startsWith('/agents/')
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <SidebarMenuItem key={item.slug}>
                <SidebarNavLink href={item.href} label={item.label} active={active} />
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/**
 * sidebar 全体の内容（ブランド・global nav・selected-Agent nav・フッター）。
 * desktop aside と mobile Sheet の両方から再利用する。
 */
export function ManagementSidebarContent() {
  // pathname はクライアントでのみ取得できるため、この component は Client Component とする。
  const pathname = usePathname();
  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <SidebarBrandHeader />
      <ShadcnSidebarContent className="gap-3 px-2 py-2">
        <GlobalNav pathname={pathname} />
        <SidebarSeparator />
        <AgentScopeNav />
      </ShadcnSidebarContent>
      <SidebarStatusFooter />
    </div>
  );
}
