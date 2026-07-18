/**
 * Stable Agent domain error categories mapped by the RPC facade.
 */
export const agentDomainErrorKinds = [
  'validation',
  'authentication',
  'authorization',
  'not_found',
  'conflict',
  'precondition',
  'concurrency',
  'rate_limit',
  'provider_failure',
  'timeout',
  'internal',
] as const;

/**
 * Stable Agent domain error category.
 */
export type AgentDomainErrorKind = (typeof agentDomainErrorKinds)[number];

/**
 * Safe domain error shape that excludes secrets and raw provider credentials.
 */
export interface AgentDomainError extends Error {
  readonly kind: AgentDomainErrorKind;
  readonly retryable: boolean;
  readonly safeDetails?: Readonly<Record<string, string>>;
  readonly target?: string;
}

/**
 * Input for constructing a safe Agent domain error.
 */
export interface AgentDomainErrorInput {
  readonly kind: AgentDomainErrorKind;
  readonly message: string;
  readonly retryable?: boolean;
  readonly safeDetails?: Readonly<Record<string, string>>;
  readonly target?: string;
}

/**
 * Create a safe Agent domain error with default retryability for its category.
 */
export function createAgentDomainError(input: AgentDomainErrorInput): AgentDomainError {
  return new AgentDomainErrorObject(input);
}

/**
 * Return whether an unknown value is an Agent domain error.
 */
export function isAgentDomainError(value: unknown): value is AgentDomainError {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<AgentDomainError>;
  return (
    typeof candidate.kind === 'string' &&
    isAgentDomainErrorKind(candidate.kind) &&
    typeof candidate.message === 'string'
  );
}

/**
 * Return the default retryable flag for a domain error category.
 */
export function getDefaultDomainErrorRetryable(kind: AgentDomainErrorKind): boolean {
  return (
    kind === 'concurrency' ||
    kind === 'rate_limit' ||
    kind === 'provider_failure' ||
    kind === 'timeout'
  );
}

function isAgentDomainErrorKind(value: string): value is AgentDomainErrorKind {
  return agentDomainErrorKinds.includes(value as AgentDomainErrorKind);
}

class AgentDomainErrorObject extends Error implements AgentDomainError {
  readonly kind: AgentDomainErrorKind;
  readonly retryable: boolean;
  readonly safeDetails?: Readonly<Record<string, string>>;
  readonly target?: string;

  constructor(input: AgentDomainErrorInput) {
    super(input.message);
    this.name = 'AgentDomainError';
    this.kind = input.kind;
    this.retryable = input.retryable ?? getDefaultDomainErrorRetryable(input.kind);
    this.safeDetails = input.safeDetails;
    this.target = input.target;
  }
}
