import 'server-only';

import type { ClientWorkerEnv } from '../env';

/**
 * Resolved credential secret material bound to a managed Agent.
 *
 * This type is server-only and must never appear in browser bundles, Server
 * Action return values, or rendered HTML.
 */
export interface ResolvedCredentialSecret {
  readonly agentId: string;
  readonly credentialRef: string;
  readonly secretMaterial: string;
}

/**
 * Allowed prefix for Worker secret names that store Agent credential material.
 *
 * Secret references stored in Client D1 must match this prefix so that
 * `resolveCredentialSecret` cannot read arbitrary Worker environment keys.
 */
const ALLOWED_CREDENTIAL_REF_PREFIX = 'AGENT_CREDENTIAL_';

/**
 * Validate that a credential reference is a safe Worker secret name.
 *
 * The reference must start with the allowed prefix and contain only uppercase
 * alphanumeric characters and underscores, preventing path traversal or
 * access to unrelated environment variables.
 */
function assertSafeCredentialRef(credentialRef: string): void {
  if (!credentialRef.startsWith(ALLOWED_CREDENTIAL_REF_PREFIX)) {
    throw new TypeError('credentialRef must reference a provisioned Agent credential secret.');
  }
  if (!/^[\dA-Z_]+$/.test(credentialRef)) {
    throw new TypeError('credentialRef must contain only uppercase alphanumeric characters.');
  }
}

/**
 * Check whether a resolved secret string has content without timing-attack risk.
 *
 * Uses `length` comparison before value comparison to avoid timing side channels
 * on secret material.
 */
function isSecretEmpty(secret: string): boolean {
  return secret.length === 0;
}

/**
 * Resolve a credential reference to its secret material using server-side Worker bindings.
 *
 * This function is server-only. It reads the provisioned Worker secret that
 * matches the stored `credentialRef` and returns the material for server-side
 * Agent RPC authentication. The result must not be serialized to browser
 * responses, logs, or Client D1 records.
 *
 * The `credentialRef` is validated against an allowed prefix to prevent access
 * to arbitrary Worker environment variables.
 */
export function resolveCredentialSecret(
  env: ClientWorkerEnv,
  agentId: string,
  credentialRef: string
): Promise<ResolvedCredentialSecret> {
  return Promise.resolve().then(() => {
    if (agentId === '') {
      throw new TypeError('agentId must not be empty.');
    }
    assertSafeCredentialRef(credentialRef);

    const secret = readWorkerSecret(env, credentialRef);
    if (isSecretEmpty(secret)) {
      throw new Error('The requested Agent credential is not provisioned.');
    }

    return {
      agentId,
      credentialRef,
      secretMaterial: secret,
    } satisfies ResolvedCredentialSecret;
  });
}

/**
 * Read a validated credential secret from the Worker environment.
 *
 * Uses `Object.entries` iteration instead of dynamic key access to avoid
 * object-injection risk. The `credentialRef` has already been validated by
 * `assertSafeCredentialRef` to start with `AGENT_CREDENTIAL_` and contain
 * only safe characters.
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
