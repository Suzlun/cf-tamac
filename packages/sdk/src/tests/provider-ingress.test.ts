import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { describe, expect, it, vi } from 'vitest';

import { TamacSdkOperationError } from '../errors';
import {
  AgentEventInputSchema,
  PublishDeliveryResultRequestSchema,
  PublishDeliveryResultResponseSchema,
  PublishIntegrationEventRequestSchema,
  PublishIntegrationEventResponseSchema,
  PublishToolResultRequestSchema,
  PublishToolResultResponseSchema,
} from '../generated/agent-rpc/cftamac/agent/v1_pb';
import { createTamacProviderIngressClient } from '../provider-ingress';
import { createTamacProviderIngressTransport } from '../provider-ingress-transport';

import type {
  PublishDeliveryResultRequest,
  PublishIntegrationEventRequest,
  PublishToolResultRequest,
} from '../generated/agent-rpc/cftamac/agent/v1_pb';
import type { ProviderIngressInvocationContext } from '../provider-ingress-types';

const providerServiceName = 'cftamac.agent.v1.IntegrationIngressService';

describe('TAMAC Provider ingress client', () => {
  it('[TAMAC-SDK-S002] Provider ingress surface が detached-signature context を使用する', async () => {
    // NFC trim、sentinel、fixed timestamp を含む Provider context と canonical input capture を作ります。
    const invocation = createInvocation();
    const signingInputs: Uint8Array[] = [];
    const captured: CapturedProviderRequest[] = [];
    const client = createTamacProviderIngressClient({
      agentRpcOrigin: 'https://agent.example.test',
      fetch: createProviderIngressFetch(captured),
      invocation,
      signing: {
        algorithm: 'Ed25519',
        keyId: 'provider-key-001',
        signDetached: (input) => {
          // Provider-owned callback が canonical UTF-8 bytes だけを受けることを記録して deterministic signature を返します。
          signingInputs.push(input);
          return Promise.resolve(new Uint8Array([signingInputs.length]));
        },
      },
    });
    const eventInput = {
      connectionId: ' connection-e\u0301 ',
      event: create(AgentEventInputSchema),
      threadKey: 'thread-001',
    };
    const toolResultInput = {
      invocationId: ' invocation-e\u0301 ',
      status: 'succeeded',
    };
    const deliveryResultInput = {
      deliveryContextId: ' delivery-e\u0301 ',
      deliveryId: 'delivery-001',
      status: 'succeeded',
    };

    // Provider-only aggregate の three-method inventory を実行し、Client Service operation が混在しないことを検査します。
    expect(Object.keys(client).sort()).toEqual([
      'publishDeliveryResult',
      'publishEvent',
      'publishToolResult',
    ]);
    await client.publishEvent(eventInput);
    await client.publishToolResult(toolResultInput);
    await client.publishDeliveryResult(deliveryResultInput);

    // signer は method ごとの canonical UTF-8 text を順序どおり受け、NFC trim と sentinel を保持します。
    const expectedCanonicalTexts = await Promise.all([
      createExpectedCanonicalText({
        body: toBinary(
          PublishIntegrationEventRequestSchema,
          create(PublishIntegrationEventRequestSchema, {
            ...eventInput,
            agentId: invocation.agentId,
            idempotencyKey: invocation.idempotencyKey,
            installationId: invocation.installationId,
          })
        ),
        connectionId: eventInput.connectionId,
        method: 'PublishEvent',
      }),
      createExpectedCanonicalText({
        body: toBinary(
          PublishToolResultRequestSchema,
          create(PublishToolResultRequestSchema, {
            ...toolResultInput,
            agentId: invocation.agentId,
            idempotencyKey: invocation.idempotencyKey,
            installationId: invocation.installationId,
          })
        ),
        invocationId: toolResultInput.invocationId,
        method: 'PublishToolResult',
      }),
      createExpectedCanonicalText({
        body: toBinary(
          PublishDeliveryResultRequestSchema,
          create(PublishDeliveryResultRequestSchema, {
            ...deliveryResultInput,
            agentId: invocation.agentId,
            idempotencyKey: invocation.idempotencyKey,
            installationId: invocation.installationId,
          })
        ),
        deliveryContextId: deliveryResultInput.deliveryContextId,
        method: 'PublishDeliveryResult',
      }),
    ]);
    expect(signingInputs.map((input) => new TextDecoder().decode(input))).toEqual(
      expectedCanonicalTexts
    );

    // signed generated bodies は unsigned digest/byte length、Ed25519 signature metadata、Provider correlation context を持ちます。
    expect(captured).toHaveLength(3);
    expect(captured.map((request) => request.path)).toEqual([
      '/cftamac.agent.v1.IntegrationIngressService/PublishEvent',
      '/cftamac.agent.v1.IntegrationIngressService/PublishToolResult',
      '/cftamac.agent.v1.IntegrationIngressService/PublishDeliveryResult',
    ]);
    for (const [index, request] of captured.entries()) {
      // binary Connect profile と Provider HTTP metadata allowlist が全 operation で一定であることを検査します。
      expect(request.method).toBe('POST');
      expect(request.contentType).toBe('application/proto');
      expect(request.requestId).toBe(invocation.requestId);
      expect(request.correlationId).toBe(invocation.correlationId);
      expect(request.agentHeaders).toEqual(['x-agent-correlation-id']);
      expect(request.authorization).toBeNull();
      // signature metadata は key/algorithm/service/method/signed time を canonical signer result と対応付けます。
      expect(request.body.signature).toMatchObject({
        algorithm: 'Ed25519',
        keyId: 'provider-key-001',
        method: ['PublishEvent', 'PublishToolResult', 'PublishDeliveryResult'][index],
        service: providerServiceName,
        signature: new Uint8Array([index + 1]),
        signedAtUnixMs: BigInt(invocation.timestampUnixMs),
      });
      // digest metadata は signer が受けた unsigned Protobuf bytes と同じ lowercase SHA-256/byte length を持ちます。
      const signingInput = signingInputs[index];
      if (signingInput === undefined) {
        throw new TypeError('Provider signer input was not captured.');
      }
      const expectedCanonical = new TextDecoder().decode(signingInput);
      const expectedDigest = /body_sha256:([0-9a-f]{64})/u.exec(expectedCanonical)?.[1];
      const expectedLength = /body_length:(\d+)/u.exec(expectedCanonical)?.[1];
      expect(request.body.rawBodyDigest).toMatchObject({
        algorithm: 'sha-256',
        byteLength: BigInt(expectedLength ?? '-1'),
        digestHex: expectedDigest,
      });
      expect(request.body.timestamp).toMatchObject({
        acceptedSkewMs: 300_000n,
        unixMs: BigInt(invocation.timestampUnixMs),
      });
      expect(request.body.nonce).toMatchObject({
        nonce: invocation.nonce,
        principalId: invocation.installationId,
        ttlSeconds: 300,
      });
    }
  });

  it('[TAMAC-SDK-S002] rejects required Provider operation identities before signer or fetch', async () => {
    // signer/fetch capture を作り、invalid identity が network/signature side effect より前に拒否されることを検査します。
    const signingInputs: Uint8Array[] = [];
    const captured: CapturedProviderRequest[] = [];
    const client = createTamacProviderIngressClient({
      agentRpcOrigin: 'https://agent.example.test',
      fetch: createProviderIngressFetch(captured),
      invocation: createInvocation(),
      signing: {
        algorithm: 'Ed25519',
        keyId: 'provider-key-001',
        signDetached: (input) => {
          // fail-closed assertion のため、もし signer が呼ばれた場合だけ input を記録します。
          signingInputs.push(input);
          return Promise.resolve(new Uint8Array([1]));
        },
      },
    });

    // Event の connection、Tool result の invocation、Delivery result の delivery/capability context を順に空値で渡します。
    await expect(
      client.publishEvent({
        connectionId: ' \t ',
        event: create(AgentEventInputSchema),
        threadKey: 'thread-001',
      })
    ).rejects.toThrow('Provider ingress connectionId must not be empty.');
    await expect(
      client.publishToolResult({ invocationId: ' \t ', status: 'succeeded' })
    ).rejects.toThrow('Provider ingress invocationId must not be empty.');
    await expect(
      client.publishDeliveryResult({
        deliveryContextId: 'delivery-context-001',
        deliveryId: ' \t ',
        status: 'succeeded',
      })
    ).rejects.toThrow('Provider ingress deliveryId must not be empty.');
    await expect(
      client.publishDeliveryResult({
        deliveryContextId: ' \t ',
        deliveryId: 'delivery-001',
        status: 'succeeded',
      })
    ).rejects.toThrow('Provider ingress deliveryContextId must not be empty.');

    // validation failure は detached signer と Connect fetch を一度も実行しないことを確認します。
    expect(signingInputs).toEqual([]);
    expect(captured).toEqual([]);
  });

  it('[TAMAC-SDK-S002] Provider HTTP 429 を resource_exhausted operation error へ正規化する', async () => {
    // Agent Worker の safe 429 response を再現し、raw response message を SDK consumer へ渡さないようにします。
    const invocation = createInvocation();
    const client = createTamacProviderIngressClient({
      agentRpcOrigin: 'https://agent.example.test',
      fetch: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({ code: 'resource_exhausted', message: 'rate-limit secret' }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 429,
            }
          )
        ),
      invocation,
      signing: createSigningContext(),
    });

    // Provider surface の typed call が 429 を stable category と request/service/method context に畳むことを検査します。
    const error = await client
      .publishEvent({
        connectionId: 'connection-001',
        event: create(AgentEventInputSchema),
        threadKey: 'thread-001',
      })
      .then(
        () => {
          throw new TypeError('Provider HTTP 429 request unexpectedly succeeded.');
        },
        (error_: unknown) => error_
      );
    expect(error).toBeInstanceOf(TamacSdkOperationError);
    expect(error).toMatchObject({
      agentId: invocation.agentId,
      category: 'resource_exhausted',
      correlationId: invocation.correlationId,
      idempotencyKey: invocation.idempotencyKey,
      methodName: 'PublishEvent',
      requestId: invocation.requestId,
      serviceName: providerServiceName,
    });
  });

  it('[TAMAC-SDK-S002] Provider transport は canonical HTTPS origin だけを受理する', () => {
    // URL.origin と一致する normal origin と明示的な non-default port は、署名済み request の宛先として受理します。
    for (const origin of ['https://agent.example.test', 'https://agent.example.test:8443']) {
      expect(() =>
        createTamacProviderIngressTransport({
          agentRpcOrigin: origin,
          invocation: createInvocation(),
        })
      ).not.toThrow();
    }

    // path、query、fragment、userinfo、HTTP、default port、trailing slash は canonical origin contract 外として拒否します。
    const rejectedOrigins = [
      'https://agent.example.test/',
      'https://agent.example.test/ingress',
      'https://agent.example.test?target=provider',
      'https://agent.example.test#provider',
      'https://provider:password@agent.example.test',
      'http://agent.example.test',
      'https://agent.example.test:443',
    ];
    for (const origin of rejectedOrigins) {
      expect(() =>
        createTamacProviderIngressTransport({
          agentRpcOrigin: origin,
          invocation: createInvocation(),
        })
      ).toThrow();
    }
  });

  it('[TAMAC-SDK-S002] negative Provider timestamp を signer と fetch の前に拒否する', () => {
    // side effect capture を用意し、canonical detached signature を作る前の validation を検査します。
    const fetch = vi.fn<typeof globalThis.fetch>();
    const signDetached = vi.fn(() => Promise.resolve(new Uint8Array([1])));
    const invocation = { ...createInvocation(), timestampUnixMs: -1 };

    // non-negative safe integer contract に反する timestamp は client construction で fail closed します。
    expect(() =>
      createTamacProviderIngressClient({
        agentRpcOrigin: 'https://agent.example.test',
        fetch,
        invocation,
        signing: { algorithm: 'Ed25519', keyId: 'provider-key-001', signDetached },
      })
    ).toThrow('Provider ingress timestampUnixMs must be a non-negative safe integer.');
    // invalid timestamp は signer callback と external fetch のどちらも開始しないことを確認します。
    expect(signDetached).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});

interface CapturedProviderRequest {
  readonly agentHeaders: string[];
  readonly authorization: string | null;
  readonly body:
    | PublishIntegrationEventRequest
    | PublishToolResultRequest
    | PublishDeliveryResultRequest;
  readonly contentType: string | null;
  readonly correlationId: string | null;
  readonly method: string;
  readonly path: string;
  readonly requestId: string | null;
}

interface ExpectedCanonicalInput {
  readonly body: Uint8Array;
  readonly connectionId?: string;
  readonly deliveryContextId?: string;
  readonly invocationId?: string;
  readonly method: 'PublishDeliveryResult' | 'PublishEvent' | 'PublishToolResult';
}

function createInvocation(): ProviderIngressInvocationContext {
  // canonical text が NFC trim する Agent/Installation/nonce/idempotency values を Provider fixture として返します。
  return {
    agentId: ' agent-e\u0301 ',
    correlationId: 'correlation-001',
    idempotencyKey: ' idempotency-e\u0301 ',
    installationId: ' installation-e\u0301 ',
    nonce: ' nonce-e\u0301 ',
    requestId: 'request-001',
    timestampUnixMs: 1_752_200_000_000,
  };
}

function createSigningContext() {
  // Provider private key を test に持ち込まず、detached signer callback の成功結果だけを返します。
  return {
    algorithm: 'Ed25519' as const,
    keyId: 'provider-key-001',
    signDetached: () => Promise.resolve(new Uint8Array([1])),
  };
}

async function createExpectedCanonicalText(input: ExpectedCanonicalInput): Promise<string> {
  // unsigned Protobuf body の SHA-256 を計算し、SDK signer input と同じ lowercase hex representation を作ります。
  const digest = await globalThis.crypto.subtle.digest('SHA-256', copyToArrayBuffer(input.body));
  let digestHex = '';
  for (const byte of new Uint8Array(digest)) {
    digestHex += byte.toString(16).padStart(2, '0');
  }
  // design 固定の line order、NFC trim、sentinel、base-10 timestamp/length を canonical text として返します。
  return [
    'agent-detached-signature-v1',
    `service:${normalizeIdentity(providerServiceName)}`,
    `method:${normalizeIdentity(input.method)}`,
    `agent_id:${normalizeIdentity(createInvocation().agentId)}`,
    `installation_id:${normalizeIdentity(createInvocation().installationId)}`,
    `connection_id:${normalizeOptionalIdentity(input.connectionId)}`,
    'tool_id:-',
    `invocation_id:${normalizeOptionalIdentity(input.invocationId)}`,
    `delivery_context_id:${normalizeOptionalIdentity(input.deliveryContextId)}`,
    `timestamp_unix_ms:${String(createInvocation().timestampUnixMs)}`,
    `nonce:${normalizeIdentity(createInvocation().nonce)}`,
    `idempotency_key:${normalizeIdentity(createInvocation().idempotencyKey)}`,
    `body_sha256:${digestHex}`,
    `body_length:${String(input.body.byteLength)}`,
  ].join('\n');
}

function normalizeIdentity(value: string): string {
  // Agent verifier と同じ NFC trim rule を test expectation に適用します。
  return value.trim().normalize('NFC');
}

function normalizeOptionalIdentity(value: string | undefined): string {
  // absent/empty optional identity は fixed sentinel を使い、canonical empty line を作りません。
  return value === undefined || value.trim() === '' ? '-' : normalizeIdentity(value);
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  // Web Crypto に独立した ArrayBuffer を渡し、test compile の BufferSource 型を正確に満たします。
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function createProviderIngressFetch(captured: CapturedProviderRequest[]): typeof globalThis.fetch {
  return async (input, init) => {
    // Connect runtime の Request を materialize して、Provider transport の HTTP metadata と binary body を記録します。
    const request = input instanceof Request ? input : new Request(input, init);
    const path = new URL(request.url).pathname;
    const bodyBytes = new Uint8Array(await request.arrayBuffer());
    const body = decodeProviderRequest(path, bodyBytes);
    captured.push({
      agentHeaders: [...request.headers.keys()]
        .filter((name) => name.startsWith('x-agent-'))
        .sort(),
      authorization: request.headers.get('Authorization'),
      body,
      contentType: request.headers.get('Content-Type'),
      correlationId: request.headers.get('x-agent-correlation-id'),
      method: request.method,
      path,
      requestId: request.headers.get('x-request-id'),
    });
    // current method と対応する empty typed binary response を返し、SDK が generated response decoding を完了できるようにします。
    return new Response(createProviderResponse(path), {
      headers: { 'Content-Type': 'application/proto' },
      status: 200,
    });
  };
}

function decodeProviderRequest(path: string, bytes: Uint8Array): CapturedProviderRequest['body'] {
  // Connect method path から対応 schema を一意に選び、Provider request の security metadata を検査可能にします。
  switch (path) {
    case '/cftamac.agent.v1.IntegrationIngressService/PublishEvent':
      return fromBinary(PublishIntegrationEventRequestSchema, bytes);
    case '/cftamac.agent.v1.IntegrationIngressService/PublishToolResult':
      return fromBinary(PublishToolResultRequestSchema, bytes);
    case '/cftamac.agent.v1.IntegrationIngressService/PublishDeliveryResult':
      return fromBinary(PublishDeliveryResultRequestSchema, bytes);
    default:
      throw new TypeError(`Unexpected Provider ingress path: ${path}`);
  }
}

function createProviderResponse(path: string): Uint8Array {
  // current Connect method path に対応する generated response schema を選び、test transport の contract を固定します。
  switch (path) {
    case '/cftamac.agent.v1.IntegrationIngressService/PublishEvent':
      return toBinary(
        PublishIntegrationEventResponseSchema,
        create(PublishIntegrationEventResponseSchema)
      );
    case '/cftamac.agent.v1.IntegrationIngressService/PublishToolResult':
      return toBinary(PublishToolResultResponseSchema, create(PublishToolResultResponseSchema));
    case '/cftamac.agent.v1.IntegrationIngressService/PublishDeliveryResult':
      return toBinary(
        PublishDeliveryResultResponseSchema,
        create(PublishDeliveryResultResponseSchema)
      );
    default:
      throw new TypeError(`Unexpected Provider ingress path: ${path}`);
  }
}
