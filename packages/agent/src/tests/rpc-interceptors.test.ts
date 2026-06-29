import { create, toBinary } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import { describe, expect, it } from 'vitest';

import { CheckHealthRequestSchema } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { handleAgentConnectRequest } from '../rpc/connect-worker-adapter';
import { createAgentRpcAuditContext } from '../rpc/interceptors/audit';
import { authenticateAgentRequest } from '../rpc/interceptors/authentication';
import {
  authorizeAgentRequest,
  getRequiredAgentRpcScopes,
  isProviderIngressOperation,
} from '../rpc/interceptors/authorization';
import { createReplayProtectionContext } from '../rpc/interceptors/replay-protection';
import { createAgentRpcRouter } from '../rpc/router';

import { testControlPlaneTrustConfig } from './test-control-plane-trust';

import type { AIAgent } from '../AIAgent';
import type { AgentWorkerEnv } from '../env';

const healthPath = '/cftamac.agent.v1.AgentHealthService/Check';
const baseUrl = 'https://agent.example.test';

function createTestEnv(
  input: {
    readonly throwHealthError?: ConnectError;
  } = {}
): { readonly env: AgentWorkerEnv; readonly healthCalls: readonly string[] } {
  const healthCalls: string[] = [];
  const durableObjectNamespace = {
    get: (id: DurableObjectId) =>
      ({
        checkHealth: () => {
          if (input.throwHealthError !== undefined) {
            throw input.throwHealthError;
          }
          const agentId = (id as { readonly name: string }).name;
          healthCalls.push(agentId);
          return {
            agentId,
            queue: 'agent_local',
            status: 'active',
            storage: 'sqlite',
          };
        },
      }) as unknown as DurableObjectStub<AIAgent>,
    idFromName: (name: string) => ({ name }) as unknown as DurableObjectId,
  } as unknown as DurableObjectNamespace<AIAgent>;

  return {
    env: {
      AGENT_BLOBS: {} as R2Bucket,
      AGENT_CONTROL_PLANE_TRUST: testControlPlaneTrustConfig,
      AGENT_INTEGRATION_SIGNATURE_KEYS: 'test-integration-key',
      AGENT_MODEL_PROVIDER_SECRET_REFS: 'test-model-secret',
      AGENT_RPC_AUDIENCE: 'test-audience',
      AI_AGENT: durableObjectNamespace,
    },
    healthCalls,
  };
}

function createHealthRequest(headers: HeadersInit): Request {
  const requestHeaders = new Headers(headers);
  requestHeaders.set('Content-Type', 'application/proto');
  return new Request(`${baseUrl}${healthPath}`, {
    body: toBinary(
      CheckHealthRequestSchema,
      create(CheckHealthRequestSchema, { agentId: 'agent-interceptor' })
    ),
    headers: requestHeaders,
    method: 'POST',
  });
}

async function readErrorCode(response: Response): Promise<string> {
  const parsed: unknown = JSON.parse(await response.text());
  expect(parsed).toEqual(expect.objectContaining({ code: expect.any(String) }));
  return (parsed as { readonly code: string }).code;
}

describe('Agent RPC interceptors', () => {
  it('[AGENT-PLATFORM-S008] extracts safe authentication, replay, and audit context', async () => {
    const request = createHealthRequest({
      'x-agent-idempotency-key': 'idem-1',
      'x-agent-nonce': 'nonce-1',
      'x-agent-test-acting-user-id': 'user-1',
      'x-agent-test-audience': 'agent-service',
      'x-agent-test-grant': 'allow',
      'x-agent-test-issuer': 'client-service',
      'x-agent-test-jwt-id': 'jwt-1',
      'x-agent-test-key-id': 'key-1',
      'x-agent-test-principal-id': 'principal-1',
      'x-agent-test-principal-type': 'CLIENT_SERVICE',
      'x-agent-test-scopes': 'agent:read',
      'x-agent-test-subject': 'client-1',
      'x-request-id': 'request-1',
    });

    const authentication = await authenticateAgentRequest(request);
    expect(authentication.rejection).toBeUndefined();
    expect(authentication.principal).toMatchObject({
      actingUserId: 'user-1',
      audience: 'agent-service',
      issuer: 'client-service',
      jwtId: 'jwt-1',
      keyId: 'key-1',
      principalId: 'principal-1',
      principalType: 'CLIENT_SERVICE',
      scopes: ['agent:read'],
      subject: 'client-1',
    });

    if (authentication.principal === undefined) {
      throw new Error('principal should be extracted for the test seam.');
    }
    const auditContext = createAgentRpcAuditContext(
      request,
      authentication.principal,
      createReplayProtectionContext(request),
      { algorithm: 'sha-256', byteLength: 3, digestHex: 'abc123' }
    );
    expect(auditContext).toMatchObject({
      method: 'Check',
      path: healthPath,
      replay: { idempotencyKey: 'idem-1', nonce: 'nonce-1' },
      requestId: 'request-1',
      service: 'cftamac.agent.v1.AgentHealthService',
    });
    expect(JSON.stringify(auditContext)).not.toContain('Bearer');
  });

  it('[AGENT-PLATFORM-S008] [AGENT-SECURITY-S009] rejects guard failures before AIAgent routing', async () => {
    const cases = [
      {
        code: 'unauthenticated',
        headers: {},
      },
      {
        code: 'permission_denied',
        headers: { 'x-agent-test-principal-id': 'principal-1' },
      },
      {
        code: 'invalid_argument',
        headers: {
          'x-agent-test-grant': 'allow',
          'x-agent-test-principal-id': 'principal-1',
          'x-agent-test-validation': 'reject',
        },
      },
      {
        code: 'invalid_argument',
        headers: {
          'x-agent-test-grant': 'allow',
          'x-agent-test-principal-id': 'principal-1',
          'x-agent-test-replay': 'reject',
        },
      },
      {
        code: 'resource_exhausted',
        headers: {
          'x-agent-test-grant': 'allow',
          'x-agent-test-principal-id': 'principal-1',
          'x-agent-test-rate-limit': 'exhausted',
        },
      },
    ] as const;

    for (const testCase of cases) {
      const { env, healthCalls } = createTestEnv();
      const response = await handleAgentConnectRequest(createHealthRequest(testCase.headers), env);
      expect(await readErrorCode(response)).toBe(testCase.code);
      expect(healthCalls).toEqual([]);
    }
  });

  it('[AGENT-SECURITY-S002] 本番 path は x-agent-test-* を credential として扱わない', async () => {
    const request = createHealthRequest({
      'x-agent-test-grant': 'allow',
      'x-agent-test-principal-id': 'principal-1',
      'x-agent-test-scopes': 'agent:read',
    });
    const directAuthentication = await authenticateAgentRequest(request, { allowTestSeam: false });
    expect(directAuthentication.rejection).toMatchObject({ code: Code.Unauthenticated });

    const { env, healthCalls } = createTestEnv();
    const bearerWithTestHeaders = createHealthRequest({
      Authorization: 'Bearer malformed-token',
      'x-agent-test-grant': 'allow',
      'x-agent-test-principal-id': 'principal-1',
      'x-agent-test-scopes': 'agent:read',
    });
    const response = await handleAgentConnectRequest(bearerWithTestHeaders, env);
    expect(await readErrorCode(response)).toBe('unauthenticated');
    expect(healthCalls).toEqual([]);
  });

  it('[AGENT-SECURITY-S013] 登録済み Agent RPC method は明示的な認可 policy を持つ', () => {
    const { env } = createTestEnv();
    const registeredOperations = createAgentRpcRouter(env).handlers.map((handler) =>
      parseConnectMethodIdentity(handler.requestPath)
    );

    const unmappedClientServiceOperations = registeredOperations.filter(
      (operation) =>
        !isProviderIngressOperation(operation) && getRequiredAgentRpcScopes(operation) === undefined
    );
    const providerIngressOperations = registeredOperations.filter(isProviderIngressOperation);

    expect(unmappedClientServiceOperations).toEqual([]);
    expect(
      providerIngressOperations
        .map((operation) => `${operation.service}/${operation.method}`)
        .sort()
    ).toEqual([
      'cftamac.agent.v1.IntegrationIngressService/PublishDeliveryResult',
      'cftamac.agent.v1.IntegrationIngressService/PublishEvent',
      'cftamac.agent.v1.IntegrationIngressService/PublishToolResult',
    ]);
  });

  it('[AGENT-SECURITY-S014] 認可は wildcard principal agent_id でも request agent_id 完全一致を要求する', () => {
    const body = toBinary(
      CheckHealthRequestSchema,
      create(CheckHealthRequestSchema, { agentId: 'agent-interceptor' })
    );
    const result = authorizeAgentRequest({
      principal: {
        agentId: '*',
        allowedAgentIds: ['*'],
        allowedScopes: ['agent:read'],
        authenticationMode: 'bearer',
        principalId: 'principal-1',
        principalType: 'CLIENT_SERVICE',
        scopes: ['agent:read'],
      },
      rawBody: body,
      request: new Request(`${baseUrl}${healthPath}`, {
        body,
        headers: { 'Content-Type': 'application/proto' },
        method: 'POST',
      }),
    });

    expect(result).toMatchObject({ code: Code.PermissionDenied, reason: 'agent_scope_mismatch' });
  });

  it('[AGENT-PLATFORM-S008] maps Connect errors without exposing Durable Object fallback routes', async () => {
    const { env } = createTestEnv({
      throwHealthError: new ConnectError('Agent health unavailable.', Code.Unavailable),
    });
    const response = await handleAgentConnectRequest(
      createHealthRequest({
        'x-agent-test-grant': 'allow',
        'x-agent-test-principal-id': 'principal-1',
      }),
      env
    );

    expect(await readErrorCode(response)).toBe('unavailable');
  });
});

function parseConnectMethodIdentity(path: string): {
  readonly method: string;
  readonly service: string;
} {
  const segments = path.split('/').filter((segment) => segment !== '');
  return { method: segments.at(1) ?? 'unknown', service: segments.at(0) ?? 'unknown' };
}
