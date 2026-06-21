import 'server-only';

import { createClient, type Client } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';

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
} from '@cf-tamac/client-agent-rpc/cftamac/agent/v1_pb';

import { createAgentRpcAuthInterceptor, type AgentRpcCredentialMetadata } from './authentication';

/**
 * Server-only Agent RPC client configuration.
 */
export interface ServerAgentRpcClientConfig {
  readonly agentRpcOrigin: string;
  readonly credential: AgentRpcCredentialMetadata;
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * Server-only generated Agent RPC clients grouped by service.
 */
export interface ServerAgentRpcClients {
  readonly lifecycle: Client<typeof AgentLifecycleService>;
  readonly events: Client<typeof AgentEventService>;
  readonly threads: Client<typeof AgentThreadService>;
  readonly runs: Client<typeof AgentRunService>;
  readonly state: Client<typeof AgentStateService>;
  readonly schedules: Client<typeof AgentScheduleService>;
  readonly tools: Client<typeof AgentToolService>;
  readonly extensions: Client<typeof AgentExtensionService>;
  readonly extensionIngress: Client<typeof ExtensionIngressService>;
  readonly health: Client<typeof AgentHealthService>;
}

/**
 * Create server-only Agent RPC clients using generated descriptors and Connect fetch transport.
 */
export function createServerAgentRpcClients(
  config: ServerAgentRpcClientConfig
): ServerAgentRpcClients {
  const transport = createConnectTransport({
    baseUrl: config.agentRpcOrigin,
    fetch: config.fetch,
    interceptors: [createAgentRpcAuthInterceptor(config.credential)],
    useBinaryFormat: true,
    useHttpGet: false,
  });

  return {
    lifecycle: createClient(AgentLifecycleService, transport),
    events: createClient(AgentEventService, transport),
    threads: createClient(AgentThreadService, transport),
    runs: createClient(AgentRunService, transport),
    state: createClient(AgentStateService, transport),
    schedules: createClient(AgentScheduleService, transport),
    tools: createClient(AgentToolService, transport),
    extensions: createClient(AgentExtensionService, transport),
    extensionIngress: createClient(ExtensionIngressService, transport),
    health: createClient(AgentHealthService, transport),
  };
}
