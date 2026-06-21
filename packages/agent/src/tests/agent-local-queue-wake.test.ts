import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { agentFoundationTableDefinitions } from '../storage';

const aiAgentSourcePath = new URL('../AIAgent.ts', import.meta.url);
const tableInitializerPath = new URL('../storage/table-initializer.ts', import.meta.url);
const wranglerConfigPath = new URL('../../wrangler.toml', import.meta.url);

describe('Agent-local Queue wake foundation', () => {
  it('[AGENT-PLATFORM-S012] Agent-local Queue coalesces scheduler wakes without owning events', () => {
    const tableNames = agentFoundationTableDefinitions.map((table) => table.tableName);
    const wakeTable = agentFoundationTableDefinitions.find(
      (table) => table.tableName === 'agent_scheduler_wake_state'
    );
    const aiAgentSource = readFileSync(fileURLToPath(aiAgentSourcePath.href), 'utf8');
    const tableInitializer = readFileSync(fileURLToPath(tableInitializerPath.href), 'utf8');
    const wranglerConfig = readFileSync(fileURLToPath(wranglerConfigPath.href), 'utf8');

    expect(tableNames).toEqual(
      expect.arrayContaining([
        'agent_threads',
        'agent_thread_sections',
        'agent_events',
        'agent_runs',
        'agent_run_inputs',
        'agent_scheduler_wake_state',
      ])
    );
    expect(wakeTable).toMatchObject({
      purpose: expect.stringContaining('wake coalescing'),
      uniqueKeys: ['agent_id'],
    });

    for (const tableName of tableNames) {
      expect(tableInitializer).toContain(`CREATE TABLE IF NOT EXISTS ${tableName}`);
    }
    expect(tableInitializer).toContain('wake_status TEXT NOT NULL');
    expect(tableInitializer).toContain('pending_count INTEGER NOT NULL');

    expect(aiAgentSource.indexOf('this.appendEvent(')).toBeLessThan(
      aiAgentSource.indexOf('this.createPendingRun(')
    );
    expect(aiAgentSource.indexOf('this.createPendingRun(')).toBeLessThan(
      aiAgentSource.indexOf('this.recordSchedulerWake(')
    );
    expect(aiAgentSource).toContain(
      "current.wakeStatus === 'pending' || current.wakeStatus === 'running'"
    );
    expect(aiAgentSource).toContain('const pendingCount = current.pendingCount + 1');

    expect(wranglerConfig).not.toMatch(/\[\[queues\.(?:producers|consumers)]]/);
    expect(aiAgentSource).not.toMatch(/\.send\(/);
  });
});
