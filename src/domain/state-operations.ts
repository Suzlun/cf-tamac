import { createAgentStorageThresholdSnapshot } from '../storage/storage-thresholds';

import {
  assertAgentContext,
  authorizeAgentOperation,
  createEmptyCapabilitySummary,
} from './agent-operation-utils';
import { createAgentDomainError } from './errors';
import { mapAgentModelPolicySummaryRow } from './model-policy-operations';

import type {
  AgentModelExecutionCapabilityView,
  AgentScopedQuery,
  GetAgentStateResult,
} from './agent-core';
import type { AgentStorageRepositories } from '../storage';

/**
 * Run GetState against Agent-owned storage and return only secret-free operational metadata.
 */
export function getAgentStateFromStore(input: {
  readonly agentId: string;
  readonly modelExecution?: AgentModelExecutionCapabilityView;
  readonly query: AgentScopedQuery;
  readonly repositories: AgentStorageRepositories;
  readonly storageUsageCurrentBytes?: number;
}): GetAgentStateResult {
  assertAgentContext(input.agentId, input.query.context);
  const profile = authorizeAgentOperation({
    action: 'state.get',
    context: input.query.context,
    method: 'GetState',
    repositories: input.repositories,
    requiredPrincipalTypes: ['CLIENT_SERVICE', 'ADMIN_OPERATOR', 'INTERNAL_SERVICE'],
    requiredScopes: ['agent.rpc', 'agent.read'],
    service: 'cftamac.agent.v1.AgentStateService',
  });
  if (profile === undefined) {
    throw createAgentDomainError({ kind: 'not_found', message: 'Agent not found.' });
  }
  const currentRun = input.repositories.pendingRuns.findCurrentRun();
  const wake = input.repositories.schedulerWakes.readWakeState();
  const config = input.repositories.config.getLatestConfig();
  const defaultModelPolicy =
    config?.modelPolicyRef === null || config?.modelPolicyRef === undefined
      ? undefined
      : input.repositories.modelPolicies.getPolicy(config.modelPolicyRef);
  const storageSnapshot = createAgentStorageThresholdSnapshot({
    currentBytes: input.storageUsageCurrentBytes,
  });
  const storage = {
    agentId: input.agentId,
    compactionPriorityPercent: storageSnapshot.compactionPriorityPercent,
    criticalPercent: storageSnapshot.criticalPercent,
    currentPercent: storageSnapshot.currentPercent,
    forceLargeBodyR2Percent: storageSnapshot.forceLargeBodyR2Percent,
    inlinePayloadLimitBytes: storageSnapshot.inlinePayloadLimitBytes,
    warningPercent: storageSnapshot.warningPercent,
  };
  return {
    state: {
      agentId: input.agentId,
      capabilitySummary: createEmptyCapabilitySummary(input.agentId),
      configVersion: profile.configVersion,
      currentRunId: currentRun?.runId,
      defaultModelPolicy:
        defaultModelPolicy === undefined
          ? undefined
          : mapAgentModelPolicySummaryRow(input.agentId, defaultModelPolicy),
      lifecycleStatus: profile.lifecycleStatus,
      modelExecution: input.modelExecution,
      schedulerStatus: wake?.wakeStatus ?? 'idle',
      stateVersion: `${String(profile.configVersion)}:${String(profile.updatedAtMs)}`,
      storageStatus: storageSnapshot.status,
      updatedAtMs: profile.updatedAtMs,
    },
    modelExecution: input.modelExecution,
    storage,
  };
}
