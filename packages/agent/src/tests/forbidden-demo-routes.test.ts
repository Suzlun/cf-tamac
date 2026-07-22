import { describe, expect, it } from 'vitest';

import { handleAgentConnectRequest } from '../rpc/connect-worker-adapter';

import { createAllowingProviderIngressRateLimitStub } from './provider-ingress-rate-limit-test-helpers';
import { testControlPlaneTrustConfig } from './test-control-plane-trust';

import type { AIAgent } from '../AIAgent';
import type { AgentWorkerEnv } from '../env';

const baseUrl = 'https://agent.example.test';
const forbiddenDemoPaths = ['/api/v1/hello', '/api/v1/users', '/api/v1/users/user-1'];

function createTestEnv(): AgentWorkerEnv {
  return {
    AGENT_BLOBS: {} as R2Bucket,
    AGENT_AUDIT_HASH_PEPPER: 'test-audit-hash-pepper',
    AGENT_CONTROL_PLANE_TRUST: testControlPlaneTrustConfig,
    AGENT_INTEGRATION_SIGNATURE_KEYS: 'test-integration-key',
    AGENT_MODEL_PROVIDER_SECRET_REFS: 'test-model-secret',
    AGENT_RPC_AUDIENCE: 'test-audience',
    AI_AGENT: {
      get: () => ({}) as DurableObjectStub<AIAgent>,
      idFromName: (name: string) => ({ name }) as unknown as DurableObjectId,
    } as unknown as DurableObjectNamespace<AIAgent>,
    PROVIDER_INGRESS_RATE_LIMITER: createAllowingProviderIngressRateLimitStub(),
  };
}

function createDemoPathRequest(path: string): Request {
  return new Request(`${baseUrl}${path}`, {
    body: new Uint8Array(),
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

describe('Agent forbidden demo routes', () => {
  it('[AGENT-PLATFORM-S006] Demo resource paths are not served by the Agent Worker', async () => {
    for (const path of forbiddenDemoPaths) {
      const response = await handleAgentConnectRequest(
        createDemoPathRequest(path),
        createTestEnv()
      );
      expect(await readErrorCode(response)).toBe('unimplemented');
    }
  });
});
