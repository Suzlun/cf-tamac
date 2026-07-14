'use server';

import { revalidatePath } from 'next/cache';

import { loadAgentRpcClients } from '../../agent-rpc/agent-loader';
import {
  createBrowserSafeAgentRpcActionFailure,
  createBrowserSafeAgentRpcActionSuccess,
  executeBrowserSafeAgentRpcQuery,
  type BrowserSafeAgentRpcActionResult,
} from '../../agent-rpc/safe-results';
import {
  toBrowserSafeAdapterConnection,
  toBrowserSafeCleanupResult,
  toBrowserSafeInstallationSummary,
  toBrowserSafeToolSummary,
  type BrowserSafeInstallationSummary,
  type ListInstallationsOptions,
} from '../agent-operation-view-models';
import {
  buildScopedPageRequest,
  toBrowserSafePageInfo,
  type BrowserSafePagedResult,
} from '../browser-safe-helpers';

/**
 * Integration installation 一覧 query が Browser へ返す allowlisted display DTO です。
 *
 * @remarks
 * installation、adapter connection、Tool、cursor は各 Browser-safe mapper が許可した metadata だけを持ちます。
 * Provider credential、manifest body、generated SDK response は含めません。
 */
export type BrowserSafeInstallationListDisplayData =
  BrowserSafePagedResult<BrowserSafeInstallationSummary>;

/**
 * AgentIntegrationService.ListInstallations を detail enrichment 付きで呼び出す。
 *
 * @param agentId - Integration installation を読み出す Agent aggregate の ID。
 * @param options - 任意の status filter と cursor 入力。
 * @returns Browser-safe installation summary と page metadata。
 * @remarks Provider credential material は返さず、grants/tools/connection も safe metadata に丸める。
 */
export async function listInstallations(
  agentId: string,
  options: ListInstallationsOptions = {}
): Promise<BrowserSafeAgentRpcActionResult<BrowserSafeInstallationListDisplayData>> {
  return executeBrowserSafeAgentRpcQuery(
    async () => {
      // Installation list と detail enrichment に使う SDK client は server-only callback 内に閉じます。
      const { clients } = await loadAgentRpcClients(agentId);
      const response = await clients.withErrorNormalization(() =>
        clients.integrations.listInstallations({
          agentId,
          page: buildScopedPageRequest(agentId, 'integrations', options.page),
          status: options.status,
        })
      );
      return { correlationId: clients.invocation.correlationId, response: { clients, response } };
    },
    async ({ clients, response }) => {
      // enrichment response も mapper 内で安全化し、Provider raw data を display DTO に混入させません。
      const items = await Promise.all(
        response.installations.map(async (installation) =>
          enrichInstallationSummary(agentId, installation, clients)
        )
      );
      return { items, page: toBrowserSafePageInfo(response.page) };
    },
    'Integration一覧を取得しました',
    'Integrationの安全な一覧情報を表示しています。',
    'Integration一覧を確認してください',
    'Integration一覧を確認できませんでした。時間をおいてもう一度表示してください。'
  );
}

/**
 * AgentIntegrationService.InstallIntegration を signed manifest 参照で呼び出す。
 *
 * @param agentId - Integration を install する Agent aggregate の ID。
 * @param idempotencyKey - install command の冪等性 key。
 * @param integrationId - install 対象 Integration の ID。
 * @param manifestRef - Agent が検証する signed manifest reference。
 * @param requestedGrants - operator が要求した grant scope 群。
 * @returns Browser-safe installation summary。
 * @remarks raw manifest body や provider credential は受け取らず、参照だけをAgentへ渡す。
 */
export async function installIntegration(
  agentId: string,
  idempotencyKey: string,
  integrationId: string,
  manifestRef: string,
  requestedGrants: readonly string[]
): Promise<BrowserSafeAgentRpcActionResult<BrowserSafeInstallationSummary>> {
  try {
    const { clients } = await loadAgentRpcClients(agentId);
    const response = await clients.withErrorNormalization(() =>
      clients.integrations.installIntegration({
        agentId,
        idempotencyKey,
        integrationId,
        manifestRef,
        requestedGrants: [...requestedGrants],
      })
    );

    revalidatePath(`/agents/${agentId}/integrations`);
    return createBrowserSafeAgentRpcActionSuccess(
      toBrowserSafeInstallationSummary(response.installation, response),
      'Integrationをインストールしました',
      'Integrationを管理対象Agentへ追加しました。',
      clients.invocation.correlationId
    );
  } catch (error) {
    return createBrowserSafeAgentRpcActionFailure(
      error,
      globalThis.crypto.randomUUID(),
      'Integrationを確認してください',
      'Integrationの状態は直前の確定値を保持しています。時間をおいてもう一度実行してください。'
    );
  }
}

/**
 * AgentIntegrationService.UninstallIntegration を cleanup 表示付きで呼び出す。
 *
 * @param agentId - Integration を uninstall する Agent aggregate の ID。
 * @param installationId - uninstall 対象 installation ID。
 * @param idempotencyKey - uninstall command の冪等性 key。
 * @param reason - operator が入力した理由。空文字は省略する。
 * @returns cleanup metadata を含む Browser-safe installation summary。
 * @remarks disabled connections と cleanup 件数だけを返し、provider raw response は返さない。
 */
export async function uninstallIntegration(
  agentId: string,
  installationId: string,
  idempotencyKey: string,
  reason: string
): Promise<BrowserSafeAgentRpcActionResult<BrowserSafeInstallationSummary>> {
  try {
    const { clients } = await loadAgentRpcClients(agentId);
    const response = await clients.withErrorNormalization(() =>
      clients.integrations.uninstallIntegration({
        agentId,
        idempotencyKey,
        installationId,
        reason: reason === '' ? undefined : reason,
      })
    );

    const disabledConnections = response.disabledConnections.map(toBrowserSafeAdapterConnection);
    revalidatePath(`/agents/${agentId}/integrations`);
    return createBrowserSafeAgentRpcActionSuccess(
      toBrowserSafeInstallationSummary(response.installation, response, {
        adapterConnections: disabledConnections,
        cleanupResult: toBrowserSafeCleanupResult(response, disabledConnections.length),
      }),
      'Integrationをアンインストールしました',
      'Integrationを管理対象Agentから削除しました。',
      clients.invocation.correlationId
    );
  } catch (error) {
    return createBrowserSafeAgentRpcActionFailure(
      error,
      globalThis.crypto.randomUUID(),
      'Integrationを確認してください',
      'Integrationの状態は直前の確定値を保持しています。時間をおいてもう一度実行してください。'
    );
  }
}

async function enrichInstallationSummary(
  agentId: string,
  installation: unknown,
  clients: Awaited<ReturnType<typeof loadAgentRpcClients>>['clients']
): Promise<BrowserSafeInstallationSummary> {
  const base = toBrowserSafeInstallationSummary(installation);
  const [detailResult, connectionsResult, toolsResult] = await Promise.allSettled([
    clients.withErrorNormalization(() =>
      clients.integrations.getInstallation({ agentId, installationId: base.installationId })
    ),
    clients.withErrorNormalization(() =>
      clients.integrations.listAdapterConnections({
        agentId,
        installationId: base.installationId,
        page: buildScopedPageRequest(agentId, `adapter-connections:${base.installationId}`),
      })
    ),
    clients.withErrorNormalization(() =>
      clients.tools.listTools({
        agentId,
        installationId: base.installationId,
        includeUnavailable: true,
        page: buildScopedPageRequest(agentId, `tools:${base.installationId}`),
      })
    ),
  ]);

  const detail = detailResult.status === 'fulfilled' ? detailResult.value : undefined;
  const connections =
    connectionsResult.status === 'fulfilled' ? connectionsResult.value.connections : [];
  const tools = toolsResult.status === 'fulfilled' ? toolsResult.value.tools : [];
  return toBrowserSafeInstallationSummary(installation, detail, {
    adapterConnections: connections.map(toBrowserSafeAdapterConnection),
    tools: tools.map(toBrowserSafeToolSummary),
  });
}
