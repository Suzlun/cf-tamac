import { describe, expect, it } from 'vitest';

import {
  getAIAgentDurableObjectId,
  getAIAgentDurableObjectName,
  getAIAgentDurableObjectStub,
} from '../agent-routing';

import type { AIAgent } from '../AIAgent';
import type { AgentWorkerEnv } from '../env';

function createRoutingEnv(): AgentWorkerEnv {
  const idsByName = new Map<string, DurableObjectId>();
  const stubsById = new Map<DurableObjectId, DurableObjectStub<AIAgent>>();
  const namespace = {
    get: (id: DurableObjectId) => {
      const existing = stubsById.get(id);
      if (existing !== undefined) return existing;
      const stub = { id } as unknown as DurableObjectStub<AIAgent>;
      stubsById.set(id, stub);
      return stub;
    },
    idFromName: (name: string) => {
      const existing = idsByName.get(name);
      if (existing !== undefined) return existing;
      const id = { name } as unknown as DurableObjectId;
      idsByName.set(name, id);
      return id;
    },
  } as unknown as DurableObjectNamespace<AIAgent>;

  return {
    AGENT_BLOBS: {} as R2Bucket,
    AGENT_CLIENT_JWT_PUBLIC_KEYS: 'test-client-key',
    AGENT_INTEGRATION_SIGNATURE_KEYS: 'test-integration-key',
    AGENT_MODEL_PROVIDER_SECRET_REFS: 'test-model-secret',
    AGENT_RPC_AUDIENCE: 'test-audience',
    AI_AGENT: namespace,
  };
}

describe('Agent ID Durable Object routing', () => {
  it('[AGENT-PLATFORM-S004] Agent ID resolves to one AIAgent instance', () => {
    const env = createRoutingEnv();

    expect(getAIAgentDurableObjectName('agent-1')).toBe('agent-1');
    expect(() => getAIAgentDurableObjectName('')).toThrow('agent_id must not be empty.');

    const firstId = getAIAgentDurableObjectId(env, 'agent-1');
    const secondId = getAIAgentDurableObjectId(env, 'agent-1');
    const otherId = getAIAgentDurableObjectId(env, 'agent-2');

    expect(secondId).toBe(firstId);
    expect(otherId).not.toBe(firstId);

    expect(getAIAgentDurableObjectStub(env, 'agent-1')).toBe(
      getAIAgentDurableObjectStub(env, 'agent-1')
    );
    expect(getAIAgentDurableObjectStub(env, 'agent-2')).not.toBe(
      getAIAgentDurableObjectStub(env, 'agent-1')
    );
  });
});
