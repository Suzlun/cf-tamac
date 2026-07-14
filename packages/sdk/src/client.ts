import { createClient, type Client } from '@connectrpc/connect';

import { normalizeTamacSdkError } from './errors';
import {
  AgentEventService,
  AgentHealthService,
  AgentIntegrationService,
  AgentLifecycleService,
  AgentModelPolicyService,
  AgentRunService,
  AgentScheduleService,
  AgentStateService,
  AgentThreadService,
  AgentToolService,
} from './generated/agent-rpc/cftamac/agent/v1_pb';
import { createTamacAgentTransport } from './transport';

import type { ClientServiceSigningContext } from './auth/types';
import type { TamacSdkInvocationContext } from './invocation-context';
import type { TamacRequestContextInjector } from './transport';

type TamacAgentService =
  | typeof AgentEventService
  | typeof AgentHealthService
  | typeof AgentIntegrationService
  | typeof AgentLifecycleService
  | typeof AgentModelPolicyService
  | typeof AgentRunService
  | typeof AgentScheduleService
  | typeof AgentStateService
  | typeof AgentThreadService
  | typeof AgentToolService;

/**
 * server-side TAMAC Agent client aggregate を作成する設定です。
 *
 * @remarks
 * Management Client などの consumer が、Client D1、encrypted key store、acting user policy から解決した
 * 値を渡します。SDK は storage と framework runtime を所有せず、browser-visible module からこの factory を
 * 呼び出してはなりません。
 *
 * @example
 * ```ts
 * const client = createTamacAgentClient({ agentRpcOrigin, signingContext, invocation });
 * ```
 */
export interface TamacAgentClientConfig {
  /** Agent Worker の Connect RPC origin です。 */
  readonly agentRpcOrigin: string;
  /** consumer-owned secure storage が解決した Client Service Ed25519 signing context です。 */
  readonly signingContext: ClientServiceSigningContext;
  /** Agent ID、scope、acting user、request correlation を共有する server-side invocation context です。 */
  readonly invocation: TamacSdkInvocationContext;
  /** テストまたは server runtime が供給する fetch implementation です。 */
  readonly fetch?: typeof globalThis.fetch;
  /** auth/Connect protocol metadata を上書きせず W3C tracing header だけを追加する server-side injection seam です。 */
  readonly requestContextInjector?: TamacRequestContextInjector;
}

/**
 * generated Protobuf service clients を同じ server-side invocation に集約した TAMAC Agent client です。
 *
 * @remarks
 * 全 property は同一の binary Connect transport、Agent ID、scope、acting user、request/correlation context を
 * 共有します。公開面は Client Service に認可された 10 service だけであり、Integration Provider の ingress は
 * `TamacProviderIngressClient` に分離します。各 request body の `agentId` や command `idempotencyKey` は
 * generated contract に従って caller が渡し、SDK は JWT/HTTP metadata との相関を保ちます。
 *
 * @example
 * ```ts
 * const health = await client.health.check({ agentId: client.invocation.agentId });
 * ```
 */
export interface TamacAgentClient {
  /** Agent lifecycle operations の typed generated client です。 */
  readonly lifecycle: Client<typeof AgentLifecycleService>;
  /** Agent model policy operations の typed generated client です。 */
  readonly modelPolicies: Client<typeof AgentModelPolicyService>;
  /** Agent event operations の typed generated client です。 */
  readonly events: Client<typeof AgentEventService>;
  /** Agent thread/section/history operations の typed generated client です。 */
  readonly threads: Client<typeof AgentThreadService>;
  /** Agent run operations の typed generated client です。 */
  readonly runs: Client<typeof AgentRunService>;
  /** Agent state/config operations の typed generated client です。 */
  readonly state: Client<typeof AgentStateService>;
  /** Agent schedule operations の typed generated client です。 */
  readonly schedules: Client<typeof AgentScheduleService>;
  /** Agent tool/invocation operations の typed generated client です。 */
  readonly tools: Client<typeof AgentToolService>;
  /** Agent integration/adapter connection operations の typed generated client です。 */
  readonly integrations: Client<typeof AgentIntegrationService>;
  /** Agent health operation の typed generated client です。 */
  readonly health: Client<typeof AgentHealthService>;
}

/**
 * server-side consumer 用の TAMAC Agent service client aggregate を作成します。
 *
 * @param config - Agent origin、consumer-supplied signing context、shared invocation、任意の fetch/injection seam。
 * @returns 同一 binary Connect transport と server-side invocation を共有する typed generated service aggregate。
 * @throws Agent ID が credential identity と一致しない場合、transport/auth metadata 構築が失敗した場合、または
 * Connect call が失敗した場合に `TamacSdkOperationError` を投げます。
 * @remarks
 * Agent public contract は既存の generated Protobuf descriptor を正とし、SDK は REST、OpenAPI、JSON DTO、
 * public Durable Object fetch、browser-direct RPC を追加しません。
 *
 * @example
 * ```ts
 * const client = createTamacAgentClient({ agentRpcOrigin, signingContext, invocation });
 * const result = await client.health.check({ agentId: invocation.agentId });
 * ```
 */
export function createTamacAgentClient(config: TamacAgentClientConfig): TamacAgentClient {
  // shared transport を一度だけ作り、service ごとに異なる auth/correlation state が生まれないようにします。
  const transport = createTamacAgentTransport({
    agentRpcOrigin: config.agentRpcOrigin,
    fetch: config.fetch,
    invocation: config.invocation,
    requestContextInjector: config.requestContextInjector,
    signingContext: config.signingContext,
  });
  // Client Service が認可された generated service descriptor だけを同一 transport へ束ねて返します。
  return {
    events: createNormalizedTamacServiceClient(
      createClient(AgentEventService, transport),
      AgentEventService.typeName,
      config.invocation
    ),
    health: createNormalizedTamacServiceClient(
      createClient(AgentHealthService, transport),
      AgentHealthService.typeName,
      config.invocation
    ),
    integrations: createNormalizedTamacServiceClient(
      createClient(AgentIntegrationService, transport),
      AgentIntegrationService.typeName,
      config.invocation
    ),
    lifecycle: createNormalizedTamacServiceClient(
      createClient(AgentLifecycleService, transport),
      AgentLifecycleService.typeName,
      config.invocation
    ),
    modelPolicies: createNormalizedTamacServiceClient(
      createClient(AgentModelPolicyService, transport),
      AgentModelPolicyService.typeName,
      config.invocation
    ),
    runs: createNormalizedTamacServiceClient(
      createClient(AgentRunService, transport),
      AgentRunService.typeName,
      config.invocation
    ),
    schedules: createNormalizedTamacServiceClient(
      createClient(AgentScheduleService, transport),
      AgentScheduleService.typeName,
      config.invocation
    ),
    state: createNormalizedTamacServiceClient(
      createClient(AgentStateService, transport),
      AgentStateService.typeName,
      config.invocation
    ),
    threads: createNormalizedTamacServiceClient(
      createClient(AgentThreadService, transport),
      AgentThreadService.typeName,
      config.invocation
    ),
    tools: createNormalizedTamacServiceClient(
      createClient(AgentToolService, transport),
      AgentToolService.typeName,
      config.invocation
    ),
  };
}

function createNormalizedTamacServiceClient<Service extends TamacAgentService>(
  client: Client<Service>,
  serviceName: string,
  invocation: TamacSdkInvocationContext
): Client<Service> {
  // generated client method の Promise rejection を aggregate 境界で必ず SDK error へ変換する proxy を作ります。
  return new Proxy(client, {
    get(target, property, receiver) {
      // generated client property を取得し、method 以外の descriptor/prototype access は変更せず通します。
      const member: unknown = Reflect.get(target, property, receiver);
      if (typeof property !== 'string' || typeof member !== 'function') {
        return member;
      }
      // Connect unary method の runtime call signature を narrow し、元 client closure を保持して実行します。
      const operation = member as (...args: never[]) => Promise<unknown>;
      return async (...args: never[]) => {
        try {
          // generated client の typed response を維持しながら network side effect を完了させます。
          return await operation(...args);
        } catch (error) {
          // service/method と shared invocation を失わず、raw Connect failure を public SDK error へ変換します。
          throw normalizeTamacSdkError(error, {
            invocation,
            methodContext: { methodName: toProtobufMethodName(property), serviceName },
          });
        }
      };
    },
  });
}

function toProtobufMethodName(clientPropertyName: string): string {
  // generated camelCase client property の先頭だけを大文字化し、Protobuf RPC method identity と対応させます。
  return `${clientPropertyName.charAt(0).toUpperCase()}${clientPropertyName.slice(1)}`;
}
