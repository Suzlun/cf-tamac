import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  agentFoundationTableDefinitions,
  agentFoundationTables,
  agentStorageRepositoryNames,
} from '../storage';

const sourceRoot = new URL('../', import.meta.url);
const storageRoot = new URL('../storage/repositories/', import.meta.url);
const aiAgentSourcePath = new URL('../AIAgent.ts', import.meta.url);
const foundationEventsPath = new URL('../AIAgent.foundation-events.ts', import.meta.url);
const schedulerWakePath = new URL('../durable-object/scheduler-wake.ts', import.meta.url);
const databaseAdapterPath = new URL('../storage/database.ts', import.meta.url);
const drizzleSchemaPath = new URL('../storage/schema/agent-storage.ts', import.meta.url);
const integrationSchemaPath = new URL('../storage/schema/integration.ts', import.meta.url);
const integrationTableInitializerPath = new URL(
  '../storage/initializers/integration.ts',
  import.meta.url
);
const memorySchemaPath = new URL('../storage/schema/memory.ts', import.meta.url);
const modelInvocationSchemaPath = new URL('../storage/schema/model-invocation.ts', import.meta.url);
const modelPolicySchemaPath = new URL('../storage/schema/model-policy.ts', import.meta.url);
const scheduleSchemaPath = new URL('../storage/schema/schedule.ts', import.meta.url);
const toolSchemaPath = new URL('../storage/schema/tool.ts', import.meta.url);
const repositoriesPath = new URL('../storage/repositories/factory.ts', import.meta.url);
const tableInitializerPath = new URL('../storage/initializers/agent-storage.ts', import.meta.url);

const requiredStorageSeams = [
  {
    repositoryFile: 'profile-repository.ts',
    repositoryName: 'AgentProfileRepository',
    tableName: 'agent_profile',
  },
  {
    repositoryFile: 'credentials-repository.ts',
    repositoryName: 'AgentCredentialsRepository',
    tableName: 'agent_credentials',
  },
  {
    repositoryFile: 'principals-repository.ts',
    repositoryName: 'AgentPrincipalsRepository',
    tableName: 'agent_principals',
  },
  {
    repositoryFile: 'grants-repository.ts',
    repositoryName: 'AgentGrantsRepository',
    tableName: 'agent_grants',
  },
  {
    repositoryFile: 'audit-repository.ts',
    repositoryName: 'AgentAuditRepository',
    tableName: 'agent_audit_events',
  },
  {
    repositoryFile: 'request-nonces-repository.ts',
    repositoryName: 'AgentRequestNoncesRepository',
    tableName: 'agent_request_nonces',
  },
  {
    repositoryFile: 'idempotency-repository.ts',
    repositoryName: 'AgentIdempotencyRepository',
    tableName: 'agent_idempotency_records',
  },
  {
    repositoryFile: 'threads-repository.ts',
    repositoryName: 'AgentThreadsRepository',
    tableName: 'agent_threads',
  },
  {
    repositoryFile: 'sections-repository.ts',
    repositoryName: 'AgentSectionsRepository',
    tableName: 'agent_thread_sections',
  },
  {
    repositoryFile: 'events-repository.ts',
    repositoryName: 'AgentEventsRepository',
    tableName: 'agent_events',
  },
  {
    repositoryFile: 'pending-runs-repository.ts',
    repositoryName: 'AgentPendingRunsRepository',
    tableName: 'agent_runs',
  },
  {
    repositoryFile: 'schedules-repository.ts',
    repositoryName: 'AgentSchedulesRepository',
    tableName: 'agent_schedules',
  },
] as const;

describe('Agent DO SQLite storage foundation', () => {
  it('[AGENT-LIFECYCLE-S001] [AGENT-EVENTING-S005] [AGENT-SECURITY-S006] creates stable Stage 2 schema and repository seams', () => {
    const tableNames = agentFoundationTableDefinitions.map((table) => table.tableName);
    const repositoryNames = agentFoundationTableDefinitions.map((table) => table.repositoryName);
    const databaseAdapter = readFileSync(fileURLToPath(databaseAdapterPath.href), 'utf8');
    const drizzleSchema = readFileSync(fileURLToPath(drizzleSchemaPath.href), 'utf8');
    const integrationSchema = readFileSync(fileURLToPath(integrationSchemaPath.href), 'utf8');
    const integrationTableInitializer = readFileSync(
      fileURLToPath(integrationTableInitializerPath.href),
      'utf8'
    );
    const memorySchema = readFileSync(fileURLToPath(memorySchemaPath.href), 'utf8');
    const modelInvocationSchema = readFileSync(
      fileURLToPath(modelInvocationSchemaPath.href),
      'utf8'
    );
    const modelPolicySchema = readFileSync(fileURLToPath(modelPolicySchemaPath.href), 'utf8');
    const scheduleSchema = readFileSync(fileURLToPath(scheduleSchemaPath.href), 'utf8');
    const toolSchema = readFileSync(fileURLToPath(toolSchemaPath.href), 'utf8');
    const compactDrizzleSchema =
      `${drizzleSchema}\n${memorySchema}\n${modelInvocationSchema}\n${modelPolicySchema}\n${scheduleSchema}\n${toolSchema}\n${integrationSchema}`.replace(
        /\s+/g,
        ''
      );
    const repositoriesSource = readFileSync(fileURLToPath(repositoriesPath.href), 'utf8');
    const tableInitializer = readFileSync(fileURLToPath(tableInitializerPath.href), 'utf8');
    const aiAgentSource = readFileSync(fileURLToPath(aiAgentSourcePath.href), 'utf8');
    const foundationEventsSource = readFileSync(fileURLToPath(foundationEventsPath.href), 'utf8');
    const schedulerWakeSource = readFileSync(fileURLToPath(schedulerWakePath.href), 'utf8');

    expect(tableNames).toEqual(expect.arrayContaining([...agentFoundationTables]));
    expect(repositoryNames).toEqual(expect.arrayContaining([...agentStorageRepositoryNames]));

    for (const seam of requiredStorageSeams) {
      const repositoryPath = new URL(seam.repositoryFile, storageRoot);
      const repositorySource = readFileSync(fileURLToPath(repositoryPath.href), 'utf8');
      expect(existsSync(fileURLToPath(repositoryPath.href))).toBe(true);
      expect(`${tableInitializer}\n${integrationTableInitializer}`).toContain(
        `CREATE TABLE IF NOT EXISTS ${seam.tableName}`
      );
      expect(repositorySource).toContain(seam.repositoryName);
      expect(repositorySource).not.toMatch(/`(?:SELECT|INSERT|UPDATE|DELETE)\b/);
    }

    for (const tableName of tableNames) {
      expect(compactDrizzleSchema).toContain(`sqliteTable('${tableName}'`);
    }

    expect(databaseAdapter).toContain("from 'drizzle-orm/durable-sqlite'");
    expect(databaseAdapter).toContain('drizzle(storage, { schema: agentStorageDrizzleSchema })');
    expect(repositoriesSource).toContain('transaction<T>');
    expect(repositoriesSource).toContain('database.transaction((transactionDatabase)');
    expect(tableInitializer).toContain('single narrow handwritten SQL exception');
    expect(tableInitializer).toContain('database.run(sql`CREATE TABLE IF NOT EXISTS agent_profile');
    expect(tableInitializer).toContain('PRIMARY KEY (agent_id, principal_id, nonce)');
    expect(tableInitializer).toContain('PRIMARY KEY (agent_id, principal_id, idempotency_key)');
    expect(tableInitializer).toContain('UNIQUE (agent_id, normalized_thread_key)');
    expect(tableInitializer).toContain('UNIQUE (agent_id, thread_id, thread_sequence)');
    expect(tableInitializer).toContain('agent_run_inputs');

    expect(aiAgentSource).toContain('createAgentStorageRepositories(this.name, ctx.storage)');
    expect(foundationEventsSource).toContain('repositories.events.appendEvent(');
    expect(foundationEventsSource).toContain('repositories.pendingRuns.insertPendingRun(');
    expect(schedulerWakeSource).toContain('input.repositories.schedulerWakes.recordWake(');
  });

  it('[AGENT-SECURITY-S009] keeps Worker-internal Durable Object RPC methods behind the Connect facade', () => {
    const aiAgentSource = readFileSync(fileURLToPath(aiAgentSourcePath.href), 'utf8');
    const workerSource = readFileSync(fileURLToPath(new URL('worker.ts', sourceRoot).href), 'utf8');

    expect(aiAgentSource).toContain('acceptFoundationEvent(input: AgentFoundationEventInput)');
    expect(aiAgentSource).toContain('requestSchedulerWake(payload: AgentLocalQueueWakePayload)');
    expect(aiAgentSource).toContain('processPendingRuns(');
    expect(aiAgentSource).toContain('payload: AgentLocalQueueProcessPayload');
    expect(aiAgentSource).toContain('checkHealth(): AgentFoundationHealth');
    expect(aiAgentSource).not.toMatch(/\n\s*fetch\s*\(/);
    expect(workerSource).toContain('handleAgentConnectRequest(request, env)');
    expect(workerSource).not.toMatch(/AI_AGENT\.get\([^)]*\)\.fetch/);
  });
});
