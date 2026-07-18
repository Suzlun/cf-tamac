import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * Management Client Worker の環境 binding 型。
 *
 * @remarks
 * Client Worker は `CLIENT_DB`、Agent RPC origin、server-only acting user context、そして
 * Ed25519 signing key store の暗号化に使う `CLIENT_CREDENTIAL_ENCRYPTION_KEY` だけを所有する。
 * `AI_AGENT` や Agent-owned storage binding を追加してはならない。
 * Agent RPC の署名鍵は Client D1 の暗号化済み signing key store が正本であり、
 * `AGENT_CREDENTIAL_*` Worker Secret や HS256 共通 secret を経由しない。
 */
export interface ClientWorkerEnv extends CloudflareEnv {
  readonly CLIENT_DB: D1Database;
  readonly AGENT_RPC_DEFAULT_ORIGIN: string;
  /**
   * Client Service signing key store の private JWK 暗号化に使う Worker Secret。
   *
   * @remarks
   * Cloudflare Workers の Variables and Secrets から直接 binding される server-only 必須 secret であり、
   * 間接参照 var を経由しない。この値は base64 形式の AES-256 鍵素材を想定し、
   * server-only module の外へ決して露出してはならない。
   */
  readonly CLIENT_CREDENTIAL_ENCRYPTION_KEY: string;
  readonly CLIENT_ACTING_OPERATOR_ID: string;
  readonly CLIENT_ACTING_SCOPES: string;
}

/**
 * server-only Client code から Cloudflare Worker 環境 binding を取得する。
 *
 * @returns Management Client Worker に必要な binding をすべて持つ環境 object。
 * @throws TypeError 必須 binding が存在しない、または型が想定と異なる場合。
 */
export function getClientWorkerEnv(): ClientWorkerEnv {
  const { env } = getCloudflareContext();
  if (!isClientWorkerEnv(env)) {
    throw new TypeError('Client Worker environment bindings are not available.');
  }
  return env;
}

/**
 * Client Worker 環境の必須 binding がすべて揃い、想定した型であるかを検査する type guard。
 *
 * @remarks
 * fail-closed な境界として扱い、必須の signing key 暗号化 secret や acting user 設定が
 * 欠落している場合は server-only 処理を進めない。secret 値そのものは比較せず、
 * 非空文字列であることだけを検査する。
 */
function isClientWorkerEnv(env: CloudflareEnv): env is ClientWorkerEnv {
  const candidate = env as {
    readonly CLIENT_DB?: unknown;
    readonly AGENT_RPC_DEFAULT_ORIGIN?: unknown;
    readonly CLIENT_CREDENTIAL_ENCRYPTION_KEY?: unknown;
    readonly CLIENT_ACTING_OPERATOR_ID?: unknown;
    readonly CLIENT_ACTING_SCOPES?: unknown;
  };
  return (
    typeof candidate.CLIENT_DB === 'object' &&
    candidate.CLIENT_DB !== null &&
    'prepare' in candidate.CLIENT_DB &&
    typeof candidate.CLIENT_DB.prepare === 'function' &&
    typeof candidate.AGENT_RPC_DEFAULT_ORIGIN === 'string' &&
    candidate.AGENT_RPC_DEFAULT_ORIGIN !== '' &&
    typeof candidate.CLIENT_CREDENTIAL_ENCRYPTION_KEY === 'string' &&
    candidate.CLIENT_CREDENTIAL_ENCRYPTION_KEY !== '' &&
    typeof candidate.CLIENT_ACTING_OPERATOR_ID === 'string' &&
    candidate.CLIENT_ACTING_OPERATOR_ID !== '' &&
    typeof candidate.CLIENT_ACTING_SCOPES === 'string' &&
    candidate.CLIENT_ACTING_SCOPES !== ''
  );
}
