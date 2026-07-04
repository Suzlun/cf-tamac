import { Code } from '@connectrpc/connect';
import { describe, expect, it } from 'vitest';

import { createAgentDomainError } from '../domain/errors';
import { decideAgentFinalAuthorization } from '../domain/final-authorization';
import { signBytesWithAgentKey, verifyBytesWithAgentKey } from '../domain/security/crypto';
import { createRawBodyDigest } from '../domain/security/digest';
import {
  buildIntegrationDeliverySignatureMetadata,
  buildIntegrationToolSignatureMetadata,
  integrationDeliveryServiceName,
  integrationToolServiceName,
} from '../domain/security/provider-signing';
import {
  createAgentDetachedSignatureBase,
  createIntegrationSignatureBase,
  verifyIntegrationDetachedSignature,
} from '../domain/security/signature';
import {
  createAgentAuditRecord,
  createAgentCounterRecord,
  createAgentMetricRecord,
  createAgentStructuredLogRecord,
} from '../observability';
import {
  createConnectErrorResponseFromDomainError,
  mapAgentDomainErrorKindToConnectCode,
} from '../rpc/errors';

import type { AgentDomainErrorKind } from '../domain/errors';
import type { AgentToProviderSignatureMetadata } from '../domain/security/provider-signing';
import type {
  AgentNonceRepository,
  AgentNonceReservationInput,
  AgentNonceReservationResult,
} from '../domain/security/replay';

const textEncoder = new TextEncoder();
const nowUnixSeconds = 1_700_000_000;
const nowUnixMs = nowUnixSeconds * 1000;

class MemoryNonceRepository implements AgentNonceRepository {
  private readonly seen = new Map<string, number>();

  reserveNonce(input: AgentNonceReservationInput): Promise<AgentNonceReservationResult> {
    const key = `${input.agentId}:${input.principalId}:${input.nonce}`;
    const firstSeenUnixMs = this.seen.get(key);
    if (firstSeenUnixMs !== undefined) {
      return Promise.resolve({ firstSeenUnixMs, status: 'replay' });
    }
    this.seen.set(key, input.nowUnixMs);
    return Promise.resolve({ status: 'reserved' });
  }
}

describe('Agent security foundation', () => {
  it('[AGENT-SECURITY-S003] Valid Integration signature accepts ingress within grant', async () => {
    // Provider から届く Protobuf body を digest 化し、署名ベースへ固定します。
    const rawBodyDigest = await createRawBodyDigest(textEncoder.encode('publish-event-protobuf'));
    const canonical = {
      agentId: 'agent-alpha',
      connectionId: 'conn-1',
      idempotencyKey: 'ingress-idem-1',
      installationId: 'inst-1',
      method: 'PublishEvent',
      nonce: 'ingress-nonce-1',
      rawBodyDigest,
      service: 'cftamac.agent.v1.IntegrationIngressService',
      timestampUnixMs: nowUnixMs,
    };
    // 署名検証は時刻、nonce、body digest、key identity を通し、成功時だけ Integration principal を生成します。
    const signature = await signBytesWithAgentKey({
      algorithm: 'HS256',
      data: textEncoder.encode(createIntegrationSignatureBase(canonical)),
      key: 'integration-secret',
    });

    const verified = await verifyIntegrationDetachedSignature({
      algorithm: 'HS256',
      canonical,
      keyId: 'integration-key-1',
      keyResolver: () => ({
        algorithm: 'HS256',
        key: 'integration-secret',
        keyId: 'integration-key-1',
      }),
      nonceRepository: new MemoryNonceRepository(),
      nowUnixMs,
      signature,
    });

    expect(verified.status).toBe('verified');
    if (verified.status !== 'verified') {
      throw new Error('expected verified Integration signature');
    }

    // AIAgent 側の最終認可では、Connection に scope された ingress grant だけで PublishEvent を許可します。
    const authorization = decideAgentFinalAuthorization({
      agentId: 'agent-alpha',
      capability: {
        adapterConnectionId: 'conn-1',
        capabilityId: 'conn-1',
        capabilityKind: 'integration',
        installationId: 'inst-1',
        ownerAgentId: 'agent-alpha',
      },
      credentialState: 'active',
      lifecycleState: 'active',
      operation: {
        action: 'event.publish',
        method: 'PublishEvent',
        service: 'cftamac.agent.v1.IntegrationIngressService',
      },
      principal: {
        ...verified.principal,
        grantDetails: [{ capability: 'agent.event', scopeRef: 'adapter_connection:conn-1' }],
        grants: ['agent.event'],
      },
      requiredGrants: ['agent.event'],
      requiredPrincipalTypes: ['INTEGRATION_INSTALLATION'],
      requiredScopes: [],
    });

    expect(authorization).toMatchObject({ matchedGrants: ['agent.event'], status: 'allow' });
  });

  it('[AGENT-SECURITY-S004] Body tampering and nonce replay are rejected', async () => {
    const rawBodyDigest = await createRawBodyDigest(textEncoder.encode('protobuf-body-v1'));
    const canonical = {
      agentId: 'agent-alpha',
      connectionId: 'conn-1',
      idempotencyKey: 'idem-1',
      installationId: 'inst-1',
      method: 'PublishEvent',
      nonce: 'nonce-1',
      rawBodyDigest,
      service: 'cftamac.agent.v1.IntegrationIngressService',
      timestampUnixMs: nowUnixMs,
    };
    const signature = await signBytesWithAgentKey({
      algorithm: 'HS256',
      data: textEncoder.encode(createIntegrationSignatureBase(canonical)),
      key: 'integration-secret',
    });
    const nonceRepository = new MemoryNonceRepository();

    const verified = await verifyIntegrationDetachedSignature({
      algorithm: 'HS256',
      canonical,
      keyId: 'integration-key-1',
      keyResolver: () => ({
        algorithm: 'HS256',
        key: 'integration-secret',
        keyId: 'integration-key-1',
      }),
      nonceRepository,
      nowUnixMs,
      signature,
    });
    expect(verified.status).toBe('verified');

    const tampered = await verifyIntegrationDetachedSignature({
      algorithm: 'HS256',
      canonical: {
        ...canonical,
        nonce: 'nonce-2',
        rawBodyDigest: { ...rawBodyDigest, digestHex: '0'.repeat(64) },
      },
      keyId: 'integration-key-1',
      keyResolver: () => ({
        algorithm: 'HS256',
        key: 'integration-secret',
        keyId: 'integration-key-1',
      }),
      nonceRepository,
      nowUnixMs,
      signature,
    });
    expect(tampered).toMatchObject({ reason: 'invalid_signature', status: 'rejected' });

    const replayed = await verifyIntegrationDetachedSignature({
      algorithm: 'HS256',
      canonical,
      keyId: 'integration-key-1',
      keyResolver: () => ({
        algorithm: 'HS256',
        key: 'integration-secret',
        keyId: 'integration-key-1',
      }),
      nonceRepository,
      nowUnixMs,
      signature,
    });
    expect(replayed).toMatchObject({ reason: 'nonce_replay', status: 'rejected' });
  });

  it('[AGENT-SECURITY-S007] Domain errors map to stable Connect codes', async () => {
    const cases: readonly (readonly [AgentDomainErrorKind, Code])[] = [
      ['validation', Code.InvalidArgument],
      ['authentication', Code.Unauthenticated],
      ['authorization', Code.PermissionDenied],
      ['not_found', Code.NotFound],
      ['conflict', Code.AlreadyExists],
      ['precondition', Code.FailedPrecondition],
      ['concurrency', Code.Aborted],
      ['rate_limit', Code.ResourceExhausted],
      ['provider_failure', Code.Unavailable],
      ['timeout', Code.DeadlineExceeded],
      ['internal', Code.Internal],
    ];
    for (const [kind, code] of cases) {
      expect(mapAgentDomainErrorKindToConnectCode(kind)).toBe(code);
    }

    const response = createConnectErrorResponseFromDomainError(
      createAgentDomainError({ kind: 'timeout', message: 'Provider timed out.' })
    );
    const payload: unknown = JSON.parse(await response.text());
    expect(payload).toMatchObject({ code: 'deadline_exceeded', message: 'Provider timed out.' });
  });

  it('[AGENT-SECURITY-S008] Observability context excludes secret material', () => {
    const log = createAgentStructuredLogRecord({
      attributes: {
        Authorization: 'Bearer raw-token',
        keyMaterial: 'raw-key-material',
        nested: {
          hiddenReasoningSummary: 'chain-of-thought-summary',
          providerCredential: 'raw-secret',
          rawJwtSummary: 'header.payload.signature.summary',
          signatureBase: 'full-signature-base',
        },
        publicJwk: { crv: 'Ed25519', kty: 'OKP', x: 'public-key-full-value' },
        rawJwt: 'header.payload.signature',
        safe: 'kept',
      },
      fields: {
        actingUserIdHash: 'hash-user-1',
        agentId: 'agent-alpha',
        authFailureReason: 'invalid_signature',
        idempotencyKey: 'idem-1',
        issuer: 'client-service',
        jwtId: 'jwt-1',
        keyFingerprint: 'sha256:fingerprint',
        keyId: 'client-key-1',
        method: 'Check',
        principalId: 'principal-1',
        principalType: 'CLIENT_SERVICE',
        requestId: 'request-1',
        scopes: ['agent:read'],
        service: 'cftamac.agent.v1.AgentHealthService',
        subjectHash: 'hash-client-service-principal',
      },
      message: 'request completed',
      severity: 'info',
      timestampUnixMs: nowUnixMs,
    });
    const audit = createAgentAuditRecord({
      action: 'IntegrationIngressService.PublishEvent',
      auditId: 'audit-1',
      details: {
        encryptedPrivateJwk: 'ciphertext',
        privateKey: 'raw-private',
        token: 'raw-token',
      },
      fields: log.fields,
      outcome: 'denied',
      timestampUnixMs: nowUnixMs,
    });
    const metric = createAgentMetricRecord({
      fields: log.fields,
      name: 'agent.rpc.duration',
      timestampUnixMs: nowUnixMs,
      unit: 'ms',
      value: 12,
    });
    const counter = createAgentCounterRecord({
      count: 1,
      counterType: 'security',
      fields: log.fields,
      name: 'agent.security.denied',
      reason: 'invalid_signature',
      timestampUnixMs: nowUnixMs,
    });

    const serialized = JSON.stringify({ audit, counter, log, metric });
    expect(serialized).toContain('agent-alpha');
    expect(serialized).toContain('idem-1');
    expect(serialized).toContain('[REDACTED]');
    expect(serialized).not.toContain('raw-token');
    expect(serialized).not.toContain('raw-secret');
    expect(serialized).not.toContain('raw-private');
    expect(serialized).not.toContain('raw-key-material');
    expect(serialized).not.toContain('public-key-full-value');
    expect(serialized).not.toContain('header.payload.signature');
    expect(serialized).not.toContain('chain-of-thought-summary');
    expect(serialized).not.toContain('ciphertext');
    expect(serialized).not.toContain('full-signature-base');
  });

  it('[AGENT-TOOL-S005] [AGENT-TOOL-S008] [AGENT-INTEGRATION-S006] signs Provider RPC metadata', async () => {
    const signingKey = {
      algorithm: 'HS256' as const,
      key: 'provider-secret',
      keyId: 'agent-key-1',
    };
    const invoke = await buildIntegrationToolSignatureMetadata({
      agentId: 'agent-alpha',
      connectionId: 'conn-1',
      idempotencyKey: 'tool-idem-1',
      installationId: 'inst-1',
      invocationId: 'inv-1',
      method: 'InvokeTool',
      nonce: 'tool-nonce-1',
      rawBodyBytes: textEncoder.encode('invoke-protobuf'),
      signingKey,
      timestampUnixMs: nowUnixMs,
      toolId: 'calendar.create_event',
    });
    const cancel = await buildIntegrationToolSignatureMetadata({
      ...invokeProviderBase(signingKey),
      idempotencyKey: 'tool-idem-cancel',
      invocationId: 'inv-1',
      method: 'CancelOperation',
      nonce: 'tool-nonce-cancel',
      rawBodyBytes: textEncoder.encode('cancel-protobuf'),
      toolId: 'calendar.create_event',
    });
    const deliver = await buildIntegrationDeliverySignatureMetadata({
      agentId: 'agent-alpha',
      connectionId: 'conn-1',
      deliveryContextId: 'deliv-1',
      idempotencyKey: 'delivery-idem-1',
      installationId: 'inst-1',
      method: 'Deliver',
      nonce: 'delivery-nonce-1',
      rawBodyBytes: textEncoder.encode('delivery-protobuf'),
      signingKey,
      timestampUnixMs: nowUnixMs,
    });

    expect(invoke).toMatchObject({
      agentId: 'agent-alpha',
      connectionId: 'conn-1',
      installationId: 'inst-1',
      invocationId: 'inv-1',
      method: 'InvokeTool',
      service: integrationToolServiceName,
      toolId: 'calendar.create_event',
    });
    expect(cancel).toMatchObject({
      method: 'CancelOperation',
      service: integrationToolServiceName,
    });
    expect(deliver).toMatchObject({
      deliveryContextId: 'deliv-1',
      method: 'Deliver',
      service: integrationDeliveryServiceName,
    });
    await expectProviderSignatureToVerify(invoke, 'provider-secret');
    await expectProviderSignatureToVerify(cancel, 'provider-secret');
    await expectProviderSignatureToVerify(deliver, 'provider-secret');
  });
});

function invokeProviderBase(signingKey: {
  readonly algorithm: 'HS256';
  readonly key: string;
  readonly keyId: string;
}) {
  return {
    agentId: 'agent-alpha',
    connectionId: 'conn-1',
    installationId: 'inst-1',
    signingKey,
    timestampUnixMs: nowUnixMs,
  };
}

async function expectProviderSignatureToVerify(
  metadata: AgentToProviderSignatureMetadata,
  key: string
): Promise<void> {
  const base = createAgentDetachedSignatureBase({
    agentId: metadata.agentId,
    connectionId: metadata.connectionId,
    deliveryContextId: metadata.deliveryContextId,
    idempotencyKey: metadata.idempotencyKey,
    installationId: metadata.installationId,
    invocationId: metadata.invocationId,
    method: metadata.method,
    nonce: metadata.nonce,
    rawBodyDigest: metadata.rawBodyDigest,
    service: metadata.service,
    timestampUnixMs: metadata.timestampUnixMs,
    toolId: metadata.toolId,
  });
  const valid = await verifyBytesWithAgentKey({
    algorithm: metadata.algorithm,
    data: textEncoder.encode(base),
    key,
    signature: metadata.signature,
  });
  expect(valid).toBe(true);
}
