import { Code } from '@connectrpc/connect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TamacSdkOperationError } from '@cf-tamac/sdk';

import { createBrowserSafeAgentRpcFailure } from '../server/agent-rpc/safe-results';
import { createManagedAgentRepository } from '../server/db';

import { applyClientMigration, createTestD1Database } from './test-d1-helper';

const mocks = vi.hoisted(() => ({
  loadAgentRpcClients: vi.fn(),
}));

vi.mock('../server/agent-rpc/agent-loader', () => ({
  loadAgentRpcClients: mocks.loadAgentRpcClients,
}));

describe('Managed Agent registration attempt reconciliation', () => {
  beforeEach(() => {
    mocks.loadAgentRpcClients.mockReset();
  });

  it('[AGENT-MANAGEMENT-UI-S017] commits a fixed create attempt before InitializeAgent and marks the same attempt active after success', async () => {
    const db = createTestD1Database();
    await applyClientMigration(db);
    const initializeAgent = vi.fn();
    const getAgent = vi.fn();
    initializeAgent.mockImplementation((request) => {
      // direct InitializeAgent と後続 GetAgent の receipt/profile/config/status 完全一致を両方検証する。
      getAgent.mockResolvedValue({
        agent: { agentId: 'agent-create', displayName: 'Agent create', status: 'active' },
        config: { modelPolicyRef: 'workers-ai-default' },
        defaultModelPolicy: { policyRef: 'workers-ai-default' },
        initializationReceipt: {
          idempotencyKey: request.idempotencyKey,
          registrationRequestDigest: request.registrationRequestDigest,
        },
      });
      return Promise.resolve({
        agent: { agentId: 'agent-create', displayName: 'Agent create', status: 'active' },
        config: { modelPolicyRef: 'workers-ai-default' },
        defaultModelPolicy: { policyRef: 'workers-ai-default' },
        initializationReceipt: {
          idempotencyKey: request.idempotencyKey,
          registrationRequestDigest: request.registrationRequestDigest,
        },
      });
    });
    const clients = createClients(initializeAgent, getAgent);
    mocks.loadAgentRpcClients.mockResolvedValue({ clients });
    const { createManagedAgentRegistrationAttempt } =
      await import('../server/actions/managed-agent-registration-attempt');

    const outcome = await createManagedAgentRegistrationAttempt(db, createRequest('agent-create'));
    const stored = await createManagedAgentRepository(db).getManagedAgent('agent-create');

    expect(outcome).toMatchObject({
      correlationId: 'registration-correlation',
      safeErrorCategory: null,
      state: 'active',
    });
    expect(stored?.registrationState).toBe('active');
    expect(stored?.initializationIdempotencyKey).toMatch(/^registration:agent-create:/u);
    expect(stored?.registrationModelPolicyRef).toBe('workers-ai-default');
    expect(stored?.registrationRequestDigest).toMatch(/^sha256:[a-f\d]{64}$/u);
    expect(initializeAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-create',
        idempotencyKey: stored?.initializationIdempotencyKey,
      })
    );
    expect(getAgent).toHaveBeenCalledWith({ agentId: 'agent-create' });
  });

  it('[AGENT-MANAGEMENT-UI-S017] keeps reconciliation required when direct InitializeAgent receipt mismatches the persisted attempt', async () => {
    const db = createTestD1Database();
    await applyClientMigration(db);
    const initializeAgent = vi.fn().mockResolvedValue({
      agent: {
        agentId: 'agent-direct-mismatch',
        displayName: 'Agent direct-mismatch',
        status: 'active',
      },
      config: { modelPolicyRef: 'workers-ai-default' },
      defaultModelPolicy: { policyRef: 'workers-ai-default' },
      initializationReceipt: {
        idempotencyKey: 'registration:another-attempt',
        registrationRequestDigest: 'sha256:another-request',
      },
    });
    const getAgent = vi.fn().mockResolvedValue({
      agent: {
        agentId: 'agent-direct-mismatch',
        displayName: 'Agent direct-mismatch',
        status: 'active',
      },
      config: { modelPolicyRef: 'workers-ai-default' },
      defaultModelPolicy: { policyRef: 'workers-ai-default' },
      initializationReceipt: {
        idempotencyKey: 'registration:another-attempt',
        registrationRequestDigest: 'sha256:another-request',
      },
    });
    mocks.loadAgentRpcClients.mockResolvedValue({
      clients: createClients(initializeAgent, getAgent),
    });
    const { createManagedAgentRegistrationAttempt } =
      await import('../server/actions/managed-agent-registration-attempt');

    const outcome = await createManagedAgentRegistrationAttempt(
      db,
      createRequest('agent-direct-mismatch')
    );

    expect(outcome.state).toBe('reconciliation_required');
    expect(getAgent).not.toHaveBeenCalled();
  });

  it('[AGENT-MANAGEMENT-UI-S017] response-loss reconciliation uses the persisted create attempt and GetAgent without a second InitializeAgent', async () => {
    const db = createTestD1Database();
    await applyClientMigration(db);
    const initializeAgent = vi.fn();
    const getAgent = vi.fn().mockResolvedValue({
      agent: { agentId: 'agent-reconcile', displayName: 'Agent reconcile' },
      config: { modelPolicyRef: 'workers-ai-default' },
      defaultModelPolicy: { policyRef: 'workers-ai-default' },
    });
    initializeAgent.mockImplementation((request) => {
      getAgent.mockResolvedValue({
        agent: { agentId: 'agent-reconcile', displayName: 'Agent reconcile', status: 'active' },
        config: { modelPolicyRef: 'workers-ai-default' },
        defaultModelPolicy: { policyRef: 'workers-ai-default' },
        initializationReceipt: {
          idempotencyKey: request.idempotencyKey,
          registrationRequestDigest: request.registrationRequestDigest,
        },
      });
      return Promise.reject(new Error('response lost'));
    });
    const clients = createClients(initializeAgent, getAgent);
    mocks.loadAgentRpcClients.mockResolvedValue({ clients });
    const { createManagedAgentRegistrationAttempt } =
      await import('../server/actions/managed-agent-registration-attempt');

    const outcome = await createManagedAgentRegistrationAttempt(
      db,
      createRequest('agent-reconcile')
    );
    const stored = await createManagedAgentRepository(db).getManagedAgent('agent-reconcile');

    // response loss でも同じ persisted key を持つ create attempt を active に確定し、InitializeAgent を再送しない。
    expect(outcome).toMatchObject({ safeErrorCategory: null, state: 'active' });
    expect(initializeAgent).toHaveBeenCalledTimes(1);
    expect(getAgent).toHaveBeenCalledWith({ agentId: 'agent-reconcile' });
    expect(stored?.registrationState).toBe('active');
  });

  it('[AGENT-MANAGEMENT-UI-S017] keeps reconciliation required when Agent initialization receipt does not match the persisted attempt', async () => {
    const db = createTestD1Database();
    await applyClientMigration(db);
    const initializeAgent = vi.fn().mockRejectedValue(new Error('response lost'));
    const getAgent = vi.fn().mockResolvedValue({
      agent: { agentId: 'agent-receipt-mismatch', displayName: 'Agent receipt-mismatch' },
      config: { modelPolicyRef: 'workers-ai-default' },
      defaultModelPolicy: { policyRef: 'workers-ai-default' },
      initializationReceipt: {
        idempotencyKey: 'registration:other-attempt',
        registrationRequestDigest: 'sha256:other-request',
      },
    });
    mocks.loadAgentRpcClients.mockResolvedValue({
      clients: createClients(initializeAgent, getAgent),
    });
    const { createManagedAgentRegistrationAttempt } =
      await import('../server/actions/managed-agent-registration-attempt');

    const outcome = await createManagedAgentRegistrationAttempt(
      db,
      createRequest('agent-receipt-mismatch')
    );

    expect(outcome.state).toBe('reconciliation_required');
    expect(
      (await createManagedAgentRepository(db).getManagedAgent('agent-receipt-mismatch'))
        ?.registrationState
    ).toBe('reconciliation_required');
  });

  it.each(['destroyed', 'suspended'] as const)(
    '[AGENT-MANAGEMENT-UI-S017] does not mark a matching %s Agent profile active',
    async (status) => {
      const db = createTestD1Database();
      await applyClientMigration(db);
      const getAgent = vi.fn();
      const initializeAgent = vi.fn().mockImplementation((request) => {
        // receipt/profile/config が一致しても active 以外の lifecycle status なら active 確定条件を満たさない。
        getAgent.mockResolvedValue({
          agent: { agentId: `agent-${status}`, displayName: `Agent ${status}`, status },
          config: { modelPolicyRef: 'workers-ai-default' },
          defaultModelPolicy: { policyRef: 'workers-ai-default' },
          initializationReceipt: {
            idempotencyKey: request.idempotencyKey,
            registrationRequestDigest: request.registrationRequestDigest,
          },
        });
        return Promise.resolve({
          agent: { agentId: `agent-${status}`, displayName: `Agent ${status}`, status },
          config: { modelPolicyRef: 'workers-ai-default' },
          defaultModelPolicy: { policyRef: 'workers-ai-default' },
          initializationReceipt: {
            idempotencyKey: request.idempotencyKey,
            registrationRequestDigest: request.registrationRequestDigest,
          },
        });
      });
      mocks.loadAgentRpcClients.mockResolvedValue({
        clients: createClients(initializeAgent, getAgent),
      });
      const { createManagedAgentRegistrationAttempt } =
        await import('../server/actions/managed-agent-registration-attempt');

      const outcome = await createManagedAgentRegistrationAttempt(
        db,
        createRequest(`agent-${status}`)
      );
      const stored = await createManagedAgentRepository(db).getManagedAgent(`agent-${status}`);
      const credentialRows = await db
        .prepare('SELECT agent_id FROM client_agent_credential_refs WHERE agent_id = ?')
        .bind(`agent-${status}`)
        .all();

      expect(outcome.state).toBe('reconciliation_required');
      // Agent が destroyed 等でも Client ledger は未確定のまま保持し、active postcondition を作らない。
      expect(stored?.registrationState).toBe('reconciliation_required');
      expect(credentialRows.results).toHaveLength(1);
    }
  );

  it('[AGENT-MANAGEMENT-UI-S017] treats a normalized not_found GetAgent result as atomic cleanup with a safe correlation', async () => {
    const db = createTestD1Database();
    await applyClientMigration(db);
    const notFound = createNotFoundOperationError();
    const initializeAgent = vi.fn().mockRejectedValue(new Error('response lost'));
    const getAgent = vi.fn().mockRejectedValue(notFound);
    mocks.loadAgentRpcClients.mockResolvedValue({
      clients: createClients(initializeAgent, getAgent),
    });
    const { createManagedAgentRegistrationAttempt } =
      await import('../server/actions/managed-agent-registration-attempt');

    const outcome = await createManagedAgentRegistrationAttempt(db, createRequest('agent-absent'));
    const stored = await createManagedAgentRepository(db).getManagedAgent('agent-absent');
    const credentialRows = await db
      .prepare('SELECT agent_id FROM client_agent_credential_refs WHERE agent_id = ?')
      .bind('agent-absent')
      .all();
    const safeResult = createBrowserSafeAgentRpcFailure(notFound, outcome.correlationId, {
      message: 'Agentが見つかりません。',
      title: 'Agent登録を確認してください',
    });

    expect(outcome).toMatchObject({
      correlationId: 'not-found-correlation',
      safeErrorCategory: 'not_found',
      state: 'failed',
    });
    expect(stored).toBeUndefined();
    expect(credentialRows.results).toHaveLength(0);
    expect(Object.keys(safeResult).sort()).toEqual([
      'correlationId',
      'displayData',
      'safeErrorCategory',
      'safeStatus',
    ]);
    expect(safeResult).toMatchObject({
      correlationId: 'not-found-correlation',
      safeErrorCategory: 'not_found',
      safeStatus: 'failed',
    });
  });

  it('[AGENT-MANAGEMENT-UI-S017] keeps a non-not_found Agent profile mismatch in reconciliation', async () => {
    const db = createTestD1Database();
    await applyClientMigration(db);
    const initializeAgent = vi.fn().mockRejectedValue(new Error('rejected before Agent creation'));
    const getAgent = vi.fn().mockResolvedValue({
      agent: { agentId: 'different-agent', displayName: 'Different Agent' },
      config: { modelPolicyRef: 'different-policy' },
      defaultModelPolicy: { policyRef: 'different-policy' },
    });
    mocks.loadAgentRpcClients.mockResolvedValue({
      clients: createClients(initializeAgent, getAgent),
    });
    const { createManagedAgentRegistrationAttempt } =
      await import('../server/actions/managed-agent-registration-attempt');

    const outcome = await createManagedAgentRegistrationAttempt(
      db,
      createRequest('agent-profile-mismatch')
    );

    // profile mismatch は not_found ではないため、Agent の存在・作成有無を断定せず同じ attempt の確認を継続する。
    expect(outcome.state).toBe('reconciliation_required');
    expect(
      (await createManagedAgentRepository(db).getManagedAgent('agent-profile-mismatch'))
        ?.registrationState
    ).toBe('reconciliation_required');
  });

  it('[AGENT-MANAGEMENT-UI-S017] keeps reconciliation required when GetAgent reports a different model policy ref', async () => {
    const db = createTestD1Database();
    await applyClientMigration(db);
    const initializeAgent = vi.fn().mockRejectedValue(new Error('response lost'));
    const getAgent = vi.fn().mockResolvedValue({
      agent: { agentId: 'agent-policy-mismatch', displayName: 'Agent policy-mismatch' },
      config: { modelPolicyRef: 'different-policy' },
      defaultModelPolicy: { policyRef: 'different-policy' },
    });
    mocks.loadAgentRpcClients.mockResolvedValue({
      clients: createClients(initializeAgent, getAgent),
    });
    const { createManagedAgentRegistrationAttempt } =
      await import('../server/actions/managed-agent-registration-attempt');

    const outcome = await createManagedAgentRegistrationAttempt(
      db,
      createRequest('agent-policy-mismatch')
    );

    expect(outcome.state).toBe('reconciliation_required');
    expect(
      (await createManagedAgentRepository(db).getManagedAgent('agent-policy-mismatch'))
        ?.registrationState
    ).toBe('reconciliation_required');
  });

  it('[AGENT-MANAGEMENT-UI-S017] persists requested policy intent for a later reconciliation and never marks a mismatched policy active', async () => {
    const db = createTestD1Database();
    await applyClientMigration(db);
    const initializeAgent = vi.fn().mockRejectedValue(new Error('response lost'));
    const getAgent = vi
      .fn()
      .mockRejectedValueOnce(new Error('GetAgent temporarily unavailable'))
      .mockResolvedValueOnce({
        agent: { agentId: 'agent-persisted-policy', displayName: 'Agent persisted-policy' },
        config: { modelPolicyRef: 'different-policy' },
        defaultModelPolicy: { policyRef: 'different-policy' },
      });
    mocks.loadAgentRpcClients.mockResolvedValue({
      clients: createClients(initializeAgent, getAgent),
    });
    const { createManagedAgentRegistrationAttempt, reconcileManagedAgentRegistrationAttempt } =
      await import('../server/actions/managed-agent-registration-attempt');

    const created = await createManagedAgentRegistrationAttempt(
      db,
      createRequest('agent-persisted-policy')
    );
    const reconciled = await reconcileManagedAgentRegistrationAttempt(db, 'agent-persisted-policy');

    expect(created.state).toBe('reconciliation_required');
    expect(reconciled.state).toBe('reconciliation_required');
    expect(initializeAgent).toHaveBeenCalledTimes(1);
    expect(
      (await createManagedAgentRepository(db).getManagedAgent('agent-persisted-policy'))
        ?.registrationModelPolicyRef
    ).toBe('workers-ai-default');
  });
});

function createClients(
  initializeAgent: ReturnType<typeof vi.fn>,
  getAgent: ReturnType<typeof vi.fn>
) {
  return {
    invocation: {
      actingUser: { actingUserId: 'attempt-test-operator' },
      agentId: 'attempt-test-agent',
      correlationId: 'registration-correlation',
      requestId: 'registration-request',
      scopes: ['agent:write'],
    },
    lifecycle: { getAgent, initializeAgent },
    withErrorNormalization: async <T>(operation: () => Promise<T>): Promise<T> => await operation(),
  };
}

function createRequest(agentId: string) {
  return {
    registration: {
      agentId,
      agentRpcOrigin: 'https://agent.example.com',
      displayName: `Agent ${agentId.slice('agent-'.length)}`,
      displayOrder: 0,
      keyId: 'provider-key',
      maskedHint: 'ed25519:ab…12',
      modelPolicy: {
        maxOutputTokens: '1024',
        model: '@cf/meta/llama-3.1-8b-instruct',
        policyRef: 'workers-ai-default',
        provider: 'workers-ai' as const,
        temperature: '0.20',
        topP: '0.90',
      },
      publicFingerprint: 'sha256:provider-public',
      referenceValue: 'opaque:provider',
      status: 'active',
    },
    signing: {
      issuer: 'client-service',
      keyId: 'signing-key',
      publicFingerprint: 'sha256:signing',
    },
  };
}

function createNotFoundOperationError(): TamacSdkOperationError {
  return new TamacSdkOperationError({
    category: 'not_found',
    connectCode: Code.NotFound,
    operation: {
      agentId: 'agent-absent',
      correlationId: 'not-found-correlation',
      methodContext: {
        methodName: 'GetAgent',
        serviceName: 'cftamac.agent.v1.AgentLifecycleService',
      },
      requestId: 'not-found-request',
    },
    safeDetail: 'The requested Agent resource was not found.',
  });
}
