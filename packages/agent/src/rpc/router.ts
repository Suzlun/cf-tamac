import { createConnectRouter, type ConnectRouter } from '@connectrpc/connect';

import {
  AgentEventService,
  AgentExtensionService,
  AgentHealthService,
  AgentLifecycleService,
  AgentRunService,
  AgentScheduleService,
  AgentStateService,
  AgentThreadService,
  AgentToolService,
  ExtensionIngressService,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { extensionIngressService } from './services/agent-adapter';
import { agentEventService } from './services/events';
import { agentExtensionService } from './services/extensions';
import { createAgentHealthService } from './services/health';
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
  router.service(ExtensionIngressService, extensionIngressService);
  router.service(AgentEventService, agentEventService);
  router.service(AgentExtensionService, agentExtensionService);
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
