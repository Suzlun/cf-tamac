'use client';

import { usePathname } from 'next/navigation';

import { AGENT_SECTION_NAV_ITEMS, SidebarNavLink, buildAgentSectionHref } from './section-nav';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from './ui/sidebar';

/**
 * 現在の pathname から選択中 Agent の情報を導出する。
 *
 * @returns Agent が選択されている場合は `{ agentId, activeSlug }`、未選択の場合は `null`。
 */
function readSelectedAgent(pathname: string): {
  agentId: string;
  activeSlug: string;
} | null {
  // `/agents/{agentId}` または `/agents/{agentId}/{section}` のみを Agent 選択状態とみなす。
  // `/agents`（一覧）や `/agents/new`（登録 flow）は Agent 未選択として扱う。
  if (pathname === '/agents' || pathname === '/agents/new') {
    return null;
  }
  const match = /^\/agents\/([^/]+)(?:\/([^#/?]+))?/.exec(pathname);
  const agentId = match?.[1];
  if (agentId === undefined) {
    return null;
  }
  const section = match?.[2] ?? '';
  // section segment から対応する nav slug を逆引きする。Overview（section 空）以外は segment 一致。
  const item = AGENT_SECTION_NAV_ITEMS.find((entry) => entry.segment === section);
  return { agentId: decodeURIComponent(agentId), activeSlug: item?.slug ?? 'overview' };
}

/**
 * selected-Agent navigation を描画する Client Component。
 *
 * @remarks
 * root layout sidebar に組み込まれ、`usePathname()` で現在の選択中 Agent と active section を判定する。
 * Agent 未選択時は selected-Agent navigation を disabled semantics（aria-disabled）で描画し、
 * global navigation だけが有効な状態を保つ（タスク 2.2 / MANAGEMENT-CLIENT-SHELL-S009）。
 * Agent RPC・credential・server-only module には一切依存しない表示専用 component。
 */
export function AgentScopeNav() {
  // usePathname() は app router で string を返す。client-side でのみ現在位置を判定する。
  const selected = readSelectedAgent(usePathname());

  // Agent 未選択時は disabled group として描画し、global scope だけが操作可能であることを示す。
  if (selected === null) {
    return (
      <SidebarGroup role="navigation" aria-label="Selected-Agent navigation" aria-disabled="true">
        <SidebarGroupLabel>Agent scope</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {AGENT_SECTION_NAV_ITEMS.map((item) => (
              <SidebarMenuItem key={item.slug}>
                <SidebarMenuButton
                  aria-disabled="true"
                  className="h-9 cursor-not-allowed opacity-45"
                >
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          <p className="mt-3 px-2 text-xs leading-5 text-sidebar-foreground/60">
            Select an Agent to enable its scoped navigation.
          </p>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  const { agentId, activeSlug } = selected;

  return (
    <SidebarGroup role="navigation" aria-label={`Selected-Agent navigation for ${agentId}`}>
      <SidebarGroupLabel>Agent scope</SidebarGroupLabel>
      <SidebarGroupContent className="space-y-3">
        {/* Agent identity header: 表示名は main content 側で扱い、sidebar では Agent ID で scope を示す。 */}
        <div className="rounded-md border border-sidebar-border bg-sidebar-accent/50 px-3 py-3">
          <span className="block text-sm font-medium text-sidebar-foreground">Selected Agent</span>
          <span className="block truncate font-mono text-xs text-sidebar-foreground/65">
            {agentId}
          </span>
        </div>
        <SidebarMenu>
          {AGENT_SECTION_NAV_ITEMS.map((item) => (
            <SidebarMenuItem key={item.slug}>
              <SidebarNavLink
                href={buildAgentSectionHref(agentId, item.segment)}
                label={item.label}
                active={item.slug === activeSlug}
              />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
