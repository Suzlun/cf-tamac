import type {
  AgentEventRow,
  AgentRunInputSnapshotRow,
  AgentStorageRepositories,
  AgentThreadMemoryItemRow,
} from '../storage';

/**
 * Stable Context Builder section order required by Agent Runtime and Memory specs.
 */
export const harnessContextPartKinds = [
  'identity_policy',
  'thread_memory',
  'handoff',
  'uncompacted_events',
  'retrieved_history',
  'agent_memory',
  'trigger_event',
] as const;

/**
 * Context Builder section kind.
 */
export type HarnessContextPartKind = (typeof harnessContextPartKinds)[number];

/**
 * Policy and seam input used by the Context Builder.
 */
export interface HarnessContextPolicyInput {
  readonly agentMemoryRefs?: readonly string[];
  readonly handoffRef?: string;
  readonly identity: string;
  readonly policy: string;
  readonly retrievedHistoryRefs?: readonly string[];
  readonly threadMemoryText?: string;
}

/**
 * Context part assembled for model prompt input.
 */
export interface HarnessContextPart {
  readonly events?: readonly AgentEventRow[];
  readonly kind: HarnessContextPartKind;
  readonly metadata?: Readonly<Record<string, string | number | readonly string[] | undefined>>;
  readonly order: number;
  readonly refs?: readonly string[];
  readonly status: 'ready' | 'pending' | 'empty';
  readonly text: string;
  readonly triggerEvent?: AgentEventRow;
}

/**
 * Ordered prompt/context bundle for one immutable AgentRun snapshot.
 */
export interface HarnessContextBundle {
  readonly agentId: string;
  readonly parts: readonly HarnessContextPart[];
  readonly runId: string;
  readonly snapshotRef: string;
  readonly threadId: string;
}

/**
 * Input accepted by the pure Context Builder assembly function.
 */
export interface BuildHarnessContextInput {
  readonly agentId: string;
  readonly events: readonly AgentEventRow[];
  readonly policy: HarnessContextPolicyInput;
  readonly snapshot: AgentRunInputSnapshotRow;
  readonly triggerEvent?: AgentEventRow;
}

/**
 * Build an ordered Context Builder bundle directly from snapshot-bound rows and seams.
 */
export function buildHarnessContext(input: BuildHarnessContextInput): HarnessContextBundle {
  const uncompactedEvents = selectSnapshotEvents(input.events, input.snapshot);
  const triggerEvent = selectTriggerEvent(input, uncompactedEvents);
  return {
    agentId: input.agentId,
    parts: [
      buildIdentityPolicyPart(input.policy),
      buildThreadMemoryPart(input.snapshot, input.policy),
      buildHandoffPart(input.snapshot, input.policy),
      buildUncompactedEventsPart(uncompactedEvents),
      buildRetrievedHistoryPart(input.policy),
      buildAgentMemoryPart(input.policy),
      buildTriggerEventPart(triggerEvent, input.snapshot.triggerEventId),
    ],
    runId: input.snapshot.runId,
    snapshotRef: input.snapshot.snapshotRef,
    threadId: input.snapshot.threadId,
  };
}

/**
 * Build an ordered Context Builder bundle by reading only snapshot-scoped repository data.
 */
export function buildHarnessContextFromRepositories(input: {
  readonly agentId: string;
  readonly policy: HarnessContextPolicyInput;
  readonly repositories: AgentStorageRepositories;
  readonly snapshot: AgentRunInputSnapshotRow;
}): HarnessContextBundle {
  const events = input.repositories.events
    .listEvents({
      afterThreadSequence: Math.max(input.snapshot.triggerEventStartSequence - 1, 0),
      limit: input.snapshot.uncompactedUpperSequence - input.snapshot.triggerEventStartSequence + 1,
      threadId: input.snapshot.threadId,
    })
    .filter((event) => event.threadSequence <= input.snapshot.uncompactedUpperSequence);
  const policy = {
    ...input.policy,
    threadMemoryText:
      input.policy.threadMemoryText ??
      resolveSnapshotThreadMemoryText(input.repositories, input.snapshot),
  };
  return buildHarnessContext({
    agentId: input.agentId,
    events,
    policy,
    snapshot: input.snapshot,
    triggerEvent: input.repositories.events.findByEventId(input.snapshot.triggerEventId),
  });
}

function resolveSnapshotThreadMemoryText(
  repositories: AgentStorageRepositories,
  snapshot: AgentRunInputSnapshotRow
): string | undefined {
  const snapshotRef = snapshot.threadMemoryRef;
  if (snapshotRef === null || snapshot.threadMemoryVersion <= 0) return undefined;
  const memory = repositories.memory.findActiveThreadMemoryVersion(snapshot.threadId);
  if (memory === undefined) return undefined;

  // The Run snapshot pins the version/ref that was current when the Run started. Do not silently
  // hydrate a newer active Memory version into an older snapshot.
  if (memory.version !== snapshot.threadMemoryVersion || memory.memoryRef !== snapshotRef) {
    return undefined;
  }

  const items = repositories.memory.listThreadMemoryItems(snapshot.threadId, memory.memoryId);
  if (items.length === 0) return `ThreadMemory version ${String(memory.version)} has no items.`;
  return [`ThreadMemory version ${String(memory.version)}:`, ...items.map(formatThreadMemoryItem)].join(
    '\n'
  );
}

function formatThreadMemoryItem(item: AgentThreadMemoryItemRow): string {
  const contentText = normalizePromptTextFragment(item.contentText ?? '');
  const parts = [
    `- ${item.memoryItemId}`,
    `status=${item.status}`,
    contentText === '' ? formatThreadMemoryItemReference(item) : `content=${contentText}`,
    item.provenanceRef === null ? undefined : `provenance=${item.provenanceRef}`,
    item.supersedesItemId === null ? undefined : `supersedes=${item.supersedesItemId}`,
    item.invalidatesItemId === null ? undefined : `invalidates=${item.invalidatesItemId}`,
    item.sourceCompactionId === null ? undefined : `source_compaction=${item.sourceCompactionId}`,
    item.sourceHistoryId === null ? undefined : `source_history=${item.sourceHistoryId}`,
    item.sourceEventId === null ? undefined : `source_event=${item.sourceEventId}`,
  ].filter((value): value is string => value !== undefined);
  return parts.join(' | ');
}

function formatThreadMemoryItemReference(item: AgentThreadMemoryItemRow): string {
  const refs = [
    item.contentRef === null ? undefined : `content_ref=${item.contentRef}`,
    item.contentSha256 === null ? undefined : `content_sha256=${item.contentSha256}`,
  ].filter((value): value is string => value !== undefined);
  return refs.length === 0 ? 'content=metadata-only' : refs.join(' ');
}

function normalizePromptTextFragment(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function buildIdentityPolicyPart(policy: HarnessContextPolicyInput): HarnessContextPart {
  return {
    kind: 'identity_policy',
    order: 0,
    status: 'ready',
    text: `Identity:\n${policy.identity}\n\nPolicy:\n${policy.policy}`,
  };
}

function buildThreadMemoryPart(
  snapshot: AgentRunInputSnapshotRow,
  policy: HarnessContextPolicyInput
): HarnessContextPart {
  const ref = snapshot.threadMemoryRef;
  return {
    kind: 'thread_memory',
    metadata: {
      digest: createContextDigest([ref ?? '', policy.threadMemoryText ?? '']),
      provenanceRef: ref ?? undefined,
      version: snapshot.threadMemoryVersion,
    },
    order: 1,
    refs: ref === null ? [] : [ref],
    status: policy.threadMemoryText === undefined && ref === null ? 'empty' : 'ready',
    text: policy.threadMemoryText ?? `ThreadMemory version ${String(snapshot.threadMemoryVersion)}`,
  };
}

function buildHandoffPart(
  snapshot: AgentRunInputSnapshotRow,
  policy: HarnessContextPolicyInput
): HarnessContextPart {
  const ref = policy.handoffRef ?? snapshot.latestReadyCompactionRef;
  return {
    kind: 'handoff',
    metadata: {
      digest: createContextDigest([ref ?? '']),
      provenanceRef: ref ?? undefined,
    },
    order: 2,
    refs: ref === null ? [] : [ref],
    status: ref === null ? 'empty' : 'ready',
    text: ref === null ? 'No latest ready Handoff seam.' : `Handoff seam: ${ref}`,
  };
}

function buildUncompactedEventsPart(events: readonly AgentEventRow[]): HarnessContextPart {
  return {
    events,
    kind: 'uncompacted_events',
    metadata: {
      digest: createContextDigest(events.map((event) => event.requestDigest ?? event.eventId)),
      eventIds: events.map((event) => event.eventId),
      maxThreadSequence: events.at(-1)?.threadSequence,
      minThreadSequence: events[0]?.threadSequence,
    },
    order: 3,
    status: events.length === 0 ? 'empty' : 'ready',
    text: events.map((event) => formatEventLine(event)).join('\n'),
  };
}

function buildRetrievedHistoryPart(policy: HarnessContextPolicyInput): HarnessContextPart {
  const refs = policy.retrievedHistoryRefs ?? [];
  return {
    kind: 'retrieved_history',
    metadata: {
      digest: createContextDigest(refs),
      historyRefs: refs,
    },
    order: 4,
    refs,
    status: refs.length === 0 ? 'pending' : 'ready',
    text: refs.length === 0 ? 'History retrieval seam pending.' : refs.join('\n'),
  };
}

function buildAgentMemoryPart(policy: HarnessContextPolicyInput): HarnessContextPart {
  const refs = policy.agentMemoryRefs ?? [];
  return {
    kind: 'agent_memory',
    metadata: {
      digest: createContextDigest(refs),
      memoryRefs: refs,
    },
    order: 5,
    refs,
    status: refs.length === 0 ? 'pending' : 'ready',
    text: refs.length === 0 ? 'Agent Memory retrieval seam pending.' : refs.join('\n'),
  };
}

function buildTriggerEventPart(
  event: AgentEventRow | undefined,
  triggerEventId: string
): HarnessContextPart {
  return {
    kind: 'trigger_event',
    metadata: {
      digest: createContextDigest([
        event?.requestDigest ?? '',
        event?.payloadSha256 ?? '',
        triggerEventId,
      ]),
      eventId: event?.eventId ?? triggerEventId,
      provenanceRef: event === undefined ? undefined : `event:${event.eventId}`,
    },
    order: 6,
    status: event === undefined ? 'pending' : 'ready',
    text:
      event === undefined
        ? `Trigger Event seam pending: ${triggerEventId}`
        : formatEventLine(event),
    triggerEvent: event,
  };
}

function formatEventLine(event: AgentEventRow): string {
  return `${String(event.threadSequence)} ${event.eventId} ${event.eventType}`;
}

function createContextDigest(values: readonly string[]): string {
  // Context metadata 用の軽量 digest は raw body ではなく、既存 digest/ref/ID のみから安定生成します。
  let hash = 2166136261;
  for (const value of values) {
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash.toString(16).padStart(8, '0');
}

function selectSnapshotEvents(
  events: readonly AgentEventRow[],
  snapshot: AgentRunInputSnapshotRow
): readonly AgentEventRow[] {
  return events
    .filter(
      (event) =>
        event.threadId === snapshot.threadId &&
        event.threadSequence >= snapshot.triggerEventStartSequence &&
        event.threadSequence <= snapshot.uncompactedUpperSequence
    )
    .sort((left, right) => left.threadSequence - right.threadSequence);
}

function selectTriggerEvent(
  input: BuildHarnessContextInput,
  uncompactedEvents: readonly AgentEventRow[]
): AgentEventRow | undefined {
  const candidate = input.triggerEvent;
  if (
    candidate?.eventId === input.snapshot.triggerEventId &&
    isEventWithinSnapshot(candidate, input.snapshot)
  ) {
    return candidate;
  }
  return uncompactedEvents.find((event) => event.eventId === input.snapshot.triggerEventId);
}

function isEventWithinSnapshot(event: AgentEventRow, snapshot: AgentRunInputSnapshotRow): boolean {
  return (
    event.threadId === snapshot.threadId &&
    event.threadSequence >= snapshot.triggerEventStartSequence &&
    event.threadSequence <= snapshot.uncompactedUpperSequence
  );
}
