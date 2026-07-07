import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { URL, fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  collectAgentLayerIssues,
  collectClientBoundaryIssues,
  collectClientD1StoragePolicyIssues,
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
        'packages/agent/src/storage/drizzle.ts',
        `import { eq } from 'drizzle-orm';

export const allowedStoragePersistence = eq;
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
        '/packages/agent/src/storage/inverted.ts: Agent storage layer must not import Agent domain, application, Durable Object, runtime, or routing layers',
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

  it('[WORKSPACE-GOVERNANCE-S004] Lint enforces proposed Agent layer directories', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'agent-layer-boundary-fixtures-'));

    try {
      writeFixture(
        fixtureRoot,
        'packages/agent/src/durable-object/shell.ts',
        `import { AgentLifecycleService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';
import { createAuthenticationInterceptor } from '../rpc/interceptors/authentication';
import { createAgentRpcRouter } from '../rpc/router';
import { createHealthService } from '../rpc/services/health';

export const durableObjectLeak = [
  AgentLifecycleService,
  createAuthenticationInterceptor,
  createAgentRpcRouter,
  createHealthService,
];
`
      );
      writeFixture(
        fixtureRoot,
        'packages/agent/src/application/orchestration.ts',
        `import { routeAgentIdToDurableObject } from '../agent-routing';
import { AIAgent } from '../AIAgent';
import { dispatchAgentHealthCheck } from '../rpc/do-router';

export const applicationLeak = [routeAgentIdToDurableObject, AIAgent, dispatchAgentHealthCheck];
`
      );
      writeFixture(
        fixtureRoot,
        'packages/agent/src/domain/new-rule.ts',
        `import type { AgentStorageRepositories } from '../storage';

export type ForbiddenDomainStorage = AgentStorageRepositories;
`
      );
      writeFixture(
        fixtureRoot,
        'packages/agent/src/domain/state-operations.ts',
        `import type { AgentStorageRepositories } from '../storage';

export type ExistingDomainStorageException = AgentStorageRepositories;
`
      );
      writeFixture(
        fixtureRoot,
        'packages/agent/src/storage/inverted-new.ts',
        `import { routeAgentIdToDurableObject } from '../agent-routing';
import type { ApplicationCommand } from '../application/commands';
import type { DomainRule } from '../domain/rules';
import type { DurableObjectShell } from '../durable-object/shell';
import { createAgentRpcRouter } from '../rpc/router';

export const storageLeak = [
  routeAgentIdToDurableObject,
  createAgentRpcRouter,
];
export type StorageLeak = ApplicationCommand | DomainRule | DurableObjectShell;
`
      );
      writeFixture(
        fixtureRoot,
        'packages/agent/src/rpc/dispatch/worker-import.ts',
        `import worker from '../../index';

export const dispatchLeak = worker;
`
      );
      writeFixture(
        fixtureRoot,
        'packages/agent/src/rpc/mappers/do-import.ts',
        `import { routeAgentIdToDurableObject } from '../../agent-routing';
import type { DurableObjectShell } from '../../durable-object/shell';

export const mapperLeak = routeAgentIdToDurableObject;
export type MapperLeak = DurableObjectShell;
`
      );

      const issues = collectAgentLayerIssues(fixtureRoot);

      expect(issues).toEqual(
        expect.arrayContaining([
          '/packages/agent/src/application/orchestration.ts: Agent runtime/domain/storage layer must not import RPC, Worker, or generated descriptor layers',
          '/packages/agent/src/application/orchestration.ts: Agent application layer must not import routing or Durable Object layers',
          '/packages/agent/src/domain/new-rule.ts: Agent domain layer must not import application, Durable Object, routing, or storage layers',
          '/packages/agent/src/durable-object/shell.ts: Agent durable-object layer must not import RPC services, router, interceptors, Worker entrypoints, or generated descriptor layers',
          '/packages/agent/src/rpc/dispatch/worker-import.ts: Agent RPC dispatch modules must not import Worker entrypoints',
          '/packages/agent/src/rpc/mappers/do-import.ts: Agent RPC mapper modules must not import Durable Object, routing, or Worker entrypoint layers',
          '/packages/agent/src/storage/inverted-new.ts: Agent storage layer must not import Agent domain, application, Durable Object, runtime, or routing layers',
          '/packages/agent/src/storage/inverted-new.ts: Agent storage must not import Worker, RPC facade, or generated descriptor layers',
        ])
      );
      expect(issues.some((issue) => issue.includes('/packages/agent/src/domain/state-operations.ts'))).toBe(
        false
      );
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

  it('[WORKSPACE-GOVERNANCE-S011] Lint rejects browser signing material and forbidden Agent RPC signing sources', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'signing-material-boundary-fixtures-'));

    try {
      writeFixture(
        fixtureRoot,
        'packages/client/app/signing-leak.tsx',
        `'use client';

export const privateJwk = { d: 'forbidden' };
export const rawJwt = 'header.payload.signature';
export const auth = { authorization: 'bearer forbidden' };
`
      );
      writeFixture(
        fixtureRoot,
        'packages/client/src/server/agent-rpc/authentication.ts',
        `import 'server-only';
import { resolveCredentialSecret } from '../credentials/secret-resolution';

export async function signWithLegacySecret() {
  const secretMaterial = await resolveCredentialSecret({}, 'agent-alpha', 'AGENT_CREDENTIAL_ALPHA');
  return { alg: 'HS256', secretMaterial, credentialRef: 'AGENT_CREDENTIAL_ALPHA' };
}
`
      );

      const issues = collectClientBoundaryIssues(fixtureRoot);

      expect(issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Client browser-visible modules must not contain signing material'),
          expect.stringContaining('Client Agent RPC signing must use the encrypted Ed25519 signing key store'),
        ])
      );
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('[WORKSPACE-GOVERNANCE-S011] Client D1 policy permits encrypted signing key store and rejects plaintext snapshots', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'client-d1-policy-fixtures-'));

    try {
      writeFixture(
        fixtureRoot,
        'packages/client/src/server/db/migrations/0002_allowed_signing_keys.sql',
        `CREATE TABLE IF NOT EXISTS client_signing_keys (
  issuer TEXT NOT NULL,
  key_id TEXT NOT NULL,
  public_jwk_json TEXT NOT NULL,
  public_fingerprint TEXT NOT NULL,
  encrypted_private_jwk TEXT NOT NULL,
  status TEXT NOT NULL
);
`
      );
      expect(collectClientD1StoragePolicyIssues(fixtureRoot)).toEqual([]);

      writeFixture(
        fixtureRoot,
        'packages/client/src/server/db/migrations/0003_forbidden_plaintext.sql',
        `CREATE TABLE IF NOT EXISTS client_signing_keys_plaintext (
  issuer TEXT NOT NULL,
  private_jwk TEXT NOT NULL,
  shared_secret TEXT NOT NULL
);

export const forbiddenPlaintext = sqliteTable('client_plaintext', {
  privateJwk: varchar('private_jwk'),
});

CREATE TABLE IF NOT EXISTS agent_events (
  event_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL
);
`
      );

      const issues = collectClientD1StoragePolicyIssues(fixtureRoot);

      expect(issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Client D1 must not define plaintext signing material or secret column private_jwk'),
          expect.stringContaining('Client D1 must not define plaintext signing material or secret column shared_secret'),
          expect.stringContaining('Client D1 must not define Agent domain snapshot table agent_events'),
        ])
      );
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
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
