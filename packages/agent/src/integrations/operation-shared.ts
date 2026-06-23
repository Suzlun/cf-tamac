import { authorizeAgentOperation } from '../domain/agent-operation-utils';
import { createAgentDomainError } from '../domain/errors';

import { integrationIngressServiceName } from './security';

import type { AgentCoreRequestContext, AgentPageView } from '../domain';
import type {
  AgentAdapterConnectionRow,
  AgentIntegrationAdapterRow,
  AgentIntegrationInstallationRow,
  AgentStorageRepositories,
} from '../storage';
import type { PublishIntegrationEventCommand } from './types';

/** AgentIntegrationService の Protobuf service 名です。 */
export const integrationServiceName = 'cftamac.agent.v1.AgentIntegrationService';
/** InstallIntegration の idempotency operation 名です。 */
export const installOperationName = 'AgentIntegrationService.InstallIntegration';
/** UninstallIntegration の idempotency operation 名です。 */
export const uninstallOperationName = 'AgentIntegrationService.UninstallIntegration';
/** CreateAdapterConnection の idempotency operation 名です。 */
export const createConnectionOperationName = 'AgentIntegrationService.CreateAdapterConnection';
/** DeleteAdapterConnection の idempotency operation 名です。 */
export const deleteConnectionOperationName = 'AgentIntegrationService.DeleteAdapterConnection';
/** PublishDeliveryResult の idempotency operation 名です。 */
export const publishDeliveryResultOperationName = 'IntegrationIngressService.PublishDeliveryResult';

/** Integration manifest grants を Agent principal grants として永続化します。 */
export function persistIntegrationGrants(
  repositories: AgentStorageRepositories,
  installationId: string,
  grants: readonly string[],
  nowMs: number
) {
  const persisted = [];
  for (const grant of expandAgentGrantCapabilities(grants)) {
    const grantId = `${installationId}:${grant}`;
    // Integration repository は manifest 由来 grant ledger を保持します。
    persisted.push(
      repositories.integrations.insertGrant({
        createdAtMs: nowMs,
        grantId,
        grantType: 'manifest',
        installationId,
        scope: grant,
        status: 'active',
      })
    );
    // Agent-wide authorization repository にも同じ capability を反映します。
    repositories.grants.upsertGrant({
      capability: grant,
      grantId,
      nowMs,
      principalId: installationId,
      scopeRef: `installation:${installationId}`,
      status: 'active',
    });
  }
  return persisted;
}

/** Integration grant を Agent 内部 capability へ展開します。 */
export function expandAgentGrantCapabilities(grants: readonly string[]): readonly string[] {
  const expanded = new Set(grants);
  if (expanded.has('integration.ingress.event')) expanded.add('agent.event');
  if (expanded.has('integration.delivery.result')) expanded.add('agent.integration');
  return [...expanded];
}

/** Installation に紐づく grant を revoke し、authorization ledger へ反映します。 */
export function revokeIntegrationGrants(
  repositories: AgentStorageRepositories,
  installationId: string,
  nowMs: number
): void {
  const grants = repositories.integrations.revokeGrantsByInstallation({ installationId, nowMs });
  for (const grant of grants) {
    repositories.grants.upsertGrant({
      capability: grant.scope,
      grantId: grant.grantId,
      nowMs,
      principalId: installationId,
      scopeRef: `installation:${installationId}`,
      status: 'revoked',
    });
  }
}

/** Installation 由来の ToolDefinition を利用不可へ遷移します。 */
export function revokeIntegrationTools(
  repositories: AgentStorageRepositories,
  installationId: string,
  nowMs: number
): void {
  const tools = repositories.tools.listDefinitions({
    includeUnavailable: true,
    installationId,
    limit: 1_000,
  });
  for (const tool of tools) {
    repositories.tools.upsertDefinition({
      approvalRequired: tool.approvalRequired === 1,
      cancellationSupported: tool.cancellationSupported === 1,
      createdAtMs: tool.createdAtMs,
      description: tool.description ?? undefined,
      displayName: tool.displayName,
      inputSchemaRef: tool.inputSchemaRef ?? undefined,
      installationId,
      outputSchemaRef: tool.outputSchemaRef ?? undefined,
      providerTargetRef: tool.providerTargetRef ?? undefined,
      status: 'unavailable',
      toolId: tool.toolId,
      toolSetVersion: tool.toolSetVersion,
      updatedAtMs: nowMs,
      version: tool.version,
    });
  }
}

/** Installation uninstall 時に未完了 ToolInvocation を安全に停止します。 */
export function cancelPendingIntegrationInvocations(
  repositories: AgentStorageRepositories,
  installationId: string,
  nowMs: number
): void {
  const invocations = repositories.tools.listInvocations({ installationId, limit: 1_000 });
  for (const invocation of invocations) {
    if (['approved', 'pending_approval', 'proposed', 'running'].includes(invocation.status)) {
      repositories.tools.transitionInvocationStatus({
        failureReason: 'integration_uninstalled',
        invocationId: invocation.invocationId,
        status: 'cancelled',
        updatedAtMs: nowMs,
      });
    } else if (invocation.status === 'outcome_unknown') {
      repositories.tools.transitionInvocationStatus({
        failureReason: 'integration_uninstalled',
        invocationId: invocation.invocationId,
        status: 'outcome_unknown',
        updatedAtMs: nowMs,
      });
    }
  }
}

/** Integration 系 operation の final authorization を統一して実行します。 */
export function authorizeIntegrationOperation(
  repositories: AgentStorageRepositories,
  context: AgentCoreRequestContext,
  action: string,
  method: string,
  mode: 'delivery' | 'ingress' | 'read' | 'write',
  capability?: Parameters<typeof authorizeAgentOperation>[0]['capability'],
  requiredGrants?: readonly string[]
): void {
  authorizeAgentOperation({
    action,
    capability,
    context,
    method,
    repositories,
    requiredGrants,
    requiredPrincipalTypes:
      mode === 'ingress'
        ? ['INTEGRATION_INSTALLATION']
        : mode === 'delivery'
          ? ['INTERNAL_SERVICE', 'CLIENT_SERVICE', 'ADMIN_OPERATOR']
          : ['CLIENT_SERVICE', 'ADMIN_OPERATOR', 'INTERNAL_SERVICE'],
    requiredScopes:
      mode === 'read'
        ? ['agent.rpc', 'agent.read']
        : mode === 'ingress'
          ? ['agent.rpc', 'agent.integration']
          : ['agent.rpc', 'agent.integration'],
    service: mode === 'ingress' ? integrationIngressServiceName : integrationServiceName,
  });
}

/** Ingress command の Connection を解決し、Installation ownership を検証します。 */
export function resolveIngressConnection(
  repositories: AgentStorageRepositories,
  command: PublishIntegrationEventCommand
): AgentAdapterConnectionRow {
  const connectionId = command.connectionId;
  if (connectionId === undefined || connectionId.trim() === '') {
    throw createAgentDomainError({
      kind: 'validation',
      message: 'connection_id is required for Integration ingress.',
      target: 'connection_id',
    });
  }
  const connection = requireConnection(repositories, connectionId);
  if (connection.installationId !== command.installationId || connection.status !== 'active') {
    throw createAgentDomainError({
      kind: 'authorization',
      message: 'Adapter Connection is not active for this Installation.',
      target: 'connection_id',
    });
  }
  const installation = requireInstallation(repositories, command.installationId);
  assertInstallationActive(installation);
  return connection;
}

/** 同じ Agent に active な同一 Integration が既にないことを検証します。 */
export function assertIntegrationNotInstalled(
  repositories: AgentStorageRepositories,
  integrationId: string
): void {
  const existing = repositories.integrations
    .listInstallations({ limit: 1_000 })
    .find((row) => row.integrationId === integrationId && row.status !== 'uninstalled');
  if (existing !== undefined) {
    throw createAgentDomainError({
      kind: 'conflict',
      message: 'Integration is already installed for this Agent.',
      target: 'integration_id',
    });
  }
}

/** Installation が Adapter Connection 作成可能な状態か検証します。 */
export function assertInstallationCanCreateConnection(
  installation: AgentIntegrationInstallationRow
): void {
  if (installation.status !== 'active' && installation.status !== 'pending_external_setup') {
    throw createAgentDomainError({
      kind: 'precondition',
      message: 'Integration Installation cannot create Adapter Connections in current status.',
      target: 'installation_id',
    });
  }
}

/** Installation が active 状態か検証します。 */
export function assertInstallationActive(installation: AgentIntegrationInstallationRow): void {
  if (installation.status !== 'active') {
    throw createAgentDomainError({
      kind: 'precondition',
      message: 'Integration Installation is not active.',
      target: 'installation_id',
    });
  }
}

/** Installation row を必須取得します。 */
export function requireInstallation(
  repositories: AgentStorageRepositories,
  installationId: string
): AgentIntegrationInstallationRow {
  const installation = repositories.integrations.findInstallation(installationId);
  if (installation === undefined) {
    throw createAgentDomainError({
      kind: 'not_found',
      message: 'Integration Installation not found.',
    });
  }
  return installation;
}

/** Adapter definition row を必須取得し、active 状態を検証します。 */
export function requireAdapterDefinition(
  repositories: AgentStorageRepositories,
  installationId: string,
  adapterId: string
): AgentIntegrationAdapterRow {
  const adapter = repositories.integrations.findAdapterDefinition({ adapterId, installationId });
  if (adapter?.status !== 'active') {
    throw createAgentDomainError({ kind: 'not_found', message: 'Adapter definition not found.' });
  }
  return adapter;
}

/** Adapter Connection row を必須取得します。 */
export function requireConnection(
  repositories: AgentStorageRepositories,
  connectionId: string
): AgentAdapterConnectionRow {
  const connection = repositories.integrations.findConnection(connectionId);
  if (connection === undefined) {
    throw createAgentDomainError({ kind: 'not_found', message: 'Adapter Connection not found.' });
  }
  return connection;
}

/** DeliveryContext row を必須取得します。 */
export function requireDeliveryContext(
  repositories: AgentStorageRepositories,
  deliveryContextId: string
) {
  const context = repositories.integrations.findDeliveryContext(deliveryContextId);
  if (context === undefined) {
    throw createAgentDomainError({ kind: 'not_found', message: 'DeliveryContext not found.' });
  }
  return context;
}

/** Installation に対応する Integration definition を取得します。 */
export function findDefinitionForInstallation(
  repositories: AgentStorageRepositories,
  installation: AgentIntegrationInstallationRow
) {
  return repositories.integrations.findDefinition(installation.integrationId);
}

/** Installation scope の authorization capability を作成します。 */
export function createInstallationCapability(agentId: string, installationId: string) {
  return { capabilityKind: 'integration' as const, installationId, ownerAgentId: agentId };
}

/** Connection scope の authorization capability を作成します。 */
export function createConnectionCapability(agentId: string, connection: AgentAdapterConnectionRow) {
  return {
    adapterConnectionId: connection.connectionId,
    capabilityKind: 'integration' as const,
    installationId: connection.installationId,
    ownerAgentId: agentId,
  };
}

/** Grant summary 参照を安定形式で作成します。 */
export function createGrantSummaryRef(installationId: string): string {
  return `agent-integration-grants://${encodeURIComponent(installationId)}`;
}

/** Provider delivery request の nonce を作成します。 */
export function createProviderNonce(context: AgentCoreRequestContext, deliveryId: string): string {
  return `${context.requestId ?? context.principal.principalId}:${deliveryId}:${String(context.requestedAtMs)}`;
}

/** Command context から必須 idempotency key を取得します。 */
export function requireContextIdempotency(context: AgentCoreRequestContext): string {
  if (context.idempotencyKey === undefined || context.idempotencyKey === '') {
    throw createAgentDomainError({
      kind: 'validation',
      message: 'idempotency_key must not be empty.',
    });
  }
  return context.idempotencyKey;
}

/** Page size を Agent RPC の許容範囲へ丸めます。 */
export function clampPageSize(value: number | undefined): number {
  return Math.min(Math.max(value ?? 50, 1), 100);
}

/** 数値 cursor token を安全に解析します。 */
export function parseNumericPageToken(token: string | undefined): number | undefined {
  if (token === undefined || token === '') return undefined;
  const value = Number.parseInt(token, 10);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Row 配列から Agent-scoped page metadata を作成します。 */
export function createPage<Row>(
  agentId: string,
  scope: string,
  rows: readonly Row[],
  hasMore: boolean,
  cursorValue: (row: Row) => number
): AgentPageView {
  const last = rows.at(-1);
  return {
    cursorScope: `${agentId}:${scope}`,
    nextPageToken: hasMore && last !== undefined ? String(cursorValue(last)) : undefined,
    resultCount: rows.length,
  };
}

/** 任意文字列を NFC 正規化し、空文字を undefined へ変換します。 */
export function normalizeOptionalText(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().normalize('NFC');
  return normalized === '' ? undefined : normalized;
}

/** Trust key material を storage 向け文字列へ変換します。 */
export function serializeKeyMaterial(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'string' ? value : JSON.stringify(value);
}
