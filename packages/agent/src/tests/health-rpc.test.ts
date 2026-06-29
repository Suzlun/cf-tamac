import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { describe, expect, it } from 'vitest';

import {
  CheckHealthRequestSchema,
  CheckHealthResponseSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { handleAgentConnectRequest } from '../rpc/connect-worker-adapter';

import {
  createClientServiceJwtPayload,
  createEd25519TrustFixture,
  createMemoryJwtReplayReservation,
  signEd25519ClientJwt,
} from './ed25519-jwt-test-helpers';
import { testControlPlaneTrustConfig } from './test-control-plane-trust';

import type { AIAgent } from '../AIAgent';
import type { AgentWorkerEnv } from '../env';

const baseUrl = 'https://agent.example.test';
const healthRpcPath = '/cftamac.agent.v1.AgentHealthService/Check';

function createTestEnv(
  modelExecution?: {
    readonly bindingPresent: boolean;
    readonly checkedAtMs: number;
    readonly defaultPolicyDigest?: string;
    readonly defaultPolicyRef?: string;
    readonly modelId?: string;
    readonly provider?: string;
    readonly safeDetailRef?: string;
    readonly status: 'serving' | 'degraded' | 'unavailable';
  },
  trustConfigJson = testControlPlaneTrustConfig
): {
  readonly env: AgentWorkerEnv;
  readonly routedNames: readonly string[];
} {
  const routedNames: string[] = [];
  const reserveClientServiceJwtId = createMemoryJwtReplayReservation();
  return {
    env: {
      AGENT_BLOBS: {} as R2Bucket,
      AGENT_AUDIT_HASH_PEPPER: 'test-audit-hash-pepper',
      AGENT_CONTROL_PLANE_TRUST: trustConfigJson,
      AGENT_INTEGRATION_SIGNATURE_KEYS: 'test-integration-key',
      AGENT_MODEL_PROVIDER_SECRET_REFS: 'test-model-secret',
      AGENT_RPC_AUDIENCE: 'test-audience',
      AI_AGENT: {
        get: (id: DurableObjectId) =>
          ({
            checkHealth: () => ({
              agentId: (id as { readonly name: string }).name,
              modelExecution,
              queue: 'agent_local',
              status: 'active',
              storage: 'sqlite',
            }),
            reserveClientServiceJwtId,
          }) as unknown as DurableObjectStub<AIAgent>,
        idFromName: (name: string) => {
          routedNames.push(name);
          return { name } as unknown as DurableObjectId;
        },
      } as unknown as DurableObjectNamespace<AIAgent>,
    },
    routedNames,
  };
}

function createHealthRequest(path: string, body?: BodyInit, headers?: HeadersInit): Request {
  const requestHeaders = new Headers(
    headers ?? {
      'x-agent-test-grant': 'allow',
      'x-agent-test-principal-id': 'principal-1',
    }
  );
  requestHeaders.set('Content-Type', 'application/proto');
  return new Request(`${baseUrl}${path}`, {
    body,
    headers: requestHeaders,
    method: 'POST',
  });
}

async function createHealthBearerHeaders(input: {
  readonly agentId?: string;
  readonly fingerprint?: string;
  readonly fixture: Awaited<ReturnType<typeof createEd25519TrustFixture>>;
  readonly jwtId?: string;
  readonly kid?: string;
  readonly overrides?: Readonly<Record<string, unknown>>;
}): Promise<HeadersInit> {
  const token = await signEd25519ClientJwt({
    kid: input.kid ?? input.fixture.kid,
    payload: {
      ...createClientServiceJwtPayload({
        agentId: input.agentId ?? 'agent-health',
        fingerprint: input.fingerprint ?? input.fixture.fingerprint,
        issuer: input.fixture.issuer,
        jwtId: input.jwtId,
        scopes: ['agent:read'],
      }),
      ...input.overrides,
    },
    privateKey: input.fixture.privateKey,
  });
  return { Authorization: `Bearer ${token}` };
}

async function readErrorCode(response: Response): Promise<string> {
  const parsed: unknown = JSON.parse(await response.text());
  expect(parsed).toEqual(expect.objectContaining({ code: expect.any(String) }));
  return (parsed as { readonly code: string }).code;
}

describe('Agent health RPC', () => {
  it('[AGENT-PLATFORM-S008] [AGENT-HEALTH-S001] Check が Protobuf RPC 経由で安全な serving 状態を返す', async () => {
    const fixture = await createEd25519TrustFixture({ allowedAgentIds: ['agent-health'] });
    const { env, routedNames } = createTestEnv(undefined, fixture.trustConfigJson);
    const requestBytes = toBinary(
      CheckHealthRequestSchema,
      create(CheckHealthRequestSchema, { agentId: 'agent-health', includeDependencies: true })
    );
    const headers = await createHealthBearerHeaders({ fixture, jwtId: 'health-jwt-1' });

    const response = await handleAgentConnectRequest(
      createHealthRequest(healthRpcPath, requestBytes, headers),
      env
    );

    expect(response.status).toBe(200);
    const responseBody = fromBinary(
      CheckHealthResponseSchema,
      new Uint8Array(await response.arrayBuffer())
    );
    expect(responseBody).toMatchObject({
      agentId: 'agent-health',
      contractPackage: 'cftamac.agent.v1',
      dependencyStatusRef: 'storage:sqlite;queue:agent_local',
      serviceVersion: '0.1.0',
      status: 'serving',
    });
    expect(responseBody.checkedAtUnixMs > 0n).toBe(true);
    expect(responseBody.health).toMatchObject({
      agentId: 'agent-health',
      contractPackage: 'cftamac.agent.v1',
      dependencyStatusRef: 'storage:sqlite;queue:agent_local',
      serviceVersion: '0.1.0',
      servingStatus: 'serving',
    });
    expect(routedNames).toEqual(['agent-health', 'agent-health']);
    expect(responseBody.trustConfig).toMatchObject({
      issuerCount: 1,
      keyCount: 1,
      status: 'serving',
    });
    expect(responseBody.currentPrincipalTrust).toMatchObject({
      fingerprint: fixture.fingerprint,
      issuer: fixture.issuer,
      kid: fixture.kid,
      verified: true,
    });
    expect(stringifyHealthResponse(responseBody)).not.toMatch(
      /credential|secret|token|thread|memory|payload/i
    );
  });

  it('[AGENT-HEALTH-S002] 公開 REST health endpoint は Agent 公開 API ではない', async () => {
    const fixture = await createEd25519TrustFixture({ allowedAgentIds: ['agent-health'] });
    const { env } = createTestEnv(undefined, fixture.trustConfigJson);
    const headers = await createHealthBearerHeaders({ fixture, jwtId: 'health-jwt-rest' });
    const requestBytes = toBinary(
      CheckHealthRequestSchema,
      create(CheckHealthRequestSchema, { agentId: 'agent-health' })
    );

    const restHealth = await handleAgentConnectRequest(
      createHealthRequest('/health', requestBytes, headers),
      env
    );
    expect(await readErrorCode(restHealth)).toBe('unimplemented');

    const connectJson = await handleAgentConnectRequest(
      new Request(`${baseUrl}${healthRpcPath}`, {
        body: '{}',
        headers: { 'Content-Type': 'application/connect+json' },
        method: 'POST',
      }),
      env
    );
    expect(await readErrorCode(connectJson)).toBe('unimplemented');

    const getHealth = await handleAgentConnectRequest(
      new Request(`${baseUrl}${healthRpcPath}`, {
        headers: { 'Content-Type': 'application/proto' },
        method: 'GET',
      }),
      env
    );
    expect(await readErrorCode(getHealth)).toBe('unimplemented');
  });

  it('[AGENT-HEALTH-S003] Check が issuer kid fingerprint の trust 状態を診断する', async () => {
    const fixture = await createEd25519TrustFixture({ allowedAgentIds: ['agent-health'] });
    const { env } = createTestEnv(undefined, fixture.trustConfigJson);
    const requestBytes = toBinary(
      CheckHealthRequestSchema,
      create(CheckHealthRequestSchema, { agentId: 'agent-health' })
    );
    const response = await handleAgentConnectRequest(
      createHealthRequest(
        healthRpcPath,
        requestBytes,
        await createHealthBearerHeaders({ fixture, jwtId: 'health-jwt-diagnostic' })
      ),
      env
    );

    expect(response.status).toBe(200);
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
    expect(stringifyHealthResponse(responseBody)).not.toMatch(
      /private|publicjwk|bearer|signature/i
    );
  });

  it('[AGENT-HEALTH-S005] 認証失敗は Check 応答ではなく安全な Connect error として診断される', async () => {
    const fixture = await createEd25519TrustFixture({ allowedAgentIds: ['agent-health'] });
    const revokedFixture = await createEd25519TrustFixture({
      allowedAgentIds: ['agent-health'],
      status: 'revoked',
    });
    const { env, routedNames } = createTestEnv(undefined, fixture.trustConfigJson);
    const body = toBinary(
      CheckHealthRequestSchema,
      create(CheckHealthRequestSchema, { agentId: 'agent-health' })
    );
    const cases: readonly {
      readonly code: string;
      readonly env?: AgentWorkerEnv;
      readonly headers: HeadersInit;
    }[] = [
      {
        headers: await createHealthBearerHeaders({ fixture, overrides: { iss: 'unknown' } }),
        code: 'unauthenticated',
      },
      {
        headers: await createHealthBearerHeaders({ fixture, kid: 'unknown-kid' }),
        code: 'unauthenticated',
      },
      {
        headers: await createHealthBearerHeaders({ fixture: revokedFixture }),
        code: 'unauthenticated',
        env: createTestEnv(undefined, revokedFixture.trustConfigJson).env,
      },
      {
        headers: await createHealthBearerHeaders({ fingerprint: 'sha256:mismatch', fixture }),
        code: 'unauthenticated',
      },
    ] as const;

    for (const testCase of cases) {
      const response = await handleAgentConnectRequest(
        createHealthRequest(healthRpcPath, body, testCase.headers),
        testCase.env ?? env
      );
      expect(await readErrorCode(response)).toBe(testCase.code);
    }

    const replayFixture = await createEd25519TrustFixture({ allowedAgentIds: ['agent-health'] });
    const replay = createTestEnv(undefined, replayFixture.trustConfigJson);
    const replayHeaders = await createHealthBearerHeaders({
      fixture: replayFixture,
      jwtId: 'health-replay',
    });
    const first = await handleAgentConnectRequest(
      createHealthRequest(healthRpcPath, body, replayHeaders),
      replay.env
    );
    const second = await handleAgentConnectRequest(
      createHealthRequest(healthRpcPath, body, replayHeaders),
      replay.env
    );
    expect(first.status).toBe(200);
    expect(await readErrorCode(second)).toBe('permission_denied');
    expect(routedNames).toEqual([]);
  });

  it('[AGENT-PLATFORM-S008] Health RPC rejects missing Agent scope after auth guard success', async () => {
    const { env } = createTestEnv();

    const missingAgentId = await handleAgentConnectRequest(
      createHealthRequest(
        healthRpcPath,
        toBinary(CheckHealthRequestSchema, create(CheckHealthRequestSchema, { agentId: '' }))
      ),
      env,
      { allowTestSeam: true }
    );
    expect(await readErrorCode(missingAgentId)).toBe('invalid_argument');
  });

  it('[AGENT-HEALTH-S004] Health Check reports model execution readiness with safe metadata', async () => {
    const { env } = createTestEnv({
      bindingPresent: true,
      checkedAtMs: 1_700_000_000_000,
      defaultPolicyDigest: 'a'.repeat(64),
      defaultPolicyRef: 'workers-ai-default',
      modelId: '@cf/meta/llama-3.1-8b-instruct',
      provider: 'workers-ai',
      status: 'serving',
    });
    const requestBytes = toBinary(
      CheckHealthRequestSchema,
      create(CheckHealthRequestSchema, { agentId: 'agent-health' })
    );

    const response = await handleAgentConnectRequest(
      createHealthRequest(healthRpcPath, requestBytes),
      env,
      { allowTestSeam: true }
    );

    expect(response.status).toBe(200);
    const responseBody = fromBinary(
      CheckHealthResponseSchema,
      new Uint8Array(await response.arrayBuffer())
    );
    expect(responseBody.modelExecution).toMatchObject({
      bindingPresent: true,
      checkedAtUnixMs: 1_700_000_000_000n,
      defaultPolicyDigest: 'a'.repeat(64),
      defaultPolicyRef: 'workers-ai-default',
      modelId: '@cf/meta/llama-3.1-8b-instruct',
      provider: 'workers-ai',
      status: 'serving',
    });
    expect(responseBody.health?.modelExecution).toMatchObject(responseBody.modelExecution ?? {});
    expect(stringifyHealthResponse(responseBody)).not.toMatch(
      /credential|secret|bearer|raw prompt|raw completion|thread payload|memory body/i
    );
  });
});

function stringifyHealthResponse(response: unknown): string {
  return JSON.stringify(response, (_key, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value
  );
}
