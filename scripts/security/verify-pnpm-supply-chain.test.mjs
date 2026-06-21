import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { collectPnpmSupplyChainIssues } from './verify-pnpm-supply-chain.mjs';

describe('pnpm supply-chain governance', () => {
  it('[WORKSPACE-GOVERNANCE-S007] Supply-chain lint enforces release-age and build-script policy', () => {
    const validWorkspaceConfig = readFileSync('pnpm-workspace.yaml', 'utf8');
    const weakenedWorkspaceConfig = `packages:
  - 'packages/*'

minimumReleaseAge: 0
minimumReleaseAgeExclude:
  - emergency-package

allowBuilds:
  esbuild: false
  '*': true

dangerouslyAllowAllBuilds: true
`;

    expect(collectPnpmSupplyChainIssues(validWorkspaceConfig)).toEqual([]);
    expect(collectPnpmSupplyChainIssues(weakenedWorkspaceConfig, 'fixture-pnpm-workspace.yaml')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('minimumReleaseAge must be at least 4320 minutes'),
        expect.stringContaining('allowBuilds entry must approve one package with true: esbuild: false'),
        expect.stringContaining("allowBuilds entry must approve one package with true: '*': true"),
        expect.stringContaining('Do not enable dangerouslyAllowAllBuilds'),
        expect.stringContaining('Do not bypass the 72-hour release-age margin'),
      ])
    );
  });
});
