import { createAgentCounterRecord } from './observability/records';
import { handleAgentConnectRequest } from './rpc/connect-worker-adapter';

import type { AgentWorkerEnv } from './env';
import type {
  ProviderIngressRateLimitDenial,
  ProviderIngressRateLimitDenialObserver,
} from './rpc/interceptors/provider-ingress-rate-limit';

/**
 * Provider ingress の pre-auth rate-limit 拒否を Workers Logs 用の安全な counter へ変換します。
 *
 * @remarks
 * 出力は counter 名、固定 counter type、generated service/method、固定 principal type、固定 reason、timestamp
 * だけです。IP、Agent/Installation ID、payload、signature、credential、request ID は observer 入力にも log にも出しません。
 *
 * @param now テストで timestamp を決定論的にするための現在時刻 provider です。
 * @returns adapter が pre-auth denial 時だけ呼ぶ observer です。
 * @throws `console.warn` の runtime failure は adapter 側が握りつぶすため、この factory 自体は送出しません。
 * @example
 * ```ts
 * const observer = createProviderIngressRateLimitDenialObserver();
 * ```
 */
export function createProviderIngressRateLimitDenialObserver(
  now: () => number = () => Date.now()
): ProviderIngressRateLimitDenialObserver {
  return (denial: ProviderIngressRateLimitDenial) => {
    // Worker outer layer だけが Logs へ副作用を出し、adapter/interceptor は安全な decision data に閉じます。
    const counter = createAgentCounterRecord({
      count: 1,
      counterType: 'rate_limit',
      fields: {
        method: denial.method,
        principalType: 'PROVIDER_INGRESS_PRE_AUTH',
        service: denial.service,
      },
      name: 'agent.provider_ingress_rate_limit_denied',
      reason: denial.reason,
      timestampUnixMs: now(),
    });
    // JSON serialization は allowlisted counter shape だけを Workers Logs へ渡し、request object を参照しません。
    // eslint-disable-next-line no-console -- Workers Logs への安全な counter 出力は Worker outer layer にだけ許可します。
    console.warn(JSON.stringify(counter));
  };
}

/**
 * Agent Service の Cloudflare Worker handler です。
 *
 * @remarks
 * public surface は Connect binary Protobuf RPC だけに閉じ、Provider pre-auth rate-limit denial は safe observer を
 * 経由して Workers Logs counter へ記録します。Client D1、Queue、public Durable Object fetch surface は持ちません。
 */
const agentWorker: ExportedHandler<AgentWorkerEnv> = {
  fetch(request, env) {
    // production Worker path は safe observer を常に接続し、rate-limit denial の理由を request data なしで集計します。
    return handleAgentConnectRequest(request, env, {
      onProviderIngressRateLimitDenied: createProviderIngressRateLimitDenialObserver(),
    });
  },
};

/**
 * Agent Service の Cloudflare Worker default export です。
 *
 * @remarks
 * Worker runtime は `fetch` ごとに safe rate-limit observer を接続します。observer は safe counter 以外を log に
 * 出さず、観測失敗は Protobuf RPC response の fail-closed decision を変えません。
 */
export default agentWorker;
