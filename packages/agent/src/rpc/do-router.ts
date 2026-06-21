import type { CheckHealthResponseSchema } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { getAIAgentDurableObjectStub } from '../agent-routing';

import type { AgentWorkerEnv } from '../env';
import type { MessageInitShape } from '@bufbuild/protobuf';

/**
 * Protobuf init shape for the generated health response.
 */
export type AgentHealthResponseInit = MessageInitShape<typeof CheckHealthResponseSchema>;

/**
 * Dispatch a foundation health request to the Agent-owned Durable Object.
 */
export async function dispatchAgentHealthCheck(
  env: AgentWorkerEnv,
  agentId: string
): Promise<AgentHealthResponseInit> {
  const agent = getAIAgentDurableObjectStub(env, agentId);
  const health = await agent.checkHealth();
  return {
    agentId: health.agentId,
    status: health.status,
    serviceVersion: '0.1.0',
  };
}
