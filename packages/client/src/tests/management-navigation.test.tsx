import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const appRoot = new URL('../../app/', import.meta.url);
const managementContentPath = new URL('../../app/agents/management-content.tsx', import.meta.url);

const expectedRouteFiles = [
  'agents/page.tsx',
  'agents/new/page.tsx',
  'agents/[agentId]/page.tsx',
  'agents/[agentId]/threads/page.tsx',
  'agents/[agentId]/events/page.tsx',
  'agents/[agentId]/schedules/page.tsx',
  'agents/[agentId]/tools/page.tsx',
  'agents/[agentId]/extensions/page.tsx',
  'agents/[agentId]/settings/page.tsx',
];

const expectedNavigationLabels = [
  'Registry',
  'New',
  'Overview',
  'Threads',
  'Events',
  'Schedules',
  'Tools',
  'Extensions',
  'Settings',
];

describe('Management Client navigation', () => {
  it('[MANAGEMENT-CLIENT-S007] Management navigation excludes demo routes', () => {
    const managementContent = readFileSync(fileURLToPath(managementContentPath.href), 'utf8');

    for (const routeFile of expectedRouteFiles) {
      expect(existsSync(fileURLToPath(new URL(routeFile, appRoot).href))).toBe(true);
    }
    for (const label of expectedNavigationLabels) {
      expect(managementContent).toContain(label);
    }

    expect(managementContent).not.toMatch(/hello|users/i);
    expect(existsSync(fileURLToPath(new URL('hello/page.tsx', appRoot).href))).toBe(false);
    expect(existsSync(fileURLToPath(new URL('users/page.tsx', appRoot).href))).toBe(false);
  });
});
