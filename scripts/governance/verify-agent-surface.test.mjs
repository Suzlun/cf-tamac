import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { URL, fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { collectAgentSurfaceIssues } from './verify-agent-surface.mjs';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const rootDocs = ['README.md', 'AGENTS.md', 'CONTRIBUTING.md', 'CODING_STANDARDS.md'];
const credentialRunbookDocs = [
  ...rootDocs,
  'docs/operations/agent-control-plane-auth.md',
  'packages/agent/README.md',
  'packages/client/README.md',
];

function writeFixture(root, relativePath, content) {
  const filePath = join(root, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
  return filePath;
}

describe('Agent surface governance', () => {
  it('[AGENT-SECURITY-S009] Lint rejects public Durable Object RPC and legacy Agent surface fixtures', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'agent-security-surface-fixtures-'));

    try {
      writeFixture(
        fixtureRoot,
        'packages/agent/src/worker.ts',
        `export default {
  fetch(request, env) {
    const id = env.AI_AGENT.idFromName('agent-alpha');
    return env.AI_AGENT.get(id).fetch(request);
  },
};
`
      );
      writeFixture(
        fixtureRoot,
        'packages/agent/src/rest-route.ts',
        `import { Hono } from 'hono';

const app = new Hono();
app.get('/agents', () => new Response('forbidden'));
`
      );
      writeFixture(fixtureRoot, 'packages/agent/src/openapi/openapi.json', '{}\n');
      writeFixture(
        fixtureRoot,
        'packages/agent/src/orval/agent-client.ts',
        'export const generatedBy = "orval";\n'
      );

      const issues = collectAgentSurfaceIssues(fixtureRoot);

      expect(issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('[AGENT-SECURITY-S009]'),
          expect.stringContaining('forbidden public-do-rpc-route'),
          expect.stringContaining('forbidden hono-rest-route'),
          expect.stringContaining('forbidden Agent OpenAPI/Orval artifact path'),
          expect.stringContaining('forbidden orval-agent-client'),
        ])
      );
      expect(collectAgentSurfaceIssues()).toEqual([]);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('[AGENT-HEALTH-S002] Lint rejects REST /health and JSON health fixtures', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'agent-health-surface-fixtures-'));

    try {
      writeFixture(
        fixtureRoot,
        'packages/agent/src/worker.ts',
        `export default {
  fetch(request) {
    if (new URL(request.url).pathname === '/health') {
      return Response.json({ status: 'ok', health: 'serving' });
    }
    return new Response('use Connect');
  },
};
`
      );
      writeFixture(
        fixtureRoot,
        'packages/agent/src/rpc/services/health.ts',
        `export const service = 'AgentHealthService.Check';
`
      );

      const issues = collectAgentSurfaceIssues(fixtureRoot);

      expect(issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('[AGENT-HEALTH-S002]'),
          expect.stringContaining('forbidden rest-health-endpoint'),
          expect.stringContaining('forbidden json-health-response'),
        ])
      );
      expect(issues).not.toEqual(
        expect.arrayContaining([expect.stringContaining('rpc/services/health.ts')])
      );
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('[CLIENT-REGISTRY-S005] Lint rejects Client public Agent proxy routes and permits Server Actions', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'client-proxy-surface-fixtures-'));

    try {
      writeFixture(
        fixtureRoot,
        'packages/client/app/api/client/agents/route.ts',
        `import { createServerAgentRpcClients } from '../../../../src/server/agent-rpc';

export async function POST() {
  const clients = createServerAgentRpcClients({ agentRpcOrigin: 'https://agent.example.com' });
  return Response.json({ proxy: clients });
}
`
      );
      writeFixture(
        fixtureRoot,
        'packages/client/app/agents/actions.ts',
        `'use server';

import { createServerAgentRpcClients } from '../../src/server/agent-rpc';

export async function callAgentFromServerAction() {
  return createServerAgentRpcClients;
}
`
      );

      const issues = collectAgentSurfaceIssues(fixtureRoot);

      expect(issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('[CLIENT-REGISTRY-S005]'),
          expect.stringContaining('forbidden Client public Agent proxy route path'),
          expect.stringContaining('forbidden Client public Agent proxy route'),
        ])
      );
      expect(issues).not.toEqual(
        expect.arrayContaining([expect.stringContaining('app/agents/actions.ts')])
      );
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('[WORKSPACE-GOVERNANCE-S011] Lint rejects forbidden production Agent auth surfaces', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'agent-auth-surface-fixtures-'));

    try {
      writeFixture(
        fixtureRoot,
        'packages/agent/src/auth-route.ts',
        `import { Hono } from 'hono';

const app = new Hono();
app.post('/auth/token', () => Response.json({ token: 'legacy-json-auth' }));

const router = new Hono();
router.post('/jwt/bootstrap', () => Response.json({ credential: 'legacy-json-auth' }));
`
      );
      writeFixture(
        fixtureRoot,
        'packages/agent/src/rpc/bootstrap.ts',
        `export function bootstrapTrustRpc() {
  return 'forbidden bootstrap trust source';
}
`
      );
      writeFixture(
        fixtureRoot,
        'packages/agent/src/AgentTrustRegistry.ts',
        `export class AgentTrustRegistry {
  fetch() {
    return new Response('forbidden');
  }
}
`
      );
      writeFixture(
        fixtureRoot,
        'packages/client/src/server/agent-rpc/private-key-secret.ts',
        `export const secretName = 'CLIENT_SERVICE_PRIVATE_JWK';
`
      );

      const issues = collectAgentSurfaceIssues(fixtureRoot);

      expect(issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('[WORKSPACE-GOVERNANCE-S011]'),
          expect.stringContaining('forbidden agent-rest-json-auth-route'),
          expect.stringContaining('forbidden bootstrap-rpc-trust-source'),
          expect.stringContaining('forbidden agent-trust-registry'),
          expect.stringContaining('forbidden client-private-key-worker-secret'),
        ])
      );
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('[AGENT-SECURITY-S009] Connect fixtures and Server Action boundaries remain allowed', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'allowed-agent-surface-fixtures-'));

    try {
      writeFixture(
        fixtureRoot,
        'packages/agent/src/rpc/connect-worker-adapter.ts',
        `export function handleAgentConnectRequest(request) {
  if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });
  return new Response(new Uint8Array(), { headers: { 'content-type': 'application/proto' } });
}
`
      );
      writeFixture(
        fixtureRoot,
        'packages/client/app/agents/actions.ts',
        `'use server';

import { createServerAgentRpcClients } from '../../src/server/agent-rpc';

export async function refreshAgentViaServerAction() {
  return createServerAgentRpcClients;
}
`
      );

      expect(collectAgentSurfaceIssues(fixtureRoot)).toEqual([]);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('[WORKSPACE-GOVERNANCE-S015] validates SDK Agent RPC surfaces against generated descriptors and the Connect binary runtime', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'sdk-agent-rpc-surface-fixtures-'));

    try {
      // generated descriptor、Connect core、Connect transport、binary profile を同じ SDK source fixture に揃えます。
      writeFixture(
        fixtureRoot,
        'packages/sdk/src/generated/agent-rpc/cftamac/agent/v1_pb.ts',
        'export const AgentHealthService = {};\n'
      );
      writeFixture(
        fixtureRoot,
        'packages/sdk/src/client.ts',
        `import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';

import { AgentHealthService } from './generated/agent-rpc/cftamac/agent/v1_pb';

const transport = createConnectTransport({ useBinaryFormat: true, useHttpGet: false });

export const healthClient = createClient(AgentHealthService, transport);
`
      );

      expect(collectAgentSurfaceIssues(fixtureRoot)).toEqual([]);

      // URL string 内の // の後ろでも実行 code の Orval import は残り、既存 surface guardrail が検出し続けます。
      writeFixture(
        fixtureRoot,
        'packages/sdk/src/orval-bypass.ts',
        `const origin = 'https://example.invalid'; void import('orval');
`
      );

      expect(collectAgentSurfaceIssues(fixtureRoot)).toEqual(
        expect.arrayContaining([expect.stringContaining('forbidden orval-agent-client')])
      );
      writeFixture(
        fixtureRoot,
        'packages/sdk/src/orval-bypass.ts',
        'export const sdkOrigin = true;\n'
      );

      // 正規表現リテラル内の // を comment と誤認せず、同一行の実行 Orval import を検出します。
      writeFixture(
        fixtureRoot,
        'packages/sdk/src/orval-bypass.ts',
        `const slash = /[//]/; void import('orval');
`
      );

      expect(collectAgentSurfaceIssues(fixtureRoot)).toEqual(
        expect.arrayContaining([expect.stringContaining('forbidden orval-agent-client')])
      );
      writeFixture(
        fixtureRoot,
        'packages/sdk/src/orval-bypass.ts',
        'export const sdkOrigin = true;\n'
      );

      // template expression の head も AST token として評価し、実行時に Orval へ解決する dynamic import を検出します。
      writeFixture(
        fixtureRoot,
        'packages/sdk/src/orval-bypass.ts',
        `void import(\`orval\${''}\`);
`
      );

      expect(collectAgentSurfaceIssues(fixtureRoot)).toEqual(
        expect.arrayContaining([expect.stringContaining('forbidden orval-agent-client')])
      );
      writeFixture(
        fixtureRoot,
        'packages/sdk/src/orval-bypass.ts',
        'export const sdkOrigin = true;\n'
      );

      // 文字列にある factory 名は AST CallExpression ではないため、transport 未構成として fail closed で拒否します。
      writeFixture(
        fixtureRoot,
        'packages/sdk/src/client.ts',
        `import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';

import { AgentHealthService } from './generated/agent-rpc/cftamac/agent/v1_pb';

const transportDecoy = 'createConnectTransport({ useBinaryFormat: true, useHttpGet: false })';

export const healthClient = createClient(AgentHealthService, transportDecoy);
`
      );

      expect(collectAgentSurfaceIssues(fixtureRoot)).toEqual(
        expect.arrayContaining([
          '/packages/sdk/src: SDK Agent RPC surface must configure every createConnectTransport() call with useBinaryFormat: true and useHttpGet: false',
        ])
      );

      // Connect Web import と同名の local factory は binding を shadow するため、正しい options でも trusted transport として数えません。
      writeFixture(
        fixtureRoot,
        'packages/sdk/src/client.ts',
        `import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';

import { AgentHealthService } from './generated/agent-rpc/cftamac/agent/v1_pb';

function createShadowedTransport() {
  const createConnectTransport = () => ({});
  return createConnectTransport({ useBinaryFormat: true, useHttpGet: false });
}

export const healthClient = createClient(AgentHealthService, createShadowedTransport());
`
      );

      expect(collectAgentSurfaceIssues(fixtureRoot)).toEqual(
        expect.arrayContaining([
          '/packages/sdk/src: SDK Agent RPC surface must configure every createConnectTransport() call with useBinaryFormat: true and useHttpGet: false',
        ])
      );

      // decoy object の binary option と、実 transport の JSON option を分離しても actual call の false を拒否します。
      writeFixture(
        fixtureRoot,
        'packages/sdk/src/client.ts',
        `import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';

import { AgentHealthService } from './generated/agent-rpc/cftamac/agent/v1_pb';

const decoy = { useBinaryFormat: true, useHttpGet: false };
const transport = createConnectTransport({ useBinaryFormat: false, useHttpGet: false });

export const healthClient = createClient(AgentHealthService, transport);
export const ignoredDecoy = decoy;
`
      );

      expect(collectAgentSurfaceIssues(fixtureRoot)).toEqual(
        expect.arrayContaining([
          '/packages/sdk/src: SDK Agent RPC surface must configure every createConnectTransport() call with useBinaryFormat: true and useHttpGet: false',
        ])
      );

      // shorthand/variable 経由の GET 値は static validation で false を証明できないため、fail closed で拒否します。
      writeFixture(
        fixtureRoot,
        'packages/sdk/src/client.ts',
        `import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';

import { AgentHealthService } from './generated/agent-rpc/cftamac/agent/v1_pb';

const useHttpGet = true;
const transport = createConnectTransport({ useBinaryFormat: true, useHttpGet });

export const healthClient = createClient(AgentHealthService, transport);
`
      );

      expect(collectAgentSurfaceIssues(fixtureRoot)).toEqual(
        expect.arrayContaining([
          '/packages/sdk/src: SDK Agent RPC surface must configure every createConnectTransport() call with useBinaryFormat: true and useHttpGet: false',
        ])
      );

      // Connect runtime または generated descriptor import を外すと、SDK が Agent RPC contract に揃わないことを明示的に検証します。
      writeFixture(
        fixtureRoot,
        'packages/sdk/src/client.ts',
        `export const healthClient = {};
`
      );

      expect(collectAgentSurfaceIssues(fixtureRoot)).toEqual(
        expect.arrayContaining([
          '/packages/sdk/src: SDK Agent RPC surface must import @connectrpc/connect',
          '/packages/sdk/src: SDK Agent RPC surface must import @connectrpc/connect-web',
          '/packages/sdk/src: SDK Agent RPC surface must import its generated Protobuf RPC descriptor',
          '/packages/sdk/src: SDK Agent RPC surface must configure every createConnectTransport() call with useBinaryFormat: true and useHttpGet: false',
        ])
      );

      // REST route を SDK に混入させると既存 Agent public surface guardrail が SDK scan root にも適用されます。
      writeFixture(
        fixtureRoot,
        'packages/sdk/src/rest-route.ts',
        `import { Hono } from 'hono';

const app = new Hono();
app.get('/agents', () => new Response('forbidden'));
`
      );

      expect(collectAgentSurfaceIssues(fixtureRoot)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('/packages/sdk/src/rest-route.ts'),
          expect.stringContaining('forbidden hono-rest-route'),
        ])
      );
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('[WORKSPACE-GOVERNANCE-S003] Lint rejects forbidden Agent API surface fixtures', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'agent-surface-fixtures-'));

    try {
      writeFixture(
        fixtureRoot,
        'packages/agent/src/rest-route.ts',
        `import { Hono } from 'hono';

const app = new Hono();
app.get('/agents', () => new Response('forbidden'));
`
      );
      writeFixture(fixtureRoot, 'packages/agent/src/openapi/openapi.json', '{}\n');
      writeFixture(
        fixtureRoot,
        'packages/agent/src/orval/agent-client.ts',
        'export const generatedBy = "orval";\n'
      );
      writeFixture(
        fixtureRoot,
        'packages/agent/src/json-dto.ts',
        'export const json = () => Response.json({ ok: true });\n'
      );

      const issues = collectAgentSurfaceIssues(fixtureRoot);

      expect(issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('forbidden hono-rest-route'),
          expect.stringContaining('forbidden Agent OpenAPI/Orval artifact path'),
          expect.stringContaining('forbidden orval-agent-client'),
          expect.stringContaining('forbidden ad-hoc-json-agent-api'),
        ])
      );
      expect(collectAgentSurfaceIssues()).toEqual([]);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('[WORKSPACE-GOVERNANCE-S006] Documentation exposes Agent and Client foundation commands', () => {
    const docs = rootDocs
      .map((relativePath) => readFileSync(join(projectRoot, relativePath), 'utf8'))
      .join('\n');
    const requiredTerms = [
      'packages/agent/src/typespec/main.tsp',
      'packages/agent/proto/**',
      'packages/client/src/generated/agent-rpc/**',
      'pnpm dev:agent',
      'pnpm dev:client',
      'pnpm gen:agent:proto',
      'pnpm gen:agent:rpc',
      'pnpm check:codegen',
      'pnpm check:agent',
      'pnpm check:client',
      'pnpm test:agent',
      'pnpm test:client',
      'Connect unary binary Protobuf',
      'Agent-local Queue',
      'Agent API proxy routes',
    ];

    for (const term of requiredTerms) {
      expect(docs).toContain(term);
    }
    expect(docs).not.toMatch(/\/api\/v1\/(?:hello|users)/u);
    expect(docs).not.toMatch(/GET\s+\/(?:hello|users)\b/iu);
  });

  it('[WORKSPACE-GOVERNANCE-S010] Documentation exposes the production credential runbook', () => {
    const runbook = readFileSync(
      join(projectRoot, 'docs/operations/agent-control-plane-auth.md'),
      'utf8'
    );
    const docs = credentialRunbookDocs
      .map((relativePath) => readFileSync(join(projectRoot, relativePath), 'utf8'))
      .join('\n');
    const requiredRunbookTerms = [
      'AGENT_CONTROL_PLANE_TRUST',
      'CLIENT_CREDENTIAL_ENCRYPTION_KEY',
      'encrypted Client Service signing key store',
      'Client signing key generation',
      'Trust Config Export',
      'AgentHealthService.Check',
      'rotation',
      'emergency revoke',
      'break-glass recovery',
      'staging smoke',
      'private JWK',
      'encrypted private JWK',
      'managed Agent records',
      'external credential references',
      'Agent domain snapshots',
    ];
    const requiredDiscoverabilityTerms = ['docs/operations/agent-control-plane-auth.md'];
    const normalizedRunbook = runbook.toLowerCase();

    for (const term of requiredRunbookTerms) {
      expect(normalizedRunbook).toContain(term.toLowerCase());
    }
    for (const term of requiredDiscoverabilityTerms) {
      expect(docs).toContain(term);
    }
  });
});
