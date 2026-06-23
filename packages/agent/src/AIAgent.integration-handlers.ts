import { readDurableObjectSqlDatabaseSizeBytes } from './agent-foundation-state';
import {
  createAdapterConnectionInStore,
  deleteAdapterConnectionInStore,
  deliverToIntegrationProvider,
  getIntegrationInstallationFromStore,
  installIntegrationInStore,
  listAdapterConnectionsFromStore,
  listIntegrationInstallationsFromStore,
  publishIntegrationDeliveryResultInStore,
  publishIntegrationEventInStore,
  publishIntegrationToolResultInStore,
  uninstallIntegrationInStore,
} from './integrations';
import { createAgentStorageThresholdSnapshot, type AgentStorageRepositories } from './storage';

import type { AgentLocalQueueWakePayload } from './AIAgent.types';
import type { AgentWorkerEnv } from './env';
import type {
  AdapterConnectionMutationResult,
  CreateAdapterConnectionCommand,
  DeleteAdapterConnectionCommand,
  DeliverToIntegrationProviderCommand,
  DeliverToIntegrationProviderResult,
  GetIntegrationInstallationQuery,
  GetIntegrationInstallationResult,
  InstallIntegrationCommand,
  InstallIntegrationResult,
  ListAdapterConnectionsQuery,
  ListAdapterConnectionsResult,
  ListIntegrationInstallationsQuery,
  ListIntegrationInstallationsResult,
  PublishIntegrationDeliveryResult,
  PublishIntegrationDeliveryResultCommand,
  PublishIntegrationEventCommand,
  PublishIntegrationEventResult,
  PublishIntegrationToolResultCommand,
  UninstallIntegrationCommand,
  UninstallIntegrationResult,
} from './integrations';
import type { IntegrationManifestBytesLoader } from './integrations/manifest';
import type { ToolInvocationMutationResult } from './tools';

/**
 * `AIAgent` から Integration handler へ渡す実行時 context です。
 *
 * @remarks
 * Durable Object 本体の責務である Agent ID、Agent-owned repository、R2 blob binding、
 * scheduler wake callback を一つの構造へまとめ、`AIAgent.ts` に Stage 7 の具体処理を
 * 直接膨らませないために使います。入力は `AIAgent` の現在状態だけで、副作用は各 handler が
 * repository/R2/scheduler callback を通じて明示的に実行します。
 *
 * @property agentId 処理対象の Agent aggregate ID です。
 * @property durableObjectStorage SQLite 使用量を読むための Durable Object storage です。
 * @property env Agent Worker の binding 群です。ここでは Agent-owned R2 だけを使います。
 * @property repositories Agent-owned SQLite repository 集約です。
 * @property requestSchedulerWake Event append 後に Run scheduler を起こす callback です。
 * @property requestWakeAfterToolResult Tool result Event 作成後に Run scheduler を起こす callback です。
 * @example
 * ```ts
 * const context = createIntegrationHandlerContextFromAIAgent(agent);
 * await agentIntegrationHandlers.publishIntegrationEvent(context, command);
 * ```
 */
export interface AIAgentIntegrationHandlerContext {
  readonly agentId: string;
  readonly durableObjectStorage: DurableObjectStorage;
  readonly env: AgentWorkerEnv;
  readonly repositories: AgentStorageRepositories;
  readonly requestSchedulerWake: (payload: AgentLocalQueueWakePayload) => void;
  readonly requestWakeAfterToolResult: (
    result: ToolInvocationMutationResult,
    requestedAtMs: number
  ) => void;
}

/**
 * `AIAgent` の public Integration methods から呼び出す Stage 7 handler 群です。
 *
 * @remarks
 * Worker/DO layer から Integration domain/runtime layer へ処理を委譲するための薄い adapter です。
 * public Agent API は引き続き generated Protobuf RPC service 経由だけに閉じ、ここでは REST/JSON 形式や
 * Provider 固有 protocol を追加しません。戻り値と例外は各 domain operation の契約をそのまま返します。
 *
 * @example
 * ```ts
 * const result = await agentIntegrationHandlers.installIntegration(context, command);
 * ```
 */
export const agentIntegrationHandlers = {
  createAdapterConnection,
  deleteAdapterConnection,
  deliverToProvider,
  getInstallation,
  installIntegration,
  listAdapterConnections,
  listInstallations,
  publishDeliveryResult,
  publishEvent,
  publishToolResult,
  uninstallIntegration,
} as const;

function installIntegration(
  context: AIAgentIntegrationHandlerContext,
  command: InstallIntegrationCommand
): Promise<InstallIntegrationResult> {
  // Agent ID と repository を明示し、manifest 検証と永続化は Integration domain に閉じます。
  return installIntegrationInStore({
    agentId: context.agentId,
    command,
    loadManifestBytes: fetchIntegrationManifestBytes,
    repositories: context.repositories,
  });
}

function uninstallIntegration(
  context: AIAgentIntegrationHandlerContext,
  command: UninstallIntegrationCommand
): UninstallIntegrationResult {
  // uninstall の副作用は domain operation に集約し、DO layer は Agent scope だけを渡します。
  return uninstallIntegrationInStore({
    agentId: context.agentId,
    command,
    repositories: context.repositories,
  });
}

function getInstallation(
  context: AIAgentIntegrationHandlerContext,
  query: GetIntegrationInstallationQuery
): GetIntegrationInstallationResult {
  // 読み取り query も Agent scope と final authorization context を domain 側で検証します。
  return getIntegrationInstallationFromStore({
    agentId: context.agentId,
    query,
    repositories: context.repositories,
  });
}

function listInstallations(
  context: AIAgentIntegrationHandlerContext,
  query: ListIntegrationInstallationsQuery
): ListIntegrationInstallationsResult {
  // Cursor/page 条件は repository に閉じ、DO layer は cross-Agent list を提供しません。
  return listIntegrationInstallationsFromStore({
    agentId: context.agentId,
    query,
    repositories: context.repositories,
  });
}

function createAdapterConnection(
  context: AIAgentIntegrationHandlerContext,
  command: CreateAdapterConnectionCommand
): AdapterConnectionMutationResult {
  // Adapter Connection は Agent-local state として作成し、Provider 固有の公開 surface は持ちません。
  return createAdapterConnectionInStore({
    agentId: context.agentId,
    command,
    repositories: context.repositories,
  });
}

function deleteAdapterConnection(
  context: AIAgentIntegrationHandlerContext,
  command: DeleteAdapterConnectionCommand
): AdapterConnectionMutationResult {
  // Connection 削除は ledger を残す無効化として扱い、監査可能性を維持します。
  return deleteAdapterConnectionInStore({
    agentId: context.agentId,
    command,
    repositories: context.repositories,
  });
}

function listAdapterConnections(
  context: AIAgentIntegrationHandlerContext,
  query: ListAdapterConnectionsQuery
): ListAdapterConnectionsResult {
  // Agent scope の list だけを許可し、Adapter/Installation filter は domain operation に委譲します。
  return listAdapterConnectionsFromStore({
    agentId: context.agentId,
    query,
    repositories: context.repositories,
  });
}

async function publishEvent(
  context: AIAgentIntegrationHandlerContext,
  command: PublishIntegrationEventCommand
): Promise<PublishIntegrationEventResult> {
  // Blob offload は Agent-owned R2 binding だけを使い、Client storage や外部 DB へ漏らしません。
  const result = await publishIntegrationEventInStore({
    agentId: context.agentId,
    blobWriter: async (blob) => {
      // R2 metadata に digest と content type を保存し、payload の完全性検証材料を残します。
      await context.env.AGENT_BLOBS.put(blob.key, blob.body, {
        customMetadata: { sha256: blob.sha256 },
        httpMetadata: { contentType: blob.contentType },
      });
      // Repository へ返す参照は Agent-owned blob の immutable metadata だけに限定します。
      return {
        byteSize: blob.body.byteLength,
        contentType: blob.contentType,
        key: blob.key,
        sha256: blob.sha256,
      };
    },
    command,
    repositories: context.repositories,
    storageUsagePercent: createAgentStorageThresholdSnapshot({
      currentBytes: readDurableObjectSqlDatabaseSizeBytes(context.durableObjectStorage),
    }).currentPercent,
  });
  // 新規 Event だけ scheduler wake を要求し、idempotency replay では重複 wake を避けます。
  if (!result.replayed) {
    context.requestSchedulerWake({
      reason: 'event_accepted',
      requestedAtMs: command.context.requestedAtMs,
    });
  }
  return result;
}

async function publishToolResult(
  context: AIAgentIntegrationHandlerContext,
  command: PublishIntegrationToolResultCommand
): Promise<ToolInvocationMutationResult> {
  // Provider callback を既存 Tool result ledger に集約し、重複結果を同じ規則で抑止します。
  const result = await publishIntegrationToolResultInStore({
    agentId: context.agentId,
    command,
    repositories: context.repositories,
  });
  // result Event が新規作成された場合だけ Run scheduler を起こします。
  context.requestWakeAfterToolResult(result, command.context.requestedAtMs);
  return result;
}

function publishDeliveryResult(
  context: AIAgentIntegrationHandlerContext,
  command: PublishIntegrationDeliveryResultCommand
): Promise<PublishIntegrationDeliveryResult> {
  // Delivery result は AdapterDelivery ledger に閉じ、Provider 固有 DTO を外へ広げません。
  return publishIntegrationDeliveryResultInStore({
    agentId: context.agentId,
    command,
    repositories: context.repositories,
  });
}

function deliverToProvider(
  context: AIAgentIntegrationHandlerContext,
  command: DeliverToIntegrationProviderCommand
): Promise<DeliverToIntegrationProviderResult> {
  // Provider 呼び出しは generated binary Protobuf client に委譲し、DO layer では routing 情報だけを渡します。
  return deliverToIntegrationProvider({
    agentId: context.agentId,
    command,
    repositories: context.repositories,
  });
}

const fetchIntegrationManifestBytes: IntegrationManifestBytesLoader = async (manifestRef) => {
  // HTTPS manifest の network I/O は Durable Object adapter 層に限定し、domain 層へは検証材料だけを渡します。
  const response = await globalThis.fetch(manifestRef, { method: 'GET' });
  // Provider が error status を返した場合でも status と content type を domain の error mapping へ渡します。
  const bytes = response.ok ? new Uint8Array(await response.arrayBuffer()) : new Uint8Array();
  return {
    bytes,
    contentType: response.headers.get('content-type') ?? '',
    ok: response.ok,
    status: response.status,
  };
};
