import { Buffer } from 'node:buffer';

import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { describe, expect, it, vi } from 'vitest';

import { createTamacAgentClient } from '../client';
import {
  CheckHealthResponseSchema,
  GetAgentResponseSchema,
  InitializeAgentRequestSchema,
  InitializeAgentResponseSchema,
} from '../generated/agent-rpc/cftamac/agent/v1_pb';

import type { ClientServiceSigningContext } from '../auth/types';
import type { TamacSdkInvocationContext } from '../invocation-context';

describe('TAMAC Agent SDK client aggregate', () => {
  it('[TAMAC-SDK-S001] Server-side consumer が SDK で Agent health を確認する', async () => {
    // server-side signing key と invocation context を作り、browser input を経由しないことを固定します。
    const signingContext = await createSigningContext();
    const invocation = createInvocation();
    const captured: CapturedRequest[] = [];
    // binary Connect response を返す test fetch を SDK transport へ渡します。
    const client = createTamacAgentClient({
      agentRpcOrigin: 'https://agent.example.test',
      fetch: createHealthFetch(captured),
      invocation,
      signingContext,
    });

    // Web Crypto signer が受ける compact JWS signing input を capture し、protected header を wire 前に検査します。
    const sign = vi.spyOn(globalThis.crypto.subtle, 'sign');
    const response = await (async () => {
      try {
        // generated health method を typed request で呼び、SDK aggregate の result を受け取ります。
        const result = await client.health.check({
          agentId: invocation.agentId,
          includeDependencies: true,
        });
        const signerCall = sign.mock.calls[0];
        if (signerCall === undefined) {
          throw new TypeError('Client Service JWT signer was not called.');
        }
        // signer callback の input に含まれる protected header を decode し、EdDSA JWT contract を直接検査します。
        expect(
          decodeJwtProtectedHeaderFromSigningInput(signerCall[2] as ArrayBuffer)
        ).toMatchObject({
          alg: 'EdDSA',
          typ: 'JWT',
        });
        return result;
      } finally {
        // global Web Crypto spy を必ず復元し、後続 SDK test の signing behavior を汚染しません。
        sign.mockRestore();
      }
    })();

    // Protobuf decoder が返した typed health response の public fields を確認します。
    expect(response.agentId).toBe(invocation.agentId);
    expect(response.status).toBe('serving');
    expect(response.serviceVersion).toBe('2026.07.10');
    // binary-only Connect transport が POST/application-proto request を作ったことを検査します。
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      contentType: 'application/proto',
      method: 'POST',
      pathname: '/cftamac.agent.v1.AgentHealthService/Check',
    });
    // Client Service authentication と Agent audit/replay metadata が同じ invocation から作られたことを検査します。
    const request = captured[0];
    if (request === undefined) {
      throw new TypeError('SDK health request was not captured.');
    }
    expect(request.authorization).toMatch(/^Bearer (?:[\w-]+\.){2}[\w-]+$/);
    expect(request.requestId).toBe(invocation.requestId);
    expect(request.correlationId).toBe(invocation.correlationId);
    expect(request.idempotencyKey).toBe(invocation.idempotency?.idempotencyKey);
    expect(request.serviceName).toBe('cftamac.agent.v1.AgentHealthService');
    expect(request.methodName).toBe('Check');
  });

  it('[TAMAC-SDK-S002] Client Service aggregate が認可 operation inventory を共有する', async () => {
    // one server-side execution context と signing identity を全 service client に共有させます。
    const signingContext = await createSigningContext();
    const invocation = createInvocation();
    const captured: CapturedRequest[] = [];
    const injectionInputs: {
      readonly agentId: string;
      readonly correlationId: string;
      readonly scope: string;
      readonly actingUserId: string;
    }[] = [];
    const client = createTamacAgentClient({
      agentRpcOrigin: 'https://agent.example.test',
      fetch: createHealthFetch(captured),
      invocation,
      requestContextInjector: (input) => {
        // custom seam には SDK が解決した shared invocation だけが渡ることを記録します。
        injectionInputs.push({
          actingUserId: input.invocation.actingUser.actingUserId,
          agentId: input.invocation.agentId,
          correlationId: input.invocation.correlationId,
          scope: input.invocation.scopes[0] ?? '',
        });
        return Promise.resolve({
          traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
        });
      },
      signingContext,
    });

    // Client Service が認可された matrix の 10 property だけを同じ transport 上で公開することを確認します。
    expect(Object.keys(client).sort()).toEqual([
      'events',
      'health',
      'integrations',
      'lifecycle',
      'modelPolicies',
      'runs',
      'schedules',
      'state',
      'threads',
      'tools',
    ]);
    // one representative typed RPC call で shared context を transport metadata と custom seam の両方へ流します。
    await client.health.check({ agentId: invocation.agentId, includeDependencies: false });

    // all aggregate services が共有する context が origin、Agent ID、scope、acting user、correlation を保持します。
    expect(injectionInputs).toEqual([
      {
        actingUserId: invocation.actingUser.actingUserId,
        agentId: invocation.agentId,
        correlationId: invocation.correlationId,
        scope: invocation.scopes[0],
      },
    ]);
    const request = captured[0];
    if (request === undefined) {
      throw new TypeError('SDK aggregate request was not captured.');
    }
    expect(request.traceparent).toBe('00-0123456789abcdef0123456789abcdef-0123456789abcdef-01');
    expect(request.authorization).toContain('Bearer ');
  });

  it('[AGENT-LIFECYCLE-S001] generated lifecycle client は必須 registration digest をbinary requestへ送信する', async () => {
    const signingContext = await createSigningContext();
    const invocation = createInvocation();
    const captured: CapturedRequest[] = [];
    const client = createTamacAgentClient({
      agentRpcOrigin: 'https://agent.example.test',
      fetch: createLifecycleFetch(captured),
      invocation,
      signingContext,
    });

    const response = await client.lifecycle.initializeAgent({
      agentId: invocation.agentId,
      idempotencyKey: 'registration-attempt-001',
      registrationRequestDigest: 'sha256:registration-request-001',
    });

    expect(response.initializationReceipt).toMatchObject({
      idempotencyKey: 'registration-attempt-001',
      registrationRequestDigest: 'sha256:registration-request-001',
    });
    const request = captured.find((entry) => entry.methodName === 'InitializeAgent');
    if (request?.body === undefined) {
      throw new TypeError('InitializeAgent binary request was not captured.');
    }
    const wireRequest = fromBinary(InitializeAgentRequestSchema, request.body);
    expect(wireRequest.registrationRequestDigest).toBe('sha256:registration-request-001');
    expect(request).toMatchObject({
      contentType: 'application/proto',
      method: 'POST',
      pathname: '/cftamac.agent.v1.AgentLifecycleService/InitializeAgent',
    });
  });

  it('[AGENT-LIFECYCLE-S002] generated lifecycle client はInitialize/Get responseのtyped receiptを保持する', async () => {
    const signingContext = await createSigningContext();
    const invocation = createInvocation();
    const captured: CapturedRequest[] = [];
    const client = createTamacAgentClient({
      agentRpcOrigin: 'https://agent.example.test',
      fetch: createLifecycleFetch(captured),
      invocation,
      signingContext,
    });

    const initialized = await client.lifecycle.initializeAgent({
      agentId: invocation.agentId,
      idempotencyKey: 'registration-attempt-002',
      registrationRequestDigest: 'sha256:registration-request-002',
    });
    const observed = await client.lifecycle.getAgent({ agentId: invocation.agentId });

    expect(initialized.initializationReceipt?.idempotencyKey).toBe('registration-attempt-002');
    expect(observed.initializationReceipt).toMatchObject(initialized.initializationReceipt ?? {});
    expect(
      captured.filter((entry) => entry.serviceName === 'cftamac.agent.v1.AgentLifecycleService')
    ).toHaveLength(2);
  });

  it('[TAMAC-SDK-S001] binary Connect protocol を上書きする injection を fetch 前に拒否する', async () => {
    // binary transport を壊す Content-Type 上書きを返す custom seam と、呼ばれてはならない fetch を作ります。
    const fetch = vi.fn<typeof globalThis.fetch>();
    const client = createTamacAgentClient({
      agentRpcOrigin: 'https://agent.example.test',
      fetch,
      invocation: createInvocation(),
      requestContextInjector: () => Promise.resolve({ 'Content-Type': 'application/json' }),
      signingContext: await createSigningContext(),
    });

    // SDK が network side effect 前に allowlist 違反を安全な normalized error に変換し、binary Protobuf profile を維持することを検査します。
    await expect(
      client.health.check({ agentId: 'agent-alpha', includeDependencies: false })
    ).rejects.toMatchObject({
      category: 'internal',
      safeDetail: 'The Agent Service could not complete the operation safely.',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('[TAMAC-SDK-S001] bearer token を作る前に HTTP Agent origin を拒否する', async () => {
    // TLS を持たない origin で aggregate 構築を試み、JWT を平文経路へ送らない transport policy を検査します。
    const signingContext = await createSigningContext();

    // HTTPS-only validation が client construction 中に fail closed することを確認します。
    expect(() =>
      createTamacAgentClient({
        agentRpcOrigin: 'http://agent.example.test',
        invocation: createInvocation(),
        signingContext,
      })
    ).toThrow('Agent RPC origin must use HTTPS.');
  });
});

interface CapturedRequest {
  readonly authorization: string | null;
  readonly body?: Uint8Array;
  readonly contentType: string | null;
  readonly correlationId: string | null;
  readonly idempotencyKey: string | null;
  readonly method: string;
  readonly methodName: string | null;
  readonly pathname: string;
  readonly requestId: string | null;
  readonly serviceName: string | null;
  readonly traceparent: string | null;
}

function createInvocation(): TamacSdkInvocationContext {
  // generated request body、JWT、metadata が同じ Agent/request context を使う fixture を返します。
  return {
    actingUser: { actingUserId: 'operator-001' },
    agentId: 'agent-alpha',
    correlationId: 'correlation-001',
    idempotency: { idempotencyKey: 'idempotency-001' },
    requestId: 'request-001',
    scopes: ['agent:read'],
  };
}

async function createSigningContext(): Promise<ClientServiceSigningContext> {
  // Web Crypto Ed25519 key pair を test process 内だけで生成し、private key を返却 payload に含めません。
  const generatedKey = await globalThis.crypto.subtle.generateKey('Ed25519', false, [
    'sign',
    'verify',
  ]);
  if (!('privateKey' in generatedKey)) {
    throw new TypeError('Ed25519 signing key pair was not generated.');
  }
  // consumer-owned storage が供給する signing context と同じ public/private split を fixture 化します。
  return {
    audience: 'https://agent.example.test',
    credential: {
      agentId: 'agent-alpha',
      issuer: 'cf-tamac-client',
      keyId: 'key-001',
      publicFingerprint: 'sha256:public-key-001',
    },
    privateKey: generatedKey.privateKey,
  };
}

function createHealthFetch(captured: CapturedRequest[]): typeof globalThis.fetch {
  return (input, init) => {
    // Connect runtime が渡した Request を materialize し、network transport の wire attributes を記録します。
    const request = input instanceof Request ? input : new Request(input, init);
    captured.push({
      authorization: request.headers.get('Authorization'),
      contentType: request.headers.get('Content-Type'),
      correlationId: request.headers.get('x-agent-correlation-id'),
      idempotencyKey: request.headers.get('x-agent-idempotency-key'),
      method: request.method,
      methodName: request.headers.get('x-agent-rpc-method'),
      pathname: new URL(request.url).pathname,
      requestId: request.headers.get('x-request-id'),
      serviceName: request.headers.get('x-agent-rpc-service'),
      traceparent: request.headers.get('traceparent'),
    });
    // AgentHealthService.Check の generated response schema を binary Protobuf response として返します。
    const response = create(CheckHealthResponseSchema, {
      agentId: 'agent-alpha',
      checkedAtUnixMs: 1n,
      contractPackage: 'cftamac.agent.v1',
      serviceVersion: '2026.07.10',
      status: 'serving',
    });
    return Promise.resolve(
      new Response(toBinary(CheckHealthResponseSchema, response), {
        headers: { 'Content-Type': 'application/proto' },
        status: 200,
      })
    );
  };
}

function createLifecycleFetch(captured: CapturedRequest[]): typeof globalThis.fetch {
  return async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const body = new Uint8Array(await request.arrayBuffer());
    const pathname = new URL(request.url).pathname;
    captured.push({
      authorization: request.headers.get('Authorization'),
      body,
      contentType: request.headers.get('Content-Type'),
      correlationId: request.headers.get('x-agent-correlation-id'),
      idempotencyKey: request.headers.get('x-agent-idempotency-key'),
      method: request.method,
      methodName: request.headers.get('x-agent-rpc-method'),
      pathname,
      requestId: request.headers.get('x-request-id'),
      serviceName: request.headers.get('x-agent-rpc-service'),
      traceparent: request.headers.get('traceparent'),
    });

    const receipt = pathname.endsWith('/InitializeAgent')
      ? fromBinary(InitializeAgentRequestSchema, body)
      : undefined;
    const responseMessage = pathname.endsWith('/InitializeAgent')
      ? create(InitializeAgentResponseSchema, {
          initializationReceipt: {
            idempotencyKey: receipt?.idempotencyKey ?? 'registration-attempt-002',
            registrationRequestDigest:
              receipt?.registrationRequestDigest ?? 'sha256:registration-request-002',
          },
        })
      : create(GetAgentResponseSchema, {
          initializationReceipt: {
            idempotencyKey: 'registration-attempt-002',
            registrationRequestDigest: 'sha256:registration-request-002',
          },
        });
    const responseSchema = pathname.endsWith('/InitializeAgent')
      ? InitializeAgentResponseSchema
      : GetAgentResponseSchema;
    return new Response(toBinary(responseSchema, responseMessage), {
      headers: { 'Content-Type': 'application/proto' },
      status: 200,
    });
  };
}

function decodeJwtProtectedHeaderFromSigningInput(input: ArrayBuffer): Record<string, unknown> {
  // signer が受ける `base64url(header).base64url(payload)` bytes を UTF-8 compact JWS text へ戻します。
  const signingInput = new TextDecoder().decode(new Uint8Array(input));
  const protectedHeader = signingInput.split('.')[0];
  if (protectedHeader === undefined) {
    throw new TypeError('JWT protected header segment is missing from signer input.');
  }
  // base64url JSON を object として decode し、key material や signature segment を読み取りません。
  return JSON.parse(Buffer.from(protectedHeader, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
}
