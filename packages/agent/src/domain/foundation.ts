/**
 * Foundation identity for an Agent aggregate.
 */
export interface AgentIdentity {
  readonly agentId: string;
}

/**
 * Initial Agent lifecycle statuses recognized by the foundation.
 */
export const agentLifecycleStatuses = [
  'initializing',
  'active',
  'destroying',
  'destroyed',
] as const;

/**
 * Agent lifecycle status value.
 */
export type AgentLifecycleStatus = (typeof agentLifecycleStatuses)[number];
