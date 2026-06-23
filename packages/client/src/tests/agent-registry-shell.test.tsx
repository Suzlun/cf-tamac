import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const registryPagePath = new URL('../../app/agents/page.tsx', import.meta.url);
const detailPagePath = new URL('../../app/agents/[agentId]/page.tsx', import.meta.url);
const sectionNavPath = new URL('../../src/components/section-nav.tsx', import.meta.url);

const expectedRouteFiles = [
  'agents/page.tsx',
  'agents/new/page.tsx',
  'agents/[agentId]/page.tsx',
  'agents/[agentId]/threads/page.tsx',
  'agents/[agentId]/events/page.tsx',
  'agents/[agentId]/runs/page.tsx',
  'agents/[agentId]/compactions/page.tsx',
  'agents/[agentId]/schedules/page.tsx',
  'agents/[agentId]/tools/page.tsx',
  'agents/[agentId]/integrations/page.tsx',
  'agents/[agentId]/settings/page.tsx',
];

describe('Management Client Agent registry shell', () => {
  it('[MANAGEMENT-CLIENT-S001] Agent registry shell renders without demo content', () => {
    const registryPage = readFileSync(fileURLToPath(registryPagePath.href), 'utf8');
    const detailPage = readFileSync(fileURLToPath(detailPagePath.href), 'utf8');
    const sectionNav = readFileSync(fileURLToPath(sectionNavPath.href), 'utf8');

    const appRoot = new URL('../../app/', import.meta.url);
    for (const routeFile of expectedRouteFiles) {
      expect(existsSync(fileURLToPath(new URL(routeFile, appRoot).href))).toBe(true);
    }

    expect(registryPage).toContain('AgentList');
    expect(detailPage).toContain('AgentToken');
    expect(sectionNav).toContain('Registry');
    expect(sectionNav).toContain('Overview');
    expect(sectionNav).toContain('Threads');
    expect(sectionNav).toContain('Events');
    expect(sectionNav).toContain('Runs');
    expect(sectionNav).toContain('Compactions');
    expect(sectionNav).toContain('Schedules');
    expect(sectionNav).toContain('Tools');
    expect(sectionNav).toContain('Integrations');
    expect(sectionNav).toContain('Settings');

    expect(`${registryPage}\n${detailPage}\n${sectionNav}`).not.toMatch(/hello|users/i);
  });
});
