import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL, fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { generateDeployArtifacts } from './generate-deploy-artifacts.mjs';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

function readArtifactFile(root, relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('Deploy Button artifact generation', () => {
  it('[WORKSPACE-GOVERNANCE-S014] Deploy artifact generation creates self-contained Worker roots', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'cf-tamac-deploy-artifacts-'));

    try {
      const outDir = join(fixtureRoot, 'out');
      const artifacts = generateDeployArtifacts({ root: projectRoot, outDir });
      const agentRoot = join(outDir, 'agent');
      const clientRoot = join(outDir, 'client');

      expect(artifacts).toEqual([
        { name: 'agent', branchName: 'deploy-agent', path: agentRoot },
        { name: 'client', branchName: 'deploy-client', path: clientRoot },
      ]);

      const agentPackage = JSON.parse(readArtifactFile(agentRoot, 'package.json'));
      const agentWorkspace = readArtifactFile(agentRoot, 'pnpm-workspace.yaml');
      const agentTsconfig = readArtifactFile(agentRoot, 'tsconfig.json');
      const agentWrangler = readArtifactFile(agentRoot, 'wrangler.toml');
      const agentDevVars = readArtifactFile(agentRoot, '.dev.vars.example');

      expect(agentPackage.scripts.deploy).toBe('wrangler deploy --config wrangler.toml');
      expect(agentWorkspace).toContain("- '.'");
      expect(agentWorkspace).toContain('minimumReleaseAge: 4320');
      expect(agentWorkspace).toContain('allowBuilds:');
      expect(agentTsconfig).toContain('"@cf-tamac/agent-rpc/*"');
      expect(agentTsconfig).not.toContain('../../tsconfig.base.json');
      expect(agentWrangler).toContain('name = "AI_AGENT"');
      expect(agentWrangler).toContain('binding = "AGENT_BLOBS"');
      expect(agentDevVars).toContain('AGENT_CONTROL_PLANE_TRUST');
      expect(agentDevVars).not.toContain('PRIVATE_KEY_BASE64URL');
      expect(existsSync(join(agentRoot, 'src/generated/rpc/cftamac/agent/v1_pb.ts'))).toBe(true);
      expect(existsSync(join(agentRoot, 'src/tests'))).toBe(false);
      expect(existsSync(join(agentRoot, 'src/typespec'))).toBe(false);

      const clientPackage = JSON.parse(readArtifactFile(clientRoot, 'package.json'));
      const clientWorkspace = readArtifactFile(clientRoot, 'pnpm-workspace.yaml');
      const clientTsconfig = readArtifactFile(clientRoot, 'tsconfig.json');
      const clientWrangler = readArtifactFile(clientRoot, 'wrangler.toml');
      const clientDevVars = readArtifactFile(clientRoot, '.dev.vars.example');

      expect(clientPackage.scripts.deploy).toBe(
        'pnpm build:worker && wrangler deploy --config wrangler.toml'
      );
      expect(clientPackage.scripts['deploy:with-migrations']).toContain('d1 migrations apply');
      expect(clientWorkspace).toContain("- '.'");
      expect(clientWorkspace).toContain('minimumReleaseAge: 4320');
      expect(clientWorkspace).toContain('allowBuilds:');
      expect(clientTsconfig).toContain('"@cf-tamac/client/*"');
      expect(clientTsconfig).toContain('"@cf-tamac/client-agent-rpc/*"');
      expect(clientTsconfig).not.toContain('../../tsconfig.base.json');
      expect(clientWrangler).toContain('binding = "CLIENT_DB"');
      expect(clientWrangler).toContain('[assets]');
      expect(clientWrangler).toContain('directory = ".open-next/assets"');
      expect(clientWrangler).toContain('binding = "ASSETS"');
      expect(clientWrangler).not.toContain('AI_AGENT');
      expect(clientDevVars).toContain('CLIENT_CREDENTIAL_ENCRYPTION_KEY');
      expect(clientDevVars).not.toContain('CLIENT_CONTROL_PLANE_PRIVATE_KEYS');
      expect(existsSync(join(clientRoot, 'src/server/db/migrations'))).toBe(true);
      expect(existsSync(join(clientRoot, 'src/generated/agent-rpc/cftamac/agent/v1_pb.ts'))).toBe(
        true
      );
      expect(existsSync(join(clientRoot, 'src/tests'))).toBe(false);

      const rootReadme = readFileSync(join(projectRoot, 'README.md'), 'utf8');
      const installGuide = readFileSync(
        join(projectRoot, 'docs/operations/self-host-deploy.md'),
        'utf8'
      );
      expect(rootReadme).toContain(
        'https://deploy.workers.cloudflare.com/?url=https://github.com/Suzlun/cf-tamac/tree/deploy-agent'
      );
      expect(rootReadme).toContain(
        'https://deploy.workers.cloudflare.com/?url=https://github.com/Suzlun/cf-tamac/tree/deploy-client'
      );
      expect(installGuide).toContain('Agent Deploy Button を先に押します');
      expect(installGuide).toContain('Cloudflare Access');
      expect(installGuide).not.toContain('CLIENT_CONTROL_PLANE_PRIVATE_KEYS');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
