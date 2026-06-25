import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const wranglerConfigPath = new URL('../../wrangler.toml', import.meta.url);

describe('Management Client Worker bindings', () => {
  it('[MANAGEMENT-CLIENT-SHELL-S005] Client Worker binding set is isolated from Agent runtime', () => {
    const config = readFileSync(fileURLToPath(wranglerConfigPath.href), 'utf8');

    expect(config).toContain('[[d1_databases]]');
    expect(config).toContain('binding = "CLIENT_DB"');
    expect(config).toContain('CLIENT_CREDENTIAL_SECRET_REF');
    expect(config).toContain('CLIENT_CREDENTIAL_ENCRYPTION_KEY');

    expect(config).not.toContain('AI_AGENT');
    expect(config).not.toContain('AGENT_BLOBS');
    expect(config).not.toMatch(/\[\[durable_objects\.bindings]]/);
    expect(config).not.toMatch(/\[\[r2_buckets]]/);
  });
});
