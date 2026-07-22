import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { codeToString } from '@connectrpc/connect/protocol-connect';
import { abortAllDurableObjects, reset, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';

import {
  GetAgentRequestSchema,
  GetAgentResponseSchema,
  InitializeAgentRequestSchema,
  InitializeAgentResponseSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { isAgentDomainError } from '../domain/errors';
import { handleAgentConnectRequest } from '../rpc/connect-worker-adapter';
import { mapAgentDomainErrorToConnectCode } from '../rpc/errors';

import type { AgentCoreRequestContext, AgentScopedQuery, InitializeAgentCommand } from '../domain';
import type { AgentWorkerEnv } from '../env';

const agentId = 'agent-initialization-receipt-test';
const principalId = 'principal-initialization-receipt-test';
const idempotencyKey = 'registration-attempt-1';
const registrationRequestDigest = 'sha256:registration-request-1';
const initializePath = '/cftamac.agent.v1.AgentLifecycleService/InitializeAgent';
const getAgentPath = '/cftamac.agent.v1.AgentLifecycleService/GetAgent';
const workerEnv = env as unknown as AgentWorkerEnv;
const lifecycleTables = [
  'agent_profile',
  'agent_config_versions',
  'agent_initialization_receipts',
  'agent_idempotency_records',
  'agent_credentials',
  'agent_audit_events',
  'agent_threads',
  'agent_thread_sections',
  'agent_model_policies',
  'agent_principals',
  'agent_grants',
] as const;

afterEach(async () => {
  // 各testのDurable Object SQLiteを完全に分離し、前testのreceiptやidempotencyを混入させません。
  await reset();
});

describe('Agent initialization receipt SQLite contract', () => {
  it('[AGENT-LIFECYCLE-S001] atomically stores profile config receipt and idempotency response in Agent SQLite', async () => {
    const requestBody = toBinary(InitializeAgentRequestSchema, createInitializeRequest());
    const response = await callAgentRpc(initializePath, requestBody);
    expect(response.status).toBe(200);
    const responseMessage = fromBinary(
      InitializeAgentResponseSchema,
      new Uint8Array(await response.arrayBuffer())
    );

    const snapshot = await readStorageSnapshot();
    expect(countRows(snapshot, 'agent_profile')).toBe(1);
    expect(countRows(snapshot, 'agent_config_versions')).toBe(1);
    expect(countRows(snapshot, 'agent_initialization_receipts')).toBe(1);
    expect(countRows(snapshot, 'agent_idempotency_records')).toBe(1);
    expect(responseMessage.initializationReceipt).toMatchObject({
      idempotencyKey,
      registrationRequestDigest,
    });
    expect(snapshot).toContain(registrationRequestDigest);
    expect(snapshot).toContain(idempotencyKey);
  });

  it('[AGENT-LIFECYCLE-S001] replays the same request with an immutable receipt and unchanged SQLite state', async () => {
    const requestBody = toBinary(InitializeAgentRequestSchema, createInitializeRequest());
    const firstResponse = await callAgentRpc(initializePath, requestBody);
    const beforeReplay = await readStorageSnapshot();
    const replayResponse = await callAgentRpc(initializePath, requestBody);
    const afterReplay = await readStorageSnapshot();

    expect(replayResponse.status).toBe(200);
    expect(new Uint8Array(await replayResponse.arrayBuffer())).toEqual(
      new Uint8Array(await firstResponse.arrayBuffer())
    );
    expect(afterReplay).toBe(beforeReplay);
  });

  it('[AGENT-LIFECYCLE-S010] rejects the same idempotency key with a different request digest without mutation', async () => {
    const stub = workerEnv.AI_AGENT.get(workerEnv.AI_AGENT.idFromName(agentId));
    const firstCommand = createDomainInitializeCommand({
      bodyDigest: 'sha256:wire-request-1',
      registrationRequestDigest,
    });
    await runInDurableObject(stub, (instance) => instance.initializeAgent(firstCommand));
    const beforeConflict = await readStorageSnapshot();
    const conflict = await runInDurableObject(stub, (instance) =>
      captureDomainError(() =>
        instance.initializeAgent(
          createDomainInitializeCommand({
            bodyDigest: 'sha256:wire-request-1',
            registrationRequestDigest: 'sha256:registration-request-2',
          })
        )
      )
    );
    const afterConflict = await readStorageSnapshot();

    expect(conflict).toMatchObject({ code: 'already_exists', kind: 'conflict' });
    expect(afterConflict).toBe(beforeConflict);
  });

  it('[AGENT-LIFECYCLE-S002] returns the persisted receipt through GetAgent dispatch and mapper after DO reinitialization', async () => {
    const initializeBody = toBinary(InitializeAgentRequestSchema, createInitializeRequest());
    await expect(callAgentRpc(initializePath, initializeBody)).resolves.toMatchObject({
      status: 200,
    });
    // instanceだけを破棄し、Agent-owned SQLiteを残したまま既存DO schema pathを再実行します。
    await abortAllDurableObjects();

    const getBody = toBinary(GetAgentRequestSchema, create(GetAgentRequestSchema, { agentId }));
    const response = await callAgentRpc(getAgentPath, getBody, 'agent.read');
    const responseMessage = fromBinary(
      GetAgentResponseSchema,
      new Uint8Array(await response.arrayBuffer())
    );

    expect(response.status).toBe(200);
    expect(responseMessage.initializationReceipt).toMatchObject({
      idempotencyKey,
      registrationRequestDigest,
    });
  });

  it('[AGENT-LIFECYCLE-S002] fails closed when an initialized Agent receipt row is missing', async () => {
    const initializeBody = toBinary(InitializeAgentRequestSchema, createInitializeRequest());
    await expect(callAgentRpc(initializePath, initializeBody)).resolves.toMatchObject({
      status: 200,
    });
    const stub = workerEnv.AI_AGENT.get(workerEnv.AI_AGENT.idFromName(agentId));
    await runInDurableObject(stub, (_instance, state) => {
      // profileを残したままreceiptだけを削除し、GetAgentのatomic invariantを壊した状態を実SQLiteへ作ります。
      state.storage.sql.exec(
        'DELETE FROM agent_initialization_receipts WHERE agent_id = ?',
        agentId
      );
    });

    const failure = await runInDurableObject(stub, (instance) =>
      captureDomainError(() => instance.getAgent(createDomainGetQuery()))
    );

    // receiptなしのprofileをdomainが成功responseへ写像せず、内部不変条件違反として拒否することを確認します。
    expect(failure).toMatchObject({ code: 'internal', kind: 'internal' });
  });

  it('[AGENT-LIFECYCLE-S001] fails closed when an idempotent Initialize replay receipt row is missing', async () => {
    const stub = workerEnv.AI_AGENT.get(workerEnv.AI_AGENT.idFromName(agentId));
    const command = createDomainInitializeCommand({
      bodyDigest: 'sha256:missing-replay-receipt-wire-request',
      registrationRequestDigest,
    });
    await runInDurableObject(stub, (instance) => instance.initializeAgent(command));
    await runInDurableObject(stub, (_instance, state) => {
      // idempotency recordを残してreceiptだけを削除し、replay専用の欠落receipt分岐を実SQLiteで作ります。
      state.storage.sql.exec(
        'DELETE FROM agent_initialization_receipts WHERE agent_id = ?',
        agentId
      );
    });

    const failure = await runInDurableObject(stub, (instance) =>
      captureDomainError(() => instance.initializeAgent(command))
    );

    expect(failure).toMatchObject({ code: 'internal', kind: 'internal' });
  });

  it('[AGENT-LIFECYCLE-S001] fails closed when the persisted receipt digest is tampered', async () => {
    const stub = workerEnv.AI_AGENT.get(workerEnv.AI_AGENT.idFromName(agentId));
    const command = createDomainInitializeCommand({
      bodyDigest: 'sha256:receipt-tamper-wire-request',
      registrationRequestDigest,
    });
    await runInDurableObject(stub, (instance) => instance.initializeAgent(command));
    await runInDurableObject(stub, (_instance, state) => {
      // SQLite上のreceipt証拠を改竄し、replayが別digestをactive確定に使わないことを検証します。
      state.storage.sql.exec(
        'UPDATE agent_initialization_receipts SET registration_request_digest = ? WHERE agent_id = ?',
        'sha256:tampered-receipt',
        agentId
      );
    });

    const conflict = await runInDurableObject(stub, (instance) =>
      captureDomainError(() => instance.initializeAgent(command))
    );

    expect(conflict).toMatchObject({ code: 'already_exists', kind: 'conflict' });
  });

  it('[AGENT-LIFECYCLE-S001] fails closed when the stored idempotency response receipt is tampered', async () => {
    const stub = workerEnv.AI_AGENT.get(workerEnv.AI_AGENT.idFromName(agentId));
    const command = createDomainInitializeCommand({
      bodyDigest: 'sha256:response-tamper-wire-request',
      registrationRequestDigest,
    });
    await runInDurableObject(stub, (instance) => instance.initializeAgent(command));
    await runInDurableObject(stub, (_instance, state) => {
      // idempotency responseRefだけを改竄し、receipt tableとの不一致をinternal fail-closedにします。
      state.storage.sql.exec(
        'UPDATE agent_idempotency_records SET response_ref = REPLACE(response_ref, ?, ?) WHERE agent_id = ?',
        registrationRequestDigest,
        'sha256:tampered-response',
        agentId
      );
    });

    const failure = await runInDurableObject(stub, (instance) =>
      captureDomainError(() => instance.initializeAgent(command))
    );

    expect(failure).toMatchObject({ code: 'internal', kind: 'internal' });
  });

  it('[AGENT-LIFECYCLE-S001] rolls back every initialization table when idempotency persistence fails', async () => {
    const stub = workerEnv.AI_AGENT.get(workerEnv.AI_AGENT.idFromName(agentId));
    await runInDurableObject(stub, (_instance, state) => {
      // transaction末尾のidempotency insertをSQLite triggerで中断し、先行mutationがrollbackされることを実証します。
      state.storage.sql.exec(`
        CREATE TRIGGER initialization_receipt_test_abort_idempotency
        BEFORE INSERT ON agent_idempotency_records
        BEGIN
          SELECT RAISE(ABORT, 'initialization receipt rollback test');
        END
      `);
    });
    const failure = await runInDurableObject(stub, (instance) => {
      try {
        instance.initializeAgent(
          createDomainInitializeCommand({
            bodyDigest: 'sha256:rollback-wire-request',
            registrationRequestDigest,
          })
        );
        return false;
      } catch {
        return true;
      }
    });
    const snapshot = await readStorageSnapshot();

    expect(failure).toBe(true);
    for (const table of lifecycleTables) {
      expect(countRows(snapshot, table)).toBe(0);
    }
  });

  it('[AGENT-LIFECYCLE-S001] rejects missing and whitespace digest before any SQLite mutation', async () => {
    const stub = workerEnv.AI_AGENT.get(workerEnv.AI_AGENT.idFromName(agentId));
    const missingDigest = await runInDurableObject(stub, (instance) =>
      captureDomainError(() =>
        instance.initializeAgent(
          createDomainInitializeCommand({
            bodyDigest: 'sha256:missing-digest-request',
            registrationRequestDigest: '',
          })
        )
      )
    );
    const whitespaceDigest = await runInDurableObject(stub, (instance) =>
      captureDomainError(() =>
        instance.initializeAgent(
          createDomainInitializeCommand({
            bodyDigest: 'sha256:whitespace-digest-request',
            registrationRequestDigest: '   ',
          })
        )
      )
    );

    expect(missingDigest).toMatchObject({ code: 'invalid_argument', kind: 'validation' });
    expect(whitespaceDigest).toMatchObject({ code: 'invalid_argument', kind: 'validation' });
    const snapshot = await readStorageSnapshot();
    for (const table of lifecycleTables) {
      expect(countRows(snapshot, table)).toBe(0);
    }
  });
});

function createInitializeRequest(overrides: { readonly registrationRequestDigest?: string } = {}) {
  // requestはgenerated Protobuf descriptorから作り、RPC wire digestと必須digest fieldを同時に固定します。
  const baseRequest = {
    agentId,
    credentialPolicy: {
      agentId,
      overlapSeconds: 300,
      publicFingerprint: 'fingerprint-initialization-receipt-test',
      requestedGeneration: 1,
      revokePrevious: false,
      verifierMaterialRef: 'verifier://initialization-receipt-test',
    },
    idempotencyKey,
  };
  if (Object.hasOwn(overrides, 'registrationRequestDigest')) {
    return create(InitializeAgentRequestSchema, {
      ...baseRequest,
      registrationRequestDigest: overrides.registrationRequestDigest,
    });
  }
  return create(InitializeAgentRequestSchema, {
    ...baseRequest,
    registrationRequestDigest,
  });
}

function createDomainInitializeCommand(input: {
  readonly bodyDigest: string;
  readonly registrationRequestDigest: string;
}): InitializeAgentCommand {
  // direct domain testでもRPCと同じAgent-scoped principal、body digest、idempotency identityを固定します。
  const context: AgentCoreRequestContext = {
    agentId,
    bodyDigest: { algorithm: 'sha-256', byteLength: 1, digestHex: input.bodyDigest },
    idempotencyKey,
    method: 'InitializeAgent',
    principal: {
      agentId,
      principalId,
      principalType: 'CLIENT_SERVICE',
      scopes: ['agent.rpc', 'agent.lifecycle'],
    },
    requestedAtMs: 1_700_000_000_000,
    service: 'cftamac.agent.v1.AgentLifecycleService',
  };
  return {
    context,
    credential: {
      credentialId: 'credential-initialization-receipt-test',
      generation: 1,
      publicFingerprint: 'fingerprint-initialization-receipt-test',
      verifierMaterialRef: 'verifier://initialization-receipt-test',
    },
    initialConfig: {},
    registrationRequestDigest: input.registrationRequestDigest,
  };
}

function createDomainGetQuery(): AgentScopedQuery {
  // GetAgentのfail-closed testでも、実RPCで使うAgent scopeとread scopeをdomainへ渡します。
  return {
    context: {
      agentId,
      bodyDigest: { algorithm: 'sha-256', byteLength: 1, digestHex: 'sha256:get-agent-query' },
      method: 'GetAgent',
      principal: {
        agentId,
        principalId,
        principalType: 'CLIENT_SERVICE',
        scopes: ['agent.rpc', 'agent.read'],
      },
      requestedAtMs: 1_700_000_000_000,
      service: 'cftamac.agent.v1.AgentLifecycleService',
    },
  };
}

function captureDomainError(
  operation: () => unknown
): { readonly code: string; readonly kind: string } | { readonly kind: 'no_error' } {
  // domain errorをDO境界内で安全な分類値へ変換し、storage内容やstackをテスト結果へ返しません。
  try {
    operation();
    return { kind: 'no_error' };
  } catch (error) {
    if (!isAgentDomainError(error)) return { code: 'unknown', kind: 'unknown' };
    return { code: codeToString(mapAgentDomainErrorToConnectCode(error)), kind: error.kind };
  }
}

async function callAgentRpc(path: string, body: Uint8Array, scope = 'agent.lifecycle') {
  // test-only principal seamをRPC adapterへ明示的に許可し、本番のJWT trust boundaryを迂回しません。
  return handleAgentConnectRequest(
    new Request(`https://agent.example.test${path}`, {
      body,
      headers: {
        'Content-Type': 'application/proto',
        'x-agent-test-grant': 'allow',
        'x-agent-test-agent-id': agentId,
        'x-agent-test-principal-id': principalId,
        'x-agent-test-scopes': `agent:read,agent:write,agent.rpc,${scope}`,
      },
      method: 'POST',
    }),
    workerEnv,
    { allowTestSeam: true }
  );
}

async function readStorageSnapshot(): Promise<string> {
  const stub = workerEnv.AI_AGENT.get(workerEnv.AI_AGENT.idFromName(agentId));
  return runInDurableObject(stub, (_instance, state) => {
    // 各tableの実SQLite行を同じDO stateから読み、repository/domain/RPC処理のpostconditionを観測します。
    return JSON.stringify(
      lifecycleTables.map((table) => [
        table,
        state.storage.sql.exec(`SELECT * FROM ${table} WHERE agent_id = ?`, agentId).toArray(),
      ])
    );
  });
}

function countRows(snapshot: string, table: (typeof lifecycleTables)[number]): number {
  // snapshotは対象tableを一つずつ保持するため、該当配列の行数を直接確認します。
  const entries = JSON.parse(snapshot) as readonly [string, readonly unknown[]][];
  return entries.find(([name]) => name === table)?.[1].length ?? 0;
}
