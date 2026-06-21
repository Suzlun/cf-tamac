import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { describe, expect, it } from 'vitest';

import {
  CheckHealthRequestSchema,
  CheckHealthResponseSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { handleAgentConnectRequest } from '../rpc/connect-worker-adapter';

import type { AIAgent } from '../AIAgent';
import type { AgentWorkerEnv } from '../env';

const baseUrl = 'https://agent.example.test';
const healthRpcPath = '/cftamac.agent.v1.AgentHealthService/Check';

function createTestEnv(): AgentWorkerEnv {
  return {
    AGENT_BLOBS: {} as R2Bucket,
    AGENT_CLIENT_JWT_PUBLIC_KEYS: 'test-client-key',
    AGENT_EXTENSION_SIGNATURE_KEYS: 'test-extension-key',
    AGENT_MODEL_PROVIDER_SECRET_REFS: 'test-model-secret',
    AGENT_RPC_AUDIENCE: 'test-audience',
    AI_AGENT: {
      get: () =>
        ({
          checkHealth: () => ({
            agentId: 'agent-health',
            queue: 'agent_local',
            status: 'active',
            storage: 'sqlite',
          }),
        }) as unknown as DurableObjectStub<AIAgent>,
      idFromName: (name: string) => ({ name }) as unknown as DurableObjectId,
    } as unknown as DurableObjectNamespace<AIAgent>,
  };
}

function createHealthRequest(path: string, body?: BodyInit): Request {
  return new Request(`${baseUrl}${path}`, {
    body,
    headers: {
      'Content-Type': 'application/proto',
      'x-agent-test-grant': 'allow',
      'x-agent-test-principal-id': 'principal-1',
    },
    method: 'POST',
  });
}

async function readErrorCode(response: Response): Promise<string> {
  const parsed: unknown = JSON.parse(await response.text());
  expect(parsed).toEqual(expect.objectContaining({ code: expect.any(String) }));
  return (parsed as { readonly code: string }).code;
}

describe('Agent health RPC', () => {
  it('[AGENT-PLATFORM-S008] Health RPC reaches the Connect Worker facade', async () => {
    const env = createTestEnv();
    const requestBytes = toBinary(
      CheckHealthRequestSchema,
      create(CheckHealthRequestSchema, { agentId: 'agent-health' })
    );

    const response = await handleAgentConnectRequest(
      createHealthRequest(healthRpcPath, requestBytes),
      env
    );

    expect(response.status).toBe(200);
    expect(
      fromBinary(CheckHealthResponseSchema, new Uint8Array(await response.arrayBuffer()))
    ).toMatchObject({
      agentId: 'agent-health',
      serviceVersion: '0.1.0',
      status: 'active',
    });

    const restHealth = await handleAgentConnectRequest(
      createHealthRequest('/health', new Uint8Array()),
      env
    );
    expect(await readErrorCode(restHealth)).toBe('unimplemented');
  });
});
