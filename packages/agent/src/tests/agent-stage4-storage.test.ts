import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { agentFoundationTables, agentStorageRepositoryNames } from '../storage';

const storageRoot = new URL('../storage/', import.meta.url);
const schemaPath = new URL('../storage/schema.ts', import.meta.url);
const memorySchemaPath = new URL('../storage/memory-schema.ts', import.meta.url);
const repositoriesPath = new URL('../storage/repositories.ts', import.meta.url);
const tableInitializerPath = new URL('../storage/table-initializer.ts', import.meta.url);

const requiredStage4Tables = [
  'agent_thread_compactions',
  'agent_history_indexes',
  'agent_thread_memory_versions',
  'agent_thread_memory_items',
  'agent_memory_versions',
  'agent_memory_items',
  'agent_archive_segments',
  'agent_r2_object_references',
] as const;

const requiredStage4Repositories = [
  {
    methods: ['insertCompaction', 'findLatestReadyCompaction', 'updateCompactionOutput'],
    repositoryFile: 'compactions-repository.ts',
    repositoryName: 'AgentCompactionsRepository',
    tableName: 'agent_thread_compactions',
  },
  {
    methods: ['insertHistoryIndex', 'searchHistoryIndexes', 'listForCompaction'],
    repositoryFile: 'history-repository.ts',
    repositoryName: 'AgentHistoryRepository',
    tableName: 'agent_history_indexes',
  },
  {
    methods: [
      'createThreadMemoryVersion',
      'insertThreadMemoryItem',
      'createAgentMemoryVersion',
      'insertAgentMemoryItem',
    ],
    repositoryFile: 'memory-repository.ts',
    repositoryName: 'AgentMemoryRepository',
    tableName: 'agent_thread_memory_versions',
  },
  {
    methods: ['insertArchiveSegment', 'recordR2ObjectReference', 'markR2ObjectDeleted'],
    repositoryFile: 'archive-repository.ts',
    repositoryName: 'AgentArchiveRepository',
    tableName: 'agent_archive_segments',
  },
] as const;

describe('Agent Stage 4 storage foundation', () => {
  it('[AGENT-MEMORY-S003] [AGENT-MEMORY-S006] [AGENT-MEMORY-S008] adds Drizzle schema and repositories for compaction memory history archive indexes', () => {
    const schema = readSource(schemaPath);
    const memorySchema = readSource(memorySchemaPath);
    const compactMemorySchema = memorySchema.replace(/\s+/g, '');
    const repositories = readSource(repositoriesPath);
    const tableInitializer = readSource(tableInitializerPath);

    expect(agentFoundationTables).toEqual(expect.arrayContaining([...requiredStage4Tables]));
    expect(agentStorageRepositoryNames).toEqual(
      expect.arrayContaining([
        'AgentCompactionsRepository',
        'AgentHistoryRepository',
        'AgentMemoryRepository',
        'AgentArchiveRepository',
      ])
    );

    for (const tableName of requiredStage4Tables) {
      expect(compactMemorySchema).toContain(`sqliteTable('${tableName}'`);
      expect(tableInitializer).toContain(`CREATE TABLE IF NOT EXISTS ${tableName}`);
    }

    expect(schema).toContain('...agentMemoryStorageDrizzleSchema');
    expect(schema).toContain('...agentMemoryFoundationTableDefinitions');

    for (const seam of requiredStage4Repositories) {
      const repositoryPath = new URL(seam.repositoryFile, storageRoot);
      const repositorySource = readSource(repositoryPath);
      expect(existsSync(fileURLToPath(repositoryPath.href))).toBe(true);
      expect(repositorySource).toContain(seam.repositoryName);
      expect(repositorySource).toContain(seam.tableName);
      expect(repositorySource).not.toMatch(/`(?:SELECT|INSERT|UPDATE|DELETE)\b/);
      for (const method of seam.methods) expect(repositorySource).toContain(method);
    }

    expect(repositories).toContain(
      'compactions: createAgentCompactionsRepository(agentId, database)'
    );
    expect(repositories).toContain('history: createAgentHistoryRepository(agentId, database)');
    expect(repositories).toContain('memory: createAgentMemoryRepository(agentId, database)');
    expect(repositories).toContain('archives: createAgentArchiveRepository(agentId, database)');
    expect(tableInitializer).toContain('UNIQUE (agent_id, thread_id, compaction_ordinal)');
    expect(tableInitializer).toContain('UNIQUE (agent_id, thread_id, version)');
    expect(tableInitializer).toContain('UNIQUE (agent_id, object_key)');
    expect(tableInitializer).toContain(
      'CREATE INDEX IF NOT EXISTS agent_history_indexes_thread_created_idx'
    );
    expect(memorySchema).toContain(
      'Agent-owned immutable R2 object references and ownership metadata'
    );
  });
});

function readSource(path: URL): string {
  return readFileSync(fileURLToPath(path.href), 'utf8');
}
