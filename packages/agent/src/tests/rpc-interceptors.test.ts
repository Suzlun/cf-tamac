import { create, toBinary } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import { describe, expect, it } from 'vitest';

import {
  CheckHealthRequestSchema,
  PublishIntegrationEventRequestSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { decideAgentFinalAuthorization } from '../domain/final-authorization';
import { createIntegrationSignatureBase } from '../domain/security';
import {
  integrationIngressTimestampWindowMs,
  verifyIntegrationIngressSignature,
} from '../integrations/security';
import { handleAgentConnectRequest } from '../rpc/connect-worker-adapter';
import { createUnsignedIngressBodyDigest } from '../rpc/dispatch/integration-ingress-signature';
import { createAgentRpcAuditContext } from '../rpc/interceptors/audit';
import { authenticateAgentRequest } from '../rpc/interceptors/authentication';
import {
  authorizeAgentRequest,
  getRequiredAgentRpcScopes,
  isProviderIngressOperation,
} from '../rpc/interceptors/authorization';
import { createReplayProtectionContext } from '../rpc/interceptors/replay-protection';
import { createAgentRpcRouter } from '../rpc/router';

import { createEd25519TrustFixture } from './ed25519-jwt-test-helpers';
import { testControlPlaneTrustConfig } from './test-control-plane-trust';

import type { AIAgent } from '../AIAgent';
import type { AgentWorkerEnv } from '../env';
import type { AgentStorageRepositories } from '../storage';

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
      AGENT_AUDIT_HASH_PEPPER: 'test-audit-hash-pepper',
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

    const authentication = await authenticateAgentRequest(request, { allowTestSeam: true });
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
    const auditContext = await createAgentRpcAuditContext(
      request,
      authentication.principal,
      createReplayProtectionContext(request),
      { algorithm: 'sha-256', byteLength: 3, digestHex: 'abc123' },
      'test-audit-hash-pepper'
    );
    expect(auditContext.audit).toMatchObject({
      method: 'Check',
      path: healthPath,
      replay: { idempotencyKey: 'idem-1', nonce: 'nonce-1' },
      requestId: 'request-1',
      service: 'cftamac.agent.v1.AgentHealthService',
    });
    const alternatePepperContext = await createAgentRpcAuditContext(
      request,
      authentication.principal,
      createReplayProtectionContext(request),
      { algorithm: 'sha-256', byteLength: 3, digestHex: 'abc123' },
      'different-test-audit-hash-pepper'
    );
    expect(auditContext.audit.auth.actingUserIdHash).toBeDefined();
    expect(auditContext.audit.auth.actingUserIdHash).not.toBe(
      alternatePepperContext.audit.auth.actingUserIdHash
    );
    expect(JSON.stringify(auditContext)).not.toContain('Bearer');
    expect(JSON.stringify(auditContext.audit)).not.toContain('user-1');
    expect(JSON.stringify(auditContext.audit)).not.toContain('client-1');
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
      const response = await handleAgentConnectRequest(createHealthRequest(testCase.headers), env, {
        allowTestSeam: true,
      });
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

  it('[TAMAC-SDK-S002] Client Service SDK と Provider integration surface が専用の認証文脈を使用する', async () => {
    // Provider の unsigned Protobuf bytes を digest 化し、canonical field order へ bind する Ed25519 signature を作ります。
    const fixture = await createEd25519TrustFixture({ kid: 'provider-key-1' });
    const nowUnixMs = Date.now();
    const rawBodyDigest = await createUnsignedIngressBodyDigest(
      create(PublishIntegrationEventRequestSchema, {
        agentId: 'agent-interceptor',
        connectionId: 'connection-1',
        idempotencyKey: 'provider-idempotency-1',
        installationId: 'installation-1',
        threadKey: 'provider-thread-1',
      }),
      'PublishEvent'
    );
    const canonical = {
      agentId: 'agent-interceptor',
      connectionId: 'connection-1',
      idempotencyKey: 'provider-idempotency-1',
      installationId: 'installation-1',
      method: 'PublishEvent',
      nonce: 'provider-nonce-1',
      rawBodyDigest,
      service: 'cftamac.agent.v1.IntegrationIngressService',
      timestampUnixMs: nowUnixMs,
    } as const;
    const signature = new Uint8Array(
      await crypto.subtle.sign(
        { name: 'Ed25519' },
        fixture.privateKey,
        new TextEncoder().encode(createIntegrationSignatureBase(canonical))
      )
    );
    // Agent-owned integration repository の最小 seam は active Installation と同じ key_id の public key だけを返します。
    const repositories = {
      integrations: {
        findActiveTrustKey: () => ({ publicKeyMaterial: JSON.stringify(fixture.publicJwk) }),
        findInstallation: () => ({ status: 'active' }),
      },
    } as unknown as AgentStorageRepositories;
    const verifiedPrincipal = await verifyIntegrationIngressSignature({
      agentId: canonical.agentId,
      canonicalBodyDigest: rawBodyDigest,
      connectionId: canonical.connectionId,
      idempotencyKey: canonical.idempotencyKey,
      installationId: canonical.installationId,
      method: canonical.method,
      repositories,
      signature: {
        algorithm: 'Ed25519',
        byteLength: rawBodyDigest.byteLength,
        digestHex: rawBodyDigest.digestHex,
        keyId: fixture.kid,
        nonce: canonical.nonce,
        signature,
        signedAtMs: nowUnixMs,
        timestampMs: nowUnixMs,
      },
    });

    // 署名検証後にだけ contract 固定の canonical principal が作られ、Client Service JWT claim は混入しません。
    expect(verifiedPrincipal).toMatchObject({
      agentId: canonical.agentId,
      connectionId: canonical.connectionId,
      installationId: canonical.installationId,
      keyId: fixture.kid,
      principalId: canonical.installationId,
      principalType: 'INTEGRATION_INSTALLATION',
      scopes: [],
    });
    // Agent-owned final authorization は Adapter Connection scoped ingress grant を要求し、verified principal と同じ Installation/Connection に bind します。
    const authorization = decideAgentFinalAuthorization({
      agentId: canonical.agentId,
      capability: {
        adapterConnectionId: canonical.connectionId,
        capabilityKind: 'integration',
        installationId: canonical.installationId,
        ownerAgentId: canonical.agentId,
      },
      credentialState: 'active',
      lifecycleState: 'active',
      operation: {
        action: 'integration.ingress.event',
        method: canonical.method,
        service: canonical.service,
      },
      principal: {
        ...verifiedPrincipal,
        grantDetails: [
          {
            capability: 'integration.ingress.event',
            scopeRef: `adapter_connection:${canonical.connectionId}`,
          },
        ],
        grants: ['integration.ingress.event'],
      },
      requiredGrants: ['integration.ingress.event'],
      requiredPrincipalTypes: ['INTEGRATION_INSTALLATION'],
      requiredScopes: ['agent.rpc', 'agent.integration'],
    });
    expect(authorization).toMatchObject({
      matchedGrants: ['integration.ingress.event'],
      status: 'allow',
    });

    // 存在しない Installation は active key 不在と同じ署名拒否へ畳み込み、未署名 caller が Agent-owned state を列挙できないことを検証します。
    const missingInstallationRepositories = {
      integrations: {
        findActiveTrustKey: () => undefined,
        findInstallation: () => undefined,
      },
    } as unknown as AgentStorageRepositories;
    await expect(
      verifyIntegrationIngressSignature({
        agentId: canonical.agentId,
        canonicalBodyDigest: rawBodyDigest,
        connectionId: canonical.connectionId,
        idempotencyKey: canonical.idempotencyKey,
        installationId: canonical.installationId,
        method: canonical.method,
        repositories: missingInstallationRepositories,
        signature: {
          algorithm: 'Ed25519',
          byteLength: rawBodyDigest.byteLength,
          digestHex: rawBodyDigest.digestHex,
          keyId: fixture.kid,
          nonce: canonical.nonce,
          signature,
          signedAtMs: nowUnixMs,
          timestampMs: nowUnixMs,
        },
      })
    ).rejects.toThrow('Integration ingress signature rejected.');

    // fixed 300_000 ms window を 1 ms 超える timestamp は、正しい Ed25519 key/signature でも検証前に拒否されます。
    const staleTimestampMs = nowUnixMs - integrationIngressTimestampWindowMs - 1;
    const staleCanonical = { ...canonical, timestampUnixMs: staleTimestampMs };
    const staleSignature = new Uint8Array(
      await crypto.subtle.sign(
        { name: 'Ed25519' },
        fixture.privateKey,
        new TextEncoder().encode(createIntegrationSignatureBase(staleCanonical))
      )
    );
    await expect(
      verifyIntegrationIngressSignature({
        agentId: staleCanonical.agentId,
        canonicalBodyDigest: rawBodyDigest,
        connectionId: staleCanonical.connectionId,
        idempotencyKey: staleCanonical.idempotencyKey,
        installationId: staleCanonical.installationId,
        method: staleCanonical.method,
        repositories,
        signature: {
          algorithm: 'Ed25519',
          byteLength: rawBodyDigest.byteLength,
          digestHex: rawBodyDigest.digestHex,
          keyId: fixture.kid,
          nonce: staleCanonical.nonce,
          signature: staleSignature,
          signedAtMs: staleTimestampMs,
          timestampMs: staleTimestampMs,
        },
      })
    ).rejects.toThrow('Integration ingress signature rejected.');
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
      env,
      { allowTestSeam: true }
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
