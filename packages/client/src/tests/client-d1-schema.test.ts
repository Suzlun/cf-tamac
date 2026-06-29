import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { clientD1Tables, forbiddenClientAgentSnapshotTables } from '../server/db/schema';

const migrationPath = new URL(
  '../server/db/migrations/0001_client_foundation.sql',
  import.meta.url
);
const signingKeysMigrationPath = new URL(
  '../server/db/migrations/0002_control_plane_signing_keys.sql',
  import.meta.url
);

describe('Management Client D1 schema', () => {
  it('[MANAGEMENT-CLIENT-SHELL-S003] Client D1 exposes only management tables', () => {
    const migration = readFileSync(fileURLToPath(migrationPath.href), 'utf8');
    const signingKeysMigration = readFileSync(fileURLToPath(signingKeysMigrationPath.href), 'utf8');
    const combinedMigration = `${migration}\n${signingKeysMigration}`;
    const tableNames = clientD1Tables.map((table) => table.tableName);

    expect(tableNames).toEqual([
      'client_managed_agents',
      'client_agent_credential_refs',
      'client_signing_keys',
    ]);
    for (const table of clientD1Tables) {
      expect(combinedMigration).toContain(`CREATE TABLE IF NOT EXISTS ${table.tableName}`);
      for (const column of table.columns) {
        expect(combinedMigration).toContain(column);
      }
    }

    for (const forbiddenTable of forbiddenClientAgentSnapshotTables) {
      expect(tableNames).not.toContain(forbiddenTable);
      expect(combinedMigration).not.toContain(`CREATE TABLE IF NOT EXISTS ${forbiddenTable}`);
    }
  });

  it('[CLIENT-REGISTRY-S001] migration creates both management tables without Agent Service bindings', () => {
    const migration = readFileSync(fileURLToPath(migrationPath.href), 'utf8');

    const db = new DatabaseSync(':memory:');
    try {
      db.exec(migration);

      const managedAgentsRow = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'client_managed_agents'`
        )
        .get() as { name: string } | undefined;
      expect(managedAgentsRow).toEqual({ name: 'client_managed_agents' });

      const credentialRefsRow = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'client_agent_credential_refs'`
        )
        .get() as { name: string } | undefined;
      expect(credentialRefsRow).toEqual({ name: 'client_agent_credential_refs' });

      const columnRows = db.prepare(`PRAGMA table_info(client_managed_agents)`).all() as {
        name: string;
      }[];
      const columns = columnRows.map((c) => c.name);
      expect(columns).toContain('pinned');

      const agentTables = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'agent\\_%' ESCAPE '\\'`
        )
        .all() as { name: string }[];
      expect(agentTables).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('[CLIENT-REGISTRY-S002] credential reference table stores no plaintext secret columns', () => {
    const migration = readFileSync(fileURLToPath(migrationPath.href), 'utf8');

    const db = new DatabaseSync(':memory:');
    try {
      db.exec(migration);

      const columnRows = db.prepare(`PRAGMA table_info(client_agent_credential_refs)`).all() as {
        name: string;
      }[];
      const columns = columnRows.map((c) => c.name);

      expect(columns).toContain('credential_ref');
      expect(columns).toContain('key_id');
      expect(columns).toContain('masked_hint');
      expect(columns).toContain('status');
      expect(columns).not.toContain('secret');
      expect(columns).not.toContain('secret_material');
      expect(columns).not.toContain('private_key');
      expect(columns).not.toContain('shared_secret');
      expect(columns).not.toContain('token');

      expect(migration).not.toMatch(/secret|private_key|shared_secret|token/i);
    } finally {
      db.close();
    }
  });

  it('[CLIENT-REGISTRY-S002] signing key store keeps private JWK encrypted and stores no plaintext columns', () => {
    const signingKeysMigration = readFileSync(fileURLToPath(signingKeysMigrationPath.href), 'utf8');

    const db = new DatabaseSync(':memory:');
    try {
      db.exec(
        `CREATE TABLE IF NOT EXISTS client_managed_agents (
          agent_id TEXT PRIMARY KEY,
          agent_rpc_origin TEXT NOT NULL,
          display_name TEXT NOT NULL,
          display_order INTEGER NOT NULL DEFAULT 0,
          pinned INTEGER NOT NULL DEFAULT 0,
          last_opened_at_ms INTEGER,
          created_at_ms INTEGER NOT NULL,
          updated_at_ms INTEGER NOT NULL
        );`
      );
      db.exec(signingKeysMigration);

      const signingKeyRows = db.prepare(`PRAGMA table_info(client_signing_keys)`).all() as {
        name: string;
      }[];
      const signingKeyColumns = signingKeyRows.map((c) => c.name);
      expect(signingKeyColumns).toContain('private_jwk_ciphertext');
      expect(signingKeysMigration).toContain("CHECK (status IN ('active', 'disabled', 'deleted'))");
      expect(signingKeysMigration).toContain('CHECK (is_default IN (0, 1))');
      expect(signingKeysMigration).toContain('client_signing_keys_one_default');
      expect(signingKeyColumns).not.toContain('private_jwk_plaintext');
      expect(signingKeyColumns).not.toContain('private_key');
      expect(signingKeyColumns).not.toContain('d');
      expect(signingKeyColumns).not.toContain('secret_material');
      expect(signingKeyColumns).not.toContain('shared_secret');

      const managedAgentRows = db.prepare(`PRAGMA table_info(client_managed_agents)`).all() as {
        name: string;
      }[];
      const managedAgentColumns = managedAgentRows.map((c) => c.name);
      // nullable migration: 既存行を壊さず、署名 metadata を追加する。
      expect(managedAgentColumns).toContain('signing_issuer');
      expect(managedAgentColumns).toContain('signing_key_id');
      expect(managedAgentColumns).toContain('signing_public_fingerprint');
      expect(managedAgentColumns).toContain('signing_last_verified_at_ms');

      expect(signingKeysMigration).not.toMatch(/private_key|shared_secret|secret_material/i);
    } finally {
      db.close();
    }
  });
});
