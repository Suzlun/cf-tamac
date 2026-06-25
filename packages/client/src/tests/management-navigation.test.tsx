import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const appRoot = new URL('../../app/', import.meta.url);
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

const expectedNavigationLabels = [
  'Registry',
  'New',
  'Overview',
  'Threads',
  'Events',
  'Runs',
  'Compactions',
  'Schedules',
  'Tools',
  'Integrations',
  'Settings',
];

describe('Management Client navigation', () => {
  it('[MANAGEMENT-CLIENT-SHELL-S007] Management navigation excludes demo routes', () => {
    const sectionNav = readFileSync(fileURLToPath(sectionNavPath.href), 'utf8');

    for (const routeFile of expectedRouteFiles) {
      expect(existsSync(fileURLToPath(new URL(routeFile, appRoot).href))).toBe(true);
    }
    for (const label of expectedNavigationLabels) {
      expect(sectionNav).toContain(label);
    }

    expect(sectionNav).not.toMatch(/hello|users/i);
    expect(existsSync(fileURLToPath(new URL('hello/page.tsx', appRoot).href))).toBe(false);
    expect(existsSync(fileURLToPath(new URL('users/page.tsx', appRoot).href))).toBe(false);
  });
});
