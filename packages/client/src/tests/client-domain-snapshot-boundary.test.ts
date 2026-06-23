import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { forbiddenClientAgentSnapshotTables } from '../server/db/schema';

const clientServerRoot = new URL('../server/', import.meta.url);
const agentPackageRoot = new URL('../../../agent/src/', import.meta.url);
const agentWranglerPath = new URL('../../../agent/wrangler.toml', import.meta.url);

function collectFiles(root: URL): string[] {
  const rootPath = fileURLToPath(root.href);
  if (!existsSync(rootPath)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(rootPath).sort()) {
    const fullPath = `${rootPath}/${entry}`;
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectFiles(new URL(`${entry}/`, root)));
    } else if (
      stats.isFile() &&
      /\.(?:ts|tsx)$/.test(entry) &&
      !/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry)
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

const forbiddenSnapshotTerms = [
  'upsertAgentEvent',
  'saveAgentStateSnapshot',
  'writeThreadMemory',
  'upsertScheduleSnapshot',
  'upsertToolInvocation',
  'upsertIntegrationInstallation',
  'upsertAdapterConnection',
  'upsertCompaction',
  'writeAgentRunSnapshot',
];

describe('Client D1 Agent domain snapshot non-persistence', () => {
  it('[CLIENT-REGISTRY-S004] Client server modules do not persist Agent domain snapshots', () => {
    const serverFiles = collectFiles(clientServerRoot);
    expect(serverFiles.length).toBeGreaterThan(0);

    const snapshotIssues = serverFiles.flatMap((filePath) => {
      const content = readFileSync(filePath, 'utf8');
      return forbiddenSnapshotTerms
        .filter((term) => content.includes(term))
        .map((term) => `${filePath} contains ${term}`);
    });
    expect(snapshotIssues).toEqual([]);
  });

  it('[CLIENT-REGISTRY-S004] Client server modules do not reference Agent-domain snapshot tables', () => {
    const serverFiles = collectFiles(clientServerRoot);
    expect(serverFiles.length).toBeGreaterThan(0);

    const tableIssues = serverFiles.flatMap((filePath) => {
      const content = readFileSync(filePath, 'utf8');
      return forbiddenClientAgentSnapshotTables
        .filter((table) => content.includes(`INTO ${table}`) || content.includes(`FROM ${table}`))
        .map((table) => `${filePath} references ${table}`);
    });
    expect(tableIssues).toEqual([]);
  });
});

describe('Agent package Client runtime isolation', () => {
  it('[CLIENT-REGISTRY-S004] Agent package does not import Client runtime source or Client D1 bindings', () => {
    const agentFiles = collectFiles(agentPackageRoot);
    expect(agentFiles.length).toBeGreaterThan(0);

    const clientImportIssues = agentFiles.flatMap((filePath) => {
      const content = readFileSync(filePath, 'utf8');
      const issues: string[] = [];
      if (content.includes('@cf-tamac/client')) {
        issues.push(`${filePath} imports @cf-tamac/client`);
      }
      if (content.includes('packages/client/')) {
        issues.push(`${filePath} references packages/client/`);
      }
      if (content.includes('CLIENT_DB')) {
        issues.push(`${filePath} references CLIENT_DB`);
      }
      if (content.includes('client_managed_agents')) {
        issues.push(`${filePath} references client_managed_agents`);
      }
      if (content.includes('client_agent_credential_refs')) {
        issues.push(`${filePath} references client_agent_credential_refs`);
      }
      return issues;
    });
    expect(clientImportIssues).toEqual([]);
  });

  it('[CLIENT-REGISTRY-S004] Agent Worker bindings do not include Client D1 or credential references', () => {
    if (!existsSync(fileURLToPath(agentWranglerPath.href))) {
      return;
    }
    const config = readFileSync(fileURLToPath(agentWranglerPath.href), 'utf8');

    expect(config).not.toContain('CLIENT_DB');
    expect(config).not.toContain('client_managed_agents');
    expect(config).not.toContain('client_agent_credential_refs');
    expect(config).not.toContain('CLIENT_CREDENTIAL_SECRET_REF');
    expect(config).not.toContain('CLIENT_CREDENTIAL_ENCRYPTION_KEY');
  });
});
