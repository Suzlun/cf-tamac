import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const shellPath = new URL('../components/management-shell.tsx', import.meta.url);
const shellNavPath = new URL('../components/management-shell-nav.tsx', import.meta.url);
const agentScopeNavPath = new URL('../components/agent-scope-nav.tsx', import.meta.url);
const sidebarPrimitivePath = new URL('../components/ui/sidebar.tsx', import.meta.url);
const navConfigPath = new URL('../components/management-nav-config.ts', import.meta.url);
const agentListPath = new URL('../components/agent-list.tsx', import.meta.url);
const overviewPagePath = new URL('../../app/agents/[agentId]/page.tsx', import.meta.url);
const agentsPagePath = new URL('../../app/agents/page.tsx', import.meta.url);
const eventsPagePath = new URL('../../app/agents/[agentId]/events/page.tsx', import.meta.url);
const integrationsPagePath = new URL(
  '../../app/agents/[agentId]/integrations/page.tsx',
  import.meta.url
);
const runsPagePath = new URL('../../app/agents/[agentId]/runs/page.tsx', import.meta.url);
const schedulesPagePath = new URL('../../app/agents/[agentId]/schedules/page.tsx', import.meta.url);
const threadsPagePath = new URL('../../app/agents/[agentId]/threads/page.tsx', import.meta.url);
const globalSettingsPagePath = new URL('../../app/global-settings/page.tsx', import.meta.url);
const dataUnavailableAlertPath = new URL(
  '../components/agent-data-unavailable-alert.tsx',
  import.meta.url
);
const detailDrawerPath = new URL('../components/detail-drawer.tsx', import.meta.url);
const confirmDialogPath = new URL('../components/confirm-dialog.tsx', import.meta.url);
const controlRoomFramePath = new URL('../components/control-room-frame.tsx', import.meta.url);
const dataTablePath = new URL('../components/data-table.tsx', import.meta.url);

function read(filePath: URL): string {
  return readFileSync(fileURLToPath(filePath.href), 'utf8');
}

/**
 * タスク 4.4 / 4.5 / 4.6 / 4.7 / 4.8: Management Client shell の scope 分離と文脈 detail を検証する。
 * 全て positive supported surface の検証であり、旧 surface の absence を目的にしない。
 */
describe('Management Client shell scope separation', () => {
  it('[MANAGEMENT-CLIENT-SHELL-S009] Agent 未選択時の左サイドメニューが global scope を表示する', () => {
    const shellNav = read(shellNavPath);
    const agentScopeNav = read(agentScopeNavPath);
    const navConfig = read(navConfigPath);

    // global navigation は Agents と Global Settings のみ。
    expect(navConfig).toContain("'Agents'");
    expect(navConfig).toContain("'Global Settings'");
    // Agent 未選択時は selected-Agent nav が disabled semantics を持つ。
    expect(agentScopeNav).toContain('aria-disabled');
    expect(agentScopeNav).toContain('Select an Agent');
    // shell は skip link と persistent desktop sidebar を持つ。
    expect(shellNav).toContain('Global navigation');
    expect(read(shellPath)).toContain('SidebarProvider');
    expect(shellNav).toContain('SidebarHeader');
    expect(shellNav).toContain('SidebarGroupLabel>Global');
    // footer の mt-auto は nav content の後に置く。これで `/agents` の nav が画面外に押し出されない。
    const renderedOrder = shellNav.slice(
      shellNav.indexOf('export function ManagementSidebarContent')
    );
    expect(renderedOrder.indexOf('ShadcnSidebarContent')).toBeLessThan(
      renderedOrder.indexOf('SidebarStatusFooter')
    );
    expect(renderedOrder.indexOf('GlobalNav')).toBeLessThan(
      renderedOrder.indexOf('SidebarStatusFooter')
    );
  });

  it('[MANAGEMENT-CLIENT-SHELL-S010] Agent 選択後に selected-Agent navigation が表示される', () => {
    const agentScopeNav = read(agentScopeNavPath);
    const navConfig = read(navConfigPath);

    // selected-Agent nav は Overview〜Settings を表示する。
    expect(agentScopeNav).toContain('AGENT_SECTION_NAV_ITEMS');
    expect(agentScopeNav).toContain('Selected-Agent navigation');
    expect(navConfig).toContain("'Overview'");
    expect(navConfig).toContain("'Settings'");
    // global nav への到達性は shell が保証する（global nav は常時表示）。
    expect(read(shellNavPath)).toContain('GLOBAL_NAV_ITEMS');
  });

  it('[MANAGEMENT-CLIENT-SHELL-S010] desktop sidebar が全高固定で main scroll から分離される', () => {
    const sidebarPrimitive = read(sidebarPrimitivePath);

    // collapsible="none" でも desktop sidebar は fixed + h-svh に閉じ、main content の縦スクロールに巻き込まれない。
    expect(sidebarPrimitive).toContain("if (collapsible === 'none')");
    expect(sidebarPrimitive).toContain(
      'fixed inset-y-0 z-10 hidden h-svh w-[--sidebar-width] md:flex'
    );
    expect(sidebarPrimitive).toContain('relative w-[--sidebar-width] bg-transparent');
    // mobile は同じ primitive の Sheet 経路を使い、狭幅で通常 div の sidebar を常時表示しない。
    expect(sidebarPrimitive.indexOf('if (isMobile)')).toBeLessThan(
      sidebarPrimitive.indexOf("if (collapsible === 'none')")
    );
  });

  it('[MANAGEMENT-CLIENT-SHELL-S011] New Agent action が Agents screen から registration flow を開く', () => {
    const agentList = read(agentListPath);
    const agentsPage = read(agentsPagePath);

    // New Agent は Agents screen 内の primary action（/agents/new registration flow への導線）。
    expect(agentList).toContain('New Agent');
    expect(agentList).toContain('/agents/new');
    expect(agentsPage).toContain('AgentList');
  });

  it('[MANAGEMENT-CLIENT-SHELL-S011] Agent list timestamp が hydration-safe な UTC 表示を使う', () => {
    const agentList = read(agentListPath);

    // SSR と browser で locale/timezone が異なっても一致するように、registry timestamp は UTC 文字列へ固定する。
    expect(agentList).toContain('toISOString()');
    expect(agentList).toContain('UTC');
    expect(agentList).not.toContain('toLocaleString()');
  });

  it('[MANAGEMENT-CLIENT-SHELL-S011] Agent selection が last-opened 更新失敗でも遷移する', () => {
    const agentList = read(agentListPath);

    // last-opened 更新は補助的な台帳書き込みなので、失敗しても Agent overview への遷移を必ず実行する。
    expect(agentList).toContain('try {');
    expect(agentList).toContain('await onOpen(agentId);');
    expect(agentList).toContain('catch {');
    expect(agentList).toContain('router.push(`/agents/${agentId}`);');
  });

  it('[MANAGEMENT-CLIENT-SHELL-S012] Tool と Compaction context が選択中 Agent 画面内で確認できる', () => {
    const runsPage = read(runsPagePath);
    const threadsPage = read(threadsPagePath);

    // Tool catalog/approval は Runs context の文脈 detail として描画される。
    expect(runsPage).toContain('ToolView');
    expect(runsPage).toContain('listTools');
    // ThreadCompaction/Memory は Threads context の文脈 detail として描画される。
    expect(threadsPage).toContain('CompactionView');
    expect(threadsPage).toContain('getLatestCompaction');
  });

  it('[AGENT-MANAGEMENT-UI-S009] selected-Agent routes が Agent RPC 失敗を secret-free fallback に閉じる', () => {
    const dataUnavailableAlert = read(dataUnavailableAlertPath);
    const selectedAgentPages = [
      read(eventsPagePath),
      read(integrationsPagePath),
      read(runsPagePath),
      read(schedulesPagePath),
      read(threadsPagePath),
    ];

    // fallback component は原因詳細や stack trace を props として受け取らず、固定の安全な文言だけを表示する。
    expect(dataUnavailableAlert).toContain('Agent RPC data is temporarily unavailable');
    expect(dataUnavailableAlert).not.toContain('error.message');
    expect(dataUnavailableAlert).not.toContain('stack');

    // Agent RPC を読む selected-Agent routes は Next error boundary に例外を漏らさず、shell 内の alert に変換する。
    for (const page of selectedAgentPages) {
      expect(page).toContain('AgentDataUnavailableAlert');
      expect(page).toContain('catch');
    }
  });

  it('[MANAGEMENT-CLIENT-SHELL-S013] Global Settings が Client-wide 設定だけを表示する', () => {
    const globalSettings = read(globalSettingsPagePath);

    // Client-wide 設定（workspace preferences / credential vault / operational settings）を表示する。
    expect(globalSettings).toContain('Workspace preferences');
    expect(globalSettings).toContain('Credential vault references');
    expect(globalSettings).toContain('Operational settings');
    expect(globalSettings).toContain('Client-wide');

    // selected-Agent identity / Agent scoped actions は含まれない。
    expect(globalSettings).not.toContain('Rotate Agent credential');
    expect(globalSettings).not.toContain('model policy');
    expect(globalSettings).not.toContain('agentId');
  });
});

/**
 * タスク 4.21 / 4.22 / 4.23: selected-Agent 画面の card/list/detail 構成、文脈 detail、responsive detail を検証する。
 */
describe('Selected-Agent card/list/detail and responsive detail', () => {
  it('[AGENT-MANAGEMENT-UI-S019] selected-Agent screens が card list detail 構成で表示される', () => {
    const agentList = read(agentListPath);
    const overview = read(overviewPagePath);

    // Agents entry は card/list composition（table 偏重ではない）。
    expect(agentList).toContain('Card');
    expect(agentList).toContain('CardContent');
    // Overview は card/list/detail composition。
    expect(overview).toContain('Card');
    expect(overview).toContain('sm:grid-cols-3');
  });

  it('[AGENT-MANAGEMENT-UI-S020] Tool と Compaction が文脈情報として表示される', () => {
    const runsPage = read(runsPagePath);
    const threadsPage = read(threadsPagePath);
    const overview = read(overviewPagePath);

    // ToolInvocation は Runs context、Compaction は Threads/Overview context。
    expect(runsPage).toContain('ToolView');
    expect(threadsPage).toContain('CompactionView');
    expect(overview).toContain('Latest memory');
    expect(overview).toContain('Open in Threads');
  });

  it('[AGENT-MANAGEMENT-UI-S021] モバイル幅で selected-Agent detail が Sheet と focus management を使う', () => {
    const shell = read(shellPath);
    const detailDrawer = read(detailDrawerPath);
    const confirmDialog = read(confirmDialogPath);

    // shell は Shadcn Sidebar の mobile Sheet と SidebarTrigger を使う。
    expect(shell).toContain('SidebarTrigger');
    expect(shell).toContain('Open navigation');
    expect(shell).toContain('SidebarInset');
    // detail surface は focus management を持つ local Shadcn component。
    expect(detailDrawer).toContain('initialFocusSelector');
    expect(detailDrawer).toContain('onOpenAutoFocus');
    expect(confirmDialog).toContain('role="alertdialog"');
  });
});

describe('Management Client visual density', () => {
  it('[CLIENT-DESIGN-SYSTEM-S003] page frame と table cells が読みやすい余白を持つ', () => {
    const frame = read(controlRoomFramePath);
    const dataTable = read(dataTablePath);
    const agentList = read(agentListPath);

    expect(frame).toContain('px-6 py-8');
    expect(frame).toContain('space-y-8');
    expect(dataTable).toContain('px-4 py-3');
    expect(dataTable).toContain('leading-6');
    expect(agentList).toContain('space-y-5');
    expect(agentList).toContain('rounded-lg bg-muted/40 p-4');
  });
});
