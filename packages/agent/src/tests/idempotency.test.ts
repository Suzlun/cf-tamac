import { describe, expect, it } from 'vitest';

import { createIntegrationSignatureBase } from '../domain/security';
import { publishIntegrationDeliveryResultInStore } from '../integrations/operations-delivery';

import { createEd25519TrustFixture } from './ed25519-jwt-test-helpers';

import type { AgentCoreRequestContext } from '../domain';
import type { IntegrationIngressSignatureInput } from '../integrations';
import type { AgentIdempotencyRecordRow, AgentStorageRepositories } from '../storage';

const agentId = 'agent-idempotency';
const installationId = 'installation-idempotency';
const deliveryContextId = 'delivery-context-idempotency';
const deliveryId = 'delivery-idempotency';
const idempotencyKey = 'delivery-result-idempotency-key';
const requestDigest = 'a'.repeat(64);
const nowMs = Date.now();

async function createVerifiedDeliveryCommand(): Promise<{
  readonly command: {
    readonly context: AgentCoreRequestContext;
    readonly deliveryContextId: string;
    readonly deliveryId: string;
    readonly installationId: string;
    readonly signature: IntegrationIngressSignatureInput;
    readonly status: string;
  };
  readonly publicKeyMaterial: string;
}> {
  const fixture = await createEd25519TrustFixture({ kid: 'delivery-idempotency-key' });
  const bodyDigest = { algorithm: 'sha-256' as const, byteLength: 1, digestHex: requestDigest };
  const nonce = 'delivery-idempotency-nonce';
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'Ed25519' },
      fixture.privateKey,
      new TextEncoder().encode(
        createIntegrationSignatureBase({
          agentId,
          deliveryContextId,
          idempotencyKey,
          installationId,
          method: 'PublishDeliveryResult',
          nonce,
          rawBodyDigest: bodyDigest,
          service: 'cftamac.agent.v1.IntegrationIngressService',
          timestampUnixMs: nowMs,
        })
      )
    )
  );
  return {
    command: {
      context: {
        agentId,
        bodyDigest,
        idempotencyKey,
        method: 'PublishDeliveryResult',
        nonce,
        principal: {
          agentId,
          installationId,
          keyId: fixture.kid,
          principalId: installationId,
          principalType: 'INTEGRATION_INSTALLATION',
          scopes: [],
        },
        requestedAtMs: nowMs,
        service: 'cftamac.agent.v1.IntegrationIngressService',
      },
      deliveryContextId,
      deliveryId,
      installationId,
      signature: {
        algorithm: 'Ed25519',
        byteLength: bodyDigest.byteLength,
        digestHex: bodyDigest.digestHex,
        keyId: fixture.kid,
        nonce,
        signature,
        signedAtMs: nowMs,
        timestampMs: nowMs,
      },
      status: 'succeeded',
    },
    publicKeyMaterial: JSON.stringify(fixture.publicJwk),
  };
}

function createExistingRecord(
  response: unknown,
  digest = requestDigest
): AgentIdempotencyRecordRow {
  return {
    createdAtMs: nowMs,
    expiresAtMs: nowMs + 86_400_000,
    idempotencyKey,
    operationName: 'IntegrationIngressService.PublishDeliveryResult',
    principalId: installationId,
    requestDigest: digest,
    responseRef: JSON.stringify(response),
    status: 'succeeded',
  };
}

describe('Agent idempotency integrity', () => {
  it('[TAMAC-SDK-S002] replays a verified delivery result before terminal mutable state lookup', async () => {
    const { command, publicKeyMaterial } = await createVerifiedDeliveryCommand();
    let mutableLookupCount = 0;
    const storedResult = {
      replayed: false,
      result: { deliveryId, status: 'succeeded' },
    };
    const repositories = {
      idempotency: {
        findRecord: () => createExistingRecord(storedResult),
      },
      integrations: {
        // terminal Connection/Delivery state を参照すると retry が失敗するので、replay ではこの mutable lookup に到達してはいけません。
        findDelivery: () => {
          mutableLookupCount += 1;
          throw new Error('terminal delivery state must not be read for replay');
        },
        findActiveTrustKey: () => ({ publicKeyMaterial }),
        findInstallation: () => ({ status: 'active' }),
      },
      requestNonces: {
        reserveNonce: () => {
          throw new Error('replay must not reserve a new nonce');
        },
      },
      transaction: () => {
        throw new Error('replay must not begin a mutation transaction');
      },
    } as unknown as AgentStorageRepositories;

    const result = await publishIntegrationDeliveryResultInStore({
      agentId,
      command,
      repositories,
    });

    expect(result).toMatchObject({ replayed: true, result: { deliveryId, status: 'succeeded' } });
    expect(mutableLookupCount).toBe(0);
  });

  it('[TAMAC-SDK-S002] rejects an existing idempotency key with a different request digest before mutable lookup', async () => {
    const { command, publicKeyMaterial } = await createVerifiedDeliveryCommand();
    let mutableLookupCount = 0;
    const repositories = {
      idempotency: {
        findRecord: () => createExistingRecord({ result: { deliveryId } }, 'b'.repeat(64)),
      },
      integrations: {
        findDelivery: () => {
          mutableLookupCount += 1;
          throw new Error('conflict must finish before mutable lookup');
        },
        findActiveTrustKey: () => ({ publicKeyMaterial }),
        findInstallation: () => ({ status: 'active' }),
      },
      requestNonces: { reserveNonce: () => ({ status: 'reserved' }) },
      transaction: () => {
        throw new Error('conflict must not begin a mutation transaction');
      },
    } as unknown as AgentStorageRepositories;

    await expect(
      publishIntegrationDeliveryResultInStore({ agentId, command, repositories })
    ).rejects.toThrow('Idempotency key was already used with a different request digest.');
    expect(mutableLookupCount).toBe(0);
  });

  it('[TAMAC-SDK-S002] commits the delivery mutation and succeeded idempotency record in one transaction', async () => {
    const { command, publicKeyMaterial } = await createVerifiedDeliveryCommand();
    const operationOrder: string[] = [];
    let transactionActive = false;
    let idempotencyWasInsideTransaction = false;
    const delivery = {
      agentId,
      connectionId: 'connection-idempotency',
      createdAtMs: nowMs,
      deliveryContextId,
      deliveryId,
      eventId: null,
      idempotencyKey,
      installationId,
      providerOperationId: null,
      providerTargetRef: null,
      requestDigest,
      requestPayloadRef: null,
      runId: 'run-idempotency',
      status: 'waiting',
      updatedAtMs: nowMs,
    };
    const repositories = {
      grants: {
        listGrantsForPrincipal: () => [
          {
            capability: 'integration.delivery.result',
            scopeRef: `installation:${installationId}`,
            status: 'active',
          },
        ],
      },
      idempotency: {
        findRecord: () => undefined,
        insertRecord: () => {
          idempotencyWasInsideTransaction = transactionActive;
          operationOrder.push('idempotency');
        },
      },
      integrations: {
        findActiveTrustKey: () => ({ publicKeyMaterial }),
        findConnection: () => ({
          connectionId: delivery.connectionId,
          installationId,
          status: 'active',
        }),
        findDelivery: () => delivery,
        findDeliveryContext: () => ({ connectionId: delivery.connectionId, status: 'active' }),
        findInstallation: () => ({ installationId, status: 'active' }),
        updateDeliveryStatus: () => ({ ...delivery, status: command.status }),
      },
      pendingRuns: {
        findRunById: () => ({ status: 'waiting' }),
        findRunInputSnapshot: () => ({}),
        transitionRunStatus: () => {
          operationOrder.push('mutation');
        },
      },
      profile: { getProfile: () => ({ lifecycleStatus: 'active' }) },
      requestNonces: { reserveNonce: () => ({ status: 'reserved' }) },
      transaction: <Result>(
        operation: (repositories: AgentStorageRepositories) => Result
      ): Result => {
        transactionActive = true;
        try {
          return operation(repositories);
        } finally {
          transactionActive = false;
        }
      },
    } as unknown as AgentStorageRepositories;

    const result = await publishIntegrationDeliveryResultInStore({
      agentId,
      command,
      repositories,
    });

    expect(result).toMatchObject({ replayed: false, result: { deliveryId, status: 'succeeded' } });
    expect(operationOrder).toEqual(['mutation', 'idempotency']);
    expect(idempotencyWasInsideTransaction).toBe(true);
  });
});
