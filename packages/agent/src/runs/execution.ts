import { createAgentDomainError } from '../domain/errors';
import { computeSha256Hex } from '../domain/security';
import {
  buildHarnessContextFromRepositories,
  createEmptyHarnessBudgetUsage,
  createModelIoBytes,
  guardHarnessRunResultCommit,
  interpretHarnessDecisions,
  parseModelDecisionOutput,
  renderHarnessContextPrompt,
} from '../harness';

import { commitHarnessDecisionSideEffects } from './decision-commit';

import type { AgentRunSchedulerStartedRun } from './scheduler';
import type {
  ModelGenerationParameters,
  ModelProvider,
  ModelProviderFailureCategory,
} from '../harness';
import type { AgentStorageRepositories } from '../storage';

/**
 * Started Run を model invocation、decision parse、decision record commit、status transition まで進める入力です。
 */
export interface ExecuteStartedAgentRunInput {
  readonly agentId: string;
  readonly modelProvider: ModelProvider;
  readonly nowMs: number;
  readonly repositories: AgentStorageRepositories;
  readonly startedRun: AgentRunSchedulerStartedRun;
}

/**
 * Started Run execution の結果です。
 */
export interface ExecuteStartedAgentRunResult {
  readonly failureCategory?: ModelProviderFailureCategory | 'stale_generation';
  readonly invocationId?: string;
  readonly runId: string;
  readonly status: 'completed' | 'failed' | 'interrupted' | 'waiting';
}

/**
 * pending から running へ遷移済みの Run を model execution loop で処理します。
 *
 * @param input Run snapshot、repository set、provider seam を含む入力です。
 * @returns Run の最終または waiting status と invocation ID を返します。
 * @throws AgentDomainError snapshot が欠落しているなど内部不整合がある場合に発生します。
 */
export async function executeStartedAgentRun(
  input: ExecuteStartedAgentRunInput
): Promise<ExecuteStartedAgentRunResult> {
  const snapshot = input.startedRun.snapshot;
  const policy = readSnapshotPolicyOrFail(input);
  if (policy === undefined) {
    return {
      failureCategory: 'invalid_policy',
      runId: snapshot.runId,
      status: 'failed',
    };
  }
  const promptText = renderHarnessContextPrompt(
    buildHarnessContextFromRepositories({
      agentId: input.agentId,
      policy: {
        identity: `Agent identity: ${input.agentId}`,
        policy: `Model policy: ${policy.policyRef} (${policy.policyDigest})`,
      },
      repositories: input.repositories,
      snapshot,
    })
  );
  const promptDigest = {
    algorithm: 'sha-256' as const,
    byteLength: createModelIoBytes(promptText).byteLength,
    digestHex: await computeSha256Hex(createModelIoBytes(promptText)),
  };
  const invocation = input.repositories.modelInvocations.startInvocation({
    attempt: 1,
    createdAtMs: input.nowMs,
    decisionSchemaVersion: policy.decisionSchemaVersion,
    invocationId: `model:${snapshot.runId}:1`,
    leaseExpiresAtMs: input.nowMs + 60_000,
    leaseOwner: input.agentId,
    modelId: policy.modelId,
    policyDigest: policy.policyDigest,
    policyRef: policy.policyRef,
    provider: policy.provider,
    requestDigest: promptDigest.digestHex,
    runId: snapshot.runId,
    threadId: snapshot.threadId,
  });
  const providerResult = await input.modelProvider.invoke({
    context: buildHarnessContextFromRepositories({
      agentId: input.agentId,
      policy: {
        identity: `Agent identity: ${input.agentId}`,
        policy: `Model policy: ${policy.policyRef} (${policy.policyDigest})`,
      },
      repositories: input.repositories,
      snapshot,
    }),
    generationParameters: readSnapshotGenerationParameters(snapshot),
    policy: {
      decisionSchemaVersion: policy.decisionSchemaVersion,
      modelId: policy.modelId,
      policyDigest: policy.policyDigest,
      policyRef: policy.policyRef,
      provider: policy.provider,
      version: policy.version,
    },
    promptDigest,
    promptText,
    runId: snapshot.runId,
    threadId: snapshot.threadId,
  });
  if (providerResult.status === 'error') {
    input.repositories.modelInvocations.failInvocation({
      invocationId: invocation.invocationId,
      providerErrorCategory: providerResult.category,
      updatedAtMs: input.nowMs,
    });
    failRun(input.repositories, snapshot.runId, input.nowMs, providerResult.category);
    return {
      failureCategory: providerResult.category,
      invocationId: invocation.invocationId,
      runId: snapshot.runId,
      status: 'failed',
    };
  }
  const inputTokenCount = estimateTokenCount(promptText);
  const outputTokenCount =
    providerResult.outputTokenCount ?? estimateTokenCount(providerResult.outputText);
  input.repositories.modelInvocations.completeInvocation({
    inputTokenCount,
    invocationId: invocation.invocationId,
    latencyMs: providerResult.latencyMs,
    outputTokenCount,
    responseDigest: providerResult.responseDigest?.digestHex,
    status: 'succeeded',
    updatedAtMs: input.nowMs,
  });
  return commitModelOutput(input, providerResult.outputText, invocation.invocationId, {
    modelCalls: 1,
    tokens: inputTokenCount + outputTokenCount,
  });
}

function readSnapshotPolicyOrFail(input: ExecuteStartedAgentRunInput) {
  try {
    return requireSnapshotPolicy(input.startedRun.snapshot);
  } catch {
    failRun(input.repositories, input.startedRun.runId, input.nowMs, 'invalid_policy');
    return undefined;
  }
}

function commitModelOutput(
  input: ExecuteStartedAgentRunInput,
  outputText: string,
  invocationId: string,
  usage: { readonly modelCalls: number; readonly tokens: number }
): ExecuteStartedAgentRunResult {
  const snapshot = input.startedRun.snapshot;
  try {
    const parsed = parseModelDecisionOutput({
      decisionSchemaVersion: snapshot.decisionSchemaVersion ?? 'v1',
      outputText,
    });
    const guard = guardHarnessRunResultCommit({
      currentCapabilityGeneration: { integrationVersion: 0, toolSetVersion: 0 },
      expected: {
        configVersion: snapshot.configVersion,
        integrationVersion: snapshot.integrationVersion,
        snapshotRef: snapshot.snapshotRef,
        toolSetVersion: snapshot.toolSetVersion,
      },
      nowMs: input.nowMs,
      repositories: input.repositories,
      runId: snapshot.runId,
    });
    const interpreted = interpretHarnessDecisions({
      budgetPolicy: { maxModelCallsPerRun: 1 },
      budgetUsage: {
        ...createEmptyHarnessBudgetUsage(input.nowMs),
        modelCalls: usage.modelCalls,
        tokens: usage.tokens,
      },
      commitGuard: guard,
      decisions: parsed.decisions,
      nowMs: input.nowMs,
      recordSink: (record) => {
        input.repositories.runtime.recordHarnessDecision({
          createdAtMs: input.nowMs,
          decisionId: record.decisionId,
          decisionRecordId: record.decisionRecordId,
          decisionType: record.decisionType,
          reason: record.reason,
          runId: record.runId,
          seam: record.seam,
          status: record.status,
          threadId: record.threadId,
        });
      },
      runId: snapshot.runId,
      threadId: snapshot.threadId,
    });
    if (!guard.allowed) {
      failRun(input.repositories, snapshot.runId, input.nowMs, 'stale_generation');
      return {
        failureCategory: 'stale_generation',
        invocationId,
        runId: snapshot.runId,
        status: 'interrupted',
      };
    }
    const sideEffects = commitHarnessDecisionSideEffects({
      agentId: input.agentId,
      decisions: parsed.decisions,
      nowMs: input.nowMs,
      records: interpreted.records,
      repositories: input.repositories,
      snapshot,
    });
    const nextStatus = sideEffects.waiting
      ? 'waiting'
      : (interpreted.terminalStatus ?? 'completed');
    transitionRun(input.repositories, snapshot.runId, input.nowMs, nextStatus);
    return { invocationId, runId: snapshot.runId, status: nextStatus };
  } catch {
    failRun(input.repositories, snapshot.runId, input.nowMs, 'malformed_model_output');
    return {
      failureCategory: 'malformed_model_output',
      invocationId,
      runId: snapshot.runId,
      status: 'failed',
    };
  }
}

function requireSnapshotPolicy(snapshot: AgentRunSchedulerStartedRun['snapshot']) {
  if (
    snapshot.resolvedModelPolicyRef === undefined ||
    snapshot.resolvedModelPolicyRef === null ||
    snapshot.resolvedModelPolicyDigest === undefined ||
    snapshot.resolvedModelPolicyDigest === null ||
    snapshot.modelProvider === undefined ||
    snapshot.modelProvider === null ||
    snapshot.modelId === undefined ||
    snapshot.modelId === null ||
    snapshot.modelPolicyVersion === undefined ||
    snapshot.modelPolicyVersion === null ||
    snapshot.decisionSchemaVersion === undefined ||
    snapshot.decisionSchemaVersion === null
  ) {
    throw createAgentDomainError({
      kind: 'precondition',
      message: 'Run snapshot has no active model policy identity.',
    });
  }
  return {
    decisionSchemaVersion: snapshot.decisionSchemaVersion,
    modelId: snapshot.modelId,
    policyDigest: snapshot.resolvedModelPolicyDigest,
    policyRef: snapshot.resolvedModelPolicyRef,
    provider: snapshot.modelProvider,
    version: snapshot.modelPolicyVersion,
  };
}

function readSnapshotGenerationParameters(
  snapshot: AgentRunSchedulerStartedRun['snapshot']
): ModelGenerationParameters {
  return {
    maxOutputTokens: snapshot.generationMaxOutputTokens ?? undefined,
    temperature: parseSnapshotGenerationNumber(snapshot.generationTemperature),
    topP: parseSnapshotGenerationNumber(snapshot.generationTopP),
  };
}

function parseSnapshotGenerationNumber(value: string | null | undefined): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function failRun(
  repositories: AgentStorageRepositories,
  runId: string,
  nowMs: number,
  category: string
): void {
  repositories.runtime.recordBudgetLedgerEntry({
    budgetDimension: category,
    budgetRecordId: `model-failure:${runId}:${category}`,
    budgetScope: 'model_execution',
    createdAtMs: nowMs,
    reason: category,
    runId,
    status: 'failed',
    usedValue: 1,
  });
  transitionRun(repositories, runId, nowMs, 'failed');
}

function transitionRun(
  repositories: AgentStorageRepositories,
  runId: string,
  nowMs: number,
  status: 'completed' | 'failed' | 'interrupted' | 'waiting'
): void {
  const current = repositories.pendingRuns.findRunById(runId);
  repositories.pendingRuns.transitionRunStatus({
    fromStatus: current?.status,
    nowMs,
    runId,
    toStatus: status,
  });
}

function estimateTokenCount(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
