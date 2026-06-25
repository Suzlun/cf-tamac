import type { AIAgent } from './AIAgent';

/**
 * Agent Worker non-secret runtime variables.
 */
export interface AgentWorkerVars {
  readonly AGENT_RPC_AUDIENCE: string;
}

/**
 * Agent Worker secret binding names that must be provisioned outside source control.
 */
export const requiredAgentSecretNames = [
  'AGENT_CLIENT_JWT_PUBLIC_KEYS',
  'AGENT_INTEGRATION_SIGNATURE_KEYS',
  'AGENT_MODEL_PROVIDER_SECRET_REFS',
] as const;

/**
 * Agent Worker required secret binding name.
 */
export type RequiredAgentSecretName = (typeof requiredAgentSecretNames)[number];

/**
 * Agent Worker secret bindings.
 */
export type AgentWorkerSecrets = Record<RequiredAgentSecretName, string>;

/**
 * Workers AI binding のうち、Agent Worker が model 実行 adapter へ渡す最小インターフェイスです。
 *
 * @remarks
 * Cloudflare runtime 固有の型を domain/runtime 下位レイヤーへ伝搬させないため、env 境界で
 * `run` のみを持つ構造として扱います。binding が存在しない local/test 環境では `undefined` を許容し、
 * provider adapter が model call 前に fail closed します。
 *
 * @example
 * ```ts
 * const result = await env.AI?.run('@cf/meta/llama-3.1-8b-instruct', { prompt: '...' });
 * ```
 */
export interface AgentWorkersAiBinding {
  run(model: string, input: unknown): Promise<unknown>;
}

/**
 * Agent Worker Cloudflare bindings owned by the Agent runtime.
 */
export interface AgentWorkerBindings {
  readonly AI_AGENT: DurableObjectNamespace<AIAgent>;
  readonly AGENT_BLOBS: R2Bucket;
  readonly AI?: AgentWorkersAiBinding;
}

/**
 * Complete Agent Worker environment contract.
 */
export interface AgentWorkerEnv
  extends Cloudflare.Env, AgentWorkerBindings, AgentWorkerSecrets, AgentWorkerVars {}

/**
 * Return secret binding names that are not present in an Agent Worker environment.
 */
export function getMissingAgentSecrets(env: Partial<AgentWorkerEnv>): RequiredAgentSecretName[] {
  const missingSecrets: RequiredAgentSecretName[] = [];
  if (isMissingSecret(env.AGENT_CLIENT_JWT_PUBLIC_KEYS)) {
    missingSecrets.push('AGENT_CLIENT_JWT_PUBLIC_KEYS');
  }
  if (isMissingSecret(env.AGENT_INTEGRATION_SIGNATURE_KEYS)) {
    missingSecrets.push('AGENT_INTEGRATION_SIGNATURE_KEYS');
  }
  if (isMissingSecret(env.AGENT_MODEL_PROVIDER_SECRET_REFS)) {
    missingSecrets.push('AGENT_MODEL_PROVIDER_SECRET_REFS');
  }
  return missingSecrets;
}

function isMissingSecret(value: string | undefined): boolean {
  return typeof value !== 'string' || value === '';
}
