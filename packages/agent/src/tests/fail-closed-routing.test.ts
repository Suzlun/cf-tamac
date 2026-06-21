import { create, toBinary } from '@bufbuild/protobuf';
import { describe, expect, it } from 'vitest';

import {
  GetAgentRequestSchema,
  GetEventRequestSchema,
  GetInstallationRequestSchema,
  GetInvocationRequestSchema,
  GetRunRequestSchema,
  GetScheduleRequestSchema,
  GetStateRequestSchema,
  GetThreadRequestSchema,
  PublishToolResultRequestSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { handleAgentConnectRequest } from '../rpc/connect-worker-adapter';

import type { AIAgent } from '../AIAgent';
import type { AgentWorkerEnv } from '../env';

const baseUrl = 'https://agent.example.test';

function createTestEnv(): AgentWorkerEnv {
  return {
    AGENT_BLOBS: {} as R2Bucket,
    AGENT_CLIENT_JWT_PUBLIC_KEYS: 'test-client-key',
    AGENT_EXTENSION_SIGNATURE_KEYS: 'test-extension-key',
    AGENT_MODEL_PROVIDER_SECRET_REFS: 'test-model-secret',
    AGENT_RPC_AUDIENCE: 'test-audience',
    AI_AGENT: {
      get: () => ({}) as DurableObjectStub<AIAgent>,
      idFromName: (name: string) => ({ name }) as unknown as DurableObjectId,
    } as unknown as DurableObjectNamespace<AIAgent>,
  };
}

function createRpcRequest(path: string, body: Uint8Array): Request {
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

describe('Agent fail-closed routing', () => {
  it('[AGENT-PLATFORM-S009] Foundation handlers fail closed for unmapped methods', async () => {
    const cases = [
      {
        body: toBinary(
          GetAgentRequestSchema,
          create(GetAgentRequestSchema, { agentId: 'agent-1' })
        ),
        path: '/cftamac.agent.v1.AgentLifecycleService/GetAgent',
      },
      {
        body: toBinary(
          GetEventRequestSchema,
          create(GetEventRequestSchema, { agentId: 'agent-1', eventId: 'event-1' })
        ),
        path: '/cftamac.agent.v1.AgentEventService/GetEvent',
      },
      {
        body: toBinary(
          GetThreadRequestSchema,
          create(GetThreadRequestSchema, { agentId: 'agent-1', threadId: 'thread-1' })
        ),
        path: '/cftamac.agent.v1.AgentThreadService/GetThread',
      },
      {
        body: toBinary(
          GetRunRequestSchema,
          create(GetRunRequestSchema, { agentId: 'agent-1', runId: 'run-1' })
        ),
        path: '/cftamac.agent.v1.AgentRunService/GetRun',
      },
      {
        body: toBinary(
          GetStateRequestSchema,
          create(GetStateRequestSchema, { agentId: 'agent-1' })
        ),
        path: '/cftamac.agent.v1.AgentStateService/GetState',
      },
      {
        body: toBinary(
          GetScheduleRequestSchema,
          create(GetScheduleRequestSchema, { agentId: 'agent-1', scheduleId: 'schedule-1' })
        ),
        path: '/cftamac.agent.v1.AgentScheduleService/GetSchedule',
      },
      {
        body: toBinary(
          GetInvocationRequestSchema,
          create(GetInvocationRequestSchema, { agentId: 'agent-1', invocationId: 'invocation-1' })
        ),
        path: '/cftamac.agent.v1.AgentToolService/GetInvocation',
      },
      {
        body: toBinary(
          GetInstallationRequestSchema,
          create(GetInstallationRequestSchema, {
            agentId: 'agent-1',
            installationId: 'installation-1',
          })
        ),
        path: '/cftamac.agent.v1.AgentExtensionService/GetInstallation',
      },
      {
        body: toBinary(
          PublishToolResultRequestSchema,
          create(PublishToolResultRequestSchema, {
            agentId: 'agent-1',
            idempotencyKey: 'idem-1',
            installationId: 'installation-1',
            invocationId: 'invocation-1',
            status: 'succeeded',
          })
        ),
        path: '/cftamac.agent.v1.ExtensionIngressService/PublishToolResult',
      },
    ] as const;

    for (const testCase of cases) {
      const response = await handleAgentConnectRequest(
        createRpcRequest(testCase.path, testCase.body),
        createTestEnv()
      );
      expect(await readErrorCode(response)).toBe('unimplemented');
    }
  });
});
