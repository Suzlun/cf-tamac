import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { describe, expect, it } from 'vitest';

import {
  ApproveInvocationRequestSchema,
  CheckHealthRequestSchema,
  CheckHealthResponseSchema,
  InstallIntegrationRequestSchema,
  PublishEventRequestSchema,
  RotateAgentCredentialRequestSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { createRawBodyDigest } from '../domain/security';
import { handleAgentConnectRequest } from '../rpc/connect-worker-adapter';

import {
  createClientServiceJwtPayload,
  createEd25519TrustFixture,
  createMemoryJwtReplayReservation,
  signEd25519ClientJwt,
} from './ed25519-jwt-test-helpers';

import type { AIAgent } from '../AIAgent';
import type { AgentCoreRequestContext } from '../domain';
import type { ClientServiceJwtReplayReservationInput } from '../domain/security/replay';
import type { AgentWorkerEnv } from '../env';

const baseUrl = 'https://agent.example.test';
const healthPath = '/cftamac.agent.v1.AgentHealthService/Check';
const eventPublishPath = '/cftamac.agent.v1.AgentEventService/PublishEvent';
const approveInvocationPath = '/cftamac.agent.v1.AgentToolService/ApproveInvocation';
const installIntegrationPath = '/cftamac.agent.v1.AgentIntegrationService/InstallIntegration';
const providerIngressPath = '/cftamac.agent.v1.IntegrationIngressService/PublishEvent';
const rotateCredentialPath = '/cftamac.agent.v1.AgentLifecycleService/RotateAgentCredential';
const nowUnixMs = 1_700_000_000_000;
const protobufTextEncoder = new TextEncoder();

function createTestEnv(input: {
  readonly trustConfigJson: string;
  readonly replay?: (input: ClientServiceJwtReplayReservationInput) => {
    readonly status: 'reserved' | 'replay';
    readonly firstSeenUnixMs?: number;
  };
}): {
  readonly env: AgentWorkerEnv;
  readonly healthCalls: readonly string[];
  readonly publishContexts: readonly AgentCoreRequestContext[];
} {
  const healthCalls: string[] = [];
  const publishContexts: AgentCoreRequestContext[] = [];
  const reserve = input.replay ?? createMemoryJwtReplayReservation();
  const namespace = {
    get: (id: DurableObjectId) =>
      ({
        checkHealth: () => {
          const agentId = (id as { readonly name: string }).name;
          healthCalls.push(agentId);
          return { agentId, queue: 'agent_local', status: 'active', storage: 'sqlite' };
        },
        publishEvent: (command: { readonly context: AgentCoreRequestContext }) => {
          const agentId = (id as { readonly name: string }).name;
          publishContexts.push(command.context);
          return createAcceptedPublishEventResult(agentId);
        },
        reserveClientServiceJwtId: reserve,
      }) as unknown as DurableObjectStub<AIAgent>,
    idFromName: (name: string) => ({ name }) as unknown as DurableObjectId,
  } as unknown as DurableObjectNamespace<AIAgent>;
  return {
    env: {
      AGENT_BLOBS: {} as R2Bucket,
      AGENT_CONTROL_PLANE_TRUST: input.trustConfigJson,
      AGENT_INTEGRATION_SIGNATURE_KEYS: 'test-integration-key',
      AGENT_MODEL_PROVIDER_SECRET_REFS: 'test-model-secret',
      AGENT_RPC_AUDIENCE: 'test-audience',
      AI_AGENT: namespace,
    },
    healthCalls,
    publishContexts,
  };
}

function createBinaryRequest(path: string, token: string | undefined, body: Uint8Array): Request {
  const headers = new Headers({ 'Content-Type': 'application/proto' });
  // テストヘルパーでは token の有無だけを見て Authorization header を組み立て、秘密値同士の比較は行いません。
  if (typeof token === 'string') headers.set('Authorization', `Bearer ${token}`);
  return new Request(`${baseUrl}${path}`, { body, headers, method: 'POST' });
}

function createAcceptedPublishEventResult(agentId: string) {
  return {
    accepted: true,
    event: {
      agentId,
      agentSequence: 1,
      eventId: 'event-1',
      eventType: 'client.message',
      idempotencyKey: 'idem-publish-1',
      normalizedThreadKey: 'thread-1',
      occurredAtMs: nowUnixMs,
      sectionId: 'section-1',
      source: 'client',
      threadId: 'thread-1',
      threadKey: 'thread-1',
      threadSequence: 1,
    },
    pendingRun: {
      agentId,
      pendingSinceMs: nowUnixMs,
      runId: 'run-1',
      status: 'pending',
      threadId: 'thread-1',
      triggerEventId: 'event-1',
    },
    replayed: false,
    thread: {
      agentId,
      createdAtMs: nowUnixMs,
      latestEventId: 'event-1',
      latestRunId: 'run-1',
      normalizedThreadKey: 'thread-1',
      priority: 0,
      status: 'active',
      threadId: 'thread-1',
      threadKey: 'thread-1',
      updatedAtMs: nowUnixMs,
    },
  };
}

function appendDuplicateAgentIdField(body: Uint8Array, agentId: string): Uint8Array {
  const encodedAgentId = protobufTextEncoder.encode(agentId);
  return new Uint8Array([...body, 0x0a, encodedAgentId.byteLength, ...encodedAgentId]);
}

async function readErrorCode(response: Response): Promise<string> {
  const parsed: unknown = JSON.parse(await response.text());
  expect(parsed).toEqual(expect.objectContaining({ code: expect.any(String) }));
  return (parsed as { readonly code: string }).code;
}

async function createToken(input: {
  readonly fixture: Awaited<ReturnType<typeof createEd25519TrustFixture>>;
  readonly overrides?: Readonly<Record<string, unknown>>;
  readonly alg?: string;
  readonly kid?: string;
  readonly signaturePrivateKey?: CryptoKey;
}): Promise<string> {
  return signEd25519ClientJwt({
    alg: input.alg,
    kid: input.kid ?? input.fixture.kid,
    payload: {
      ...createClientServiceJwtPayload({
        fingerprint: input.fixture.fingerprint,
        issuer: input.fixture.issuer,
        scopes: ['agent:read'],
      }),
      ...input.overrides,
    },
    privateKey: input.fixture.privateKey,
    signaturePrivateKey: input.signaturePrivateKey,
  });
}

describe('Client Service Ed25519 Agent RPC authentication', () => {
  it('[AGENT-SECURITY-S001] 有効な Client Service JWT が Agent RPC を認証する', async () => {
    const fixture = await createEd25519TrustFixture();
    const { env, healthCalls } = createTestEnv({ trustConfigJson: fixture.trustConfigJson });
    const token = await createToken({ fixture });
    const body = toBinary(
      CheckHealthRequestSchema,
      create(CheckHealthRequestSchema, { agentId: 'agent-alpha' })
    );

    const response = await handleAgentConnectRequest(
      createBinaryRequest(healthPath, token, body),
      env
    );

    expect(response.status).toBe(200);
    expect(healthCalls).toEqual(['agent-alpha']);
    const responseBody = fromBinary(
      CheckHealthResponseSchema,
      new Uint8Array(await response.arrayBuffer())
    );
    expect(responseBody.currentPrincipalTrust).toMatchObject({
      fingerprint: fixture.fingerprint,
      issuer: fixture.issuer,
      keyStatus: 'active',
      kid: fixture.kid,
      principalType: 'CLIENT_SERVICE',
      verified: true,
    });
    expect(responseBody.trustConfig).toMatchObject({
      issuerCount: 1,
      keyCount: 1,
      status: 'serving',
      version: '1',
    });
  });

  it('[AGENT-SECURITY-S001] mutation は検証済み Client Service principal だけを AIAgent へ渡す', async () => {
    const fixture = await createEd25519TrustFixture({ allowedScopes: ['agent:write'] });
    const { env, publishContexts } = createTestEnv({ trustConfigJson: fixture.trustConfigJson });
    const token = await createToken({
      fixture,
      overrides: { jti: 'jwt-mutation-1', scopes: ['agent:write'] },
    });
    const forgedDigest = '0'.repeat(64);
    const request = create(PublishEventRequestSchema, {
      agentId: 'agent-alpha',
      event: {
        eventType: 'client.message',
        occurredAtUnixMs: BigInt(nowUnixMs),
        source: 'client',
      },
      idempotencyKey: 'idem-publish-1',
      security: {
        principal: {
          issuer: 'forged-issuer',
          jwtId: 'forged-jti',
          keyId: 'forged-key',
          principalId: 'forged-principal',
          principalType: 'ADMIN_OPERATOR',
          scopes: ['agent:admin'],
          subject: 'forged-subject',
        },
        rawBodyDigest: { algorithm: 'sha-256', byteLength: 1n, digestHex: forgedDigest },
      },
      threadKey: 'thread-1',
    });
    const body = toBinary(PublishEventRequestSchema, request);
    const expectedDigest = await createRawBodyDigest(body);

    const response = await handleAgentConnectRequest(
      createBinaryRequest(eventPublishPath, token, body),
      env
    );

    expect(response.status).toBe(200);
    expect(publishContexts).toHaveLength(1);
    expect(publishContexts[0]?.principal).toMatchObject({
      actingUserId: 'user-1',
      issuer: fixture.issuer,
      jwtId: 'jwt-mutation-1',
      keyId: fixture.kid,
      principalId: 'client-service-principal',
      principalType: 'CLIENT_SERVICE',
      scopes: ['agent:write'],
      subject: 'client-service-principal',
    });
    expect(publishContexts[0]?.bodyDigest).toEqual(expectedDigest);
    expect(publishContexts[0]?.bodyDigest.digestHex).not.toBe(forgedDigest);
  });

  it('[AGENT-SECURITY-S002] 不正な Client JWT は mutation 前に拒否される', async () => {
    const fixture = await createEd25519TrustFixture({ allowedScopes: ['agent:read'] });
    const otherFixture = await createEd25519TrustFixture({ kid: 'other-key' });
    const body = toBinary(
      CheckHealthRequestSchema,
      create(CheckHealthRequestSchema, { agentId: 'agent-alpha' })
    );
    const cases = [
      { code: 'unauthenticated', label: 'missing', token: undefined },
      {
        code: 'unauthenticated',
        label: 'alg',
        token: await createToken({ alg: 'HS256', fixture }),
      },
      {
        code: 'unauthenticated',
        label: 'unknown issuer',
        token: await createToken({ fixture, overrides: { iss: 'unknown-client' } }),
      },
      {
        code: 'unauthenticated',
        label: 'unknown kid',
        token: await createToken({ fixture, kid: 'unknown-kid' }),
      },
      {
        code: 'unauthenticated',
        label: 'bad signature',
        token: await createToken({ fixture, signaturePrivateKey: otherFixture.privateKey }),
      },
      {
        code: 'unauthenticated',
        label: 'audience',
        token: await createToken({ fixture, overrides: { aud: 'other-audience' } }),
      },
      {
        code: 'unauthenticated',
        label: 'expired',
        token: await createToken({ fixture, overrides: { exp: 1_699_999_800 } }),
      },
      {
        code: 'permission_denied',
        label: 'agent',
        token: await createToken({ fixture, overrides: { agent_id: 'agent-beta' } }),
      },
      {
        code: 'permission_denied',
        label: 'scope',
        token: await createToken({ fixture, overrides: { scopes: ['agent:admin'] } }),
      },
    ] as const;

    for (const testCase of cases) {
      const { env, healthCalls } = createTestEnv({ trustConfigJson: fixture.trustConfigJson });
      const response = await handleAgentConnectRequest(
        createBinaryRequest(healthPath, testCase.token, body),
        env
      );
      expect(await readErrorCode(response), testCase.label).toBe(testCase.code);
      expect(healthCalls, testCase.label).toEqual([]);
    }
  });

  it('[AGENT-SECURITY-S013] メソッド scope matrix が不足 scope を拒否する', async () => {
    const fixture = await createEd25519TrustFixture({ allowedScopes: ['agent:read'] });
    const token = await createToken({ fixture, overrides: { scopes: ['agent:read'] } });
    const cases = [
      {
        body: toBinary(
          PublishEventRequestSchema,
          create(PublishEventRequestSchema, { agentId: 'agent-alpha' })
        ),
        path: eventPublishPath,
      },
      {
        body: toBinary(
          ApproveInvocationRequestSchema,
          create(ApproveInvocationRequestSchema, { agentId: 'agent-alpha' })
        ),
        path: approveInvocationPath,
      },
      {
        body: toBinary(
          InstallIntegrationRequestSchema,
          create(InstallIntegrationRequestSchema, { agentId: 'agent-alpha' })
        ),
        path: installIntegrationPath,
      },
      {
        body: toBinary(
          RotateAgentCredentialRequestSchema,
          create(RotateAgentCredentialRequestSchema, { agentId: 'agent-alpha' })
        ),
        path: rotateCredentialPath,
      },
      {
        body: toBinary(
          CheckHealthRequestSchema,
          create(CheckHealthRequestSchema, { agentId: 'agent-alpha' })
        ),
        path: providerIngressPath,
      },
    ];

    for (const testCase of cases) {
      const { env } = createTestEnv({ trustConfigJson: fixture.trustConfigJson });
      const response = await handleAgentConnectRequest(
        createBinaryRequest(testCase.path, token, testCase.body),
        env
      );
      expect(await readErrorCode(response)).toBe('permission_denied');
    }
  });

  it('[AGENT-SECURITY-S013] allowedScopes wildcard は concrete token scope だけを許可する', async () => {
    const fixture = await createEd25519TrustFixture({ allowedScopes: ['*'] });
    const concreteToken = await createToken({
      fixture,
      overrides: { jti: 'jwt-policy-wildcard-scope', scopes: ['agent:read'] },
    });
    const body = toBinary(
      CheckHealthRequestSchema,
      create(CheckHealthRequestSchema, { agentId: 'agent-alpha' })
    );
    const { env: concreteEnv, healthCalls: concreteHealthCalls } = createTestEnv({
      trustConfigJson: fixture.trustConfigJson,
    });

    const concreteResponse = await handleAgentConnectRequest(
      createBinaryRequest(healthPath, concreteToken, body),
      concreteEnv
    );

    expect(concreteResponse.status).toBe(200);
    expect(concreteHealthCalls).toEqual(['agent-alpha']);

    const wildcardToken = await createToken({
      fixture,
      overrides: { jti: 'jwt-token-wildcard-scope', scopes: ['*', 'agent:read'] },
    });
    const { env: wildcardEnv, healthCalls: wildcardHealthCalls } = createTestEnv({
      trustConfigJson: fixture.trustConfigJson,
    });

    const wildcardResponse = await handleAgentConnectRequest(
      createBinaryRequest(healthPath, wildcardToken, body),
      wildcardEnv
    );

    expect(await readErrorCode(wildcardResponse)).toBe('permission_denied');
    expect(wildcardHealthCalls).toEqual([]);
  });

  it('[AGENT-SECURITY-S014] 対象 Agent id と allowedAgentIds の不一致が拒否される', async () => {
    const fixture = await createEd25519TrustFixture({ allowedAgentIds: ['agent-alpha'] });
    const token = await createToken({ fixture });
    const mismatchedBody = toBinary(
      CheckHealthRequestSchema,
      create(CheckHealthRequestSchema, { agentId: 'agent-beta' })
    );
    const mismatchedResponse = await handleAgentConnectRequest(
      createBinaryRequest(healthPath, token, mismatchedBody),
      createTestEnv({ trustConfigJson: fixture.trustConfigJson }).env
    );
    expect(await readErrorCode(mismatchedResponse)).toBe('permission_denied');

    const deniedFixture = await createEd25519TrustFixture({ allowedAgentIds: ['agent-beta'] });
    const deniedToken = await createToken({
      fixture: deniedFixture,
      overrides: { agent_id: 'agent-alpha' },
    });
    const body = toBinary(
      CheckHealthRequestSchema,
      create(CheckHealthRequestSchema, { agentId: 'agent-alpha' })
    );
    const deniedResponse = await handleAgentConnectRequest(
      createBinaryRequest(healthPath, deniedToken, body),
      createTestEnv({ trustConfigJson: deniedFixture.trustConfigJson }).env
    );
    expect(await readErrorCode(deniedResponse)).toBe('permission_denied');

    const duplicateAgentBody = appendDuplicateAgentIdField(body, 'agent-beta');
    const { env: duplicateEnv, healthCalls: duplicateHealthCalls } = createTestEnv({
      trustConfigJson: fixture.trustConfigJson,
    });
    const duplicateResponse = await handleAgentConnectRequest(
      createBinaryRequest(healthPath, token, duplicateAgentBody),
      duplicateEnv
    );
    expect(await readErrorCode(duplicateResponse)).toBe('invalid_argument');
    expect(duplicateHealthCalls).toEqual([]);
  });

  it('[AGENT-SECURITY-S014] allowedAgentIds wildcard は concrete JWT agent_id だけを許可する', async () => {
    const fixture = await createEd25519TrustFixture({ allowedAgentIds: ['*'] });
    const concreteToken = await createToken({
      fixture,
      overrides: { agent_id: 'agent-beta', jti: 'jwt-policy-wildcard-agent' },
    });
    const concreteBody = toBinary(
      CheckHealthRequestSchema,
      create(CheckHealthRequestSchema, { agentId: 'agent-beta' })
    );
    const { env: concreteEnv, healthCalls: concreteHealthCalls } = createTestEnv({
      trustConfigJson: fixture.trustConfigJson,
    });

    const concreteResponse = await handleAgentConnectRequest(
      createBinaryRequest(healthPath, concreteToken, concreteBody),
      concreteEnv
    );

    expect(concreteResponse.status).toBe(200);
    expect(concreteHealthCalls).toEqual(['agent-beta']);

    const wildcardToken = await createToken({
      fixture,
      overrides: { agent_id: '*', jti: 'jwt-token-wildcard-agent' },
    });
    const wildcardBody = toBinary(
      CheckHealthRequestSchema,
      create(CheckHealthRequestSchema, { agentId: 'agent-alpha' })
    );
    const { env: wildcardEnv, healthCalls: wildcardHealthCalls } = createTestEnv({
      trustConfigJson: fixture.trustConfigJson,
    });

    const wildcardResponse = await handleAgentConnectRequest(
      createBinaryRequest(healthPath, wildcardToken, wildcardBody),
      wildcardEnv
    );

    expect(await readErrorCode(wildcardResponse)).toBe('permission_denied');
    expect(wildcardHealthCalls).toEqual([]);
  });

  it('[AGENT-SECURITY-S015] 再利用された jti は mutation 前に拒否される', async () => {
    const fixture = await createEd25519TrustFixture();
    const replay = createMemoryJwtReplayReservation();
    const { env, healthCalls } = createTestEnv({
      replay,
      trustConfigJson: fixture.trustConfigJson,
    });
    const token = await createToken({ fixture, overrides: { jti: 'jwt-replay-1' } });
    const body = toBinary(
      CheckHealthRequestSchema,
      create(CheckHealthRequestSchema, { agentId: 'agent-alpha' })
    );

    const first = await handleAgentConnectRequest(
      createBinaryRequest(healthPath, token, body),
      env
    );
    const second = await handleAgentConnectRequest(
      createBinaryRequest(healthPath, token, body),
      env
    );

    expect(first.status).toBe(200);
    expect(await readErrorCode(second)).toBe('permission_denied');
    expect(healthCalls).toEqual(['agent-alpha']);
  });
});
