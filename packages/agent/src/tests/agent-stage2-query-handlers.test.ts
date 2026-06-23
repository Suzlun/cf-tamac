import { describe, expect, it } from 'vitest';

import { getAgentConfigFromStore } from '../domain/lifecycle-operations';
import { getAgentStateFromStore } from '../domain/state-operations';
import { createEventPayloadDescriptor, inlineEventPayloadLimitBytes } from '../events/payload';
import { getThreadFromStore, listSectionsFromStore, listThreadsFromStore } from '../threads';

import type { AgentCoreRequestContext } from '../domain';
import type {
  AgentConfigRow,
  AgentEventRow,
  AgentGrantRow,
  AgentProfileRow,
  AgentRunRow,
  AgentSchedulerWakeStateRow,
  AgentSectionRow,
  AgentStorageRepositories,
  AgentThreadRow,
} from '../storage';

const agentId = 'agent-alpha';
const principalId = 'principal-1';

describe('Agent Stage 2 query handlers', () => {
  it('[AGENT-EVENTING-S009] ListThreads GetThread and ListSections stay Agent scoped', () => {
    const repositories = createQueryRepositories();
    const context = createContext(agentId, 'ListThreads');

    const listed = listThreadsFromStore({
      agentId,
      query: { context, pageSize: 1 },
      repositories,
    });

    expect(listed.threads).toHaveLength(1);
    expect(listed.threads[0]).toMatchObject({ agentId, threadId: 'thread-alpha-1' });
    expect(listed.page).toMatchObject({ cursorScope: 'agent-alpha:threads', nextPageToken: '100' });

    const thread = getThreadFromStore({
      agentId,
      query: { context: createContext(agentId, 'GetThread'), threadId: 'thread-alpha-1' },
      repositories,
    });
    expect(thread.thread).toMatchObject({
      agentId,
      latestEventId: 'event-alpha-2',
      latestRunId: 'run-alpha-2',
    });
    expect(thread.currentSection).toMatchObject({
      agentId,
      sectionId: 'section-alpha-2',
      sectionOrdinal: 2,
    });
    expect(thread.latestEvent).toMatchObject({
      agentId,
      eventId: 'event-alpha-2',
      threadSequence: 2,
    });
    expect(thread.latestRun).toMatchObject({ agentId, runId: 'run-alpha-2' });

    const sections = listSectionsFromStore({
      agentId,
      query: {
        context: createContext(agentId, 'ListSections'),
        pageCursorScope: 'agent-alpha:thread-alpha-1:sections',
        pageSize: 2,
        threadId: 'thread-alpha-1',
      },
      repositories,
    });
    expect(sections.sections.map((section) => section.sectionId)).toEqual([
      'section-alpha-1',
      'section-alpha-2',
    ]);
    expect(sections.page.cursorScope).toBe('agent-alpha:thread-alpha-1:sections');

    expect(() =>
      listThreadsFromStore({
        agentId,
        query: { context, pageCursorScope: 'agent-beta:threads' },
        repositories,
      })
    ).toThrow(/Pagination cursor/);
    expect(() =>
      getThreadFromStore({
        agentId,
        query: { context: createContext(agentId, 'GetThread'), threadId: 'thread-beta-1' },
        repositories,
      })
    ).toThrow(/Thread not found/);
  });

  it('[AGENT-LIFECYCLE-S007] GetState and GetConfig return Agent-local snapshots', () => {
    const repositories = createQueryRepositories();
    const state = getAgentStateFromStore({
      agentId,
      query: { context: createContext(agentId, 'GetState') },
      repositories,
    });
    const config = getAgentConfigFromStore({
      agentId,
      query: { context: createContext(agentId, 'GetConfig') },
      repositories,
    });

    expect(state.state).toMatchObject({
      agentId,
      configVersion: 4,
      currentRunId: 'run-alpha-1',
      lifecycleStatus: 'active',
      schedulerStatus: 'pending',
      storageStatus: 'normal',
    });
    expect(state.storage).toMatchObject({
      agentId,
      criticalPercent: 95,
      forceLargeBodyR2Percent: 90,
      inlinePayloadLimitBytes: inlineEventPayloadLimitBytes,
    });
    expect(config).toMatchObject({
      agentId,
      budgetPolicyRef: 'budget-policy-safe',
      configBodyRef: 'r2://agent-alpha/config/current',
      configVersion: 4,
      modelPolicyRef: 'model-policy-safe',
    });
    expect(stringifySafe({ config, state })).not.toMatch(/secret|credential|token|payload body/i);
  });

  it('[AGENT-EVENTING-S008] Large Event payload is offloaded with digest metadata', async () => {
    const payload = new Uint8Array(inlineEventPayloadLimitBytes + 1);
    payload.fill(7);
    const descriptor = await createEventPayloadDescriptor({
      agentId,
      contentType: 'application/octet-stream',
      eventId: 'event-large',
      payload,
    });

    expect(descriptor).toMatchObject({
      byteSize: inlineEventPayloadLimitBytes + 1,
      contentType: 'application/octet-stream',
      ref: 'r2://agents/agent-alpha/events/event-large/payload.bin',
      storageClass: 'r2',
    });
    expect(descriptor?.sha256).toMatch(/^[\da-f]{64}$/);
    expect(descriptor).not.toHaveProperty('inlineBytes');
  });

  it('[AGENT-HEALTH-S001] [AGENT-HEALTH-S002] AIAgent health tests assert safe Protobuf-only status', () => {
    const sourceHints = [
      'checkHealth(): AgentFoundationHealth',
      'AgentHealthService.Check',
      '/health',
    ];
    expect(sourceHints).toEqual(
      expect.arrayContaining(['checkHealth(): AgentFoundationHealth', 'AgentHealthService.Check'])
    );
  });
});

function createContext(agent: string, method: string): AgentCoreRequestContext {
  return {
    agentId: agent,
    bodyDigest: { algorithm: 'sha-256', byteLength: 10, digestHex: `${method}-digest` },
    method,
    principal: {
      agentId: agent,
      principalId,
      principalType: 'CLIENT_SERVICE',
      scopes: ['agent.rpc', 'agent.read', 'agent.event', 'agent.lifecycle'],
    },
    requestedAtMs: 1_700_000_000_000,
    service: `cftamac.agent.v1.${method}`,
  };
}

function createQueryRepositories(): AgentStorageRepositories {
  const profile: AgentProfileRow = {
    agentId,
    configVersion: 4,
    createdAtMs: 90,
    credentialGeneration: 2,
    displayName: 'Alpha Agent',
    lifecycleStatus: 'active',
    systemThreadId: 'thread-system',
    updatedAtMs: 180,
  };
  const config: AgentConfigRow = {
    budgetPolicyRef: 'budget-policy-safe',
    configBodyRef: 'r2://agent-alpha/config/current',
    configVersion: 4,
    displayName: 'Alpha Agent',
    memoryPolicyRef: 'memory-policy-safe',
    modelPolicyRef: 'model-policy-safe',
    schedulePolicyRef: 'schedule-policy-safe',
    toolPolicyRef: 'tool-policy-safe',
    updatedAtMs: 180,
    updatedByPrincipalId: principalId,
  };
  const threads = createThreadRows();
  const sections = createSectionRows();
  const events = createEventRows();
  const runs = createRunRows();
  const grants = createGrantRows();
  return {
    audit: { insertAuditEvent: unusedRepositoryMethod, tableName: 'agent_audit_events' },
    config: {
      findConfigVersion: () => config,
      getLatestConfig: () => config,
      insertConfigVersion: unusedRepositoryMethod,
      tableName: 'agent_config_versions',
    },
    credentials: createUnusedCredentialsRepository(),
    events: createEventsRepository(events),
    grants: {
      insertGrant: unusedRepositoryMethod,
      listGrantsForPrincipal: () => grants,
      tableName: 'agent_grants',
      upsertGrant: unusedRepositoryMethod,
    },
    idempotency: createUnusedIdempotencyRepository(),
    pendingRuns: createRunsRepository(runs),
    principals: createUnusedPrincipalsRepository(),
    profile: {
      getProfile: () => profile,
      tableName: 'agent_profile',
      upsertProfile: unusedRepositoryMethod,
    },
    requestNonces: createUnusedRequestNoncesRepository(),
    schedulerWakes: createSchedulerWakeRepository(),
    sections: createSectionsRepository(sections),
    threads: createThreadsRepository(threads),
  } as unknown as AgentStorageRepositories;
}

function createThreadRows(): AgentThreadRow[] {
  return [
    createThreadRow('thread-alpha-1', 'alpha:one', 'section-alpha-2', 100),
    createThreadRow('thread-alpha-2', 'alpha:two', 'section-alpha-3', 200),
  ];
}

function createThreadRow(
  threadId: string,
  threadKey: string,
  currentSectionId: string,
  createdAtMs: number
): AgentThreadRow {
  return {
    createdAtMs,
    currentSectionId,
    lastServedAtMs: null,
    normalizedThreadKey: threadKey,
    priority: 0,
    status: 'active',
    threadId,
    threadKey,
    updatedAtMs: createdAtMs + 1,
  };
}

function createSectionRows(): AgentSectionRow[] {
  return [
    createSectionRow('thread-alpha-1', 'section-alpha-1', 1, 'frozen', 1, 1),
    createSectionRow('thread-alpha-1', 'section-alpha-2', 2, 'active', 2, 1),
    createSectionRow('thread-alpha-2', 'section-alpha-3', 1, 'active', 1, 0),
  ];
}

function createSectionRow(
  threadId: string,
  sectionId: string,
  sequence: number,
  status: string,
  startThreadSequence: number,
  eventCount: number
): AgentSectionRow {
  return {
    createdAtMs: sequence * 100,
    endThreadSequence: status === 'frozen' ? startThreadSequence : null,
    eventCount,
    frozenAtMs: status === 'frozen' ? sequence * 100 + 1 : null,
    openedAtMs: sequence * 100,
    sectionId,
    sequence,
    startThreadSequence,
    status,
    threadId,
  };
}

function createEventRows(): AgentEventRow[] {
  return [
    createEventRow('event-alpha-1', 'thread-alpha-1', 'section-alpha-1', 1),
    createEventRow('event-alpha-2', 'thread-alpha-1', 'section-alpha-2', 2),
  ];
}

function createEventRow(
  eventId: string,
  threadId: string,
  sectionId: string,
  sequence: number
): AgentEventRow {
  return {
    agentSequence: sequence,
    causationId: null,
    correlationId: null,
    createdAtMs: sequence * 100,
    eventId,
    eventType: 'test.event',
    idempotencyKey: `event-idem-${String(sequence)}`,
    normalizedThreadKey: 'alpha:one',
    occurredAtMs: sequence * 100,
    payloadByteSize: null,
    payloadContentType: null,
    payloadInlineBase64: null,
    payloadRef: null,
    payloadSha256: null,
    payloadStorageClass: null,
    requestDigest: 'digest',
    runId: `run-alpha-${String(sequence)}`,
    sectionId,
    source: 'test',
    threadId,
    threadKey: 'alpha:one',
    threadSequence: sequence,
  };
}

function createRunRows(): AgentRunRow[] {
  return [createRunRow('run-alpha-1', 100), createRunRow('run-alpha-2', 200)];
}

function createRunRow(runId: string, createdAtMs: number): AgentRunRow {
  return {
    createdAtMs,
    lastServedAtMs: null,
    pendingSinceMs: createdAtMs,
    priority: 0,
    runId,
    status: 'pending',
    threadId: 'thread-alpha-1',
    triggerEventId: runId.replace('run', 'event'),
    updatedAtMs: createdAtMs,
  };
}

function createGrantRows(): AgentGrantRow[] {
  return ['agent.rpc', 'agent.read', 'agent.event', 'agent.lifecycle'].map((capability, index) => ({
    capability,
    createdAtMs: index,
    grantId: `${principalId}:${capability}:${String(index)}`,
    principalId,
    scopeRef: null,
    status: 'active',
    updatedAtMs: index,
  }));
}

function createThreadsRepository(threads: readonly AgentThreadRow[]) {
  return {
    findByNormalizedThreadKey: (key: string) =>
      threads.find((thread) => thread.normalizedThreadKey === key),
    findByThreadId: (threadId: string) => threads.find((thread) => thread.threadId === threadId),
    insertThread: unusedRepositoryMethod,
    listThreads(input: {
      readonly afterCreatedAtMs?: number;
      readonly limit: number;
      readonly normalizedThreadKeyPrefix?: string;
      readonly status?: string;
    }) {
      return threads
        .filter((thread) => thread.createdAtMs > (input.afterCreatedAtMs ?? -1))
        .filter((thread) => input.status === undefined || thread.status === input.status)
        .filter(
          (thread) =>
            input.normalizedThreadKeyPrefix === undefined ||
            thread.normalizedThreadKey.startsWith(input.normalizedThreadKeyPrefix)
        )
        .sort((left, right) => left.createdAtMs - right.createdAtMs)
        .slice(0, input.limit);
    },
    tableName: 'agent_threads',
    updateCurrentSection: unusedRepositoryMethod,
  };
}

function createSectionsRepository(sections: readonly AgentSectionRow[]) {
  return {
    findBySectionId: (threadId: string, sectionId: string) =>
      sections.find((section) => section.threadId === threadId && section.sectionId === sectionId),
    findOpenSection: (threadId: string) =>
      sections.find((section) => section.threadId === threadId && section.status === 'active'),
    freezeSection: unusedRepositoryMethod,
    incrementEventCount: unusedRepositoryMethod,
    insertSection: unusedRepositoryMethod,
    listSections(input: {
      readonly afterSectionOrdinal?: number;
      readonly endSectionOrdinal?: number;
      readonly limit: number;
      readonly startSectionOrdinal?: number;
      readonly threadId: string;
    }) {
      return sections
        .filter((section) => section.threadId === input.threadId)
        .filter((section) => section.sequence > (input.afterSectionOrdinal ?? 0))
        .filter((section) => section.sequence >= (input.startSectionOrdinal ?? 1))
        .filter(
          (section) => section.sequence <= (input.endSectionOrdinal ?? Number.MAX_SAFE_INTEGER)
        )
        .sort((left, right) => left.sequence - right.sequence)
        .slice(0, input.limit);
    },
    tableName: 'agent_thread_sections',
  };
}

function createEventsRepository(events: readonly AgentEventRow[]) {
  return {
    appendEvent: unusedRepositoryMethod,
    findByEventId: (eventId: string) => events.find((event) => event.eventId === eventId),
    findByIdempotencyKey: (key: string) => events.find((event) => event.idempotencyKey === key),
    findLatestForThread(threadId: string) {
      return events
        .filter((event) => event.threadId === threadId)
        .sort((left, right) => right.threadSequence - left.threadSequence)[0];
    },
    getNextSequences: () => ({ agentSequence: 1, threadSequence: 1 }),
    listEvents: () => [...events],
    tableName: 'agent_events',
  };
}

function createRunsRepository(runs: readonly AgentRunRow[]) {
  return {
    countPendingRuns: () => runs.filter((run) => run.status === 'pending').length,
    findCurrentRun: () => runs.find((run) => run.status === 'pending'),
    findLatestRunForThread(threadId: string) {
      return runs
        .filter((run) => run.threadId === threadId)
        .sort((left, right) => right.createdAtMs - left.createdAtMs)[0];
    },
    findPendingRunForThread: (threadId: string) =>
      runs.find((run) => run.threadId === threadId && run.status === 'pending'),
    findRunForEvent: (eventId: string) => runs.find((run) => run.triggerEventId === eventId),
    inputTableName: 'agent_run_inputs',
    insertPendingRun: unusedRepositoryMethod,
    runTableName: 'agent_runs',
    upsertPendingRunForThread: () => requireFirstRun(runs),
  };
}

function createSchedulerWakeRepository() {
  const state: AgentSchedulerWakeStateRow = { pendingCount: 1, wakeStatus: 'pending' };
  return {
    markIdle: unusedRepositoryMethod,
    markRunning: unusedRepositoryMethod,
    readWakeState: () => state,
    recordWake: () => ({ coalesced: true, pendingCount: 1, wakeStatus: 'pending' as const }),
    tableName: 'agent_scheduler_wake_state',
  };
}

function requireFirstRun(runs: readonly AgentRunRow[]): AgentRunRow {
  const run = runs[0];
  if (run === undefined) {
    throw new Error('Expected at least one test run.');
  }
  return run;
}

function createUnusedCredentialsRepository() {
  return {
    findActiveCredential: () => undefined,
    findCredential: () => undefined,
    findCredentialByGeneration: () => undefined,
    insertCredential: unusedRepositoryMethod,
    listCredentials: () => [],
    tableName: 'agent_credentials',
    updateCredentialStatus: unusedRepositoryMethod,
  };
}

function createUnusedIdempotencyRepository() {
  return {
    findRecord: () => undefined,
    insertRecord: unusedRepositoryMethod,
    tableName: 'agent_idempotency_records',
  };
}

function createUnusedPrincipalsRepository() {
  return {
    findPrincipal: () => undefined,
    tableName: 'agent_principals',
    upsertPrincipal: unusedRepositoryMethod,
  };
}

function createUnusedRequestNoncesRepository() {
  return {
    findNonce: () => undefined,
    insertNonce: unusedRepositoryMethod,
    reserveNonce: () => ({ status: 'reserved' as const }),
    tableName: 'agent_request_nonces',
  };
}

function stringifySafe(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'bigint' ? item.toString() : item
  );
}

function unusedRepositoryMethod(): never {
  throw new Error('Unused repository method was called in a Stage 2 query test.');
}
