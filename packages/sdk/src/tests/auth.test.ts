import { Buffer } from 'node:buffer';

import { describe, expect, it, vi } from 'vitest';

import {
  buildClientServiceRequestMetadata,
  createClientServiceJwt,
} from '../auth/client-service-jwt';

import type { ClientServiceSigningContext, ResolvedAgentRpcCredential } from '../auth/types';
import type { TamacAgentRpcMethodContext, TamacSdkInvocationContext } from '../invocation-context';

describe('Client Service JWT metadata', () => {
  it('[TAMAC-SDK-S003] SDK が acting user 付き Client Service JWT を付与する', async () => {
    // consumer が server-side で解決した signing context と mutating invocation を作ります。
    const signingContext = await createSigningContext();
    const invocation = createInvocation();
    const methodContext: TamacAgentRpcMethodContext = {
      methodName: 'InitializeAgent',
      serviceName: 'cftamac.agent.v1.AgentLifecycleService',
    };

    // SDK が JWT と Agent RPC metadata を同じ context から組み立てます。
    const metadata = await buildClientServiceRequestMetadata({
      invocation,
      methodContext,
      signingContext,
    });
    const authorization = metadata.Authorization;
    if (authorization === undefined) {
      throw new TypeError('Authorization metadata was not built.');
    }
    const payload = decodeJwtPayload(authorization.slice('Bearer '.length));

    // EdDSA header/payload が Agent、scope、acting user、request correlation、method identity を持つことを検査します。
    expect(payload).toMatchObject({
      acting_user_id: invocation.actingUser.actingUserId,
      agent_id: invocation.agentId,
      aud: signingContext.audience,
      correlation_id: invocation.correlationId,
      fingerprint: signingContext.credential.publicFingerprint,
      idempotency_key: invocation.idempotency?.idempotencyKey,
      iss: signingContext.credential.issuer,
      request_id: invocation.requestId,
      rpc_method: methodContext.methodName,
      rpc_service: methodContext.serviceName,
      scopes: invocation.scopes,
      sub: signingContext.credential.keyId,
    });
    expect(metadata['x-request-id']).toBe(invocation.requestId);
    expect(metadata['x-agent-idempotency-key']).toBe(invocation.idempotency?.idempotencyKey);
    expect(metadata['x-agent-correlation-id']).toBe(invocation.correlationId);
    expect(metadata['x-agent-rpc-service']).toBe(methodContext.serviceName);
    expect(metadata['x-agent-rpc-method']).toBe(methodContext.methodName);
  });

  it('[TAMAC-SDK-S004] SDK consumer が自身の server-side storage から signing context を供給する', async () => {
    // consumer-owned storage callback を模した fixture から signing context と public credential view を取得します。
    const onJwtSigned = vi.fn(() => Promise.resolve());
    const signingContext = await createSigningContext({ onJwtSigned });
    const invocation = createInvocation();
    const methodContext: TamacAgentRpcMethodContext = {
      methodName: 'Check',
      serviceName: 'cftamac.agent.v1.AgentHealthService',
    };

    // SDK は caller-supplied private key で署名し、storage usage callback を成功時だけ実行します。
    const jwt = await createClientServiceJwt({ invocation, methodContext, signingContext });

    // public credential view は identity fields だけを持ち、private key は signing context に閉じることを検査します。
    expect(jwt).toMatch(/^(?:[\w-]+\.){2}[\w-]+$/);
    expect(onJwtSigned).toHaveBeenCalledTimes(1);
    expect(Object.keys(signingContext.credential).sort()).toEqual([
      'agentId',
      'issuer',
      'keyId',
      'publicFingerprint',
    ]);
    expect(signingContext.credential).toMatchObject({
      agentId: invocation.agentId,
      issuer: 'cf-tamac-client',
      keyId: 'key-001',
    });
    expect(signingContext.credential).not.toHaveProperty('privateKey');
  });
});

function createInvocation(): TamacSdkInvocationContext {
  // command fixture は idempotency context を持ち、JWT claim と request metadata の両方を検証できます。
  return {
    actingUser: { actingUserId: 'operator-001', displayName: 'Operator One' },
    agentId: 'agent-alpha',
    correlationId: 'correlation-001',
    idempotency: { idempotencyKey: 'idempotency-001' },
    requestId: 'request-001',
    scopes: ['agent:write'],
  };
}

async function createSigningContext(
  overrides: Partial<ClientServiceSigningContext> = {}
): Promise<ClientServiceSigningContext> {
  // test-local Web Crypto key pair を生成し、consumer-provided non-extractable private key を再現します。
  const generatedKey = await globalThis.crypto.subtle.generateKey('Ed25519', false, [
    'sign',
    'verify',
  ]);
  if (!('privateKey' in generatedKey)) {
    throw new TypeError('Ed25519 signing key pair was not generated.');
  }
  const credential: ResolvedAgentRpcCredential = {
    agentId: 'agent-alpha',
    issuer: 'cf-tamac-client',
    keyId: 'key-001',
    publicFingerprint: 'sha256:public-key-001',
  };
  // storage view と private key を分離した signing context を返し、SDK の storage non-ownership を検証します。
  return {
    audience: 'https://agent.example.test',
    credential,
    privateKey: generatedKey.privateKey,
    ...overrides,
  };
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  // compact JWT の payload segment を検査専用に decode し、signature/private key を読み取りません。
  const payloadSegment = token.split('.')[1];
  if (payloadSegment === undefined) {
    throw new TypeError('JWT payload segment is missing.');
  }
  // base64url JSON を object として返し、claims の public shape を assert します。
  return JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
}
