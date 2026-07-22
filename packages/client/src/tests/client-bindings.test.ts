import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const wranglerConfigPath = new URL('../../wrangler.toml', import.meta.url);

describe('Management Client Worker bindings', () => {
  it('[WORKSPACE-GOVERNANCE-S015] [MANAGEMENT-CLIENT-SHELL-S005] Client Worker binding set keeps SDK origin policy server-side and isolated from Agent runtime', () => {
    const config = readFileSync(fileURLToPath(wranglerConfigPath.href), 'utf8');

    expect(config).toContain('[[d1_databases]]');
    expect(config).toContain('binding = "CLIENT_DB"');
    expect(config).toContain('CLIENT_CREDENTIAL_ENCRYPTION_KEY');
    expect(config).toContain('AGENT_RPC_ALLOWED_ORIGINS');
    expect(config).toContain('AGENT_RPC_AUDIENCE');
    expect(config).toContain('[assets]');
    expect(config).toContain('directory = ".open-next/assets"');
    expect(config).toContain('binding = "ASSETS"');

    expect(config).not.toContain('AI_AGENT');
    expect(config).not.toContain('AGENT_BLOBS');
    expect(config).not.toMatch(/\[\[durable_objects\.bindings]]/);
    expect(config).not.toMatch(/\[\[r2_buckets]]/);
  });
});
