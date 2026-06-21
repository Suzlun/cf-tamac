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
  'AGENT_EXTENSION_SIGNATURE_KEYS',
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
 * Agent Worker Cloudflare bindings owned by the Agent runtime.
 */
export interface AgentWorkerBindings {
  readonly AI_AGENT: DurableObjectNamespace<AIAgent>;
  readonly AGENT_BLOBS: R2Bucket;
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
  if (isMissingSecret(env.AGENT_EXTENSION_SIGNATURE_KEYS)) {
    missingSecrets.push('AGENT_EXTENSION_SIGNATURE_KEYS');
  }
  if (isMissingSecret(env.AGENT_MODEL_PROVIDER_SECRET_REFS)) {
    missingSecrets.push('AGENT_MODEL_PROVIDER_SECRET_REFS');
  }
  return missingSecrets;
}

function isMissingSecret(value: string | undefined): boolean {
  return typeof value !== 'string' || value === '';
}
