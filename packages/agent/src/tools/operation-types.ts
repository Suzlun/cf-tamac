import type {
  AgentAuditView,
  AgentCoreRequestContext,
  AgentEventView,
  AgentPageView,
} from '../domain';
import type { AgentToolDefinitionView } from './catalog';
import type { IntegrationToolProviderClient } from './provider-client';

/**
 * AgentToolService.ListTools query です。
 */
export interface ListAgentToolsQuery {
  readonly context: AgentCoreRequestContext;
  readonly includeUnavailable?: boolean;
  readonly installationId?: string;
  readonly pageSize?: number;
}

/**
 * AgentToolService.GetInvocation query です。
 */
export interface GetToolInvocationQuery {
  readonly context: AgentCoreRequestContext;
  readonly includePayloadRefs?: boolean;
  readonly invocationId: string;
}

/**
 * AgentToolService.ListInvocations query です。
 */
export interface ListToolInvocationsQuery {
  readonly context: AgentCoreRequestContext;
  readonly installationId?: string;
  readonly pageCursorScope?: string;
  readonly pageSize?: number;
  readonly pageToken?: string;
  readonly runId?: string;
  readonly status?: string;
  readonly threadId?: string;
}

/**
 * Harness が ToolInvocation を提案するときの command です。
 */
export interface CreateToolInvocationCommand {
  readonly causationEventId?: string;
  readonly context: AgentCoreRequestContext;
  readonly inputRef?: string;
  readonly runId: string;
  readonly threadId: string;
  readonly toolId: string;
}

/**
 * ToolInvocation approval / rejection command です。
 */
export interface DecideToolInvocationCommand {
  readonly context: AgentCoreRequestContext;
  readonly invocationId: string;
  readonly reason?: string;
}

/**
 * Provider Tool を実行する command です。
 */
export interface ExecuteToolInvocationCommand {
  readonly context: AgentCoreRequestContext;
  readonly invocationId: string;
  readonly providerClient: IntegrationToolProviderClient;
}

/**
 * Provider からの Tool result callback を処理する command です。
 */
export interface RecordToolResultCommand {
  readonly context: AgentCoreRequestContext;
  readonly invocationId: string;
  readonly outputRef?: string;
  readonly providerOperationId?: string;
  readonly status: 'failed' | 'succeeded';
}

/**
 * outcome_unknown の Provider operation を照合する command です。
 */
export interface ReconcileToolInvocationCommand {
  readonly context: AgentCoreRequestContext;
  readonly invocationId: string;
  readonly providerClient: IntegrationToolProviderClient;
}

/**
 * running / outcome_unknown ToolInvocation を取り消す command です。
 */
export interface CancelToolInvocationCommand {
  readonly context: AgentCoreRequestContext;
  readonly invocationId: string;
  readonly providerClient?: IntegrationToolProviderClient;
  readonly reason?: string;
}

/**
 * ToolInvocation の安全な view です。
 */
export interface ToolInvocationView {
  readonly agentId: string;
  readonly approvalId?: string;
  readonly attemptCount: number;
  readonly createdAtMs: number;
  readonly failureReason?: string;
  readonly idempotencyKey: string;
  readonly inputRef?: string;
  readonly installationId?: string;
  readonly invocationId: string;
  readonly outputRef?: string;
  readonly providerOperationId?: string;
  readonly resultEventId?: string;
  readonly runId: string;
  readonly status: string;
  readonly threadId: string;
  readonly toolId: string;
  readonly toolSetVersion: number;
  readonly updatedAtMs: number;
}

/**
 * Tool approval の安全な view です。
 */
export interface ToolApprovalView {
  readonly actorId: string;
  readonly agentId: string;
  readonly approvalId: string;
  readonly auditEventId?: string;
  readonly decidedAtMs: number;
  readonly decision: string;
  readonly invocationId: string;
  readonly principalId: string;
  readonly reason?: string;
}

/**
 * Provider operation の安全な view です。
 */
export interface ProviderOperationView {
  readonly agentId: string;
  readonly cancellationSupported: boolean;
  readonly installationId: string;
  readonly invocationId?: string;
  readonly operationId: string;
  readonly providerOperationRef?: string;
  readonly requestDigest?: string;
  readonly status: string;
  readonly timeoutAtMs?: number;
}

/**
 * ListTools の結果です。
 */
export interface ListAgentToolsResult {
  readonly page: AgentPageView;
  readonly tools: readonly AgentToolDefinitionView[];
  readonly toolSetVersion: number;
}

/**
 * GetInvocation の結果です。
 */
export interface GetToolInvocationResult {
  readonly approval?: ToolApprovalView;
  readonly invocation: ToolInvocationView;
  readonly providerOperation?: ProviderOperationView;
}

/**
 * ListInvocations の結果です。
 */
export interface ListToolInvocationsResult {
  readonly invocations: readonly ToolInvocationView[];
  readonly page: AgentPageView;
}

/**
 * ToolInvocation mutation の結果です。
 */
export interface ToolInvocationMutationResult extends GetToolInvocationResult {
  readonly audit?: AgentAuditView;
  readonly replayed: boolean;
  readonly resultEvent?: AgentEventView;
}
