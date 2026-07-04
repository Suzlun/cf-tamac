import { describe, expect, it } from 'vitest';

import {
  buildHarnessContext,
  createModelIoBytes,
  parseModelDecisionOutput,
  renderHarnessContextPrompt,
  type ModelProviderRequest,
} from '../harness';
import { createWorkersAiModelProvider } from '../model-provider-workers-ai';
import {
  createAgentModelInvocationRepository,
  type AgentEventRow,
  type AgentModelInvocationRow,
  type AgentRunInputSnapshotRow,
} from '../storage';

import type { AgentWorkersAiBinding } from '../env';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

describe('Agent model invocation boundary', () => {
  it('[AGENT-MODEL-INVOCATION-S001] Missing Workers AI binding fails closed before provider call', async () => {
    const provider = createWorkersAiModelProvider(undefined);

    const result = await provider.invoke(createModelProviderRequest());

    expect(result).toMatchObject({
      category: 'missing_binding',
      retryable: false,
      status: 'error',
    });
    expect(JSON.stringify(result)).not.toMatch(/prompt|completion|reasoning|credential|token/i);
  });

  it('[AGENT-MODEL-INVOCATION-S002] [AGENT-SECURITY-S018] Provider failure is normalized without raw request or response leakage', async () => {
    const provider = createWorkersAiModelProvider({
      run: () => Promise.reject(new Error('429 raw-token sk-provider-secret')),
    } satisfies AgentWorkersAiBinding);

    const result = await provider.invoke(createModelProviderRequest());

    expect(result).toMatchObject({
      category: 'provider_rate_limited',
      retryable: true,
      safeMessage: 'Workers AI provider rate limited the request.',
      status: 'error',
    });
    expect(JSON.stringify(result)).not.toMatch(/raw-token|sk-provider-secret|prompt text/i);
  });

  it('[AGENT-MODEL-INVOCATION-S001] Workers AI request includes resolved generation parameters', async () => {
    const calls: [string, unknown][] = [];
    const provider = createWorkersAiModelProvider({
      run: (model, input) => {
        calls.push([model, input]);
        return Promise.resolve({ response: JSON.stringify({ decisions: [] }) });
      },
    } satisfies AgentWorkersAiBinding);

    await provider.invoke({
      ...createModelProviderRequest(),
      generationParameters: {
        maxOutputTokens: 256,
        temperature: 0.35,
        topP: 0.75,
      },
    });

    expect(calls[0]?.[0]).toBe('@cf/meta/llama-3.1-8b-instruct');
    expect(calls[0]?.[1]).toMatchObject({
      max_tokens: 256,
      temperature: 0.35,
      top_p: 0.75,
    });
  });

  it('[AGENT-MODEL-INVOCATION-S003] Context bundle renders model input in stable snapshot order', () => {
    const bundle = buildHarnessContext({
      agentId: 'agent-alpha',
      events: [createEvent('event-2', 2), createEvent('event-1', 1)],
      policy: {
        agentMemoryRefs: ['agent-memory://global'],
        handoffRef: 'handoff://latest-ready',
        identity: 'Agent Alpha',
        policy: 'Use the resolved model policy snapshot.',
        retrievedHistoryRefs: ['history://ready'],
        threadMemoryText: 'Thread memory v3',
      },
      snapshot: createSnapshot(),
    });

    const prompt = renderHarnessContextPrompt(bundle);

    expect(bundle.parts.map((part) => part.kind)).toEqual([
      'identity_policy',
      'thread_memory',
      'handoff',
      'uncompacted_events',
      'retrieved_history',
      'agent_memory',
      'trigger_event',
    ]);
    expect(prompt.indexOf('[identity_policy:ready]')).toBeLessThan(
      prompt.indexOf('[thread_memory:ready]')
    );
    expect(prompt.indexOf('[thread_memory:ready]')).toBeLessThan(prompt.indexOf('[handoff:ready]'));
    expect(prompt.indexOf('1 event-1 customer.message')).toBeLessThan(
      prompt.indexOf('2 event-2 customer.message')
    );
    expect(prompt).not.toMatch(/payload body|raw prompt|raw completion|reasoning/i);
  });

  it('[AGENT-MODEL-INVOCATION-S004] Valid model output converts to typed HarnessDecision values', () => {
    const parsed = parseModelDecisionOutput({
      decisionSchemaVersion: 'v1',
      outputText: JSON.stringify({
        decisions: [
          {
            decisionId: 'respond-1',
            deliveryContextId: 'delivery-1',
            responseRef: 'response://1',
            type: 'respond',
          },
          {
            decisionId: 'memory-1',
            memoryScope: 'thread',
            operationRef: 'memory://write/1',
            type: 'write_memory',
          },
          { decisionId: 'stop-1', reason: 'done', type: 'stop' },
        ],
      }),
    });

    expect(parsed.decisions.map((decision) => decision.type)).toEqual([
      'respond',
      'write_memory',
      'stop',
    ]);
    expect(parsed.safeSummary).toBe('respond:respond-1,write_memory:memory-1,stop:stop-1');
    expect(JSON.stringify(parsed)).not.toMatch(/chain-of-thought|hidden reasoning/i);
  });

  it('[AGENT-MODEL-INVOCATION-S005] Malformed model output is rejected before side effects', () => {
    const sideEffects: string[] = [];

    expect(() =>
      parseModelDecisionOutput({ decisionSchemaVersion: 'v1', outputText: '{not-json' })
    ).toThrow(/malformed model output/);
    expect(() =>
      parseModelDecisionOutput({
        decisionSchemaVersion: 'v1',
        outputText: JSON.stringify({ decisions: [{ decisionId: 'x', type: 'unknown' }] }),
      })
    ).toThrow(/unsupported decision type/);
    expect(() =>
      parseModelDecisionOutput({ decisionSchemaVersion: 'v0', outputText: JSON.stringify([]) })
    ).toThrow(/unsupported decision schema/);
    expect(sideEffects).toHaveLength(0);
  });

  it('[AGENT-MODEL-INVOCATION-S006] [AGENT-SECURITY-S017] Invocation ledger stores safe metadata and digests only', () => {
    const rows: Mutable<AgentModelInvocationRow>[] = [];
    const repository = createAgentModelInvocationRepository(
      'agent-alpha',
      createInMemoryInvocationDatabase(rows)
    );

    const started = repository.startInvocation({
      attempt: 1,
      createdAtMs: 1_700_000_000_000,
      decisionSchemaVersion: 'v1',
      invocationId: 'model:run-1:1',
      leaseExpiresAtMs: 1_700_000_060_000,
      leaseOwner: 'agent-alpha',
      modelId: '@cf/meta/llama-3.1-8b-instruct',
      policyDigest: 'a'.repeat(64),
      policyRef: 'workers-ai-default',
      provider: 'workers-ai',
      requestDigest: 'b'.repeat(64),
      runId: 'run-1',
      threadId: 'thread-1',
    });
    const completed = repository.completeInvocation({
      inputTokenCount: 40,
      invocationId: started.invocationId,
      latencyMs: 25,
      outputTokenCount: 12,
      responseDigest: 'c'.repeat(64),
      status: 'succeeded',
      updatedAtMs: 1_700_000_000_025,
    });

    expect(completed).toMatchObject({
      inputTokenCount: 40,
      outputTokenCount: 12,
      requestDigest: 'b'.repeat(64),
      responseDigest: 'c'.repeat(64),
      status: 'succeeded',
    });
    expect(JSON.stringify(rows)).not.toMatch(
      /raw prompt|raw completion|reasoning|credential|secret|bearer|sk-/i
    );
  });

  it('[AGENT-MODEL-INVOCATION-S007] Lease recovery finds a single recoverable active invocation', () => {
    const rows: Mutable<AgentModelInvocationRow>[] = [
      {
        attempt: 1,
        createdAtMs: 1_700_000_000_000,
        decisionSchemaVersion: 'v1',
        heartbeatAtMs: 1_700_000_000_000,
        inputTokenCount: null,
        invocationId: 'model:run-1:1',
        latencyMs: null,
        leaseExpiresAtMs: 1_700_000_010_000,
        leaseOwner: 'agent-alpha',
        modelId: '@cf/meta/llama-3.1-8b-instruct',
        outputTokenCount: null,
        policyDigest: 'a'.repeat(64),
        policyRef: 'workers-ai-default',
        provider: 'workers-ai',
        providerErrorCategory: null,
        requestDigest: 'b'.repeat(64),
        responseDigest: null,
        runId: 'run-1',
        safeMetadataRef: null,
        status: 'running',
        threadId: 'thread-1',
        updatedAtMs: 1_700_000_000_000,
      },
    ];
    const repository = createAgentModelInvocationRepository(
      'agent-alpha',
      createInMemoryInvocationDatabase(rows)
    );

    const recoverable = repository.findRecoverableInvocation(1_700_000_020_000);

    expect(recoverable).toMatchObject({
      invocationId: 'model:run-1:1',
      runId: 'run-1',
      status: 'running',
    });
  });
});

function createModelProviderRequest(): ModelProviderRequest {
  const context = buildHarnessContext({
    agentId: 'agent-alpha',
    events: [createEvent('event-1', 1)],
    policy: { identity: 'Agent Alpha', policy: 'Safe policy' },
    snapshot: createSnapshot(),
  });
  const promptText = renderHarnessContextPrompt(context);
  return {
    context,
    generationParameters: {
      maxOutputTokens: 1024,
      temperature: 0.2,
      topP: 0.9,
    },
    policy: {
      decisionSchemaVersion: 'v1',
      modelId: '@cf/meta/llama-3.1-8b-instruct',
      policyDigest: 'a'.repeat(64),
      policyRef: 'workers-ai-default',
      provider: 'workers-ai',
      version: 1,
    },
    promptDigest: {
      algorithm: 'sha-256',
      byteLength: createModelIoBytes(promptText).byteLength,
      digestHex: 'b'.repeat(64),
    },
    promptText,
    runId: 'run-1',
    threadId: 'thread-1',
  };
}

function createSnapshot(): AgentRunInputSnapshotRow {
  return {
    configVersion: 4,
    createdAtMs: 1_700_000_000_000,
    decisionSchemaVersion: 'v1',
    integrationVersion: 2,
    latestReadyCompactionRef: 'handoff://latest-ready',
    modelId: '@cf/meta/llama-3.1-8b-instruct',
    modelPolicySource: 'agent_default',
    modelPolicyVersion: 1,
    modelProvider: 'workers-ai',
    requestedModelPolicyRef: null,
    resolvedModelPolicyDigest: 'a'.repeat(64),
    resolvedModelPolicyRef: 'workers-ai-default',
    runId: 'run-1',
    snapshotRef: 'snapshot://run-1',
    threadId: 'thread-1',
    threadMemoryRef: 'thread-memory://thread-1/v3',
    threadMemoryVersion: 3,
    toolSetVersion: 5,
    triggerEventEndSequence: 2,
    triggerEventId: 'event-1',
    triggerEventStartSequence: 1,
    uncompactedUpperSequence: 2,
  };
}

function createEvent(eventId: string, threadSequence: number): AgentEventRow {
  return {
    agentSequence: threadSequence,
    causationId: null,
    correlationId: null,
    createdAtMs: 1_700_000_000_000 + threadSequence,
    eventId,
    eventType: 'customer.message',
    idempotencyKey: `idem-${eventId}`,
    normalizedThreadKey: 'customer:alpha',
    occurredAtMs: 1_700_000_000_000 + threadSequence,
    payloadByteSize: null,
    payloadContentType: null,
    payloadInlineBase64: null,
    payloadRef: null,
    payloadSha256: null,
    payloadStorageClass: null,
    requestDigest: null,
    runId: 'run-1',
    sectionId: 'section-1',
    source: 'client',
    threadId: 'thread-1',
    threadKey: 'customer:alpha',
    threadSequence,
  };
}

function createInMemoryInvocationDatabase(rows: Mutable<AgentModelInvocationRow>[]) {
  return {
    insert: () => ({
      values: (value: Mutable<AgentModelInvocationRow> & { readonly agentId: string }) => ({
        run: () => {
          rows.push(value);
        },
      }),
    }),
    select: () => {
      const query = {
        all: () => [...rows],
        from: () => query,
        get: () => rows[0],
        limit: () => query,
        orderBy: () => query,
        where: () => query,
      };
      return query;
    },
    update: () => ({
      set: (value: Partial<Mutable<AgentModelInvocationRow>>) => ({
        where: () => ({
          run: () => {
            if (rows[0] !== undefined) Object.assign(rows[0], value);
          },
        }),
      }),
    }),
  } as unknown as Parameters<typeof createAgentModelInvocationRepository>[1];
}
