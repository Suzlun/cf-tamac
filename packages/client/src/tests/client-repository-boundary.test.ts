import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  createCredentialReferenceRepository,
  createManagedAgentRegistrationAttemptRepository,
  createManagedAgentRepository,
  forbiddenClientAgentSnapshotTables,
} from '../server/db';

const repositoryFiles = [
  new URL('../server/db/index.ts', import.meta.url),
  new URL('../server/db/managed-agents.ts', import.meta.url),
  new URL('../server/db/access-credentials.ts', import.meta.url),
  new URL('../server/db/managed-agent-registration-attempts.ts', import.meta.url),
  new URL('../server/db/signing-keys.ts', import.meta.url),
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
  it('[MANAGEMENT-CLIENT-SHELL-S004] Client repository rejects Agent-domain snapshot persistence', () => {
    expect(Object.keys(createManagedAgentRepository({} as D1Database))).toEqual([
      'createManagedAgent',
      'upsertManagedAgent',
      'getManagedAgent',
      'listManagedAgents',
      'markManagedAgentOpened',
      'renameManagedAgent',
      'setManagedAgentPinned',
      'reorderManagedAgents',
      'deleteManagedAgent',
      'updateManagedAgentSigningKey',
      'markManagedAgentSigningVerified',
    ]);
    expect(Object.keys(createCredentialReferenceRepository({} as D1Database))).toEqual([
      'upsertCredentialReference',
      'getCredentialReference',
      'listCredentialReferences',
      'deleteCredentialReference',
    ]);
    expect(Object.keys(createManagedAgentRegistrationAttemptRepository({} as D1Database))).toEqual([
      'createRegistrationAttempt',
      'updateRegistrationMetadata',
      'markAttemptActive',
      'markAttemptReconciliationRequired',
      'cleanupCreatedAttempt',
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

  it('[CLIENT-REGISTRY-S009] Client D1 does not store authoritative model policy bodies or secrets', () => {
    const repositorySource = repositoryFiles
      .map((filePath) => readFileSync(fileURLToPath(filePath.href), 'utf8'))
      .join('\n');
    const schemaSource = readFileSync(
      fileURLToPath(new URL('../server/db/schema.ts', import.meta.url).href),
      'utf8'
    );
    const migrationSources = [
      new URL('../server/db/migrations/0001_client_foundation.sql', import.meta.url),
      new URL('../server/db/migrations/0002_control_plane_signing_keys.sql', import.meta.url),
      new URL(
        '../server/db/migrations/0004_managed_agent_registration_reconciliation.sql',
        import.meta.url
      ),
    ].map((migration) => readFileSync(fileURLToPath(migration.href), 'utf8'));
    const allD1Sources = `${repositorySource}\n${schemaSource}\n${migrationSources.join('\n')}`;

    expect(allD1Sources).not.toContain('model_policy_body');
    expect(allD1Sources).not.toContain('agent_model_policies');
    expect(allD1Sources).not.toContain('generation_parameters_ref');
    expect(allD1Sources).not.toContain('provider_token');
    expect(allD1Sources).not.toContain('raw_prompt');
    expect(allD1Sources).not.toContain('raw_completion');
    expect(allD1Sources).not.toContain('raw_reasoning');
  });
});
