import type {
  CheckHealthRequestSchema,
  CheckHealthResponseSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { getAIAgentDurableObjectStub } from '../../agent-routing';
import { loadControlPlaneTrustConfig } from '../../domain/security';
import { getCurrentAgentRpcExecutionPrincipal } from '../interceptors/audit';

import type { AgentWorkerEnv } from '../../env';
import type { MessageInitShape } from '@bufbuild/protobuf';

const agentContractPackage = 'cftamac.agent.v1';
const agentServiceVersion = '0.1.0';

/**
 * AgentHealthService.Check が返す generated Protobuf response の初期化形です。
 *
 * @remarks
 * service 層とテストが health dispatcher を直接参照することで、Phase 1 分割後も
 * 責務境界を保ったまま同じ型名で health response を扱えます。
 */
export type AgentHealthResponseInit = MessageInitShape<typeof CheckHealthResponseSchema>;

/**
 * AgentHealthService.Check が受け取る generated Protobuf request の初期化形です。
 *
 * @remarks
 * service 層が Agent ID と dependency diagnostic 表示条件だけを渡すための薄い境界型です。
 */
export type AgentHealthRequestInit = MessageInitShape<typeof CheckHealthRequestSchema>;

/**
 * AgentHealthService.Check を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と trust config secret を含む環境です。
 * @param request generated RPC request から抽出した Agent ID と dependency diagnostic 表示条件です。
 * @returns generated CheckHealthResponse の初期化値です。
 * @throws Durable Object routing、Agent health check、または trust config 読み込み以外の予期しない失敗を伝播します。
 * @example
 * ```ts
 * const response = await dispatchAgentHealthCheck(env, { agentId: 'agent-1' });
 * ```
 */
export async function dispatchAgentHealthCheck(
  env: AgentWorkerEnv,
  request: AgentHealthRequestInit
): Promise<AgentHealthResponseInit> {
  // Health service 側で空 Agent ID を拒否済みですが、ここでは既存挙動に合わせて request 値をそのまま扱います。
  const agentId = request.agentId ?? '';
  // Agent ID に対応する Durable Object だけへ問い合わせ、Agent-cross な診断 surface を作りません。
  const agent = getAIAgentDurableObjectStub(env, agentId);
  const health = await agent.checkHealth();
  // response 全体の観測時刻は dispatcher 到達時点で再採番し、DO 内の health 値とは独立させます。
  const checkedAtUnixMs = BigInt(Date.now());
  const servingStatus = mapLifecycleStatusToServingStatus(health.status);
  // 呼び出し側が求めた場合だけ storage/queue の安全な要約を返し、詳細接続情報は返しません。
  const dependencyStatusRef =
    request.includeDependencies === true ? createSafeDependencyStatusRef(health) : undefined;
  // Model execution diagnostic は secret-free な値だけを Protobuf 初期化形へ写します。
  const modelExecution =
    health.modelExecution === undefined
      ? undefined
      : {
          bindingPresent: health.modelExecution.bindingPresent,
          checkedAtUnixMs: BigInt(health.modelExecution.checkedAtMs),
          defaultPolicyDigest: health.modelExecution.defaultPolicyDigest,
          defaultPolicyRef: health.modelExecution.defaultPolicyRef,
          modelId: health.modelExecution.modelId,
          provider: health.modelExecution.provider,
          safeDetailRef: health.modelExecution.safeDetailRef,
          status: health.modelExecution.status,
        };
  const trustConfig = await createTrustConfigDiagnostic(env);
  const currentPrincipalTrust = createCurrentPrincipalTrustDiagnostic();

  return {
    agentId: health.agentId,
    checkedAtUnixMs,
    contractPackage: agentContractPackage,
    dependencyStatusRef,
    health: {
      agentId: health.agentId,
      checkedAtUnixMs,
      contractPackage: agentContractPackage,
      dependencyStatusRef,
      modelExecution,
      serviceVersion: agentServiceVersion,
      servingStatus,
    },
    modelExecution,
    serviceVersion: agentServiceVersion,
    status: servingStatus,
    trustConfig,
    currentPrincipalTrust,
  };
}

async function createTrustConfigDiagnostic(env: AgentWorkerEnv): Promise<
  | {
      readonly fingerprint: string;
      readonly issuerCount: number;
      readonly keyCount: number;
      readonly loadedAtUnixMs: bigint;
      readonly status: string;
      readonly version: string;
    }
  | undefined
> {
  try {
    // health response は trust config の公開 fingerprint と集約数だけを返し、公開鍵全文や secret は返しません。
    const config = await loadControlPlaneTrustConfig(env.AGENT_CONTROL_PLANE_TRUST);
    return {
      fingerprint: config.diagnostic.fingerprint,
      issuerCount: config.diagnostic.issuerCount,
      keyCount: config.diagnostic.keyCount,
      loadedAtUnixMs: BigInt(config.diagnostic.loadedAtUnixMs),
      status: config.diagnostic.status,
      version: config.diagnostic.version,
    };
  } catch {
    // 認証済み RPC でここへ来ることは通常ありませんが、diagnostic は secret-free degraded として返します。
    return {
      fingerprint: 'unavailable',
      issuerCount: 0,
      keyCount: 0,
      loadedAtUnixMs: BigInt(Date.now()),
      status: 'unavailable',
      version: 'unavailable',
    };
  }
}

function createCurrentPrincipalTrustDiagnostic():
  | {
      readonly fingerprint: string;
      readonly issuer: string;
      readonly keyStatus: string;
      readonly kid: string;
      readonly principalType: string;
      readonly verified: boolean;
      readonly verifiedAtUnixMs: bigint;
    }
  | undefined {
  const summary = getCurrentAgentRpcExecutionPrincipal()?.trustSummary;
  if (summary === undefined) return undefined;
  // 認証済み principal の安全な issuer/kid/fingerprint だけを health response へ写します。
  return {
    fingerprint: summary.fingerprint,
    issuer: summary.issuer,
    keyStatus: summary.keyStatus,
    kid: summary.kid,
    principalType: summary.principalType,
    verified: summary.verified,
    verifiedAtUnixMs: BigInt(summary.verifiedAtUnixMs),
  };
}

function mapLifecycleStatusToServingStatus(status: string): 'serving' | 'degraded' {
  // lifecycle が停止系へ入った Agent は Connect health では degraded として明示します。
  return status === 'destroying' || status === 'destroyed' ? 'degraded' : 'serving';
}

function createSafeDependencyStatusRef(health: {
  readonly storage: string;
  readonly queue: string;
}): string {
  // storage/queue の状態ラベルだけを連結し、内部接続先や secret を含む diagnostic にしません。
  return `storage:${health.storage};queue:${health.queue}`;
}
