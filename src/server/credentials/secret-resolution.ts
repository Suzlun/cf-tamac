import 'server-only';

import type { ClientWorkerEnv } from '../env';

/**
 * Provider/外部 credential 参照から解決した秘密素材。
 *
 * @remarks
 * この型は Provider / model provider / Integration など Agent RPC 認証 *以外* の用途向け
 * 外部 credential 解決だけに使う。Agent RPC bearer JWT の署名 source としては絶対に使わず、
 * server-only scope の外へ出さない。
 *
 * 後方互換性は完全悪: 旧 `AGENT_CREDENTIAL_*` 経路は撤去し、外部 credential 参照は
 * `PROVIDER_CREDENTIAL_*` prefix のみを受け付ける。
 */
export interface ResolvedProviderCredentialSecret {
  readonly agentId: string;
  readonly credentialRef: string;
  readonly secretMaterial: string;
}

/**
 * Provider/外部 credential 参照として許容する Worker secret name の prefix。
 *
 * @remarks
 * Agent RPC 認証とは無関係な外部 credential (model provider API key など) だけを解決するため、
 * `AGENT_CREDENTIAL_*` は一切受け付けない。これにより、誤って Provider credential 参照が
 * Agent RPC 署名経路へ接続されることを防ぐ。
 */
const ALLOWED_PROVIDER_CREDENTIAL_REF_PREFIX = 'PROVIDER_CREDENTIAL_';

/**
 * Provider credential 参照が安全な Worker secret 名であるか検証する。
 *
 * @remarks
 * 参照は許可された `PROVIDER_CREDENTIAL_` prefix で始まり、英大文字・数字・アンダースコアだけを
 * 含む必要がある。path traversal や無関係な環境変数へのアクセスを防ぐための境界。
 */
function assertSafeProviderCredentialRef(credentialRef: string): void {
  if (!credentialRef.startsWith(ALLOWED_PROVIDER_CREDENTIAL_REF_PREFIX)) {
    throw new TypeError('credentialRef must reference a provisioned Provider credential secret.');
  }
  if (!/^[\dA-Z_]+$/.test(credentialRef)) {
    throw new TypeError('credentialRef must contain only uppercase alphanumeric characters.');
  }
}

/**
 * 空文字判定を長さ比較だけで行い、secret 値の timing side-channel を避ける。
 */
function isSecretEmpty(secret: string): boolean {
  return secret.length === 0;
}

/**
 * Provider/外部 credential 参照を Worker binding から解決する。
 *
 * @remarks
 * この関数は server-only であり、Provider / model provider / Integration など Agent RPC 認証 *以外* の
 * 外部 credential 解決にだけ使う。Agent RPC bearer JWT 署名 source としては絶対に呼び出さず、
 * `packages/client/src/server/agent-rpc/**` からは import しない。
 *
 * 結果は browser response・log・Client D1 record へ直列化してはならない。
 * 参照は許可された prefix で検証し、任意の Worker 環境変数アクセスを防ぐ。
 *
 * 後方互換性は完全悪: 旧 `AGENT_CREDENTIAL_*` 解決は撤去済み。
 */
export function resolveProviderCredentialSecret(
  env: ClientWorkerEnv,
  agentId: string,
  credentialRef: string
): Promise<ResolvedProviderCredentialSecret> {
  return Promise.resolve().then(() => {
    if (agentId === '') {
      throw new TypeError('agentId must not be empty.');
    }
    assertSafeProviderCredentialRef(credentialRef);

    const secret = readWorkerSecret(env, credentialRef);
    if (isSecretEmpty(secret)) {
      throw new Error('The requested Provider credential is not provisioned.');
    }

    return {
      agentId,
      credentialRef,
      secretMaterial: secret,
    } satisfies ResolvedProviderCredentialSecret;
  });
}

/**
 * 検証済み Provider credential secret を Worker 環境から読み出す。
 *
 * @remarks
 * 動的 key access による object-injection リスクを避けるため `Object.entries` で反復する。
 * `credentialRef` は `assertSafeProviderCredentialRef` で `PROVIDER_CREDENTIAL_` prefix と
 * 安全な文字種だけで検証済みである。
 */
function readWorkerSecret(env: ClientWorkerEnv, credentialRef: string): string {
  const envRecord = env as unknown as Readonly<Record<string, unknown>>;
  for (const [key, value] of Object.entries(envRecord)) {
    if (key === credentialRef && typeof value === 'string') {
      return value;
    }
  }
  return '';
}
