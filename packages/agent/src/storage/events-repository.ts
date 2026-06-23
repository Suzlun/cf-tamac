import { and, asc, desc, eq, gt, max } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from './schema';

import type { AgentStorageDatabase } from './database';

/**
 * Row stored for an accepted Agent Event.
 */
export interface AgentEventRow {
  readonly eventId: string;
  readonly threadId: string;
  readonly sectionId: string;
  readonly eventType: string;
  readonly idempotencyKey: string;
  readonly source: string;
  readonly threadKey: string;
  readonly normalizedThreadKey: string;
  readonly requestDigest: string | null;
  readonly payloadRef: string | null;
  readonly payloadContentType: string | null;
  readonly payloadByteSize: number | null;
  readonly payloadSha256: string | null;
  readonly payloadStorageClass: string | null;
  readonly payloadInlineBase64: string | null;
  readonly agentSequence: number;
  readonly threadSequence: number;
  readonly occurredAtMs: number;
  readonly correlationId: string | null;
  readonly causationId: string | null;
  readonly deliveryContextId?: string | null;
  readonly runId: string | null;
  readonly createdAtMs: number;
}

/**
 * Next sequence numbers for an Agent Event append.
 */
export interface AgentEventSequencePair {
  readonly agentSequence: number;
  readonly threadSequence: number;
}

/**
 * Input for appending an accepted Agent Event.
 */
export interface AppendAgentEventInput {
  readonly eventId: string;
  readonly threadId: string;
  readonly sectionId: string;
  readonly idempotencyKey: string;
  readonly eventType: string;
  readonly source: string;
  readonly threadKey: string;
  readonly normalizedThreadKey: string;
  readonly requestDigest?: string;
  readonly payloadRef?: string;
  readonly payloadContentType?: string;
  readonly payloadByteSize?: number;
  readonly payloadSha256?: string;
  readonly payloadStorageClass?: string;
  readonly payloadInlineBase64?: string;
  readonly sequences: AgentEventSequencePair;
  readonly occurredAtMs: number;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly deliveryContextId?: string;
  readonly runId?: string;
  readonly createdAtMs: number;
}

/**
 * Input for paginating accepted Agent Events.
 */
export interface ListAgentEventsInput {
  readonly threadId: string;
  readonly limit: number;
  readonly afterThreadSequence?: number;
  readonly sectionId?: string;
  readonly eventType?: string;
}

/**
 * Repository for accepted Agent Event records.
 */
export interface AgentEventsRepository {
  readonly tableName: 'agent_events';
  appendEvent(input: AppendAgentEventInput): void;
  findByEventId(eventId: string): AgentEventRow | undefined;
  findByIdempotencyKey(idempotencyKey: string): AgentEventRow | undefined;
  findLatestForThread(threadId: string): AgentEventRow | undefined;
  getNextSequences(threadId: string): AgentEventSequencePair;
  listEvents(input: ListAgentEventsInput): AgentEventRow[];
}

/**
 * Create a repository for accepted Agent Event records.
 */
export function createAgentEventsRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentEventsRepository {
  const table = agentStorageDrizzleSchema.agentEvents;
  return {
    tableName: 'agent_events',
    appendEvent(input) {
      database
        .insert(table)
        .values({
          agentId,
          agentSequence: input.sequences.agentSequence,
          causationId: input.causationId ?? null,
          correlationId: input.correlationId ?? null,
          createdAtMs: input.createdAtMs,
          deliveryContextId: input.deliveryContextId ?? null,
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
        })
        .run();
    },
    findByEventId(eventId) {
      return database
        .select()
        .from(table)
        .where(and(eq(table.agentId, agentId), eq(table.eventId, eventId)))
        .limit(1)
        .get();
    },
    findByIdempotencyKey(idempotencyKey) {
      return database
        .select()
        .from(table)
        .where(and(eq(table.agentId, agentId), eq(table.idempotencyKey, idempotencyKey)))
        .limit(1)
        .get();
    },
    findLatestForThread(threadId) {
      return database
        .select()
        .from(table)
        .where(and(eq(table.agentId, agentId), eq(table.threadId, threadId)))
        .orderBy(desc(table.threadSequence))
        .limit(1)
        .get();
    },
    getNextSequences(threadId) {
      const agentRow = database
        .select({ lastSequence: max(table.agentSequence) })
        .from(table)
        .where(eq(table.agentId, agentId))
        .get();
      const threadRow = database
        .select({ lastSequence: max(table.threadSequence) })
        .from(table)
        .where(and(eq(table.agentId, agentId), eq(table.threadId, threadId)))
        .get();
      return {
        agentSequence: (agentRow?.lastSequence ?? 0) + 1,
        threadSequence: (threadRow?.lastSequence ?? 0) + 1,
      };
    },
    listEvents(input) {
      return database
        .select()
        .from(table)
        .where(
          and(
            eq(table.agentId, agentId),
            eq(table.threadId, input.threadId),
            gt(table.threadSequence, input.afterThreadSequence ?? 0),
            input.sectionId === undefined ? undefined : eq(table.sectionId, input.sectionId),
            input.eventType === undefined ? undefined : eq(table.eventType, input.eventType)
          )
        )
        .orderBy(asc(table.threadSequence))
        .limit(input.limit)
        .all();
    },
  };
}
