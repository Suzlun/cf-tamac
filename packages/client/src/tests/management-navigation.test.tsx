import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  AGENT_SECTION_NAV_ITEMS,
  GLOBAL_NAV_ITEMS,
  SUPPORTED_MANAGEMENT_ROUTES,
} from '../components/management-nav-config';

const appRoot = new URL('../../app/', import.meta.url);

/**
 * タスク 4.3: supported management route graph を positive に検証する。
 * 旧 surface（demo routes 等）の absence を目的にするのではなく、
 * Agents / Global Settings / selected-Agent sections の shell routes が存在することを確認する。
 */
describe('Management Client navigation route graph', () => {
  it('[MANAGEMENT-CLIENT-SHELL-S007] Management route graph が supported Agent sections を公開する', () => {
    // supported route graph の page file が存在することを positive に確認する。
    const routeFileMap: readonly (readonly [string, string])[] = [
      ['/agents', 'agents/page.tsx'],
      ['/agents/new', 'agents/new/page.tsx'],
      ['/global-settings', 'global-settings/page.tsx'],
      ['/agents/:agentId', 'agents/[agentId]/page.tsx'],
    ];
    for (const [route, file] of routeFileMap) {
      expect(SUPPORTED_MANAGEMENT_ROUTES).toContain(route);
      expect(existsSync(fileURLToPath(new URL(file, appRoot).href))).toBe(true);
    }

    // selected-Agent section routes（Overview は [agentId]/page.tsx、それ以外は segment dir）が存在する。
    for (const item of AGENT_SECTION_NAV_ITEMS) {
      const relative =
        item.segment === ''
          ? 'agents/[agentId]/page.tsx'
          : `agents/[agentId]/${item.segment}/page.tsx`;
      expect(existsSync(fileURLToPath(new URL(relative, appRoot).href))).toBe(true);
    }

    // global navigation は Agents と Global Settings のみ（Tools/Compactions 単独項目を含まない）。
    const globalLabels = GLOBAL_NAV_ITEMS.map((item) => item.label);
    expect(globalLabels).toEqual(['Agents', 'Global Settings']);
    expect(globalLabels).not.toContain('Tools');
    expect(globalLabels).not.toContain('Compactions');

    // selected-Agent navigation labels は Overview〜Settings のみ。
    const sectionLabels = AGENT_SECTION_NAV_ITEMS.map((item) => item.label);
    expect(sectionLabels).toEqual([
      'Overview',
      'Threads',
      'Events',
      'Runs',
      'Schedules',
      'Integrations',
      'Settings',
    ]);
    expect(sectionLabels).not.toContain('Tools');
    expect(sectionLabels).not.toContain('Compactions');

    // standalone tools/compactions route は supported graph に含まれない。
    expect(SUPPORTED_MANAGEMENT_ROUTES).not.toContain('/agents/:agentId/tools');
    expect(SUPPORTED_MANAGEMENT_ROUTES).not.toContain('/agents/:agentId/compactions');

    // Global Settings 配下の Client-wide signing operations は Agent 0 件でも到達できる。
    expect(SUPPORTED_MANAGEMENT_ROUTES).toContain('/global-settings/signing-keys');
    expect(SUPPORTED_MANAGEMENT_ROUTES).toContain('/global-settings/trust-config-export');
    expect(SUPPORTED_MANAGEMENT_ROUTES).toContain('/global-settings/key-rotation');
  });
});
