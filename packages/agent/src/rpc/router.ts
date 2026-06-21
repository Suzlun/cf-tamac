import { createConnectRouter, type ConnectRouter } from '@connectrpc/connect';

import {
  AgentEventService,
  AgentIntegrationService,
  AgentHealthService,
  AgentLifecycleService,
  AgentRunService,
  AgentScheduleService,
  AgentStateService,
  AgentThreadService,
  AgentToolService,
  IntegrationIngressService,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { integrationIngressService } from './services/agent-adapter';
import { agentEventService } from './services/events';
import { createAgentHealthService } from './services/health';
import { agentIntegrationService } from './services/integrations';
import { agentLifecycleService } from './services/lifecycle';
import { agentRunService } from './services/runs';
import { agentScheduleService } from './services/schedules';
import { agentStateService } from './services/state';
import { agentThreadService } from './services/threads';
import { agentToolService } from './services/tools';

import type { AgentWorkerEnv } from '../env';

/**
 * Register all generated Agent services on a Connect router.
 */
export function registerAgentRpcServices(
  router: ConnectRouter,
  env: AgentWorkerEnv
): ConnectRouter {
  router.service(IntegrationIngressService, integrationIngressService);
  router.service(AgentEventService, agentEventService);
  router.service(AgentIntegrationService, agentIntegrationService);
  router.service(AgentHealthService, createAgentHealthService(env));
  router.service(AgentLifecycleService, agentLifecycleService);
  router.service(AgentRunService, agentRunService);
  router.service(AgentScheduleService, agentScheduleService);
  router.service(AgentStateService, agentStateService);
  router.service(AgentThreadService, agentThreadService);
  router.service(AgentToolService, agentToolService);
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
