import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * Management Client Worker environment bindings.
 */
export interface ClientWorkerEnv extends CloudflareEnv {
  readonly CLIENT_DB: D1Database;
  readonly AGENT_RPC_DEFAULT_ORIGIN: string;
  readonly CLIENT_CREDENTIAL_SECRET_REF: string;
}

/**
 * Return the Cloudflare environment for server-only Client code.
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
  };
  return (
    typeof candidate.CLIENT_DB === 'object' &&
    candidate.CLIENT_DB !== null &&
    'prepare' in candidate.CLIENT_DB &&
    typeof candidate.CLIENT_DB.prepare === 'function' &&
    typeof candidate.AGENT_RPC_DEFAULT_ORIGIN === 'string' &&
    candidate.AGENT_RPC_DEFAULT_ORIGIN !== '' &&
    typeof candidate.CLIENT_CREDENTIAL_SECRET_REF === 'string' &&
    candidate.CLIENT_CREDENTIAL_SECRET_REF !== ''
  );
}
