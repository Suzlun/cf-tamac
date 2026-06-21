import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { URL, fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { collectAgentSurfaceIssues } from './verify-agent-surface.mjs';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const rootDocs = ['README.md', 'AGENTS.md', 'CONTRIBUTING.md', 'CODING_STANDARDS.md'];

function writeFixture(root, relativePath, content) {
  const filePath = join(root, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
  return filePath;
}

describe('Agent surface governance', () => {
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
      writeFixture(fixtureRoot, 'packages/agent/src/orval/agent-client.ts', 'export const generatedBy = "orval";\n');
      writeFixture(fixtureRoot, 'packages/agent/src/json-dto.ts', 'export const json = () => Response.json({ ok: true });\n');

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
    const docs = rootDocs.map((relativePath) => readFileSync(join(projectRoot, relativePath), 'utf8')).join('\n');
    const requiredTerms = [
      'packages/agent/src/typespec/main.tsp',
      'packages/agent/proto/**',
      'packages/client/src/generated/agent-rpc/**',
      'pnpm dev:agent',
      'pnpm dev:management-client',
      'pnpm gen:agent:proto',
      'pnpm gen:agent:rpc',
      'pnpm check:codegen',
      'pnpm check:agent',
      'pnpm check:management-client',
      'pnpm test:agent',
      'pnpm test:management-client',
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
});
