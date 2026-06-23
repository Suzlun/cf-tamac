import type { AgentDomainErrorKind } from './errors';
import type { AgentPrincipalContext, AgentPrincipalType } from './security/types';

/**
 * Lifecycle states considered by the final Agent-local authorization policy.
 */
export type AgentAuthorizationLifecycleState =
  | 'initializing'
  | 'active'
  | 'disabled'
  | 'destroying'
  | 'destroyed';

/**
 * Credential states considered by final authorization.
 */
export type AgentAuthorizationCredentialState =
  | 'active'
  | 'overlap'
  | 'expired'
  | 'revoked'
  | 'disabled';

/**
 * Operation requested against an Agent aggregate.
 */
export interface AgentAuthorizationOperation {
  readonly action: string;
  readonly method: string;
  readonly service: string;
}

/**
 * Capability ownership facts considered by final authorization.
 */
export interface AgentCapabilityOwnershipContext {
  readonly adapterConnectionId?: string;
  readonly capabilityId?: string;
  readonly capabilityKind?:
    | 'thread'
    | 'schedule'
    | 'tool'
    | 'integration'
    | 'delivery'
    | 'credential';
  readonly installationId?: string;
  readonly ownerAgentId: string;
  readonly toolId?: string;
}

/**
 * Input passed to the Agent-local final authorization policy.
 */
export interface AgentFinalAuthorizationRequest {
  readonly agentId: string;
  readonly capability?: AgentCapabilityOwnershipContext;
  readonly credentialState: AgentAuthorizationCredentialState;
  readonly lifecycleState: AgentAuthorizationLifecycleState;
  readonly operation: AgentAuthorizationOperation;
  readonly principal: AgentPrincipalContext;
  readonly requiredGrants: readonly string[];
  readonly requiredPrincipalTypes: readonly AgentPrincipalType[];
  readonly requiredScopes: readonly string[];
}

/**
 * Final authorization decision returned by Agent-local policy implementations.
 */
export type AgentFinalAuthorizationDecision =
  | {
      readonly matchedGrants: readonly string[];
      readonly matchedScopes: readonly string[];
      readonly status: 'allow';
    }
  | {
      readonly denialKind: AgentDomainErrorKind;
      readonly reason:
        | 'lifecycle_state'
        | 'credential_state'
        | 'principal_type'
        | 'scope_or_grant'
        | 'capability_ownership'
        | 'operation_not_allowed';
      readonly safeMessage: string;
      readonly status: 'deny';
    };

/**
 * Policy interface implemented later by AIAgent Durable Object state lookups.
 */
export interface AgentFinalAuthorizationPolicy {
  decide(input: AgentFinalAuthorizationRequest): Promise<AgentFinalAuthorizationDecision>;
}

/**
 * Build an allow decision for tests and foundational policy adapters.
 */
export function allowAgentAuthorization(
  input: {
    readonly matchedGrants?: readonly string[];
    readonly matchedScopes?: readonly string[];
  } = {}
): AgentFinalAuthorizationDecision {
  return {
    matchedGrants: input.matchedGrants ?? [],
    matchedScopes: input.matchedScopes ?? [],
    status: 'allow',
  };
}

/**
 * Build a deny decision for tests and foundational policy adapters.
 */
export function denyAgentAuthorization(input: {
  readonly denialKind?: AgentDomainErrorKind;
  readonly reason: Extract<AgentFinalAuthorizationDecision, { status: 'deny' }>['reason'];
  readonly safeMessage: string;
}): AgentFinalAuthorizationDecision {
  return {
    denialKind: input.denialKind ?? 'authorization',
    reason: input.reason,
    safeMessage: input.safeMessage,
    status: 'deny',
  };
}
