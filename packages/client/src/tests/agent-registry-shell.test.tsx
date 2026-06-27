import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const registryPagePath = new URL('../../app/agents/page.tsx', import.meta.url);
const detailPagePath = new URL('../../app/agents/[agentId]/page.tsx', import.meta.url);
const shellPath = new URL('../../src/components/management-shell.tsx', import.meta.url);
const shellNavPath = new URL('../../src/components/management-shell-nav.tsx', import.meta.url);
const agentScopeNavPath = new URL('../../src/components/agent-scope-nav.tsx', import.meta.url);
const navConfigPath = new URL('../../src/components/management-nav-config.ts', import.meta.url);
const globalSettingsPagePath = new URL('../../app/global-settings/page.tsx', import.meta.url);

function read(filePath: URL): string {
  return readFileSync(fileURLToPath(filePath.href), 'utf8');
}

/**
 * タスク 4.1: Agent registry shell が sidebar shell と Agents entry を描画することを positive に検証する。
 * 旧 demo content の absence ではなく、supported registry shell / global nav / registration action /
 * detail affordances の存在を確認する。
 */
describe('Management Client Agent registry shell', () => {
  it('[MANAGEMENT-CLIENT-SHELL-S001] Agent registry shell が sidebar shell と Agents entry を描画する', () => {
    const registryPage = read(registryPagePath);
    const detailPage = read(detailPagePath);
    const shell = read(shellPath);
    const shellNav = read(shellNavPath);
    const agentScopeNav = read(agentScopeNavPath);
    const navConfig = read(navConfigPath);

    // Agents entry page は registry list component を描画する。
    expect(registryPage).toContain('AgentList');

    // selected-Agent overview は Agent scope と detail affordance を描画する。
    expect(detailPage).toContain('AgentToken');
    expect(detailPage).toContain('Overview');

    // root layout shell は skip link・Shadcn persistent sidebar・mobile trigger を提供する。
    expect(shell).toContain('Skip to main content');
    expect(shell).toContain('management-main');
    expect(shell).toContain('SidebarProvider');
    expect(shell).toContain('SidebarTrigger');
    expect(shellNav).toContain('ManagementSidebarContent');
    expect(shellNav).toContain('SidebarHeader');
    expect(shellNav).toContain('SidebarFooter');

    // global navigation は Agents と Global Settings のみ。
    expect(navConfig).toContain("label: 'Agents'");
    expect(navConfig).toContain("label: 'Global Settings'");
    // selected-Agent navigation の項目は nav config に定義される（label は config 側）。
    expect(agentScopeNav).toContain('AGENT_SECTION_NAV_ITEMS');
    expect(navConfig).toContain('Overview');
    expect(navConfig).toContain('Threads');
    expect(navConfig).toContain('Events');
    expect(navConfig).toContain('Runs');
    expect(navConfig).toContain('Schedules');
    expect(navConfig).toContain('Integrations');
    expect(navConfig).toContain('Settings');

    // Global Settings page が存在する。
    expect(existsSync(fileURLToPath(globalSettingsPagePath.href))).toBe(true);

    // demo content が混入していない。
    expect(`${registryPage}\n${detailPage}\n${shell}\n${shellNav}`).not.toMatch(/hello|users/i);
  });
});
