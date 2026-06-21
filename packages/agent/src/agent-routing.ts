import type { AIAgent } from './AIAgent';
import type { AgentWorkerEnv } from './env';

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
