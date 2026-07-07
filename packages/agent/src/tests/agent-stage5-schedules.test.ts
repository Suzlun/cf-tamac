import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  createAndRegisterAgentSchedule,
  decideScheduleFire,
  fireScheduleInStore,
  parseAgentScheduleSpec,
  type CreateAgentScheduleCommand,
} from '../schedules';
import { agentFoundationTables, agentStorageRepositoryNames } from '../storage';

import type { AgentCoreRequestContext } from '../domain';
import type {
  AgentEventRow,
  AgentIdempotencyRecordRow,
  AgentRunRow,
  AgentScheduleFireRow,
  AgentScheduleRow,
  AgentSectionRow,
  AgentStorageRepositories,
  AgentThreadRow,
  BindAgentRuntimeScheduleInput,
  CancelAgentScheduleInput,
  InsertAgentScheduleInput,
  InsertAgentThreadInput,
  InsertPendingAgentRunInput,
  RecordAgentScheduleFireInput,
  UpdateAgentScheduleAfterFireInput,
} from '../storage';

const aiAgentPath = new URL('../AIAgent.ts', import.meta.url);
const runtimeSchedulePath = new URL('../durable-object/runtime-schedule.ts', import.meta.url);
const scheduleHandlersPath = new URL('../durable-object/schedule-handlers.ts', import.meta.url);
const cancelOperationsPath = new URL('../schedules/operations-cancel.ts', import.meta.url);
const createOperationsPath = new URL('../schedules/operations-create.ts', import.meta.url);
const firingPath = new URL('../schedules/firing.ts', import.meta.url);
const sharedOperationsPath = new URL('../schedules/operations-shared.ts', import.meta.url);
const overlapPath = new URL('../schedules/overlap.ts', import.meta.url);
const repositoryPath = new URL('../storage/repositories/schedules-repository.ts', import.meta.url);
const dispatchPath = new URL('../rpc/dispatch/schedules.ts', import.meta.url);
const servicePath = new URL('../rpc/services/schedules.ts', import.meta.url);
const tableInitializerPath = new URL('../storage/initializers/agent-storage.ts', import.meta.url);

describe('Agent Stage 5 Schedule implementation', () => {
  it('[AGENT-SCHEDULE-S001] CreateSchedule requires a Thread context', () => {
    const operations = readSource(createOperationsPath);
    const service = readSource(servicePath);

    expect(operations).toContain('assertScheduleThreadContext(input.command)');
    expect(operations).toContain('CreateSchedule requires thread_id or thread_key.');
    expect(service).toContain('createSchedule(request)');
    expect(service).toContain('dispatchCreateSchedule(env, request)');
  });

  it('[AGENT-SCHEDULE-S002] Schedule firing appends a schedule.triggered Event', () => {
    const aiAgent = readSource(aiAgentPath);
    const runtimeSchedule = readSource(runtimeSchedulePath);
    const scheduleHandlers = readSource(scheduleHandlersPath);
    const firing = readSource(firingPath);
    const parsed = parseAgentScheduleSpec('delay:30', 1_000);

    expect(parsed.kind).toBe('one_shot');
    expect(parsed.nextFireAtMs).toBe(31_000);
    expect(firing).toContain('eventType: scheduleTriggeredEventType');
    expect(firing).toContain('appendAgentEventToThreadInRepositories({');
    expect(firing).toContain("source: 'agent.schedule'");
    expect(aiAgent).toContain('handleAgentScheduleCallback(payload: AgentScheduleCallbackPayload)');
    expect(runtimeSchedule).toContain("'handleAgentScheduleCallback' as const");
    expect(runtimeSchedule).toContain('input.scheduleEvery(');
    expect(runtimeSchedule).toContain('input.schedule(input.result.runtimePlan.when');
    expect(scheduleHandlers).toContain("reason: 'event_accepted'");
  });

  it('[AGENT-SCHEDULE-S006] create_schedule decision preserves causation through fire', () => {
    const decisionCommit = readSource(new URL('../runs/decision-commit.ts', import.meta.url));
    const firing = readSource(firingPath);

    expect(decisionCommit).toContain('createDecisionScheduleSpec(input, decision)');
    expect(decisionCommit).toContain('causationEventId: input.snapshot.triggerEventId');
    expect(decisionCommit).toContain('modelPolicyDigest: input.snapshot.resolvedModelPolicyDigest');
    expect(decisionCommit).toContain("callbackIdentity: 'agent-run-decision'");
    expect(firing).toContain('readScheduleCausationEventId(schedule.scheduleSpec)');
    expect(firing).toContain('eventType: scheduleTriggeredEventType');
  });

  it('[AGENT-SCHEDULE-S003] Overlap policy prevents duplicate interval work', () => {
    const repository = readSource(repositoryPath);
    const parsed = parseAgentScheduleSpec('every:60', 1_000);

    expect(parsed.kind).toBe('interval');
    expect(parsed.intervalSeconds).toBe(60);
    expect(decideScheduleFire(createOverlapInput('skip'))).toEqual({
      fireStatus: 'skipped_overlap',
      status: 'skip',
    });
    expect(decideScheduleFire(createOverlapInput('coalesce'))).toEqual({
      fireStatus: 'coalesced_overlap',
      status: 'coalesce',
    });
    expect(decideScheduleFire(createOverlapInput('queue-next'))).toEqual({
      fireStatus: 'queued_next_overlap',
      status: 'queue_next',
    });
    expect(repository).toContain('agent_schedule_fires');
    expect(repository).toContain('findFire(scheduleId: string, tickId: string)');
  });

  it('[AGENT-SCHEDULE-S004] CancelSchedule prevents future firing', () => {
    const aiAgent = readSource(aiAgentPath);
    const scheduleHandlers = readSource(scheduleHandlersPath);
    const operations = readSource(cancelOperationsPath);
    const overlap = readSource(overlapPath);

    expect(operations).toContain('cancelScheduleInStore');
    expect(operations).toContain("status: 'cancelled'");
    expect(overlap).toContain("fireStatus: 'suppressed_inactive'");
    expect(aiAgent).toContain('cancelRuntimeSchedule: async (runtimeScheduleId)');
    expect(scheduleHandlers).toContain(
      'await context.cancelRuntimeSchedule(result.runtimeScheduleId)'
    );
  });

  it('[AGENT-SCHEDULE-S005] Integration uninstall cancels its active Schedules', () => {
    const operations = readSource(cancelOperationsPath);
    const sharedOperations = readSource(sharedOperationsPath);
    const tableInitializer = readSource(tableInitializerPath);

    expect(agentFoundationTables).toEqual(
      expect.arrayContaining(['agent_schedules', 'agent_schedule_fires'])
    );
    expect(agentStorageRepositoryNames).toEqual(
      expect.arrayContaining(['AgentSchedulesRepository'])
    );
    expect(tableInitializer).toContain('installation_id TEXT');
    expect(operations).toContain('cleanupInstallationSchedulesInStore');
    expect(operations).toContain('cancelSchedulesByInstallation({');
    expect(operations).toContain('agent.schedule.installation_cleanup');
    expect(sharedOperations).toContain('appendScheduleAuditEvent(');
  });

  it('wires Schedule RPC handlers without changing TypeSpec or generated outputs', () => {
    const dispatch = readSource(dispatchPath);
    const service = readSource(servicePath);

    expect(dispatch).toContain('createAgentCoreContext({');
    expect(dispatch).toContain('createAgentSchedule({');
    expect(dispatch).toContain('getAgentSchedule({');
    expect(dispatch).toContain('listAgentSchedules({');
    expect(dispatch).toContain('cancelAgentSchedule({');
    expect(service).toContain('createAgentScheduleService');
  });

  it('[AGENT-SCHEDULE-S001] CreateSchedule retries runtime registration before replay completion', async () => {
    const harness = new ScheduleRepositoryHarness();
    const command = harness.createCommand('schedule-create-key');
    let attempts = 0;

    await expect(
      createAndRegisterAgentSchedule({
        agentId: harness.agentId,
        cancelRuntimeSchedule: () => Promise.resolve(),
        command,
        registerRuntimeSchedule: () => {
          attempts += 1;
          return Promise.reject(new Error('runtime unavailable'));
        },
        repositories: harness.repositories,
      })
    ).rejects.toThrow('runtime unavailable');

    expect(harness.idempotencyRecord('schedule-create-key')?.responseRef).toBeNull();
    expect(harness.scheduleByIdempotencyKey('schedule-create-key')?.runtimeScheduleId).toBeNull();

    const retry = await createAndRegisterAgentSchedule({
      agentId: harness.agentId,
      cancelRuntimeSchedule: () => Promise.resolve(),
      command,
      registerRuntimeSchedule: () => {
        attempts += 1;
        return Promise.resolve({ id: 'runtime-schedule-1', time: 31_000 });
      },
      repositories: harness.repositories,
    });

    expect(attempts).toBe(2);
    expect(retry.runtimeScheduleId).toBe('runtime-schedule-1');
    expect(harness.idempotencyRecord('schedule-create-key')?.responseRef).toContain(
      'runtime-schedule-1'
    );
  });

  it('[AGENT-SCHEDULE-S001] CreateSchedule validation failure does not poison the idempotency key', async () => {
    const harness = new ScheduleRepositoryHarness();
    const invalidCommand = {
      ...harness.createCommand('invalid-schedule-key'),
      scheduleSpec: 'delay:0',
    };

    // schedule_spec 検証失敗は runtime 登録前に止まり、予約レコードも残さない。
    await expect(
      createAndRegisterAgentSchedule({
        agentId: harness.agentId,
        cancelRuntimeSchedule: () => Promise.resolve(),
        command: invalidCommand,
        registerRuntimeSchedule: () => Promise.reject(new Error('runtime must not be called')),
        repositories: harness.repositories,
      })
    ).rejects.toThrow('delay_seconds must be positive.');

    expect(harness.idempotencyRecord('invalid-schedule-key')).toBeUndefined();
    expect(harness.scheduleByIdempotencyKey('invalid-schedule-key')).toBeUndefined();

    // 同じ idempotency key の修正版 command が poisoned key にならず成功することを確認する。
    const retry = await createAndRegisterAgentSchedule({
      agentId: harness.agentId,
      cancelRuntimeSchedule: () => Promise.resolve(),
      command: harness.createCommand('invalid-schedule-key'),
      registerRuntimeSchedule: () =>
        Promise.resolve({ id: 'runtime-after-validation', time: 31_000 }),
      repositories: harness.repositories,
    });

    expect(retry.runtimeScheduleId).toBe('runtime-after-validation');
    expect(harness.idempotencyRecord('invalid-schedule-key')?.responseRef).toContain(
      'runtime-after-validation'
    );
  });

  it('[AGENT-SCHEDULE-S001] CreateSchedule retry completes idempotency after bind succeeds', async () => {
    const harness = new ScheduleRepositoryHarness();
    const command = harness.createCommand('completion-retry-key');
    const cancelledRuntimeIds: string[] = [];
    let registerAttempts = 0;
    harness.failNextIdempotencyResponseUpdate('completion store unavailable');

    // runtime bind 後の completion 失敗を再現し、runtime cancel が呼ばれないことを検証する。
    await expect(
      createAndRegisterAgentSchedule({
        agentId: harness.agentId,
        cancelRuntimeSchedule: (runtimeScheduleId) => {
          cancelledRuntimeIds.push(runtimeScheduleId);
          return Promise.resolve();
        },
        command,
        registerRuntimeSchedule: () => {
          registerAttempts += 1;
          return Promise.resolve({ id: 'runtime-bound-before-complete', time: 31_000 });
        },
        repositories: harness.repositories,
      })
    ).rejects.toThrow('completion store unavailable');

    expect(cancelledRuntimeIds).toEqual([]);
    expect(registerAttempts).toBe(1);
    expect(harness.scheduleByIdempotencyKey('completion-retry-key')?.runtimeScheduleId).toBe(
      'runtime-bound-before-complete'
    );
    expect(harness.idempotencyRecord('completion-retry-key')?.responseRef).toBeNull();

    // retry は既に bind 済みの runtime ID を使い、runtime を二重登録せず応答保存だけを完了する。
    const retry = await createAndRegisterAgentSchedule({
      agentId: harness.agentId,
      cancelRuntimeSchedule: (runtimeScheduleId) => {
        cancelledRuntimeIds.push(runtimeScheduleId);
        return Promise.resolve();
      },
      command,
      registerRuntimeSchedule: () => {
        registerAttempts += 1;
        return Promise.reject(new Error('runtime must not be registered twice'));
      },
      repositories: harness.repositories,
    });

    expect(retry.runtimeScheduleId).toBe('runtime-bound-before-complete');
    expect(registerAttempts).toBe(1);
    expect(cancelledRuntimeIds).toEqual([]);
    expect(harness.idempotencyRecord('completion-retry-key')?.responseRef).toContain(
      'runtime-bound-before-complete'
    );
  });

  it('[AGENT-SCHEDULE-S002] [AGENT-SCHEDULE-S003] persists fire ledger duplicate and queue-next transitions', () => {
    const duplicateHarness = new ScheduleRepositoryHarness();
    duplicateHarness.addSchedule({ intervalSeconds: 60, scheduleId: 'schedule-duplicate' });

    const first = fireScheduleInStore({
      agentId: duplicateHarness.agentId,
      command: { fireAtMs: 60_000, scheduleId: 'schedule-duplicate' },
      repositories: duplicateHarness.repositories,
    });
    duplicateHarness.transitionRun(first.runId ?? '', 'succeeded');
    const duplicate = fireScheduleInStore({
      agentId: duplicateHarness.agentId,
      command: { fireAtMs: 60_000, scheduleId: 'schedule-duplicate' },
      repositories: duplicateHarness.repositories,
    });

    expect(first.eventAppended).toBe(true);
    expect(duplicate.replayed).toBe(true);
    expect(duplicate.fireStatus).toBe('duplicate_tick');
    expect(duplicateHarness.events).toHaveLength(1);

    const queueHarness = new ScheduleRepositoryHarness();
    queueHarness.addRun('active-run', 'running');
    queueHarness.addSchedule({
      intervalSeconds: 60,
      lastRunId: 'active-run',
      overlapPolicy: 'queue-next',
      scheduleId: 'schedule-queue-next',
    });

    const queued = fireScheduleInStore({
      agentId: queueHarness.agentId,
      command: { fireAtMs: 60_000, scheduleId: 'schedule-queue-next' },
      repositories: queueHarness.repositories,
    });
    queueHarness.transitionRun('active-run', 'succeeded');
    const appended = fireScheduleInStore({
      agentId: queueHarness.agentId,
      command: { fireAtMs: 120_000, scheduleId: 'schedule-queue-next' },
      repositories: queueHarness.repositories,
    });

    expect(queued.fireStatus).toBe('queued_next_overlap');
    expect(queueHarness.schedule('schedule-queue-next')?.queuedFireCount).toBe(0);
    expect(appended.eventAppended).toBe(true);
    expect(appended.tickId).toBe('schedule-queue-next:60000');
    expect(queueHarness.events).toHaveLength(1);
  });
});

function createOverlapInput(overlapPolicy: 'skip' | 'coalesce' | 'queue-next') {
  return {
    existingTickRecorded: false,
    lastRunStatus: 'running',
    overlapPolicy,
    queuedFireCount: 0,
    scheduleStatus: 'active' as const,
  };
}

function readSource(path: URL): string {
  return readFileSync(fileURLToPath(path.href), 'utf8');
}

class ScheduleRepositoryHarness {
  readonly agentId = 'agent-1';
  readonly events: AgentEventRow[] = [];
  readonly repositories: AgentStorageRepositories;

  private readonly fires = new Map<string, AgentScheduleFireRow>();
  private readonly idempotency = new Map<string, AgentIdempotencyRecordRow>();
  private readonly runs = new Map<string, AgentRunRow>();
  private readonly schedules = new Map<string, AgentScheduleRow>();
  private readonly sections = new Map<string, AgentSectionRow>();
  private readonly threads = new Map<string, AgentThreadRow>();
  private nextIdempotencyResponseUpdateError: Error | undefined;

  constructor() {
    this.addThread({
      createdAtMs: 1_000,
      currentSectionId: 'section-1',
      lastServedAtMs: null,
      normalizedThreadKey: 'thread-main',
      priority: 0,
      status: 'active',
      threadId: 'thread-1',
      threadKey: 'thread-main',
      updatedAtMs: 1_000,
    });
    this.sections.set('section-1', {
      createdAtMs: 1_000,
      endThreadSequence: null,
      eventCount: 0,
      frozenAtMs: null,
      openedAtMs: 1_000,
      sectionId: 'section-1',
      sequence: 1,
      startThreadSequence: 1,
      status: 'active',
      threadId: 'thread-1',
    });
    let repositories = undefined as unknown as AgentStorageRepositories;
    repositories = this.createRepositories(() => repositories);
    this.repositories = repositories;
  }

  createCommand(idempotencyKey: string): CreateAgentScheduleCommand {
    return {
      context: this.createContext(idempotencyKey),
      overlapPolicy: 'skip',
      scheduleSpec: 'delay:30',
      threadKey: 'thread-main',
    };
  }

  idempotencyRecord(idempotencyKey: string): AgentIdempotencyRecordRow | undefined {
    return this.idempotency.get(this.idempotencyMapKey('principal-1', idempotencyKey));
  }

  failNextIdempotencyResponseUpdate(message: string): void {
    // 次回の応答保存だけを失敗させ、bind 済み retry 経路をテストから制御する。
    this.nextIdempotencyResponseUpdateError = new Error(message);
  }

  schedule(scheduleId: string): AgentScheduleRow | undefined {
    return this.schedules.get(scheduleId);
  }

  scheduleByIdempotencyKey(idempotencyKey: string): AgentScheduleRow | undefined {
    return [...this.schedules.values()].find((row) => row.idempotencyKey === idempotencyKey);
  }

  addRun(runId: string, status: string): AgentRunRow {
    const row: AgentRunRow = {
      createdAtMs: 1_000,
      lastServedAtMs: null,
      pendingSinceMs: 1_000,
      priority: 0,
      runId,
      status,
      threadId: 'thread-1',
      triggerEventId: `event-for-${runId}`,
      updatedAtMs: 1_000,
    };
    this.runs.set(runId, row);
    return row;
  }

  addSchedule(input: {
    readonly intervalSeconds?: number;
    readonly lastRunId?: string;
    readonly overlapPolicy?: string;
    readonly scheduleId: string;
  }): AgentScheduleRow {
    const row: AgentScheduleRow = {
      activeFireStartedAtMs: null,
      auditEventId: 'audit-1',
      callbackIdentity: 'handleAgentScheduleCallback',
      cancelledAtMs: null,
      cancelledByPrincipalId: null,
      cancelReason: null,
      createdAtMs: 1_000,
      createdByPrincipalId: 'principal-1',
      idempotencyKey: `idem-${input.scheduleId}`,
      installationId: null,
      intervalSeconds: input.intervalSeconds ?? null,
      lastEventId: null,
      lastFireAtMs: null,
      lastFireStatus: null,
      lastFireTickId: null,
      lastRunId: input.lastRunId ?? null,
      nextFireAtMs: 60_000,
      normalizedThreadKey: 'thread-main',
      overlapPolicy: input.overlapPolicy ?? 'skip',
      queuedFireCount: 0,
      runtimeScheduleId: 'runtime-existing',
      scheduleId: input.scheduleId,
      scheduleKind: input.intervalSeconds === undefined ? 'one_shot' : 'interval',
      scheduleSpec:
        input.intervalSeconds === undefined ? 'delay:30' : `every:${String(input.intervalSeconds)}`,
      status: 'active',
      threadId: 'thread-1',
      threadKey: 'thread-main',
      updatedAtMs: 1_000,
    };
    this.schedules.set(row.scheduleId, row);
    return row;
  }

  transitionRun(runId: string, status: string): void {
    const current = this.runs.get(runId);
    if (current === undefined) return;
    this.runs.set(runId, { ...current, status, updatedAtMs: current.updatedAtMs + 1 });
  }

  private createContext(idempotencyKey: string): AgentCoreRequestContext {
    return {
      agentId: this.agentId,
      bodyDigest: { algorithm: 'sha-256', byteLength: 1, digestHex: `digest-${idempotencyKey}` },
      idempotencyKey,
      method: 'CreateSchedule',
      principal: {
        agentId: this.agentId,
        principalId: 'principal-1',
        principalType: 'CLIENT_SERVICE',
        scopes: ['agent.rpc', 'agent.schedule'],
      },
      requestedAtMs: 1_000,
      service: 'cftamac.agent.v1.AgentScheduleService',
    };
  }

  private createRepositories(
    getRepositories: () => AgentStorageRepositories
  ): AgentStorageRepositories {
    return {
      audit: { insertAuditEvent: () => undefined, tableName: 'agent_audit_events' },
      credentials: { findCredential: () => undefined, tableName: 'agent_credentials' },
      events: {
        appendEvent: (input: Parameters<AgentStorageRepositories['events']['appendEvent']>[0]) => {
          this.events.push({
            agentSequence: input.sequences.agentSequence,
            causationId: input.causationId ?? null,
            correlationId: input.correlationId ?? null,
            createdAtMs: input.createdAtMs,
            eventId: input.eventId,
            eventType: input.eventType,
            idempotencyKey: input.idempotencyKey,
            normalizedThreadKey: input.normalizedThreadKey,
            occurredAtMs: input.occurredAtMs,
            payloadByteSize: input.payloadByteSize ?? null,
            payloadContentType: input.payloadContentType ?? null,
            payloadInlineBase64: input.payloadInlineBase64 ?? null,
            payloadRef: input.payloadRef ?? null,
            payloadSha256: input.payloadSha256 ?? null,
            payloadStorageClass: input.payloadStorageClass ?? null,
            requestDigest: input.requestDigest ?? null,
            runId: input.runId ?? null,
            sectionId: input.sectionId,
            source: input.source,
            threadId: input.threadId,
            threadKey: input.threadKey,
            threadSequence: input.sequences.threadSequence,
          });
        },
        findByEventId: (eventId: string) => this.events.find((event) => event.eventId === eventId),
        findByIdempotencyKey: (idempotencyKey: string) =>
          this.events.find((event) => event.idempotencyKey === idempotencyKey),
        findLatestForThread: (threadId: string) =>
          this.events.filter((event) => event.threadId === threadId).at(-1),
        getNextSequences: (threadId: string) => ({
          agentSequence: this.events.length + 1,
          threadSequence: this.events.filter((event) => event.threadId === threadId).length + 1,
        }),
        listEvents: () => this.events,
        tableName: 'agent_events',
      },
      grants: { listGrantsForPrincipal: () => [], tableName: 'agent_grants' },
      idempotency: {
        findRecord: (principalId: string, idempotencyKey: string) =>
          this.idempotency.get(this.idempotencyMapKey(principalId, idempotencyKey)),
        insertRecord: (
          input: Parameters<AgentStorageRepositories['idempotency']['insertRecord']>[0]
        ) => {
          this.idempotency.set(this.idempotencyMapKey(input.principalId, input.idempotencyKey), {
            createdAtMs: input.createdAtMs,
            expiresAtMs: input.expiresAtMs,
            idempotencyKey: input.idempotencyKey,
            operationName: input.operationName,
            principalId: input.principalId,
            requestDigest: input.requestDigest,
            responseRef: input.responseRef ?? null,
            status: input.status,
          });
        },
        tableName: 'agent_idempotency_records',
        updateRecordResponse: (
          input: Parameters<AgentStorageRepositories['idempotency']['updateRecordResponse']>[0]
        ) => {
          // テストで指定された一度限りの保存失敗を先に消費し、以降の retry は成功させる。
          if (this.nextIdempotencyResponseUpdateError !== undefined) {
            const error = this.nextIdempotencyResponseUpdateError;
            this.nextIdempotencyResponseUpdateError = undefined;
            throw error;
          }
          const key = this.idempotencyMapKey(input.principalId, input.idempotencyKey);
          const current = this.idempotency.get(key);
          if (current === undefined) throw new Error('idempotency record missing in harness');
          this.idempotency.set(key, {
            ...current,
            responseRef: input.responseRef,
            status: input.status,
          });
        },
      },
      pendingRuns: {
        findRunById: (runId: string) => this.runs.get(runId),
        findPendingRunForThread: (threadId: string) =>
          [...this.runs.values()].find(
            (run) => run.threadId === threadId && run.status === 'pending'
          ),
        runTableName: 'agent_runs',
        inputTableName: 'agent_run_inputs',
        upsertPendingRunForThread: (input: InsertPendingAgentRunInput) =>
          this.upsertPendingRun(input),
      },
      profile: {
        getProfile: () => ({
          configVersion: 1,
          createdAtMs: 1_000,
          credentialGeneration: 1,
          displayName: 'Agent',
          lifecycleStatus: 'active',
          systemThreadId: '',
          updatedAtMs: 1_000,
        }),
        tableName: 'agent_profile',
      },
      requestNonces: {
        reserveNonce: () => ({ status: 'reserved' }),
        tableName: 'agent_request_nonces',
      },
      schedules: this.createScheduleRepository(),
      sections: {
        findBySectionId: (_threadId: string, sectionId: string) => this.sections.get(sectionId),
        findOpenSection: (threadId: string) =>
          [...this.sections.values()].find(
            (section) => section.threadId === threadId && section.status === 'active'
          ),
        incrementEventCount: (_threadId: string, sectionId: string) => {
          const current = this.sections.get(sectionId);
          if (current !== undefined) {
            this.sections.set(sectionId, { ...current, eventCount: current.eventCount + 1 });
          }
        },
        insertSection: (
          input: Parameters<AgentStorageRepositories['sections']['insertSection']>[0]
        ) => {
          this.sections.set(input.sectionId, {
            createdAtMs: input.createdAtMs,
            endThreadSequence: null,
            eventCount: 0,
            frozenAtMs: null,
            openedAtMs: input.createdAtMs,
            sectionId: input.sectionId,
            sequence: input.sequence,
            startThreadSequence: input.startThreadSequence ?? 1,
            status: input.status,
            threadId: input.threadId,
          });
        },
        tableName: 'agent_thread_sections',
      },
      threads: {
        findByNormalizedThreadKey: (normalizedThreadKey: string) =>
          [...this.threads.values()].find(
            (thread) => thread.normalizedThreadKey === normalizedThreadKey
          ),
        findByThreadId: (threadId: string) => this.threads.get(threadId),
        insertThread: (input: InsertAgentThreadInput) => {
          this.addInsertedThread(input);
        },
        tableName: 'agent_threads',
        updateCurrentSection: (
          input: Parameters<AgentStorageRepositories['threads']['updateCurrentSection']>[0]
        ) => {
          const current = this.threads.get(input.threadId);
          if (current !== undefined) {
            this.addThread({
              ...current,
              currentSectionId: input.currentSectionId,
              updatedAtMs: input.nowMs,
            });
          }
        },
      },
      transaction: <T>(operation: (repositories: AgentStorageRepositories) => T): T =>
        operation(getRepositories()),
    } as unknown as AgentStorageRepositories;
  }

  private createScheduleRepository(): AgentStorageRepositories['schedules'] {
    return {
      bindRuntimeSchedule: (input) => this.bindRuntimeSchedule(input),
      cancelSchedule: (input) => this.cancelSchedule(input),
      cancelSchedulesByInstallation: () => [],
      findByIdempotencyKey: (idempotencyKey) => this.scheduleByIdempotencyKey(idempotencyKey),
      findByScheduleId: (scheduleId) => this.schedules.get(scheduleId),
      findFire: (scheduleId, tickId) => this.fires.get(this.fireKey(scheduleId, tickId)),
      fireTableName: 'agent_schedule_fires',
      insertSchedule: (input) => this.insertSchedule(input),
      listSchedules: () => [...this.schedules.values()],
      recordFire: (input) => this.recordFire(input),
      tableName: 'agent_schedules',
      updateAfterFire: (input) => this.updateAfterFire(input),
    };
  }

  private addThread(row: AgentThreadRow): void {
    this.threads.set(row.threadId, row);
  }

  private addInsertedThread(input: InsertAgentThreadInput): void {
    this.addThread({
      createdAtMs: input.nowMs,
      currentSectionId: input.currentSectionId ?? null,
      lastServedAtMs: null,
      normalizedThreadKey: input.normalizedThreadKey,
      priority: input.priority ?? 0,
      status: input.status ?? 'active',
      threadId: input.threadId,
      threadKey: input.threadKey,
      updatedAtMs: input.nowMs,
    });
  }

  private insertSchedule(input: InsertAgentScheduleInput): AgentScheduleRow {
    const row: AgentScheduleRow = {
      activeFireStartedAtMs: null,
      auditEventId: input.auditEventId ?? null,
      callbackIdentity: input.callbackIdentity ?? null,
      cancelledAtMs: null,
      cancelledByPrincipalId: null,
      cancelReason: null,
      createdAtMs: input.createdAtMs,
      createdByPrincipalId: input.createdByPrincipalId ?? null,
      idempotencyKey: input.idempotencyKey,
      installationId: input.installationId ?? null,
      intervalSeconds: input.intervalSeconds ?? null,
      lastEventId: null,
      lastFireAtMs: null,
      lastFireStatus: null,
      lastFireTickId: null,
      lastRunId: null,
      nextFireAtMs: input.nextFireAtMs ?? null,
      normalizedThreadKey: input.normalizedThreadKey ?? null,
      overlapPolicy: input.overlapPolicy,
      queuedFireCount: 0,
      runtimeScheduleId: input.runtimeScheduleId ?? null,
      scheduleId: input.scheduleId,
      scheduleKind: input.scheduleKind,
      scheduleSpec: input.scheduleSpec,
      status: input.status,
      threadId: input.threadId,
      threadKey: input.threadKey ?? null,
      updatedAtMs: input.updatedAtMs,
    };
    this.schedules.set(row.scheduleId, row);
    return row;
  }

  private bindRuntimeSchedule(input: BindAgentRuntimeScheduleInput): AgentScheduleRow {
    const current = this.requireSchedule(input.scheduleId);
    const updated = {
      ...current,
      nextFireAtMs: input.nextFireAtMs ?? current.nextFireAtMs,
      runtimeScheduleId: input.runtimeScheduleId,
      updatedAtMs: input.updatedAtMs,
    };
    this.schedules.set(updated.scheduleId, updated);
    return updated;
  }

  private cancelSchedule(input: CancelAgentScheduleInput): AgentScheduleRow {
    const current = this.requireSchedule(input.scheduleId);
    const updated = {
      ...current,
      cancelReason: input.reason ?? null,
      cancelledAtMs: input.cancelledAtMs,
      cancelledByPrincipalId: input.cancelledByPrincipalId ?? null,
      nextFireAtMs: null,
      status: input.status,
      updatedAtMs: input.cancelledAtMs,
    };
    this.schedules.set(updated.scheduleId, updated);
    return updated;
  }

  private recordFire(input: RecordAgentScheduleFireInput): AgentScheduleFireRow {
    const key = this.fireKey(input.scheduleId, input.tickId);
    const existing = this.fires.get(key);
    const row: AgentScheduleFireRow = {
      completedAtMs: input.completedAtMs ?? existing?.completedAtMs ?? null,
      eventId: input.eventId ?? existing?.eventId ?? null,
      fireAtMs: input.fireAtMs,
      idempotencyKey: input.idempotencyKey,
      observedAtMs: input.observedAtMs,
      reason: input.reason ?? existing?.reason ?? null,
      runId: input.runId ?? existing?.runId ?? null,
      scheduleId: input.scheduleId,
      status: input.status,
      tickId: input.tickId,
    };
    this.fires.set(key, row);
    return row;
  }

  private updateAfterFire(input: UpdateAgentScheduleAfterFireInput): AgentScheduleRow {
    const current = this.requireSchedule(input.scheduleId);
    const updated = {
      ...current,
      activeFireStartedAtMs: input.activeFireStartedAtMs ?? current.activeFireStartedAtMs,
      lastEventId: input.eventId ?? current.lastEventId,
      lastFireAtMs: input.lastFireAtMs,
      lastFireStatus: input.lastFireStatus,
      lastFireTickId: input.lastFireTickId,
      lastRunId: input.runId ?? current.lastRunId,
      nextFireAtMs: input.nextFireAtMs ?? current.nextFireAtMs,
      queuedFireCount: input.queuedFireCount ?? current.queuedFireCount,
      status: input.status ?? current.status,
      updatedAtMs: input.updatedAtMs,
    };
    this.schedules.set(updated.scheduleId, updated);
    return updated;
  }

  private upsertPendingRun(input: InsertPendingAgentRunInput): AgentRunRow {
    const existing = [...this.runs.values()].find(
      (run) => run.threadId === input.threadId && run.status === 'pending'
    );
    if (existing !== undefined) return existing;
    const row: AgentRunRow = {
      createdAtMs: input.nowMs,
      lastServedAtMs: input.lastServedAtMs ?? null,
      pendingSinceMs: input.nowMs,
      priority: input.priority,
      runId: input.runId,
      status: 'pending',
      threadId: input.threadId,
      triggerEventId: input.triggerEventId,
      updatedAtMs: input.nowMs,
    };
    this.runs.set(row.runId, row);
    return row;
  }

  private requireSchedule(scheduleId: string): AgentScheduleRow {
    const schedule = this.schedules.get(scheduleId);
    if (schedule === undefined) throw new Error(`Missing schedule ${scheduleId}`);
    return schedule;
  }

  private fireKey(scheduleId: string, tickId: string): string {
    return `${scheduleId}:${tickId}`;
  }

  private idempotencyMapKey(principalId: string, idempotencyKey: string): string {
    return `${principalId}:${idempotencyKey}`;
  }
}
