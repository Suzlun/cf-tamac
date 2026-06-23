import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { agentFoundationTableDefinitions } from '../storage';

const aiAgentSourcePath = new URL('../AIAgent.ts', import.meta.url);
const foundationEventsPath = new URL('../AIAgent.foundation-events.ts', import.meta.url);
const integrationTableInitializerPath = new URL(
  '../storage/integration-table-initializer.ts',
  import.meta.url
);
const tableInitializerPath = new URL('../storage/table-initializer.ts', import.meta.url);
const toolTableInitializerPath = new URL('../storage/tool-table-initializer.ts', import.meta.url);
const wranglerConfigPath = new URL('../../wrangler.toml', import.meta.url);

describe('Agent-local Queue wake foundation', () => {
  it('[AGENT-PLATFORM-S012] [AGENT-RUNTIME-S001] Agent-local Queue coalesces scheduler wakes without owning events', () => {
    const tableNames = agentFoundationTableDefinitions.map((table) => table.tableName);
    const wakeTable = agentFoundationTableDefinitions.find(
      (table) => table.tableName === 'agent_scheduler_wake_state'
    );
    const aiAgentSource = readFileSync(fileURLToPath(aiAgentSourcePath.href), 'utf8');
    const foundationEventsSource = readFileSync(fileURLToPath(foundationEventsPath.href), 'utf8');
    const integrationTableInitializer = readFileSync(
      fileURLToPath(integrationTableInitializerPath.href),
      'utf8'
    );
    const tableInitializer = readFileSync(fileURLToPath(tableInitializerPath.href), 'utf8');
    const toolTableInitializer = readFileSync(fileURLToPath(toolTableInitializerPath.href), 'utf8');
    const initializerSources = `${tableInitializer}\n${toolTableInitializer}\n${integrationTableInitializer}`;
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
      expect(initializerSources).toContain(`CREATE TABLE IF NOT EXISTS ${tableName}`);
    }
    expect(tableInitializer).toContain('wake_status TEXT NOT NULL');
    expect(tableInitializer).toContain('pending_count INTEGER NOT NULL');

    expect(foundationEventsSource.indexOf('appendEvent(')).toBeLessThan(
      foundationEventsSource.indexOf('createPendingRun(')
    );
    expect(foundationEventsSource.indexOf('createPendingRun(')).toBeLessThan(
      foundationEventsSource.lastIndexOf('requestSchedulerWake(')
    );
    expect(aiAgentSource).toContain('requestSchedulerWake(payload: AgentLocalQueueWakePayload)');
    expect(aiAgentSource).toContain('processPendingRuns(payload: AgentLocalQueueProcessPayload)');
    expect(aiAgentSource).toContain("this.queue('processPendingRuns'");
    expect(aiAgentSource).toContain("reason: 'event_accepted'");
    expect(tableInitializer).toContain('pending_since_ms INTEGER NOT NULL');
    expect(tableInitializer).toContain('last_served_at_ms INTEGER');

    expect(wranglerConfig).not.toMatch(/\[\[queues\.(?:producers|consumers)]]/);
    expect(aiAgentSource).not.toMatch(/\.send\(/);
  });
});
