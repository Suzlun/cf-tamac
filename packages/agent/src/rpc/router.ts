import { createConnectRouter, type ConnectRouter } from '@connectrpc/connect';

import {
  AgentEventService,
  AgentIntegrationService,
  AgentHealthService,
  AgentLifecycleService,
  AgentModelPolicyService,
  AgentRunService,
  AgentScheduleService,
  AgentStateService,
  AgentThreadService,
  AgentToolService,
  IntegrationIngressService,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { createIntegrationIngressService } from './services/agent-adapter';
import { createAgentEventService } from './services/events';
import { createAgentHealthService } from './services/health';
import { createAgentIntegrationService } from './services/integrations';
import { createAgentLifecycleService } from './services/lifecycle';
import { createAgentModelPolicyService } from './services/model-policies';
import { createAgentRunService } from './services/runs';
import { createAgentScheduleService } from './services/schedules';
import { createAgentStateService } from './services/state';
import { createAgentThreadService } from './services/threads';
import { createAgentToolService } from './services/tools';

import type { AgentWorkerEnv } from '../env';

/**
 * Register all generated Agent services on a Connect router.
 */
export function registerAgentRpcServices(
  router: ConnectRouter,
  env: AgentWorkerEnv
): ConnectRouter {
  router.service(IntegrationIngressService, createIntegrationIngressService(env));
  router.service(AgentEventService, createAgentEventService(env));
  router.service(AgentIntegrationService, createAgentIntegrationService(env));
  router.service(AgentHealthService, createAgentHealthService(env));
  router.service(AgentLifecycleService, createAgentLifecycleService(env));
  router.service(AgentModelPolicyService, createAgentModelPolicyService(env));
  router.service(AgentRunService, createAgentRunService(env));
  router.service(AgentScheduleService, createAgentScheduleService(env));
  router.service(AgentStateService, createAgentStateService(env));
  router.service(AgentThreadService, createAgentThreadService(env));
  router.service(AgentToolService, createAgentToolService(env));
  return router;
}

/**
 * Create the Agent RPC router for Connect binary Protobuf traffic.
 */
export function createAgentRpcRouter(env: AgentWorkerEnv): ConnectRouter {
  const router = createConnectRouter({
    connect: true,
    grpc: false,
    grpcWeb: false,
  });
  return registerAgentRpcServices(router, env);
}
