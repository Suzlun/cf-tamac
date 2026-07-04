import { allowAgentAuthorization, denyAgentAuthorization } from './authorization';

import type {
  AgentAuthorizationCredentialState,
  AgentFinalAuthorizationDecision,
  AgentFinalAuthorizationRequest,
} from './authorization';

const lifecycleQueryActions = new Set([
  'agent.get',
  'config.get',
  'event.get',
  'event.list',
  'integration.connection.list',
  'integration.get',
  'integration.list',
  'model_policy.get',
  'model_policy.list',
  'model_policy.validate',
  'run.get',
  'run.list',
  'schedule.get',
  'schedule.list',
  'section.list',
  'state.get',
  'thread.compaction.get_latest',
  'thread.get',
  'thread.list',
  'thread.history.search',
  'thread.memory.get',
  'tool.catalog.list',
  'tool.invocation.get',
  'tool.invocation.list',
]);

/**
 * Decide final Agent-local authorization from persisted profile, credential, principal, and grant facts.
 */
export function decideAgentFinalAuthorization(
  input: AgentFinalAuthorizationRequest
): AgentFinalAuthorizationDecision {
  const lifecycleDecision = decideLifecycle(input);
  if (lifecycleDecision !== undefined) {
    return lifecycleDecision;
  }
  const credentialDecision = decideCredential(input.credentialState);
  if (credentialDecision !== undefined) {
    return credentialDecision;
  }
  if (!input.requiredPrincipalTypes.includes(input.principal.principalType)) {
    return denyAgentAuthorization({
      reason: 'principal_type',
      safeMessage: 'Principal type is not allowed for this Agent operation.',
    });
  }
  if (input.capability !== undefined && input.capability.ownerAgentId !== input.agentId) {
    return denyAgentAuthorization({
      reason: 'capability_ownership',
      safeMessage: 'Requested capability is not owned by this Agent.',
    });
  }
  const matchedScopes = input.requiredScopes.filter((scope) =>
    input.principal.scopes.includes(scope)
  );
  const effectiveMatchedScopes = requiresScopedIntegrationScopedGrant(input) ? [] : matchedScopes;
  const matchedGrants = getMatchedScopedGrants(input);
  if (effectiveMatchedScopes.length === 0 && matchedGrants.length === 0) {
    return denyAgentAuthorization({
      reason: 'scope_or_grant',
      safeMessage: 'Principal lacks an Agent-local scope or grant for this operation.',
    });
  }
  return allowAgentAuthorization({ matchedGrants, matchedScopes: effectiveMatchedScopes });
}

function requiresScopedIntegrationToolResultGrant(input: AgentFinalAuthorizationRequest): boolean {
  // Integration callback は Provider 境界から来るため、generic Agent scope ではなく installation/tool scope 付き grant を必須にします。
  return (
    input.operation.action === 'tool.result.publish' &&
    input.principal.principalType === 'INTEGRATION_INSTALLATION'
  );
}

function requiresScopedIntegrationModelPolicyGrant(input: AgentFinalAuthorizationRequest): boolean {
  // Integration が model policy override を要求する場合は、汎用 scope ではなく Installation/Connection/Policy に絞った grant を必須にします。
  return (
    input.operation.action === 'event.model_policy.override' &&
    input.principal.principalType === 'INTEGRATION_INSTALLATION'
  );
}

function requiresScopedIntegrationScopedGrant(input: AgentFinalAuthorizationRequest): boolean {
  return (
    requiresScopedIntegrationToolResultGrant(input) ||
    requiresScopedIntegrationModelPolicyGrant(input)
  );
}

function getMatchedScopedGrants(input: AgentFinalAuthorizationRequest): readonly string[] {
  const grantDetails =
    input.principal.grantDetails ??
    (input.principal.grants ?? []).map((capability) => ({ capability, scopeRef: undefined }));
  return input.requiredGrants.filter((requiredGrant) =>
    grantDetails.some(
      (grant) =>
        grant.capability === requiredGrant && doesGrantScopeMatchCapability(grant.scopeRef, input)
    )
  );
}

function doesGrantScopeMatchCapability(
  scopeRef: string | undefined,
  input: AgentFinalAuthorizationRequest
): boolean {
  if (scopeRef === undefined || scopeRef === '')
    return !requiresScopedIntegrationScopedGrant(input);
  const capability = input.capability;
  if (capability === undefined) return true;
  const acceptedScopeRefs = [
    input.agentId,
    `agent:${input.agentId}`,
    capability.capabilityId,
    capability.capabilityId === undefined ? undefined : `capability:${capability.capabilityId}`,
    capability.installationId,
    capability.installationId === undefined
      ? undefined
      : `installation:${capability.installationId}`,
    capability.modelPolicyRef,
    capability.modelPolicyRef === undefined
      ? undefined
      : `model_policy:${capability.modelPolicyRef}`,
    capability.modelPolicyRef === undefined
      ? undefined
      : `agent.model_policy.override:${capability.modelPolicyRef}`,
    capability.adapterConnectionId,
    capability.adapterConnectionId === undefined
      ? undefined
      : `adapter_connection:${capability.adapterConnectionId}`,
    capability.toolId,
    capability.toolId === undefined ? undefined : `tool:${capability.toolId}`,
  ].filter((value): value is string => value !== undefined && value !== '');
  return acceptedScopeRefs.includes(scopeRef);
}

function decideLifecycle(
  input: AgentFinalAuthorizationRequest
): AgentFinalAuthorizationDecision | undefined {
  if (input.lifecycleState === 'destroyed' && !lifecycleQueryActions.has(input.operation.action)) {
    return denyAgentAuthorization({
      denialKind: 'precondition',
      reason: 'lifecycle_state',
      safeMessage: 'Destroyed Agent cannot accept mutating operations.',
    });
  }
  if (input.lifecycleState === 'destroying' && input.operation.action !== 'agent.destroy') {
    return denyAgentAuthorization({
      denialKind: 'precondition',
      reason: 'lifecycle_state',
      safeMessage: 'Agent lifecycle transition is already in progress.',
    });
  }
  return undefined;
}

function decideCredential(
  state: AgentAuthorizationCredentialState
): AgentFinalAuthorizationDecision | undefined {
  if (state === 'active' || state === 'overlap') {
    return undefined;
  }
  return denyAgentAuthorization({
    denialKind: 'authorization',
    reason: 'credential_state',
    safeMessage: 'Agent credential is not active for this operation.',
  });
}
