import 'server-only';

import { createClient, type Client } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';

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
} from '@cf-tamac/client-agent-rpc/cftamac/agent/v1_pb';

import { createAgentRpcAuthInterceptor, type ResolvedAgentRpcCredential } from './authentication';
import { withAgentRpcErrorNormalization } from './errors';

/**
 * server-only Agent RPC client factory の設定。
 *
 * @remarks
 * Agent RPC origin と解決済み credential は server-only module 内でだけ扱い、browser-visible module
 * へ渡してはならない。
 */
export interface ServerAgentRpcClientConfig {
  readonly agentRpcOrigin: string;
  readonly credential: ResolvedAgentRpcCredential;
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * generated Agent RPC client を service ごとにまとめた server-only bundle。
 *
 * @remarks
 * 各 client は generated Protobuf descriptor と Connect binary transport を使う。
 * Server Action は `withErrorNormalization` で RPC 呼び出しを包み、raw Connect error が browser payload
 * へ到達する前に `AgentRpcOperationError` へ正規化する。
 */
export interface ServerAgentRpcClients {
  readonly lifecycle: Client<typeof AgentLifecycleService>;
  readonly events: Client<typeof AgentEventService>;
  readonly threads: Client<typeof AgentThreadService>;
  readonly runs: Client<typeof AgentRunService>;
  readonly state: Client<typeof AgentStateService>;
  readonly schedules: Client<typeof AgentScheduleService>;
  readonly tools: Client<typeof AgentToolService>;
  readonly integrations: Client<typeof AgentIntegrationService>;
  readonly integrationIngress: Client<typeof IntegrationIngressService>;
  readonly health: Client<typeof AgentHealthService>;
  /**
   * Agent RPC 呼び出しを browser-safe error normalization で包む。
   *
   * @remarks Server Action はすべての Agent RPC 呼び出しでこの helper を使い、raw Connect error を
   * browser-visible payload へ漏らさない。
   */
  readonly withErrorNormalization: typeof withAgentRpcErrorNormalization;
}

/**
 * generated descriptors と Connect fetch transport から server-only Agent RPC clients を作成する。
 *
 * @param config - Agent RPC origin、解決済み credential、任意 fetch 実装を含む factory 設定。
 * @returns service ごとの generated Agent RPC clients と browser-safe error normalization helper。
 * @remarks
 * 返却する client は binary Protobuf、POST-only transport、acting user context 付き auth metadata を使う。
 * この関数は `server-only` module に閉じ、browser bundle から import してはならない。
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
    integrations: createClient(AgentIntegrationService, transport),
    integrationIngress: createClient(IntegrationIngressService, transport),
    health: createClient(AgentHealthService, transport),
    withErrorNormalization: withAgentRpcErrorNormalization,
  };
}
