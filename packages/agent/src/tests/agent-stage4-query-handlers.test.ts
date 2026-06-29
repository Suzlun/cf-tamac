import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { describe, expect, it } from 'vitest';

import {
  GetLatestCompactionRequestSchema,
  GetLatestCompactionResponseSchema,
  GetThreadMemoryRequestSchema,
  GetThreadMemoryResponseSchema,
  SearchThreadHistoryRequestSchema,
  SearchThreadHistoryResponseSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { buildHarnessContextFromRepositories } from '../harness';
import { handleAgentConnectRequest } from '../rpc/connect-worker-adapter';
import { createImmutableRunSnapshot } from '../runs';
import {
  getLatestCompactionFromStore,
  getThreadMemoryFromStore,
  searchThreadHistoryFromStore,
} from '../threads';

import { testControlPlaneTrustConfig } from './test-control-plane-trust';

import type { AIAgent } from '../AIAgent';
import type {
  AgentCoreRequestContext,
  GetAgentThreadMemoryQuery,
  GetLatestAgentThreadCompactionQuery,
  SearchAgentThreadHistoryQuery,
} from '../domain';
import type { AgentWorkerEnv } from '../env';
import type {
  AgentConfigRow,
  AgentEventRow,
  AgentGrantRow,
  AgentHistoryIndexRow,
  AgentModelPolicyRow,
  AgentProfileRow,
  AgentRunInputSnapshotRow,
  AgentRunRow,
  AgentStorageRepositories,
  AgentThreadCompactionRow,
  AgentThreadMemoryItemRow,
  AgentThreadMemoryVersionRow,
  AgentThreadRow,
  CreateAgentRunInputSnapshotInput,
} from '../storage';

const agentId = 'agent-alpha';
const threadId = 'thread-a';
const otherThreadId = 'thread-b';
const principalId = 'principal-query';
const baseUrl = 'https://agent.example.test';
const latestPath = '/cftamac.agent.v1.AgentThreadService/GetLatestCompaction';
const memoryPath = '/cftamac.agent.v1.AgentThreadService/GetThreadMemory';
const historyPath = '/cftamac.agent.v1.AgentThreadService/SearchThreadHistory';
const readyLatestDigest = 'b'.repeat(64);
const readyHistoryDigest = 'd'.repeat(64);

describe('Agent Stage 4 Thread memory/history query handlers', () => {
  it('[AGENT-MEMORY-S004] Context Builder resumes from latest ready compaction and raw Events', () => {
    const runtime = new Stage4QueryRuntime();
    const run = createRun('run-s004', threadId, 'event-after-ready-4', 'pending', 640);

    const snapshot = createImmutableRunSnapshot({
      agentId,
      nowMs: 700,
      repositories: runtime.repositories,
      run,
    });
    const bundle = buildHarnessContextFromRepositories({
      agentId,
      policy: {
        handoffRef: snapshot.latestReadyCompactionRef ?? undefined,
        identity: 'Agent Alpha identity',
        policy: 'Use scoped latest-ready memory only.',
        retrievedHistoryRefs: ['history://history-ready-latest'],
        threadMemoryText: 'ThreadMemory version 2',
      },
      repositories: runtime.repositories,
      snapshot,
    });

    const uncompacted = bundle.parts.find((part) => part.kind === 'uncompacted_events');

    expect(snapshot).toMatchObject({
      latestReadyCompactionRef: 'snapshot://compaction-ready-latest',
      threadMemoryRef: 'thread-memory://thread-a/v2',
      threadMemoryVersion: 2,
      triggerEventStartSequence: 4,
      uncompactedUpperSequence: 5,
    });
    expect(uncompacted?.events?.map((event) => event.eventId)).toEqual([
      'event-after-ready-4',
      'event-after-ready-5',
    ]);
    expect(JSON.stringify({ bundle, snapshot })).not.toMatch(
      /snapshot:\/\/compaction-(?:running|failed)|history:\/\/history-(?:running|failed)/
    );
  });

  it('[AGENT-MEMORY-S008] Thread memory and history queries return scoped references', async () => {
    const runtime = new Stage4QueryRuntime();
    const { env, routedNames } = createTestEnv(runtime);

    const latestResponse = await callGetLatestCompaction(env);
    const memoryResponse = await callGetThreadMemory(env);
    const historyResponse = await callSearchThreadHistory(env);

    expect(latestResponse.compaction).toMatchObject({
      agentId,
      compactionId: 'compaction-ready-latest',
      digestSha256: readyLatestDigest,
      sectionId: 'section-ready-latest',
      status: 'ready',
      threadId,
    });
    expect(latestResponse.snapshot).toMatchObject({
      agentId,
      compactionId: 'compaction-ready-latest',
      digestSha256: readyLatestDigest,
      snapshotRef: 'snapshot://compaction-ready-latest',
      threadId,
    });

    expect(memoryResponse.memory).toMatchObject({
      agentId,
      itemCount: 2,
      latestCompactionId: 'compaction-ready-latest',
      memoryId: 'thread-memory://thread-a/v2',
      rebaseStatus: 'rebased',
      threadId,
      version: '2',
    });
    expect(memoryResponse.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          memoryItemId: 'memory-revised-policy',
          provenanceRef: 'history:history-ready-latest#policy',
          status: 'active',
          supersedesItemId: 'memory-old-policy',
        }),
        expect.objectContaining({
          memoryItemId: 'memory-invalidated-rest',
          provenanceRef: 'history:history-ready-latest#rest-invalid',
          status: 'invalidated',
        }),
      ])
    );

    expect(historyResponse.results.map((result) => result.historyId)).toEqual([
      'history-ready-old',
      'history-ready-latest',
    ]);
    expect(historyResponse.page).toMatchObject({
      cursorScope: 'agent-alpha:thread-a:history',
      resultCount: 2,
    });
    expect(historyResponse.results[1]).toMatchObject({
      agentId,
      body: {
        byteSize: 2048n,
        ref: 'r2://agents/agent-alpha/threads/thread-a/compactions/compaction-ready-latest/history/history-ready-latest.json',
        sha256: readyHistoryDigest,
        storageClass: 'r2',
      },
      compactionId: 'compaction-ready-latest',
      provenanceRef: 'policy://memory/query#latest',
      sectionId: 'section-ready-latest',
      threadId,
    });
    expect(historyResponse.results[1]?.body).not.toHaveProperty('inlineBytes');
    expect(
      stringifyForExpectation({ historyResponse, latestResponse, memoryResponse })
    ).not.toMatch(
      /compaction-(?:running|failed|cancelled)|history-(?:running|failed|other-agent)|agent-beta/
    );
    expect(routedNames).toEqual([agentId, agentId, agentId]);

    const denseRuntime = new Stage4QueryRuntime({ denseNonReadyHistory: true });
    const denseHistory = searchThreadHistoryFromStore({
      agentId,
      query: {
        context: createQueryContext('SearchThreadHistory'),
        pageSize: 1,
        provenanceContains: 'policy://memory/query#latest',
        query: 'customer',
        sectionId: 'section-ready-latest',
        threadId,
      },
      repositories: denseRuntime.repositories,
    });
    expect(denseHistory.results.map((result) => result.historyId)).toEqual([
      'history-ready-latest',
    ]);

    const destroyedRuntime = new Stage4QueryRuntime({ lifecycleStatus: 'destroyed' });
    expect(
      getLatestCompactionFromStore({
        agentId,
        query: { context: createQueryContext('GetLatestCompaction'), threadId },
        repositories: destroyedRuntime.repositories,
      }).compaction?.compactionId
    ).toBe('compaction-ready-latest');
    expect(
      getThreadMemoryFromStore({
        agentId,
        query: { context: createQueryContext('GetThreadMemory'), threadId },
        repositories: destroyedRuntime.repositories,
      }).memory?.memoryId
    ).toBe('thread-memory://thread-a/v2');
    expect(
      searchThreadHistoryFromStore({
        agentId,
        query: { context: createQueryContext('SearchThreadHistory'), pageSize: 1, threadId },
        repositories: destroyedRuntime.repositories,
      }).results
    ).toHaveLength(1);
  });
});

interface Stage4QueryRuntimeOptions {
  readonly denseNonReadyHistory?: boolean;
  readonly lifecycleStatus?: string;
}

class Stage4QueryRuntime {
  private readonly compactions = createCompactionRows();
  private readonly events = createEventRows();
  private readonly histories: AgentHistoryIndexRow[];
  private readonly lifecycleStatus: string;
  private readonly memoryItems = createMemoryItemRows();
  private readonly memoryVersions = createMemoryVersionRows();
  private readonly snapshots = [createPreviousSnapshot()];
  private readonly threads = createThreadRows();
  readonly repositories: AgentStorageRepositories;

  constructor(options: Stage4QueryRuntimeOptions = {}) {
    this.histories = createHistoryRows(options.denseNonReadyHistory ?? false);
    this.lifecycleStatus = options.lifecycleStatus ?? 'active';
    this.repositories = this.createRepositories();
  }

  createStub(routedAgentId: string): DurableObjectStub<AIAgent> {
    // fake Durable Object stub は public RPC service handler から DO method へ渡る query seam だけを実行します。
    return {
      getLatestCompaction: (query: GetLatestAgentThreadCompactionQuery) =>
        getLatestCompactionFromStore({
          agentId: routedAgentId,
          query,
          repositories: this.repositories,
        }),
      getThreadMemory: (query: GetAgentThreadMemoryQuery) =>
        getThreadMemoryFromStore({
          agentId: routedAgentId,
          query,
          repositories: this.repositories,
        }),
      searchThreadHistory: (query: SearchAgentThreadHistoryQuery) =>
        searchThreadHistoryFromStore({
          agentId: routedAgentId,
          query,
          repositories: this.repositories,
        }),
    } as unknown as DurableObjectStub<AIAgent>;
  }

  private createRepositories(): AgentStorageRepositories {
    let repositories = undefined as unknown as AgentStorageRepositories;
    repositories = {
      compactions: this.createCompactionsRepository(),
      config: { getLatestConfig: () => createConfig(), tableName: 'agent_config_versions' },
      credentials: { findCredential: () => undefined, tableName: 'agent_credentials' },
      events: this.createEventsRepository(),
      grants: { listGrantsForPrincipal: () => createGrantRows(), tableName: 'agent_grants' },
      history: this.createHistoryRepository(),
      memory: this.createMemoryRepository(),
      modelPolicies: {
        getActivePolicy: (policyRef: string) => createModelPolicy(policyRef),
        tableName: 'agent_model_policies',
      },
      pendingRuns: this.createPendingRunsRepository(),
      profile: {
        getProfile: () => createProfile(this.lifecycleStatus),
        tableName: 'agent_profile',
      },
      threads: this.createThreadsRepository(),
      transaction<T>(operation: (transactionRepositories: AgentStorageRepositories) => T): T {
        return operation(repositories);
      },
    } as unknown as AgentStorageRepositories;
    return repositories;
  }

  private createCompactionsRepository() {
    return {
      findByCompactionId: (compactionId: string) =>
        this.compactions.find((compaction) => compaction.compactionId === compactionId),
      findLatestReadyCompaction: (targetThreadId: string) =>
        this.compactions
          .filter(
            (compaction) => compaction.threadId === targetThreadId && compaction.status === 'ready'
          )
          .sort((left, right) => right.compactionOrdinal - left.compactionOrdinal)[0],
      tableName: 'agent_thread_compactions' as const,
    };
  }

  private createEventsRepository() {
    return {
      findByEventId: (eventId: string) => this.events.find((event) => event.eventId === eventId),
      findLatestForThread: (targetThreadId: string) =>
        this.events
          .filter((event) => event.threadId === targetThreadId)
          .sort((left, right) => right.threadSequence - left.threadSequence)[0],
      listEvents: (input: {
        readonly afterThreadSequence?: number;
        readonly limit: number;
        readonly threadId: string;
      }) =>
        this.events
          .filter((event) => event.threadId === input.threadId)
          .filter((event) => event.threadSequence > (input.afterThreadSequence ?? 0))
          .sort((left, right) => left.threadSequence - right.threadSequence)
          .slice(0, input.limit),
      tableName: 'agent_events' as const,
    };
  }

  private createHistoryRepository() {
    return {
      searchHistoryIndexes: (input: {
        readonly afterCreatedAtMs?: number;
        readonly afterHistoryId?: string;
        readonly compactionId?: string;
        readonly endCreatedAtMs?: number;
        readonly limit: number;
        readonly provenanceContains?: string;
        readonly query?: string;
        readonly sectionId?: string;
        readonly startCreatedAtMs?: number;
        readonly threadId: string;
      }) =>
        this.histories
          .filter((history) => history.threadId === input.threadId)
          .filter((history) => matchesHistoryCursor(history, input))
          .filter(
            (history) =>
              input.compactionId === undefined || history.compactionId === input.compactionId
          )
          .filter(
            (history) => input.sectionId === undefined || history.sectionId === input.sectionId
          )
          .filter(
            (history) =>
              input.startCreatedAtMs === undefined || history.createdAtMs >= input.startCreatedAtMs
          )
          .filter(
            (history) =>
              input.endCreatedAtMs === undefined || history.createdAtMs <= input.endCreatedAtMs
          )
          .filter(
            (history) =>
              input.query === undefined || (history.queryText ?? '').includes(input.query)
          )
          .filter(
            (history) =>
              input.provenanceContains === undefined ||
              (history.provenanceRef ?? '').includes(input.provenanceContains)
          )
          .sort(
            (left, right) =>
              left.createdAtMs - right.createdAtMs || left.historyId.localeCompare(right.historyId)
          )
          .slice(0, input.limit),
      tableName: 'agent_history_indexes' as const,
    };
  }

  private createMemoryRepository() {
    return {
      findActiveThreadMemoryVersion: (targetThreadId: string) =>
        this.memoryVersions
          .filter((memory) => memory.threadId === targetThreadId && memory.status === 'active')
          .sort((left, right) => right.version - left.version)[0],
      listThreadMemoryItems: (targetThreadId: string, memoryId: string) =>
        this.memoryItems
          .filter((item) => item.threadId === targetThreadId && item.memoryId === memoryId)
          .sort((left, right) => left.createdAtMs - right.createdAtMs),
      tableName: 'agent_thread_memory_versions' as const,
    };
  }

  private createPendingRunsRepository() {
    return {
      createRunInputSnapshot: (input: CreateAgentRunInputSnapshotInput) => {
        const row: AgentRunInputSnapshotRow = { ...input };
        this.snapshots.push(row);
        return row;
      },
      findLatestRunInputSnapshotForThread: (targetThreadId: string) =>
        this.snapshots
          .filter((snapshot) => snapshot.threadId === targetThreadId)
          .sort((left, right) => right.createdAtMs - left.createdAtMs)[0],
      findRunInputSnapshot: (runId: string) =>
        this.snapshots.find((snapshot) => snapshot.runId === runId),
      tableName: 'agent_run_inputs' as const,
    };
  }

  private createThreadsRepository() {
    return {
      findByThreadId: (targetThreadId: string) =>
        this.threads.find((thread) => thread.threadId === targetThreadId),
      tableName: 'agent_threads' as const,
    };
  }
}

function createTestEnv(runtime: Stage4QueryRuntime): {
  readonly env: AgentWorkerEnv;
  readonly routedNames: string[];
} {
  const routedNames: string[] = [];
  return {
    env: {
      AGENT_BLOBS: {} as R2Bucket,
      AGENT_CONTROL_PLANE_TRUST: testControlPlaneTrustConfig,
      AGENT_INTEGRATION_SIGNATURE_KEYS: 'test-integration-key',
      AGENT_MODEL_PROVIDER_SECRET_REFS: 'test-model-secret',
      AGENT_RPC_AUDIENCE: 'test-audience',
      AI_AGENT: {
        get: (id: DurableObjectId) => runtime.createStub((id as { readonly name: string }).name),
        idFromName: (name: string) => {
          routedNames.push(name);
          return { name } as unknown as DurableObjectId;
        },
      } as unknown as DurableObjectNamespace<AIAgent>,
    },
    routedNames,
  };
}

async function callGetLatestCompaction(env: AgentWorkerEnv) {
  const response = await handleAgentConnectRequest(
    createRpcRequest(
      latestPath,
      toBinary(
        GetLatestCompactionRequestSchema,
        create(GetLatestCompactionRequestSchema, { agentId, threadId })
      )
    ),
    env
  );
  expect(response.status).toBe(200);
  return fromBinary(
    GetLatestCompactionResponseSchema,
    new Uint8Array(await response.arrayBuffer())
  );
}

async function callGetThreadMemory(env: AgentWorkerEnv) {
  const response = await handleAgentConnectRequest(
    createRpcRequest(
      memoryPath,
      toBinary(
        GetThreadMemoryRequestSchema,
        create(GetThreadMemoryRequestSchema, { agentId, threadId })
      )
    ),
    env
  );
  expect(response.status).toBe(200);
  return fromBinary(GetThreadMemoryResponseSchema, new Uint8Array(await response.arrayBuffer()));
}

async function callSearchThreadHistory(env: AgentWorkerEnv) {
  const response = await handleAgentConnectRequest(
    createRpcRequest(
      historyPath,
      toBinary(
        SearchThreadHistoryRequestSchema,
        create(SearchThreadHistoryRequestSchema, {
          agentId,
          filter: {
            provenanceContains: 'policy://memory/query',
            timeRange: { endUnixMs: 350n, startUnixMs: 50n },
          },
          page: { pageSize: 5 },
          query: 'customer',
          threadId,
        })
      )
    ),
    env
  );
  expect(response.status).toBe(200);
  return fromBinary(
    SearchThreadHistoryResponseSchema,
    new Uint8Array(await response.arrayBuffer())
  );
}

function createRpcRequest(path: string, body: Uint8Array): Request {
  return new Request(`${baseUrl}${path}`, {
    body,
    headers: {
      'Content-Type': 'application/proto',
      'x-agent-test-agent-id': agentId,
      'x-agent-test-principal-id': principalId,
      'x-agent-test-scopes': 'agent:read,agent.rpc,agent.read',
    },
    method: 'POST',
  });
}

function createQueryContext(method: string): AgentCoreRequestContext {
  return {
    agentId,
    bodyDigest: { algorithm: 'sha-256', byteLength: 10, digestHex: `${method}-digest` },
    method,
    principal: {
      agentId,
      principalId,
      principalType: 'CLIENT_SERVICE',
      scopes: ['agent.rpc', 'agent.read'],
    },
    requestedAtMs: 1_700_000_300_000,
    service: 'cftamac.agent.v1.AgentThreadService',
  };
}

function createProfile(lifecycleStatus = 'active'): AgentProfileRow {
  return {
    agentId,
    configVersion: 7,
    createdAtMs: 1,
    credentialGeneration: 1,
    displayName: 'Agent Alpha',
    lifecycleStatus,
    systemThreadId: 'thread-system',
    updatedAtMs: 2,
  };
}

function createConfig(): AgentConfigRow {
  return {
    budgetPolicyRef: 'budget-policy-safe',
    configBodyRef: 'config://agent-alpha/current',
    configVersion: 7,
    displayName: 'Agent Alpha',
    memoryPolicyRef: 'memory-policy-safe',
    modelPolicyRef: 'model-policy-safe',
    schedulePolicyRef: 'schedule-policy-safe',
    toolPolicyRef: 'tool-policy-safe',
    updatedAtMs: 2,
    updatedByPrincipalId: principalId,
  };
}

function createModelPolicy(policyRef: string): AgentModelPolicyRow {
  return {
    archivedAtMs: null,
    budgetMetadataRef: null,
    budgetMetadataSha256: null,
    createdAtMs: 2,
    createdByPrincipalId: principalId,
    credentialRef: null,
    decisionSchemaVersion: 'agent-decision-v1',
    generationMaxOutputTokens: null,
    generationParametersRef: null,
    generationParametersSha256: null,
    generationTemperature: null,
    generationTopP: null,
    modelId: '@cf/meta/llama-3.1-8b-instruct',
    policyDigest: 'f'.repeat(64),
    policyRef,
    provider: 'workers-ai',
    safeMetadataRef: null,
    safeMetadataSha256: null,
    safetyMetadataRef: null,
    safetyMetadataSha256: null,
    status: 'active',
    updatedAtMs: 3,
    updatedByPrincipalId: principalId,
    validatedAtMs: 3,
    version: 1,
  };
}

function createGrantRows(): AgentGrantRow[] {
  return ['agent.rpc', 'agent.read'].map((capability, index) => ({
    capability,
    createdAtMs: index,
    grantId: `${principalId}:${capability}`,
    principalId,
    scopeRef: null,
    status: 'active',
    updatedAtMs: index,
  }));
}

function createThreadRows(): AgentThreadRow[] {
  return [createThread(threadId, 'customer:alpha'), createThread(otherThreadId, 'customer:beta')];
}

function createThread(targetThreadId: string, threadKey: string): AgentThreadRow {
  return {
    createdAtMs: 10,
    currentSectionId: 'section-open',
    lastServedAtMs: null,
    normalizedThreadKey: threadKey,
    priority: 0,
    status: 'active',
    threadId: targetThreadId,
    threadKey,
    updatedAtMs: 20,
  };
}

function createCompactionRows(): AgentThreadCompactionRow[] {
  return [
    createCompaction(
      'compaction-ready-old',
      'ready',
      1,
      'section-ready-old',
      'snapshot://compaction-ready-old',
      'a'.repeat(64)
    ),
    createCompaction(
      'compaction-ready-latest',
      'ready',
      3,
      'section-ready-latest',
      'snapshot://compaction-ready-latest',
      readyLatestDigest
    ),
    createCompaction(
      'compaction-running',
      'running',
      4,
      'section-running',
      'snapshot://compaction-running',
      'c'.repeat(64)
    ),
    createCompaction(
      'compaction-failed',
      'failed',
      5,
      'section-failed',
      'snapshot://compaction-failed',
      'e'.repeat(64)
    ),
    createCompaction(
      'compaction-other-agent-thread',
      'ready',
      1,
      'section-other',
      'snapshot://agent-beta/history-other-agent',
      'f'.repeat(64),
      otherThreadId
    ),
  ];
}

function createCompaction(
  compactionId: string,
  status: string,
  ordinal: number,
  sectionId: string,
  outputRef: string,
  digestSha256: string,
  targetThreadId = threadId
): AgentThreadCompactionRow {
  return {
    archiveRef: null,
    completedAtMs: status === 'ready' || status === 'failed' ? ordinal * 100 : null,
    compactionId,
    compactionOrdinal: ordinal,
    createdAtMs: ordinal * 100,
    digestSha256,
    endThreadSequence: ordinal,
    errorCode: status === 'failed' ? 'model_error' : null,
    errorMessage: status === 'failed' ? 'safe failure detail' : null,
    handoffRef: `handoff://${compactionId}`,
    historyRef: `history://${compactionId}`,
    memoryDeltaRef: `memory-delta://${compactionId}`,
    outputRef,
    provenanceRef: `policy://memory/query#${compactionId}`,
    r2ObjectRef: null,
    sectionId,
    sectionOrdinal: ordinal,
    startedAtMs: ordinal * 100 - 1,
    startThreadSequence: ordinal,
    status,
    threadId: targetThreadId,
    updatedAtMs: ordinal * 100,
  };
}

function createMemoryVersionRows(): AgentThreadMemoryVersionRow[] {
  return [
    {
      createdAtMs: 100,
      itemCount: 1,
      latestCompactionId: 'compaction-ready-old',
      memoryId: 'thread-memory://thread-a/v1',
      memoryRef: 'thread-memory://thread-a/v1',
      provenanceRef: 'policy://memory/query#old',
      rebaseStatus: null,
      snapshotRef: 'memory-delta://old',
      status: 'superseded',
      threadId,
      updatedAtMs: 100,
      version: 1,
    },
    {
      createdAtMs: 300,
      itemCount: 2,
      latestCompactionId: 'compaction-ready-latest',
      memoryId: 'thread-memory://thread-a/v2',
      memoryRef: 'thread-memory://thread-a/v2',
      provenanceRef: 'policy://memory/query#latest',
      rebaseStatus: 'rebased',
      snapshotRef: 'memory-delta://latest',
      status: 'active',
      threadId,
      updatedAtMs: 320,
      version: 2,
    },
  ];
}

function createMemoryItemRows(): AgentThreadMemoryItemRow[] {
  return [
    createMemoryItem(
      'memory-revised-policy',
      'active',
      'memory-old-policy',
      'history:history-ready-latest#policy'
    ),
    createMemoryItem(
      'memory-invalidated-rest',
      'invalidated',
      null,
      'history:history-ready-latest#rest-invalid'
    ),
  ];
}

function createMemoryItem(
  memoryItemId: string,
  status: string,
  supersedesItemId: string | null,
  provenanceRef: string
): AgentThreadMemoryItemRow {
  return {
    contentRef: null,
    contentSha256: null,
    contentText: null,
    createdAtMs: 310,
    invalidatesItemId: status === 'invalidated' ? 'memory-rest-route' : null,
    memoryId: 'thread-memory://thread-a/v2',
    memoryItemId,
    provenanceRef,
    sourceCompactionId: 'compaction-ready-latest',
    sourceEventId: 'event-after-ready-4',
    sourceHistoryId: 'history-ready-latest',
    status,
    supersedesItemId,
    threadId,
    updatedAtMs: 320,
  };
}

function createHistoryRows(denseNonReadyHistory: boolean): AgentHistoryIndexRow[] {
  const denseRows = denseNonReadyHistory
    ? Array.from({ length: 30 }, (_unused, index) =>
        createHistory(
          `history-running-dense-${String(index).padStart(2, '0')}`,
          'compaction-running',
          120 + index,
          'section-ready-latest',
          'policy://memory/query#latest',
          'c'.repeat(64)
        )
      )
    : [];
  return [
    createHistory(
      'history-ready-old',
      'compaction-ready-old',
      100,
      'section-ready-old',
      'policy://memory/query#old',
      'a'.repeat(64)
    ),
    ...denseRows,
    createHistory(
      'history-ready-latest',
      'compaction-ready-latest',
      200,
      'section-ready-latest',
      'policy://memory/query#latest',
      readyHistoryDigest
    ),
    createHistory(
      'history-running',
      'compaction-running',
      250,
      'section-running',
      'policy://memory/query#running',
      'c'.repeat(64)
    ),
    createHistory(
      'history-failed',
      'compaction-failed',
      300,
      'section-failed',
      'policy://memory/query#failed',
      'e'.repeat(64)
    ),
    createHistory(
      'history-other-agent',
      'compaction-other-agent-thread',
      150,
      'section-other',
      'policy://memory/query#other-agent',
      'f'.repeat(64),
      otherThreadId
    ),
  ];
}

function createHistory(
  historyId: string,
  compactionId: string,
  createdAtMs: number,
  sectionId: string,
  provenanceRef: string,
  bodySha256: string,
  targetThreadId = threadId
): AgentHistoryIndexRow {
  return {
    bodyByteSize: 2048,
    bodyContentType: 'application/json',
    bodyRef: `r2://agents/agent-alpha/threads/${targetThreadId}/compactions/${compactionId}/history/${historyId}.json`,
    bodySha256,
    bodyStorageClass: 'r2',
    compactionId,
    createdAtMs,
    endThreadSequence: createdAtMs / 100,
    historyId,
    historyRef: `history://${historyId}`,
    provenanceRef,
    queryText: `customer alpha decision trace ${historyId}`,
    retentionStatus: 'active',
    sectionId,
    startThreadSequence: createdAtMs / 100,
    summary: `summary for ${historyId}`,
    threadId: targetThreadId,
  };
}

function createEventRows(): AgentEventRow[] {
  return [
    createEvent('event-before-ready-3', 3),
    createEvent('event-after-ready-4', 4),
    createEvent('event-after-ready-5', 5),
  ];
}

function createEvent(eventId: string, sequence: number): AgentEventRow {
  return {
    agentSequence: sequence,
    causationId: null,
    correlationId: null,
    createdAtMs: sequence * 100,
    eventId,
    eventType: 'user.message.received',
    idempotencyKey: `event-idem-${String(sequence)}`,
    normalizedThreadKey: 'customer:alpha',
    occurredAtMs: sequence * 100,
    payloadByteSize: null,
    payloadContentType: null,
    payloadInlineBase64: null,
    payloadRef: null,
    payloadSha256: null,
    payloadStorageClass: null,
    requestDigest: 'digest',
    runId: `run-${String(sequence)}`,
    sectionId: sequence <= 3 ? 'section-ready-latest' : 'section-open',
    source: 'client',
    threadId,
    threadKey: 'customer:alpha',
    threadSequence: sequence,
  };
}

function createRun(
  runId: string,
  targetThreadId: string,
  triggerEventId: string,
  status: string,
  createdAtMs: number
): AgentRunRow {
  return {
    createdAtMs,
    lastServedAtMs: null,
    pendingSinceMs: createdAtMs,
    priority: 0,
    runId,
    status,
    threadId: targetThreadId,
    triggerEventId,
    updatedAtMs: createdAtMs,
  };
}

function createPreviousSnapshot(): AgentRunInputSnapshotRow {
  return {
    configVersion: 7,
    createdAtMs: 500,
    integrationVersion: 0,
    latestReadyCompactionRef: 'snapshot://compaction-ready-old',
    runId: 'run-before-ready',
    snapshotRef: 'agent-run-snapshot://agent-alpha/run-before-ready',
    threadId,
    threadMemoryRef: 'thread-memory://thread-a/v1',
    threadMemoryVersion: 1,
    toolSetVersion: 0,
    triggerEventEndSequence: 3,
    triggerEventId: 'event-before-ready-3',
    triggerEventStartSequence: 1,
    uncompactedUpperSequence: 3,
  };
}

function matchesHistoryCursor(
  history: AgentHistoryIndexRow,
  input: { readonly afterCreatedAtMs?: number; readonly afterHistoryId?: string }
): boolean {
  if (input.afterCreatedAtMs === undefined) return true;
  if (history.createdAtMs > input.afterCreatedAtMs) return true;
  return history.createdAtMs === input.afterCreatedAtMs && input.afterHistoryId !== undefined
    ? history.historyId > input.afterHistoryId
    : false;
}

function stringifyForExpectation(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'bigint' ? item.toString() : item
  );
}
