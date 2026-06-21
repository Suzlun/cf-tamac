import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { describe, expect, it } from 'vitest';

import {
  CheckHealthRequestSchema,
  CheckHealthResponseSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { handleAgentConnectRequest } from '../rpc/connect-worker-adapter';

import type { AIAgent } from '../AIAgent';
import type { AgentWorkerEnv } from '../env';

const healthPath = '/cftamac.agent.v1.AgentHealthService/Check';
const baseUrl = 'https://agent.example.test';

function createTestEnv(): AgentWorkerEnv {
  const durableObjectNamespace = {
    idFromName: (name: string) => ({ name }) as unknown as DurableObjectId,
    get: () =>
      ({
        checkHealth: () => ({
          agentId: 'agent-1',
          queue: 'agent_local',
          status: 'active',
          storage: 'sqlite',
        }),
      }) as unknown as DurableObjectStub<AIAgent>,
  } as unknown as DurableObjectNamespace<AIAgent>;

  return {
    AGENT_BLOBS: {} as R2Bucket,
    AGENT_CLIENT_JWT_PUBLIC_KEYS: 'test-client-key',
    AGENT_EXTENSION_SIGNATURE_KEYS: 'test-extension-key',
    AGENT_MODEL_PROVIDER_SECRET_REFS: 'test-model-secret',
    AGENT_RPC_AUDIENCE: 'test-audience',
    AI_AGENT: durableObjectNamespace,
  };
}

function createAuthenticatedRequest(input: {
  readonly body?: BodyInit;
  readonly contentType?: string;
  readonly method?: string;
}): Request {
  const headers = new Headers({
    'x-agent-test-grant': 'allow',
    'x-agent-test-principal-id': 'principal-1',
  });
  if (input.contentType !== undefined) {
    headers.set('Content-Type', input.contentType);
  }
  return new Request(`${baseUrl}${healthPath}`, {
    body: input.body,
    headers,
    method: input.method ?? 'POST',
  });
}

async function readErrorCode(response: Response): Promise<string> {
  const parsed: unknown = JSON.parse(await response.text());
  expect(parsed).toEqual(expect.objectContaining({ code: expect.any(String) }));
  return (parsed as { readonly code: string }).code;
}

describe('Agent Connect binary transport', () => {
  it('[AGENT-PLATFORM-S002] Binary Connect accepted and JSON rejected', async () => {
    const env = createTestEnv();
    const body = toBinary(
      CheckHealthRequestSchema,
      create(CheckHealthRequestSchema, { agentId: 'agent-1' })
    );

    const success = await handleAgentConnectRequest(
      createAuthenticatedRequest({ body, contentType: 'application/proto' }),
      env
    );
    expect(success.status).toBe(200);
    const successBody = fromBinary(
      CheckHealthResponseSchema,
      new Uint8Array(await success.arrayBuffer())
    );
    expect(successBody).toMatchObject({
      agentId: 'agent-1',
      serviceVersion: '0.1.0',
      status: 'active',
    });

    const json = await handleAgentConnectRequest(
      createAuthenticatedRequest({ body: '{}', contentType: 'application/json' }),
      env
    );
    expect(await readErrorCode(json)).toBe('unimplemented');

    const get = await handleAgentConnectRequest(
      createAuthenticatedRequest({ contentType: 'application/proto', method: 'GET' }),
      env
    );
    expect(await readErrorCode(get)).toBe('unimplemented');

    const missingContentType = await handleAgentConnectRequest(
      createAuthenticatedRequest({ body }),
      env
    );
    expect(await readErrorCode(missingContentType)).toBe('invalid_argument');

    const malformedContentType = await handleAgentConnectRequest(
      createAuthenticatedRequest({ body, contentType: 'text/plain' }),
      env
    );
    expect(await readErrorCode(malformedContentType)).toBe('invalid_argument');

    const malformedProto = await handleAgentConnectRequest(
      createAuthenticatedRequest({ body: new Uint8Array([255]), contentType: 'application/proto' }),
      env
    );
    expect(await readErrorCode(malformedProto)).toBe('invalid_argument');
  });
});
