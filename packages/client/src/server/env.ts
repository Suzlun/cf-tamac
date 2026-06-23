import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * Management Client Worker の環境 binding 型。
 *
 * @remarks
 * Client Worker は `CLIENT_DB` と Agent RPC 呼び出しに必要な credential 参照だけを所有する。
 * `AI_AGENT` や Agent-owned storage binding を追加してはならない。
 */
export interface ClientWorkerEnv extends CloudflareEnv {
  readonly CLIENT_DB: D1Database;
  readonly AGENT_RPC_DEFAULT_ORIGIN: string;
  readonly CLIENT_CREDENTIAL_SECRET_REF: string;
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

function isClientWorkerEnv(env: CloudflareEnv): env is ClientWorkerEnv {
  const candidate = env as {
    readonly CLIENT_DB?: unknown;
    readonly AGENT_RPC_DEFAULT_ORIGIN?: unknown;
    readonly CLIENT_CREDENTIAL_SECRET_REF?: unknown;
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
    typeof candidate.CLIENT_CREDENTIAL_SECRET_REF === 'string' &&
    candidate.CLIENT_CREDENTIAL_SECRET_REF !== '' &&
    typeof candidate.CLIENT_ACTING_OPERATOR_ID === 'string' &&
    candidate.CLIENT_ACTING_OPERATOR_ID !== '' &&
    typeof candidate.CLIENT_ACTING_SCOPES === 'string' &&
    candidate.CLIENT_ACTING_SCOPES !== ''
  );
}
