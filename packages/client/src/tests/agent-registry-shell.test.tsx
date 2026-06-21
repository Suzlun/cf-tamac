import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const managementContentPath = new URL('../../app/agents/management-content.tsx', import.meta.url);
const registryPagePath = new URL('../../app/agents/page.tsx', import.meta.url);
const detailPagePath = new URL('../../app/agents/[agentId]/page.tsx', import.meta.url);

describe('Management Client Agent registry shell', () => {
  it('[MANAGEMENT-CLIENT-S001] Agent registry shell renders without demo content', () => {
    const managementContent = readFileSync(fileURLToPath(managementContentPath.href), 'utf8');
    const registryPage = readFileSync(fileURLToPath(registryPagePath.href), 'utf8');
    const detailPage = readFileSync(fileURLToPath(detailPagePath.href), 'utf8');

    expect(registryPage).toContain('AgentRegistryShell');
    expect(detailPage).toContain('AgentSectionShell');
    expect(managementContent).toContain('Agent registry');
    expect(managementContent).toContain('Register the first managed Agent.');
    expect(managementContent).toContain('New Agent record');
    expect(managementContent).toContain('Preview detail shell');
    expect(managementContent).toContain('threads');
    expect(managementContent).toContain('events');
    expect(managementContent).toContain('agent_id:');
    expect(managementContent).toContain('Detail shell is ready for Agent management.');

    expect(`${registryPage}\n${detailPage}\n${managementContent}`).not.toMatch(/hello|users/i);
  });
});
