import { Agent, type AgentContext } from 'agents';

import { type AgentIdentity, type AgentLifecycleStatus } from './domain';
import { type EventStorageStatus } from './events';
import { ensureAgentFoundationTables } from './storage';
import { createThreadKeyIdentity, type ThreadKeyIdentity } from './threads';

import type { AgentWorkerEnv } from './env';

/**
 * Foundation health state exposed by the AIAgent Durable Object.
 */
export interface AgentFoundationHealth {
  readonly agentId: string;
  readonly status: AgentLifecycleStatus;
  readonly storage: 'sqlite';
  readonly queue: 'agent_local';
}

/**
 * Persisted state shape for the AIAgent foundation.
 */
export interface AIAgentState {
  readonly lifecycleStatus: AgentLifecycleStatus;
}

/**
 * Internal event acceptance input used before generated RPC handlers are wired.
 */
export interface AgentFoundationEventInput {
  readonly threadKey: string;
  readonly idempotencyKey: string;
  readonly eventType: string;
  readonly payloadRef?: string;
}

/**
 * Internal event acceptance result for foundation seams.
 */
export interface AgentFoundationEventAcceptance {
  readonly identity: ThreadKeyIdentity;
  readonly idempotencyKey: string;
  readonly eventType: string;
  readonly payloadRef?: string;
  readonly storageStatus: EventStorageStatus;
  readonly threadId: string;
  readonly sectionId: string;
  readonly eventId: string;
  readonly runId: string;
  readonly wake: AgentSchedulerWakeRecord;
}

/**
 * Scheduler wake state recorded after event and pending run persistence.
 */
export interface AgentSchedulerWakeRecord {
  readonly wakeStatus: 'pending' | 'running';
  readonly coalesced: boolean;
  readonly pendingCount: number;
}

interface ThreadRow {
  readonly threadId: string;
}

interface SectionRow {
  readonly sectionId: string;
}

interface SequenceRow {
  readonly nextSequence: number;
}

interface ExistingEventRow {
  readonly eventId: string;
  readonly threadId: string;
  readonly sectionId: string;
  readonly eventType: string;
  readonly payloadRef: string | null;
}

interface ExistingRunRow {
  readonly runId: string;
}

interface WakeStateRow {
  readonly wakeStatus: 'pending' | 'running' | 'idle';
  readonly pendingCount: number;
}

/**
 * Return the Durable Object name for an Agent ID.
 */
export function getAIAgentDurableObjectName(agentId: string): string {
  if (agentId === '') {
    throw new TypeError('agent_id must not be empty.');
  }
  return agentId;
}

/**
 * Resolve the Durable Object ID for an Agent ID.
 */
export function getAIAgentDurableObjectId(env: AgentWorkerEnv, agentId: string): DurableObjectId {
  return env.AI_AGENT.idFromName(getAIAgentDurableObjectName(agentId));
}

/**
 * Resolve the Durable Object stub for an Agent ID.
 */
export function getAIAgentDurableObjectStub(
  env: AgentWorkerEnv,
  agentId: string
): DurableObjectStub<AIAgent> {
  return env.AI_AGENT.get(getAIAgentDurableObjectId(env, agentId));
}

/**
 * Cloudflare Agents SDK Durable Object foundation for one Agent aggregate.
 */
export class AIAgent extends Agent<AgentWorkerEnv, AIAgentState> {
  constructor(ctx: AgentContext, env: AgentWorkerEnv) {
    super(ctx, env);
    ensureAgentFoundationTables((strings, ...values) => this.sql(strings, ...values));
  }

  /**
   * Default lifecycle state for a new Agent Durable Object instance.
   */
  override initialState: AIAgentState = {
    lifecycleStatus: 'initializing',
  };

  /**
   * Return the Agent identity owned by this Durable Object instance.
   */
  getAgentIdentity(): AgentIdentity {
    return {
      agentId: this.name,
    };
  }

  /**
   * Validate and normalize a public thread key for this Agent instance.
   */
  createThreadIdentity(threadKey: string): ThreadKeyIdentity {
    return createThreadKeyIdentity(this.name, threadKey);
  }

  /**
   * Accept an event into the foundation seam without running the model harness.
   */
  acceptFoundationEvent(input: AgentFoundationEventInput): AgentFoundationEventAcceptance {
    this.assertFoundationEventInput(input);
    const now = Date.now();
    const identity = this.createThreadIdentity(input.threadKey);
    const replayed = this.findExistingEvent(input.idempotencyKey);
    if (replayed !== undefined) {
      return this.createReplayedEventAcceptance(identity, input, replayed);
    }

    const threadId = this.resolveOrCreateThread(identity, now);
    const sectionId = this.resolveOrCreateSection(threadId, now);
    const eventId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    this.appendEvent(input, threadId, sectionId, eventId, now);
    this.createPendingRun(threadId, eventId, runId, input.payloadRef, now);
    const wake = this.recordSchedulerWake(now);
    return {
      identity,
      idempotencyKey: input.idempotencyKey,
      eventType: input.eventType,
      payloadRef: input.payloadRef,
      storageStatus: 'accepted',
      threadId,
      sectionId,
      eventId,
      runId,
      wake,
    };
  }

  /**
   * Return foundation-only Agent health without exposing a public DO fetch route.
   */
  checkHealth(): AgentFoundationHealth {
    return {
      agentId: this.name,
      status: this.state.lifecycleStatus,
      storage: 'sqlite',
      queue: 'agent_local',
    };
  }

  private assertFoundationEventInput(input: AgentFoundationEventInput): void {
    if (input.idempotencyKey === '') {
      throw new TypeError('idempotency_key must not be empty.');
    }
    if (input.eventType === '') {
      throw new TypeError('event_type must not be empty.');
    }
  }

  private findExistingEvent(idempotencyKey: string): ExistingEventRow | undefined {
    const rows = this.sql<ExistingEventRow>`SELECT
      event_id as eventId,
      thread_id as threadId,
      section_id as sectionId,
      event_type as eventType,
      payload_ref as payloadRef
      FROM agent_events
      WHERE agent_id = ${this.name} AND idempotency_key = ${idempotencyKey}
      LIMIT 1`;
    return rows[0];
  }

  private createReplayedEventAcceptance(
    identity: ThreadKeyIdentity,
    input: AgentFoundationEventInput,
    existing: ExistingEventRow
  ): AgentFoundationEventAcceptance {
    const run = this.findRunForEvent(existing.eventId);
    return {
      identity,
      idempotencyKey: input.idempotencyKey,
      eventType: existing.eventType,
      payloadRef: existing.payloadRef ?? undefined,
      storageStatus: 'replayed',
      threadId: existing.threadId,
      sectionId: existing.sectionId,
      eventId: existing.eventId,
      runId: run?.runId ?? '',
      wake: this.getSchedulerWakeState(),
    };
  }

  private findRunForEvent(eventId: string): ExistingRunRow | undefined {
    const rows = this.sql<ExistingRunRow>`SELECT run_id as runId
      FROM agent_runs
      WHERE agent_id = ${this.name} AND trigger_event_id = ${eventId}
      LIMIT 1`;
    return rows[0];
  }

  private resolveOrCreateThread(identity: ThreadKeyIdentity, now: number): string {
    const rows = this.sql<ThreadRow>`SELECT thread_id as threadId
      FROM agent_threads
      WHERE agent_id = ${this.name} AND normalized_thread_key = ${identity.normalizedThreadKey}
      LIMIT 1`;
    const existing = rows[0];
    if (existing !== undefined) {
      return existing.threadId;
    }

    const threadId = crypto.randomUUID();
    void this.sql`INSERT INTO agent_threads (
      agent_id,
      thread_id,
      thread_key,
      normalized_thread_key,
      created_at_ms,
      updated_at_ms
    ) VALUES (${this.name}, ${threadId}, ${identity.threadKey}, ${identity.normalizedThreadKey}, ${now}, ${now})`;
    return threadId;
  }

  private resolveOrCreateSection(threadId: string, now: number): string {
    const rows = this.sql<SectionRow>`SELECT section_id as sectionId
      FROM agent_thread_sections
      WHERE agent_id = ${this.name} AND thread_id = ${threadId}
      ORDER BY sequence ASC
      LIMIT 1`;
    const existing = rows[0];
    if (existing !== undefined) {
      return existing.sectionId;
    }

    const sectionId = crypto.randomUUID();
    void this.sql`INSERT INTO agent_thread_sections (
      agent_id,
      thread_id,
      section_id,
      sequence,
      status,
      created_at_ms
    ) VALUES (${this.name}, ${threadId}, ${sectionId}, 1, 'active', ${now})`;
    return sectionId;
  }

  private appendEvent(
    input: AgentFoundationEventInput,
    threadId: string,
    sectionId: string,
    eventId: string,
    now: number
  ): void {
    const sequence = this.getNextEventSequence(threadId);
    void this.sql`INSERT INTO agent_events (
      agent_id,
      event_id,
      thread_id,
      section_id,
      idempotency_key,
      event_type,
      payload_ref,
      sequence,
      created_at_ms
    ) VALUES (
      ${this.name},
      ${eventId},
      ${threadId},
      ${sectionId},
      ${input.idempotencyKey},
      ${input.eventType},
      ${input.payloadRef ?? null},
      ${sequence},
      ${now}
    )`;
  }

  private getNextEventSequence(threadId: string): number {
    const rows = this.sql<SequenceRow>`SELECT COALESCE(MAX(sequence), 0) + 1 as nextSequence
      FROM agent_events
      WHERE agent_id = ${this.name} AND thread_id = ${threadId}`;
    return rows[0]?.nextSequence ?? 1;
  }

  private createPendingRun(
    threadId: string,
    eventId: string,
    runId: string,
    snapshotRef: string | undefined,
    now: number
  ): void {
    void this.sql`INSERT INTO agent_runs (
      agent_id,
      run_id,
      thread_id,
      trigger_event_id,
      status,
      created_at_ms,
      updated_at_ms
    ) VALUES (${this.name}, ${runId}, ${threadId}, ${eventId}, 'pending', ${now}, ${now})`;
    void this.sql`INSERT INTO agent_run_inputs (
      agent_id,
      run_id,
      snapshot_ref,
      trigger_event_id,
      created_at_ms
    ) VALUES (${this.name}, ${runId}, ${snapshotRef ?? null}, ${eventId}, ${now})`;
  }

  private recordSchedulerWake(now: number): AgentSchedulerWakeRecord {
    const current = this.readSchedulerWakeState();
    if (
      current !== undefined &&
      (current.wakeStatus === 'pending' || current.wakeStatus === 'running')
    ) {
      const pendingCount = current.pendingCount + 1;
      void this.sql`UPDATE agent_scheduler_wake_state
        SET pending_count = ${pendingCount}, updated_at_ms = ${now}
        WHERE agent_id = ${this.name}`;
      return {
        wakeStatus: current.wakeStatus,
        coalesced: true,
        pendingCount,
      };
    }

    this.upsertPendingSchedulerWake(now);
    return {
      wakeStatus: 'pending',
      coalesced: false,
      pendingCount: 1,
    };
  }

  private getSchedulerWakeState(): AgentSchedulerWakeRecord {
    const current = this.readSchedulerWakeState();
    if (
      current !== undefined &&
      (current.wakeStatus === 'pending' || current.wakeStatus === 'running')
    ) {
      return {
        wakeStatus: current.wakeStatus,
        coalesced: true,
        pendingCount: current.pendingCount,
      };
    }
    return {
      wakeStatus: 'pending',
      coalesced: false,
      pendingCount: 0,
    };
  }

  private readSchedulerWakeState(): WakeStateRow | undefined {
    const rows = this.sql<WakeStateRow>`SELECT
      wake_status as wakeStatus,
      pending_count as pendingCount
      FROM agent_scheduler_wake_state
      WHERE agent_id = ${this.name}
      LIMIT 1`;
    return rows[0];
  }

  private upsertPendingSchedulerWake(now: number): void {
    const current = this.readSchedulerWakeState();
    if (current === undefined) {
      void this.sql`INSERT INTO agent_scheduler_wake_state (
        agent_id,
        wake_status,
        pending_count,
        updated_at_ms
      ) VALUES (${this.name}, 'pending', 1, ${now})`;
      return;
    }
    void this.sql`UPDATE agent_scheduler_wake_state
      SET wake_status = 'pending', pending_count = 1, updated_at_ms = ${now}
      WHERE agent_id = ${this.name}`;
  }
}
