import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { clientD1Tables, forbiddenClientAgentSnapshotTables } from '../server/db/schema';

const migrationPath = new URL(
  '../server/db/migrations/0001_client_foundation.sql',
  import.meta.url
);

describe('Management Client D1 schema', () => {
  it('[MANAGEMENT-CLIENT-S003] Client D1 exposes only management tables', () => {
    const migration = readFileSync(fileURLToPath(migrationPath.href), 'utf8');
    const tableNames = clientD1Tables.map((table) => table.tableName);

    expect(tableNames).toEqual(['client_managed_agents', 'client_agent_credential_refs']);
    for (const table of clientD1Tables) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table.tableName}`);
      for (const column of table.columns) {
        expect(migration).toContain(column);
      }
    }

    for (const forbiddenTable of forbiddenClientAgentSnapshotTables) {
      expect(tableNames).not.toContain(forbiddenTable);
      expect(migration).not.toContain(`CREATE TABLE IF NOT EXISTS ${forbiddenTable}`);
    }
  });
});
