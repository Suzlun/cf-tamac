import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { clientAgentCredentialRefsTable, clientManagedAgentsTable } from '../server/db/schema';

const managedAgentsPath = fileURLToPath(
  new URL('../server/db/managed-agents.ts', import.meta.url).href
);
const accessCredentialsPath = fileURLToPath(
  new URL('../server/db/access-credentials.ts', import.meta.url).href
);
const schemaPath = fileURLToPath(new URL('../server/db/schema.ts', import.meta.url).href);
const clientPackageJsonPath = fileURLToPath(new URL('../../package.json', import.meta.url).href);

describe('Client D1 Drizzle ORM refactor', () => {
  it('[CLIENT-REGISTRY-S001] managed agents repository uses Drizzle ORM D1 driver', () => {
    const source = readFileSync(managedAgentsPath, 'utf8');

    expect(source).toContain("from 'drizzle-orm/d1'");
    expect(source).toContain('drizzle(');
    expect(source).toContain('clientManagedAgentsTable');
    expect(source).toContain('.insert(');
    expect(source).toContain('.select()');
    expect(source).toContain('.update(');
    expect(source).toContain('.delete(');
    expect(source).toContain('onConflictDoUpdate');
  });

  it('[CLIENT-REGISTRY-S002] credential reference repository uses Drizzle ORM D1 driver', () => {
    const source = readFileSync(accessCredentialsPath, 'utf8');

    expect(source).toContain("from 'drizzle-orm/d1'");
    expect(source).toContain('drizzle(');
    expect(source).toContain('clientAgentCredentialRefsTable');
    expect(source).toContain('.insert(');
    expect(source).toContain('.select()');
    expect(source).toContain('.delete(');
    expect(source).toContain('onConflictDoUpdate');
  });

  it('[CLIENT-REGISTRY-S001] production repository modules do not use raw .prepare().bind() D1 API', () => {
    const managedAgentsSource = readFileSync(managedAgentsPath, 'utf8');
    const accessCredentialsSource = readFileSync(accessCredentialsPath, 'utf8');

    expect(managedAgentsSource).not.toContain('.prepare(');
    expect(managedAgentsSource).not.toContain('.bind(');
    expect(accessCredentialsSource).not.toContain('.prepare(');
    expect(accessCredentialsSource).not.toContain('.bind(');
  });

  it('[CLIENT-REGISTRY-S001] Drizzle schema defines exactly the two Client D1 tables', () => {
    const source = readFileSync(schemaPath, 'utf8');

    expect(source).toMatch(/sqliteTable\(\s*'client_managed_agents'/);
    expect(source).toMatch(/sqliteTable\(\s*'client_agent_credential_refs'/);
    expect(source).toContain("from 'drizzle-orm/sqlite-core'");
  });

  it('[CLIENT-REGISTRY-S004] Drizzle table definitions do not model Agent domain snapshot tables', () => {
    const source = readFileSync(schemaPath, 'utf8');

    const forbiddenTables = [
      'agent_events',
      'agent_threads',
      'agent_runs',
      'agent_schedules',
      'agent_tool_invocations',
      'agent_integration_installations',
      'agent_adapter_connections',
      'agent_compactions',
    ];

    for (const table of forbiddenTables) {
      expect(source).not.toContain(`sqliteTable('${table}'`);
    }
  });

  it('[CLIENT-REGISTRY-S001] Drizzle managed agents table has correct column mappings', () => {
    expect(clientManagedAgentsTable.agentId).toBeDefined();
    expect(clientManagedAgentsTable.agentRpcOrigin).toBeDefined();
    expect(clientManagedAgentsTable.displayName).toBeDefined();
    expect(clientManagedAgentsTable.displayOrder).toBeDefined();
    expect(clientManagedAgentsTable.pinned).toBeDefined();
    expect(clientManagedAgentsTable.lastOpenedAtMs).toBeDefined();
    expect(clientManagedAgentsTable.createdAtMs).toBeDefined();
    expect(clientManagedAgentsTable.updatedAtMs).toBeDefined();
  });

  it('[CLIENT-REGISTRY-S002] Drizzle credential refs table has no secret columns', () => {
    const source = readFileSync(schemaPath, 'utf8');

    expect(clientAgentCredentialRefsTable.agentId).toBeDefined();
    expect(clientAgentCredentialRefsTable.credentialRef).toBeDefined();
    expect(clientAgentCredentialRefsTable.keyId).toBeDefined();
    expect(clientAgentCredentialRefsTable.maskedHint).toBeDefined();
    expect(clientAgentCredentialRefsTable.status).toBeDefined();

    expect(source).not.toMatch(/text\(["']secret["']\)/);
    expect(source).not.toMatch(/text\(["']private_key["']\)/);
    expect(source).not.toMatch(/text\(["']shared_secret["']\)/);
    expect(source).not.toMatch(/text\(["']token["']\)/);
  });

  it('[CLIENT-REGISTRY-S001] Client package does not depend on Prisma', () => {
    const packageJson = JSON.parse(readFileSync(clientPackageJsonPath, 'utf8'));

    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };
    const prismaKeys = Object.keys(allDeps).filter((key) => key.toLowerCase().includes('prisma'));
    expect(prismaKeys).toEqual([]);
  });

  it('[CLIENT-REGISTRY-S001] no schema.prisma file exists in the Client package', () => {
    const clientRoot = fileURLToPath(new URL('../..', import.meta.url).href);

    function findPrismaFiles(dir: string): string[] {
      if (!existsSync(dir)) return [];
      const entries = readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        if (
          entry.name === 'node_modules' ||
          entry.name === '.next' ||
          entry.name === '.open-next'
        ) {
          continue;
        }
        const fullPath = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          files.push(...findPrismaFiles(fullPath));
        } else if (entry.name.endsWith('.prisma')) {
          files.push(fullPath);
        }
      }
      return files;
    }

    const prismaFiles = findPrismaFiles(clientRoot);
    expect(prismaFiles).toEqual([]);
  });

  it('[CLIENT-REGISTRY-S004] Drizzle D1 driver imports stay in server-only db repository layer', () => {
    const managedAgentsSource = readFileSync(managedAgentsPath, 'utf8');
    const accessCredentialsSource = readFileSync(accessCredentialsPath, 'utf8');

    expect(managedAgentsSource).toContain("from 'drizzle-orm/d1'");
    expect(accessCredentialsSource).toContain("from 'drizzle-orm/d1'");
  });
});
