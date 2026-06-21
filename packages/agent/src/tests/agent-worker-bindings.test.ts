import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const wranglerConfigPath = new URL('../../wrangler.toml', import.meta.url);

describe('Agent Worker bindings', () => {
  it('[AGENT-PLATFORM-S005] Agent Worker bindings exclude Client D1 and Cloudflare Queues', () => {
    const config = readFileSync(fileURLToPath(wranglerConfigPath.href), 'utf8');

    expect(config).toContain('[[durable_objects.bindings]]');
    expect(config).toContain('name = "AI_AGENT"');
    expect(config).toContain('class_name = "AIAgent"');
    expect(config).toContain('[[r2_buckets]]');
    expect(config).toContain('binding = "AGENT_BLOBS"');

    expect(config).not.toMatch(/\[\[d1_databases]]/);
    expect(config).not.toContain('CLIENT_DB');
    expect(config).not.toMatch(/\[\[queues\.(?:producers|consumers)]]/);
    expect(config).not.toMatch(/binding\s*=\s*".*D1.*"/);
  });
});
