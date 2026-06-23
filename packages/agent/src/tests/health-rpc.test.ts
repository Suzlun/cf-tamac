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

function createTestEnv(): {
  readonly env: AgentWorkerEnv;
  readonly routedNames: readonly string[];
} {
  const routedNames: string[] = [];
  return {
    env: {
      AGENT_BLOBS: {} as R2Bucket,
      AGENT_CLIENT_JWT_PUBLIC_KEYS: 'test-client-key',
      AGENT_INTEGRATION_SIGNATURE_KEYS: 'test-integration-key',
      AGENT_MODEL_PROVIDER_SECRET_REFS: 'test-model-secret',
      AGENT_RPC_AUDIENCE: 'test-audience',
      AI_AGENT: {
        get: (id: DurableObjectId) =>
          ({
            checkHealth: () => ({
              agentId: (id as { readonly name: string }).name,
              queue: 'agent_local',
              status: 'active',
              storage: 'sqlite',
            }),
          }) as unknown as DurableObjectStub<AIAgent>,
        idFromName: (name: string) => {
          routedNames.push(name);
          return { name } as unknown as DurableObjectId;
        },
      } as unknown as DurableObjectNamespace<AIAgent>,
    },
    routedNames,
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
  it('[AGENT-PLATFORM-S008] [AGENT-HEALTH-S001] [AGENT-HEALTH-S002] Health RPC reaches the Connect Worker facade and safe AIAgent routing', async () => {
    const { env, routedNames } = createTestEnv();
    const requestBytes = toBinary(
      CheckHealthRequestSchema,
      create(CheckHealthRequestSchema, { agentId: 'agent-health', includeDependencies: true })
    );

    const response = await handleAgentConnectRequest(
      createHealthRequest(healthRpcPath, requestBytes),
      env
    );

    expect(response.status).toBe(200);
    const responseBody = fromBinary(
      CheckHealthResponseSchema,
      new Uint8Array(await response.arrayBuffer())
    );
    expect(responseBody).toMatchObject({
      agentId: 'agent-health',
      contractPackage: 'cftamac.agent.v1',
      dependencyStatusRef: 'storage:sqlite;queue:agent_local',
      serviceVersion: '0.1.0',
      status: 'serving',
    });
    expect(responseBody.checkedAtUnixMs > 0n).toBe(true);
    expect(responseBody.health).toMatchObject({
      agentId: 'agent-health',
      contractPackage: 'cftamac.agent.v1',
      dependencyStatusRef: 'storage:sqlite;queue:agent_local',
      serviceVersion: '0.1.0',
      servingStatus: 'serving',
    });
    expect(routedNames).toEqual(['agent-health']);
    expect(stringifyHealthResponse(responseBody)).not.toMatch(
      /credential|secret|token|thread|memory|payload/i
    );

    const missingAgentId = await handleAgentConnectRequest(
      createHealthRequest(
        healthRpcPath,
        toBinary(CheckHealthRequestSchema, create(CheckHealthRequestSchema, { agentId: '' }))
      ),
      env
    );
    expect(await readErrorCode(missingAgentId)).toBe('invalid_argument');

    const restHealth = await handleAgentConnectRequest(
      createHealthRequest('/health', new Uint8Array()),
      env
    );
    expect(await readErrorCode(restHealth)).toBe('unimplemented');
  });
});

function stringifyHealthResponse(response: unknown): string {
  return JSON.stringify(response, (_key, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value
  );
}
