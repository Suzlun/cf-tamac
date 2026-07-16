import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { describe, expect, it, vi } from 'vitest';

import {
  GetStateRequestSchema,
  GetStateResponseSchema,
  PublishIntegrationEventRequestSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { handleAgentConnectRequest } from '../rpc/connect-worker-adapter';
import {
  createProviderIngressRateLimitKey,
  inspectProviderIngressRateLimit,
} from '../rpc/interceptors/provider-ingress-rate-limit';
import { createProviderIngressRateLimitDenialObserver } from '../worker';

import { createProviderIngressRateLimitStub } from './provider-ingress-rate-limit-test-helpers';
import { testControlPlaneTrustConfig } from './test-control-plane-trust';

import type { AIAgent } from '../AIAgent';
import type { AgentWorkerEnv } from '../env';

const baseUrl = 'https://agent.example.test';
const providerEventPath = '/cftamac.agent.v1.IntegrationIngressService/PublishEvent';
const providerToolPath = '/cftamac.agent.v1.IntegrationIngressService/PublishToolResult';
const statePath = '/cftamac.agent.v1.AgentStateService/GetState';
const agentId = 'agent-rate-limit';
const providerOperation = {
  method: 'PublishEvent',
  service: 'cftamac.agent.v1.IntegrationIngressService',
} as const;

function createTestEnv(rateLimit: RateLimit): {
  readonly env: AgentWorkerEnv;
  readonly providerCalls: readonly string[];
} {
  const providerCalls: string[] = [];
  return {
    env: {
      AGENT_AUDIT_HASH_PEPPER: 'test-audit-hash-pepper',
      AGENT_BLOBS: {} as R2Bucket,
      AGENT_CONTROL_PLANE_TRUST: testControlPlaneTrustConfig,
      AGENT_INTEGRATION_SIGNATURE_KEYS: 'test-integration-key',
      AGENT_MODEL_PROVIDER_SECRET_REFS: 'test-model-secret',
      AGENT_RPC_AUDIENCE: 'test-audience',
      AI_AGENT: {
        get: (id: DurableObjectId) =>
          ({
            getState: () => createStateSnapshot((id as { readonly name: string }).name),
            publishIntegrationEvent: () => {
              // provider handler 到達は rate-limit denial が pre-auth terminal でない場合だけに記録します。
              providerCalls.push((id as { readonly name: string }).name);
              return createProviderEventResult((id as { readonly name: string }).name);
            },
          }) as unknown as DurableObjectStub<AIAgent>,
        idFromName: (name: string) => ({ name }) as unknown as DurableObjectId,
      } as unknown as DurableObjectNamespace<AIAgent>,
      PROVIDER_INGRESS_RATE_LIMITER: rateLimit,
    },
    providerCalls,
  };
}

function createProviderIngressRequest(
  input: {
    readonly body?: BodyInit;
    readonly headers?: HeadersInit;
    readonly path?: string;
  } = {}
): Request {
  const headers = new Headers(input.headers);
  headers.set('Content-Type', 'application/proto');
  return new Request(`${baseUrl}${input.path ?? providerEventPath}`, {
    body:
      input.body ??
      toBinary(
        PublishIntegrationEventRequestSchema,
        create(PublishIntegrationEventRequestSchema, {
          agentId,
          connectionId: 'connection-rate-limit',
          idempotencyKey: 'provider-idempotency-rate-limit',
          installationId: 'installation-rate-limit',
          threadKey: 'provider-rate-limit',
        })
      ),
    headers,
    method: 'POST',
  });
}

function createClientStateRequest(): Request {
  return new Request(`${baseUrl}${statePath}`, {
    body: toBinary(GetStateRequestSchema, create(GetStateRequestSchema, { agentId })),
    headers: {
      'Content-Type': 'application/proto',
      'x-agent-test-grant': 'allow',
      'x-agent-test-principal-id': 'client-service-rate-limit-reader',
    },
    method: 'POST',
  });
}

function createStateSnapshot(targetAgentId: string) {
  return {
    state: {
      agentId: targetAgentId,
      configVersion: 3,
      lifecycleStatus: 'active',
      schedulerStatus: 'idle',
      stateVersion: '17',
      storageStatus: 'normal',
      updatedAtMs: 1_700_000_000_000,
    },
    storage: {
      agentId: targetAgentId,
      compactionPriorityPercent: 80,
      criticalPercent: 95,
      currentPercent: 20,
      forceLargeBodyR2Percent: 90,
      inlinePayloadLimitBytes: 4096,
      warningPercent: 70,
    },
  };
}

function createProviderEventResult(targetAgentId: string) {
  return {
    event: {
      agentId: targetAgentId,
      agentSequence: 1,
      eventId: 'event-rate-limit',
      eventType: 'integration.message',
      idempotencyKey: 'provider-idempotency-rate-limit',
      normalizedThreadKey: 'provider-rate-limit',
      occurredAtMs: 1_700_000_000_000,
      sectionId: 'section-rate-limit',
      source: 'integration',
      threadId: 'thread-rate-limit',
      threadKey: 'provider-rate-limit',
      threadSequence: 1,
    },
    replayed: false,
    thread: {
      agentId: targetAgentId,
      createdAtMs: 1_700_000_000_000,
      normalizedThreadKey: 'provider-rate-limit',
      priority: 0,
      status: 'active',
      threadId: 'thread-rate-limit',
      threadKey: 'provider-rate-limit',
      updatedAtMs: 1_700_000_000_000,
    },
  };
}

async function readError(
  response: Response
): Promise<{ readonly code: string; readonly message: string }> {
  const parsed: unknown = JSON.parse(await response.text());
  expect(parsed).toEqual({ code: expect.any(String), message: expect.any(String) });
  return parsed as { readonly code: string; readonly message: string };
}

async function readStateVersion(env: AgentWorkerEnv): Promise<string> {
  const response = await handleAgentConnectRequest(createClientStateRequest(), env, {
    allowTestSeam: true,
  });
  expect(response.status).toBe(200);
  const decoded = fromBinary(GetStateResponseSchema, new Uint8Array(await response.arrayBuffer()));
  return decoded.state?.stateVersion ?? '';
}

describe('Provider ingress pre-auth rate limit', () => {
  it('[TAMAC-SDK-S002] hashes only normalized trusted source and generated procedure', async () => {
    // payload/Agent/Installation identity は key input に渡せない API にして、同一 source/procedure の bucket を固定します。
    const first = await createProviderIngressRateLimitKey({
      operation: providerOperation,
      source: '2001:db8::1',
    });
    const sameNormalizedSource = await createProviderIngressRateLimitKey({
      operation: providerOperation,
      source: '2001:db8::1',
    });
    const differentSource = await createProviderIngressRateLimitKey({
      operation: providerOperation,
      source: '2001:db8::2',
    });
    const differentProcedure = await createProviderIngressRateLimitKey({
      operation: { ...providerOperation, method: 'PublishToolResult' },
      source: '2001:db8::1',
    });

    expect(first).toMatch(/^pir1:[A-Za-z0-9_-]{43}$/u);
    expect(sameNormalizedSource).toBe(first);
    expect(differentSource).not.toBe(first);
    expect(differentProcedure).not.toBe(first);
  });

  it('[TAMAC-SDK-S002] evaluates one allowance for the same source/procedure regardless of body identity', async () => {
    const rateLimit = createProviderIngressRateLimitStub();
    const { env } = createTestEnv(rateLimit.binding);
    const first = await inspectProviderIngressRateLimit({
      env,
      operation: providerOperation,
      request: createProviderIngressRequest({ headers: { 'CF-Connecting-IP': '203.0.113.10' } }),
    });
    const second = await inspectProviderIngressRateLimit({
      env,
      operation: providerOperation,
      request: createProviderIngressRequest({
        body: toBinary(
          PublishIntegrationEventRequestSchema,
          create(PublishIntegrationEventRequestSchema, {
            agentId: 'a-different-unverified-agent-id',
            connectionId: 'different-connection',
            idempotencyKey: 'different-idempotency-key',
            installationId: 'different-installation',
            threadKey: 'different-thread-key',
          })
        ),
        headers: { 'CF-Connecting-IP': '203.0.113.10' },
      }),
    });

    expect(first.status).toBe('allowed');
    expect(second.status).toBe('allowed');
    expect(rateLimit.calls).toHaveLength(2);
    expect(rateLimit.calls[1]?.key).toBe(rateLimit.calls[0]?.key);
  });

  it('[TAMAC-SDK-S002] normalizes equivalent IPv6 literals before procedure-scoped key generation', async () => {
    const rateLimit = createProviderIngressRateLimitStub();
    const { env } = createTestEnv(rateLimit.binding);

    // 異なる表記の同一 IPv6 edge source は同じ request bucket に収束し、allowance を分散させません。
    await inspectProviderIngressRateLimit({
      env,
      operation: providerOperation,
      request: createProviderIngressRequest({
        headers: { 'CF-Connecting-IP': '2001:0db8:0000:0000:0000:0000:0000:0001' },
      }),
    });
    await inspectProviderIngressRateLimit({
      env,
      operation: providerOperation,
      request: createProviderIngressRequest({ headers: { 'CF-Connecting-IP': '2001:db8::1' } }),
    });

    expect(rateLimit.calls).toHaveLength(2);
    expect(rateLimit.calls[1]?.key).toBe(rateLimit.calls[0]?.key);
  });

  it('[TAMAC-SDK-S002] denies invalid trusted sources and binding faults before raw body or AIAgent state', async () => {
    const failureCases = [
      {
        headers: { 'CF-Connecting-IP': '203.0.113.10, 203.0.113.11' },
        label: 'multiple source values',
        rateLimit: createProviderIngressRateLimitStub(),
      },
      {
        headers: { 'CF-Worker': 'worker-subrequest', 'CF-Connecting-IP': '203.0.113.10' },
        label: 'Worker subrequest',
        rateLimit: createProviderIngressRateLimitStub(),
      },
      {
        headers: {},
        label: 'missing source',
        rateLimit: createProviderIngressRateLimitStub(),
      },
      {
        headers: { 'CF-Connecting-IP': 'not-an-ip-literal' },
        label: 'invalid source literal',
        rateLimit: createProviderIngressRateLimitStub(),
      },
      {
        headers: { 'CF-Connecting-IP': '203.0.113.10' },
        label: 'binding throw',
        rateLimit: createProviderIngressRateLimitStub({
          limit: () => Promise.reject(new Error('binding unavailable')),
        }),
      },
      {
        headers: { 'CF-Connecting-IP': '203.0.113.10' },
        label: 'invalid binding outcome',
        rateLimit: createProviderIngressRateLimitStub({ limit: () => ({}) }),
      },
    ] as const;

    for (const testCase of failureCases) {
      const { env, providerCalls } = createTestEnv(testCase.rateLimit.binding);
      // malformed raw bytesを渡しても、pre-auth denial が wire decode より先に terminal になることを確認します。
      const response = await handleAgentConnectRequest(
        createProviderIngressRequest({ body: new Uint8Array([255]), headers: testCase.headers }),
        env
      );
      const error = await readError(response);
      expect(response.status, testCase.label).toBe(429);
      expect(error, testCase.label).toEqual({
        code: 'resource_exhausted',
        message: 'Provider ingress traffic cannot be accepted at this time.',
      });
      expect(providerCalls, testCase.label).toEqual([]);
    }
  });

  it('[TAMAC-SDK-S002] gives Authorization denial priority and never consumes a Provider allowance', async () => {
    const rateLimit = createProviderIngressRateLimitStub({ limit: () => ({ success: false }) });
    const { env, providerCalls } = createTestEnv(rateLimit.binding);
    const response = await handleAgentConnectRequest(
      createProviderIngressRequest({
        headers: {
          Authorization: 'Bearer client-service-token-must-not-reach-provider',
          'CF-Connecting-IP': '203.0.113.10',
        },
      }),
      env
    );

    expect(await readError(response)).toMatchObject({ code: 'permission_denied' });
    expect(rateLimit.calls).toEqual([]);
    expect(providerCalls).toEqual([]);
  });

  it('[TAMAC-SDK-S002] fails closed when the required RateLimit binding is missing or its getter throws', async () => {
    const rateLimit = createProviderIngressRateLimitStub();
    const { env } = createTestEnv(rateLimit.binding);
    const missingBindingEnv = {
      ...env,
      PROVIDER_INGRESS_RATE_LIMITER: undefined,
    } as unknown as AgentWorkerEnv;
    const throwingBindingEnv = Object.create(env) as AgentWorkerEnv;
    Object.defineProperty(throwingBindingEnv, 'PROVIDER_INGRESS_RATE_LIMITER', {
      get: () => {
        throw new Error('binding getter failure');
      },
    });

    // required binding の欠落/取得失敗も source/body/signature を処理せず、同じ固定 429 schema へ畳み込みます。
    for (const failureEnv of [missingBindingEnv, throwingBindingEnv]) {
      const response = await handleAgentConnectRequest(
        createProviderIngressRequest({ headers: { 'CF-Connecting-IP': '203.0.113.10' } }),
        failureEnv
      );
      expect(await readError(response)).toEqual({
        code: 'resource_exhausted',
        message: 'Provider ingress traffic cannot be accepted at this time.',
      });
    }
  });

  it('[TAMAC-SDK-S002] returns identical 429 for signed-looking and invalid-signature requests without state mutation', async () => {
    const rateLimit = createProviderIngressRateLimitStub({ limit: () => ({ success: false }) });
    const { env, providerCalls } = createTestEnv(rateLimit.binding);
    const denials: unknown[] = [];
    const stateVersionBefore = await readStateVersion(env);
    const validSignatureShape = toBinary(
      PublishIntegrationEventRequestSchema,
      create(PublishIntegrationEventRequestSchema, {
        agentId,
        connectionId: 'connection-rate-limit',
        idempotencyKey: 'provider-idempotency-rate-limit',
        installationId: 'installation-rate-limit',
        nonce: { nonce: 'rate-limit-nonce' },
        signature: {
          algorithm: 'Ed25519',
          keyId: 'provider-key-1',
          signature: new Uint8Array(64),
          signedAtUnixMs: 1_700_000_000_000n,
        },
        threadKey: 'provider-rate-limit',
        timestamp: { unixMs: 1_700_000_000_000n },
      })
    );
    const invalidSignatureShape = new Uint8Array([...validSignatureShape, 0x12, 0x01, 0x00]);
    const responses = await Promise.all(
      [validSignatureShape, invalidSignatureShape].map((body) =>
        handleAgentConnectRequest(
          createProviderIngressRequest({ body, headers: { 'CF-Connecting-IP': '203.0.113.10' } }),
          env,
          {
            // adapter は body/signature を observer へ渡さず、guard が返した safe denial だけを接続します。
            onProviderIngressRateLimitDenied: (denial) => denials.push(denial),
          }
        )
      )
    );

    const errors = await Promise.all(responses.map(readError));
    expect(errors).toEqual([
      {
        code: 'resource_exhausted',
        message: 'Provider ingress traffic cannot be accepted at this time.',
      },
      {
        code: 'resource_exhausted',
        message: 'Provider ingress traffic cannot be accepted at this time.',
      },
    ]);
    expect(providerCalls).toEqual([]);
    expect(denials).toEqual([
      {
        method: 'PublishEvent',
        reason: 'rate_limit_exceeded',
        service: 'cftamac.agent.v1.IntegrationIngressService',
      },
      {
        method: 'PublishEvent',
        reason: 'rate_limit_exceeded',
        service: 'cftamac.agent.v1.IntegrationIngressService',
      },
    ]);
    expect(await readStateVersion(env)).toBe(stateVersionBefore);
  });

  it('[TAMAC-SDK-S002] emits only the allowlisted safe denial counter fields', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const observer = createProviderIngressRateLimitDenialObserver(() => 1_700_000_000_000);

    // observer input は safe denial value だけなので、log output に caller-controlled identities を供給できません。
    observer({
      method: 'PublishEvent',
      reason: 'rate_limit_exceeded',
      service: 'cftamac.agent.v1.IntegrationIngressService',
    });

    expect(warn).toHaveBeenCalledOnce();
    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toEqual({
      count: 1,
      counterType: 'rate_limit',
      fields: {
        method: 'PublishEvent',
        principalType: 'PROVIDER_INGRESS_PRE_AUTH',
        service: 'cftamac.agent.v1.IntegrationIngressService',
      },
      name: 'agent.provider_ingress_rate_limit_denied',
      reason: 'rate_limit_exceeded',
      timestampUnixMs: 1_700_000_000_000,
    });
    warn.mockRestore();
  });

  it('[TAMAC-SDK-S002] scopes different generated Provider procedures into different allowance buckets', async () => {
    const rateLimit = createProviderIngressRateLimitStub();
    const { env } = createTestEnv(rateLimit.binding);
    const event = await handleAgentConnectRequest(
      createProviderIngressRequest({ headers: { 'CF-Connecting-IP': '2001:0db8:0:0:0:0:0:1' } }),
      env
    );
    const tool = await handleAgentConnectRequest(
      createProviderIngressRequest({
        headers: { 'CF-Connecting-IP': '2001:db8::1' },
        path: providerToolPath,
      }),
      env
    );

    // allowance が通った後は intentionally malformed identity が generated handler で拒否されても、bucket は procedure ごとに異なります。
    expect(event.status).not.toBe(429);
    expect(tool.status).not.toBe(429);
    expect(rateLimit.calls).toHaveLength(2);
    expect(rateLimit.calls[1]?.key).not.toBe(rateLimit.calls[0]?.key);
  });
});
