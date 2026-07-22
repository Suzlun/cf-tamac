import type { AIAgent } from './AIAgent';

/**
 * Agent Worker が受け取る非 secret runtime 変数です。
 *
 * @remarks
 * `AGENT_RPC_AUDIENCE` は Client Service JWT の `aud` と照合する公開識別子です。
 * 値そのものは secret ではありませんが、Agent Worker ごとに期待 audience を固定し、
 * 別環境向け token の流用を防ぐために env 境界で型として明示します。
 */
export interface AgentWorkerVars {
  readonly AGENT_RPC_AUDIENCE: string;
}

/**
 * Agent Worker に必ず外部設定される secret binding 名です。
 *
 * @remarks
 * Client Service 認証の正本は公開鍵だけを含む `AGENT_CONTROL_PLANE_TRUST` です。
 * 旧 `AGENT_CLIENT_JWT_PUBLIC_KEYS` は本番 trust source として扱わないため、required secret から除外します。
 */
export const requiredAgentSecretNames = [
  'AGENT_AUDIT_HASH_PEPPER',
  'AGENT_CONTROL_PLANE_TRUST',
  'AGENT_INTEGRATION_SIGNATURE_KEYS',
  'AGENT_MODEL_PROVIDER_SECRET_REFS',
] as const;

/**
 * Agent Worker が必須とする secret binding 名の union 型です。
 */
export type RequiredAgentSecretName = (typeof requiredAgentSecretNames)[number];

/**
 * Agent Worker が source control 外から受け取る secret bindings です。
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
 * Agent runtime が所有する Cloudflare bindings です。
 *
 * @remarks
 * Agent Worker は Durable Object、Agent-owned blob/model binding、Provider ingress 専用の
 * Rate Limiting binding だけを受け取り、Client D1 や Management Client runtime 由来の binding を
 * ここに混ぜません。Rate Limiting binding は Agent domain state の正本ではなく、raw body/signature/state mutation
 * より前に実行する pre-auth traffic guard が fail-closed で使うため optional にしません。
 *
 * @example
 * ```ts
 * await env.PROVIDER_INGRESS_RATE_LIMITER.limit({ key: 'pir1:example' });
 * ```
 */
export interface AgentWorkerBindings {
  readonly AI_AGENT: DurableObjectNamespace<AIAgent>;
  readonly AGENT_BLOBS: R2Bucket;
  readonly AI?: AgentWorkersAiBinding;
  readonly PROVIDER_INGRESS_RATE_LIMITER: RateLimit;
}

/**
 * Agent Worker の完全な環境 contract です。
 */
export interface AgentWorkerEnv
  extends Cloudflare.Env, AgentWorkerBindings, AgentWorkerSecrets, AgentWorkerVars {}

/**
 * Agent Worker 環境で欠落している required secret binding 名を返します。
 *
 * @param env 部分的な Worker env。local/test では一部 binding が未設定のため `Partial` で受け取ります。
 * @returns 未設定または空文字の required secret 名一覧です。
 */
export function getMissingAgentSecrets(env: Partial<AgentWorkerEnv>): RequiredAgentSecretName[] {
  const missingSecrets: RequiredAgentSecretName[] = [];
  // 監査用 hash は secret pepper 付き HMAC で作り、既知 ID の辞書照合を防ぎます。
  if (isMissingSecret(env.AGENT_AUDIT_HASH_PEPPER)) {
    missingSecrets.push('AGENT_AUDIT_HASH_PEPPER');
  }
  // 本番 Client Service trust は `AGENT_CONTROL_PLANE_TRUST` だけを正本にします。
  if (isMissingSecret(env.AGENT_CONTROL_PLANE_TRUST)) {
    missingSecrets.push('AGENT_CONTROL_PLANE_TRUST');
  }
  // Integration Provider 署名検証は Client Service JWT とは別の principal 境界です。
  if (isMissingSecret(env.AGENT_INTEGRATION_SIGNATURE_KEYS)) {
    missingSecrets.push('AGENT_INTEGRATION_SIGNATURE_KEYS');
  }
  // Model provider secret reference は Agent RPC auth には使わず、provider adapter 用に分離します。
  if (isMissingSecret(env.AGENT_MODEL_PROVIDER_SECRET_REFS)) {
    missingSecrets.push('AGENT_MODEL_PROVIDER_SECRET_REFS');
  }
  return missingSecrets;
}

function isMissingSecret(value: string | undefined): boolean {
  return typeof value !== 'string' || value === '';
}
