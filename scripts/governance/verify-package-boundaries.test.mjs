import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { URL, fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  collectAgentLayerIssues,
  collectClientBoundaryIssues,
  collectOpenCodeWorkflowIssuesFromFiles,
  collectRuntimeCouplingIssues,
} from './verify-package-boundaries.mjs';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

const workflowFiles = [
  '.opencode/skills/coding-guardian/SKILL.md',
  '.opencode/skills/coding-guardian/references/repo-entrypoints.md',
  '.opencode/agents/openspec/applier.md',
  '.opencode/agents/unit/agent/engineer.md',
  '.opencode/agents/unit/agent/reviewer.md',
  '.opencode/agents/unit/client/engineer.md',
  '.opencode/agents/unit/client/reviewer.md',
  '.opencode/agents/unit/client/designer.md',
  '.opencode/agents/unit/build/builder.md',
  '.opencode/agents/unit/build/reviewer.md',
];

function readProjectFile(relativePath) {
  return readFileSync(`${projectRoot}/${relativePath}`, 'utf8');
}

function writeFixture(root, relativePath, content) {
  const filePath = join(root, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
  return filePath;
}

describe('OpenCode workflow package boundary governance', () => {
  it('[WORKSPACE-GOVERNANCE-S004] Lint rejects Agent and Client runtime coupling', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'package-boundary-fixtures-'));

    try {
      writeFixture(
        fixtureRoot,
        'packages/agent/src/coupled.ts',
        `import { createServerAgentRpcClients } from '@cf-tamac/client';

export const leaked = createServerAgentRpcClients;
`
      );
      writeFixture(
        fixtureRoot,
        'packages/client/src/coupled.ts',
        `import { AIAgent } from '@cf-tamac/agent';

export const leaked = AIAgent;
`
      );
      writeFixture(
        fixtureRoot,
        'packages/client/src/generated/agent-rpc/generated.ts',
        `import { AIAgent } from '@cf-tamac/agent';

export const generated = AIAgent;
`
      );

      expect(collectRuntimeCouplingIssues(fixtureRoot)).toEqual([
        '/packages/agent/src/coupled.ts: Agent runtime must not import Client runtime',
        '/packages/client/src/coupled.ts: Client runtime must not import Agent runtime',
      ]);

      writeFixture(
        fixtureRoot,
        'packages/agent/src/domain/external-runtime.ts',
        `import { ConnectError } from '@connectrpc/connect';

export const externalRuntime = ConnectError;
`
      );
      writeFixture(
        fixtureRoot,
        'packages/agent/src/events/direct-network.ts',
        `export const directNetwork = () => fetch('https://example.invalid');
`
      );
      writeFixture(
        fixtureRoot,
        'packages/agent/src/domain/inverted.ts',
        `import { createAgentRpcRouter } from '../rpc/router';

export const inverted = createAgentRpcRouter;
`
      );
      writeFixture(
        fixtureRoot,
        'packages/agent/src/storage/inverted.ts',
        `import { eventStorageStatuses } from '../events';

export const inverted = eventStorageStatuses;
`
      );
      writeFixture(
        fixtureRoot,
        'packages/agent/src/rpc/services/inverted.ts',
        `import { createAgentRpcRouter } from '../router';

export const inverted = createAgentRpcRouter;
`
      );

      expect(collectAgentLayerIssues(fixtureRoot)).toEqual([
        '/packages/agent/src/domain/external-runtime.ts: Agent runtime/domain/storage layer must not import framework, transport, persistence, or platform runtime packages',
        '/packages/agent/src/domain/inverted.ts: Agent runtime/domain/storage layer must not import RPC, Worker, or generated descriptor layers',
        '/packages/agent/src/events/direct-network.ts: Agent runtime/domain/storage layer must not use Worker network globals directly',
        '/packages/agent/src/rpc/services/inverted.ts: Agent RPC service modules must not import router, adapter, or interceptor layers',
        '/packages/agent/src/storage/inverted.ts: Agent storage layer must not import Agent domain/runtime layers',
      ]);

      writeFixture(
        fixtureRoot,
        'packages/client/app/browser-visible.tsx',
        `'use client';

import { createServerAgentRpcClients } from '../src/server/agent-rpc/create-client';

export const leaked = createServerAgentRpcClients;
`
      );
      writeFixture(
        fixtureRoot,
        'packages/client/app/direct-network.tsx',
        `export const directNetwork = () => fetch('https://example.invalid');
`
      );
      writeFixture(
        fixtureRoot,
        'packages/client/src/components/browser-visible.tsx',
        `import { createServerAgentRpcClients } from '../server/agent-rpc/create-client';

export const leaked = createServerAgentRpcClients;
`
      );
      writeFixture(
        fixtureRoot,
        'packages/client/src/server/agent-rpc/create-client.ts',
        `export function createServerAgentRpcClients() {
  return {};
}
`
      );

      expect(collectClientBoundaryIssues(fixtureRoot)).toEqual([
        '/packages/client/app/browser-visible.tsx: Client browser-visible modules must not import server-only Agent RPC, credentials, or Connect runtime',
        '/packages/client/app/browser-visible.tsx: Client browser-visible modules must not contain Agent RPC credential or Client D1 access seams',
        '/packages/client/app/direct-network.tsx: Client browser-visible modules must not perform direct network calls',
        '/packages/client/src/components/browser-visible.tsx: Client browser-visible modules must not import server-only Agent RPC, credentials, or Connect runtime',
        '/packages/client/src/components/browser-visible.tsx: Client browser-visible modules must not contain Agent RPC credential or Client D1 access seams',
        '/packages/client/src/server/agent-rpc/create-client.ts: Client Agent RPC modules must import server-only',
      ]);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('[WORKSPACE-GOVERNANCE-S008] OpenCode workflow recognizes Agent and Client foundations', () => {
    const files = Object.fromEntries(
      workflowFiles.map((relativePath) => [relativePath, readProjectFile(relativePath)])
    );

    expect(collectOpenCodeWorkflowIssuesFromFiles(files)).toEqual([]);
  });

  it('blocks stale demo-only OpenCode workflow fixtures', () => {
    const staleFiles = Object.fromEntries(
      workflowFiles.map((relativePath) => [
        relativePath,
        'Old demo package graph only. Generated files are command-owned. Do not hand-edit generated/**. unit/backend/engineer unit/frontend/engineer\n',
      ])
    );

    expect(collectOpenCodeWorkflowIssuesFromFiles(staleFiles)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('packages/agent/**'),
        expect.stringContaining('packages/client/**'),
        'workflow remains demo-only guidance',
        'workflow references removed backend/frontend unit agents',
      ])
    );
  });
});
