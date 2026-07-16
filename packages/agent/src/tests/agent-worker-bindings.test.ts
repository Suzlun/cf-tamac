import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const wranglerConfigPath = new URL('../../wrangler.toml', import.meta.url);

describe('Agent Worker bindings', () => {
  it('[AGENT-PLATFORM-S005] [TAMAC-SDK-S002] Agent Worker bindings exclude Client D1 and Cloudflare Queues', () => {
    const config = readFileSync(fileURLToPath(wranglerConfigPath.href), 'utf8');

    expect(config).toContain('[[durable_objects.bindings]]');
    expect(config).toContain('name = "AI_AGENT"');
    expect(config).toContain('class_name = "AIAgent"');
    expect(config).toContain('[[r2_buckets]]');
    expect(config).toContain('binding = "AGENT_BLOBS"');
    expect(config).toContain('[[ratelimits]]');
    expect(config).toContain('name = "PROVIDER_INGRESS_RATE_LIMITER"');
    expect(config).toContain('namespace_id = "1001"');
    expect(config).toContain('limit = 100');
    expect(config).toContain('period = 60');
    expect(config).toContain('[[env.staging.ratelimits]]');
    expect(config).toContain('namespace_id = "1002"');
    expect(config).toContain('[[env.staging.durable_objects.bindings]]');
    expect(config).toContain('[[env.staging.r2_buckets]]');
    expect(config).toContain('bucket_name = "cf-tamac-agent-staging-blobs"');
    expect(config).toContain('[env.staging.ai]');
    expect(config).toContain('[env.staging.vars]');
    expect(config).toContain('AGENT_RPC_AUDIENCE = "cf-tamac-agent-staging"');

    expect(config).not.toMatch(/\[\[d1_databases]]/);
    expect(config).not.toContain('CLIENT_DB');
    expect(config).not.toMatch(/\[\[queues\.(?:producers|consumers)]]/);
    expect(config).not.toMatch(/binding\s*=\s*".*D1.*"/);
  });

  it('[AGENT-PLATFORM-S015] [TAMAC-SDK-S002] Agent Worker bindings include Workers AI and exclude Client storage', () => {
    const config = readFileSync(fileURLToPath(wranglerConfigPath.href), 'utf8');

    expect(config).toContain('[[durable_objects.bindings]]');
    expect(config).toContain('name = "AI_AGENT"');
    expect(config).toContain('[[r2_buckets]]');
    expect(config).toContain('binding = "AGENT_BLOBS"');
    expect(config).toContain('[ai]');
    expect(config).toContain('binding = "AI"');
    expect(config).toContain('PROVIDER_INGRESS_RATE_LIMITER');

    expect(config).not.toContain('CLIENT_DB');
    expect(config).not.toMatch(/\[\[d1_databases]]/);
    expect(config).not.toMatch(/\[\[queues\.(?:producers|consumers)]]/);
    expect(config).not.toMatch(/\[\[env\.staging\.d1_databases]]/);
    expect(config).not.toMatch(/\[\[env\.staging\.queues\.(?:producers|consumers)]]/);
  });
});
