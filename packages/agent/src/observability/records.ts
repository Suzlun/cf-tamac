import { redactObservabilityRecord } from './redaction';

/**
 * Safe correlation fields shared by logs, metrics, audit, and counters.
 */
export interface AgentObservabilityCorrelationFields {
  readonly adapterConnectionId?: string;
  readonly agentId?: string;
  readonly actingUserIdHash?: string;
  readonly authFailureReason?: string;
  readonly causationId?: string;
  readonly compactionId?: string;
  readonly correlationId?: string;
  readonly decisionSummary?: string;
  readonly eventId?: string;
  readonly idempotencyKey?: string;
  readonly installationId?: string;
  readonly issuer?: string;
  readonly jwtId?: string;
  readonly keyFingerprint?: string;
  readonly keyId?: string;
  readonly method?: string;
  readonly modelPolicyDigest?: string;
  readonly modelPolicyRef?: string;
  readonly principalId?: string;
  readonly principalType?: string;
  readonly promptDigest?: string;
  readonly requestId?: string;
  readonly responseDigest?: string;
  readonly runId?: string;
  readonly service?: string;
  readonly subjectHash?: string;
  readonly scopes?: readonly string[];
  readonly threadId?: string;
  readonly threadKeyHash?: string;
  readonly toolInvocationId?: string;
}

/**
 * Structured log severity recognized by Agent observability.
 */
export type AgentStructuredLogSeverity = 'debug' | 'info' | 'warn' | 'error';

/**
 * Structured log record with redacted arbitrary attributes.
 */
export interface AgentStructuredLogRecord {
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly fields: AgentObservabilityCorrelationFields;
  readonly message: string;
  readonly severity: AgentStructuredLogSeverity;
  readonly timestampUnixMs: number;
}

/**
 * Metric record emitted by Agent runtime modules.
 */
export interface AgentMetricRecord {
  readonly fields: AgentObservabilityCorrelationFields;
  readonly name: string;
  readonly timestampUnixMs: number;
  readonly unit?: string;
  readonly value: number;
}

/**
 * Audit record kept free of raw tokens, private keys, and provider credentials.
 */
export interface AgentAuditRecord {
  readonly action: string;
  readonly auditId: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly fields: AgentObservabilityCorrelationFields;
  readonly outcome: 'success' | 'failure' | 'denied';
  readonly timestampUnixMs: number;
}

/**
 * Rate-limit or security counter record for denial observability.
 */
export interface AgentCounterRecord {
  readonly count: number;
  readonly counterType: 'rate_limit' | 'security';
  readonly fields: AgentObservabilityCorrelationFields;
  readonly name: string;
  readonly reason?: string;
  readonly timestampUnixMs: number;
}

/**
 * Create a structured log record after applying redaction to arbitrary attributes.
 */
export function createAgentStructuredLogRecord(input: {
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly fields: AgentObservabilityCorrelationFields;
  readonly message: string;
  readonly severity: AgentStructuredLogSeverity;
  readonly timestampUnixMs: number;
}): AgentStructuredLogRecord {
  return {
    attributes: redactObservabilityRecord(input.attributes ?? {}),
    fields: input.fields,
    message: input.message,
    severity: input.severity,
    timestampUnixMs: input.timestampUnixMs,
  };
}

/**
 * Create a metric record using safe correlation fields.
 */
export function createAgentMetricRecord(input: AgentMetricRecord): AgentMetricRecord {
  return input;
}

/**
 * Create an audit record after applying redaction to arbitrary details.
 */
export function createAgentAuditRecord(input: AgentAuditRecord): AgentAuditRecord {
  return {
    ...input,
    details: redactObservabilityRecord(input.details),
  };
}

/**
 * Create a rate-limit or security counter record.
 */
export function createAgentCounterRecord(input: AgentCounterRecord): AgentCounterRecord {
  return input;
}
