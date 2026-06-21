import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  createCredentialReferenceRepository,
  createManagedAgentRepository,
  forbiddenClientAgentSnapshotTables,
} from '../server/db';

const repositoryFiles = [
  new URL('../server/db/index.ts', import.meta.url),
  new URL('../server/db/managed-agents.ts', import.meta.url),
  new URL('../server/db/access-credentials.ts', import.meta.url),
];

const forbiddenRepositoryTerms = [
  'writeAgentEvent',
  'upsertAgentEvent',
  'saveAgentStateSnapshot',
  'writeThreadMemory',
  'upsertScheduleSnapshot',
  'upsertToolInvocation',
  'upsertIntegrationInstallation',
  'upsertAdapterConnection',
  'upsertCompaction',
];

describe('Management Client repository boundary', () => {
  it('[MANAGEMENT-CLIENT-S004] Client repository rejects Agent-domain snapshot persistence', () => {
    expect(Object.keys(createManagedAgentRepository({} as D1Database))).toEqual([
      'upsertManagedAgent',
      'getManagedAgent',
      'listManagedAgents',
      'markManagedAgentOpened',
    ]);
    expect(Object.keys(createCredentialReferenceRepository({} as D1Database))).toEqual([
      'upsertCredentialReference',
      'getCredentialReference',
      'listCredentialReferences',
    ]);

    const repositorySource = repositoryFiles
      .map((filePath) => readFileSync(fileURLToPath(filePath.href), 'utf8'))
      .join('\n');

    for (const forbiddenTable of forbiddenClientAgentSnapshotTables) {
      expect(repositorySource).not.toContain(`FROM ${forbiddenTable}`);
      expect(repositorySource).not.toContain(`INTO ${forbiddenTable}`);
    }
    for (const forbiddenTerm of forbiddenRepositoryTerms) {
      expect(repositorySource).not.toContain(forbiddenTerm);
    }
  });
});
