import { Agent, type AgentContext } from 'agents';

import { readDurableObjectSqlDatabaseSizeBytes } from './agent-foundation-state';
import { acceptFoundationEventInStore } from './AIAgent.foundation-events';
import {
  agentIntegrationHandlers,
  type AIAgentIntegrationHandlerContext,
} from './AIAgent.integration-handlers';
import {
  type AgentConfigView,
  type AgentEventView,
  type AgentIdentity,
  type AgentLifecycleStatus,
  type AgentScopedQuery,
  type GetAgentStateResult,
  type DestroyAgentCommand,
  type DestroyAgentResult,
  type GetAgentEventQuery,
  type GetAgentResult,
  type GetAgentThreadQuery,
  type GetAgentThreadResult,
  type GetAgentThreadMemoryQuery,
  type GetAgentThreadMemoryResult,
  type InitializeAgentCommand,
  type InitializeAgentResult,
  type GetLatestAgentThreadCompactionQuery,
  type GetLatestAgentThreadCompactionResult,
  type ListAgentEventsQuery,
  type ListAgentEventsResult,
  type ListAgentSectionsQuery,
  type ListAgentSectionsResult,
  type ListAgentThreadsQuery,
  type ListAgentThreadsResult,
  type PublishAgentEventCommand,
  type PublishAgentEventResult,
  type RotateAgentCredentialCommand,
  type RotateAgentCredentialResult,
  type SearchAgentThreadHistoryQuery,
  type SearchAgentThreadHistoryResult,
  type UpdateAgentConfigCommand,
  type UpdateAgentConfigResult,
} from './domain';
import {
  getAgentConfigFromStore,
  getAgentFromStore,
  initializeAgentInStore,
  destroyAgentInStore,
  rotateAgentCredentialInStore,
  updateAgentConfigInStore,
} from './domain/lifecycle-operations';
import { getAgentStateFromStore } from './domain/state-operations';
import { getEventFromStore, listEventsFromStore, publishEventInStore } from './events';
import {
  cancelRunInStore,
  getRunFromStore,
  listRunsFromStore,
  processAgentRunSchedulerBatch,
  type CancelAgentRunCommand,
  type CancelAgentRunResult,
  type GetAgentRunQuery,
  type GetAgentRunResult,
  type ListAgentRunsQuery,
  type ListAgentRunsResult,
} from './runs';
import {
  cancelScheduleInStore,
  cleanupInstallationSchedulesInStore,
  createAndRegisterAgentSchedule,
  fireScheduleInStore,
  getScheduleFromStore,
  listSchedulesFromStore,
  type AgentScheduleCallbackPayload,
  type CancelAgentScheduleCommand,
  type CancelAgentScheduleResult,
  type CleanupInstallationSchedulesCommand,
  type CleanupInstallationSchedulesResult,
  type CreateAgentScheduleCommand,
  type CreateAgentScheduleResult,
  type FireAgentScheduleResult,
  type GetAgentScheduleQuery,
  type GetAgentScheduleResult,
  type ListAgentSchedulesQuery,
  type ListAgentSchedulesResult,
} from './schedules';
import {
  createAgentStorageRepositories,
  createAgentStorageThresholdSnapshot,
  type AgentStorageRepositories,
} from './storage';
import {
  createThreadKeyIdentity,
  getLatestCompactionFromStore,
  getThreadFromStore,
  getThreadMemoryFromStore,
  listSectionsFromStore,
  listThreadsFromStore,
  searchThreadHistoryFromStore,
  type ThreadKeyIdentity,
} from './threads';
import {
  approveToolInvocationInStore,
  cancelToolInvocationInStore,
  createToolInvocationInStore,
  executeToolInvocationWithProvider,
  getToolInvocationFromStore,
  listToolInvocationsFromStore,
  listToolsFromStore,
  reconcileToolInvocationInStore,
  recordToolResultInStore,
  rejectToolInvocationInStore,
  type CancelToolInvocationCommand,
  type CreateToolInvocationCommand,
  type DecideToolInvocationCommand,
  type ExecuteToolInvocationCommand,
  type GetToolInvocationQuery,
  type GetToolInvocationResult,
  type ListAgentToolsQuery,
  type ListAgentToolsResult,
  type ListToolInvocationsQuery,
  type ListToolInvocationsResult,
  type ReconcileToolInvocationCommand,
  type RecordToolResultCommand,
  type ToolInvocationMutationResult,
} from './tools';

import type {
  AgentFoundationEventAcceptance,
  AgentFoundationEventInput,
  AgentFoundationHealth,
  AgentLocalQueueProcessPayload,
  AgentLocalQueueProcessResult,
  AgentLocalQueueWakePayload,
  AgentSchedulerWakeRecord,
  AIAgentState,
} from './AIAgent.types';
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

/**
 * Cloudflare Agents SDK Durable Object foundation for one Agent aggregate.
 */
export class AIAgent extends Agent<AgentWorkerEnv, AIAgentState> {
  private readonly repositories: AgentStorageRepositories;
  private readonly durableObjectStorage: DurableObjectStorage;

  constructor(ctx: AgentContext, env: AgentWorkerEnv) {
    super(ctx, env);
    this.durableObjectStorage = ctx.storage;
    this.repositories = createAgentStorageRepositories(this.name, ctx.storage);
  }

  /**
   * Default lifecycle state for a new Agent Durable Object instance.
   */
  override initialState: AIAgentState = {
    lifecycleStatus: 'initializing',
  };

  /**
   * Return the Agent identity owned by this Durable Object instance.
   */
  getAgentIdentity(): AgentIdentity {
    return {
      agentId: this.name,
    };
  }

  /**
   * Validate and normalize a public thread key for this Agent instance.
   */
  createThreadIdentity(threadKey: string): ThreadKeyIdentity {
    return createThreadKeyIdentity(this.name, threadKey);
  }

  /**
   * Initialize the Agent aggregate profile, config, credential, system Thread, and audit Event.
   */
  initializeAgent(command: InitializeAgentCommand): InitializeAgentResult {
    return initializeAgentInStore({ agentId: this.name, command, repositories: this.repositories });
  }

  /**
   * Return the Agent aggregate profile and current safe configuration snapshot.
   */
  getAgent(query: AgentScopedQuery): GetAgentResult {
    return getAgentFromStore({ agentId: this.name, query, repositories: this.repositories });
  }

  /**
   * Destroy the Agent aggregate for future mutating operations.
   */
  destroyAgent(command: DestroyAgentCommand): DestroyAgentResult {
    return destroyAgentInStore({ agentId: this.name, command, repositories: this.repositories });
  }

  /**
   * Rotate Agent credential verifier metadata without storing plaintext secrets.
   */
  rotateAgentCredential(command: RotateAgentCredentialCommand): RotateAgentCredentialResult {
    return rotateAgentCredentialInStore({
      agentId: this.name,
      command,
      repositories: this.repositories,
    });
  }

  /**
   * Update the Agent configuration and increment the Agent-local config version.
   */
  updateConfig(command: UpdateAgentConfigCommand): UpdateAgentConfigResult {
    return updateAgentConfigInStore({
      agentId: this.name,
      command,
      repositories: this.repositories,
    });
  }

  /**
   * Return the current safe Agent configuration snapshot.
   */
  getConfig(query: AgentScopedQuery): AgentConfigView {
    return getAgentConfigFromStore({ agentId: this.name, query, repositories: this.repositories });
  }

  /**
   * Publish an external Event into the Agent-owned mailbox and Event Log.
   */
  async publishEvent(command: PublishAgentEventCommand): Promise<PublishAgentEventResult> {
    const result = await publishEventInStore({
      agentId: this.name,
      blobWriter: async (blob) => {
        await this.env.AGENT_BLOBS.put(blob.key, blob.body, {
          customMetadata: { sha256: blob.sha256 },
          httpMetadata: { contentType: blob.contentType },
        });
        return {
          byteSize: blob.body.byteLength,
          contentType: blob.contentType,
          key: blob.key,
          sha256: blob.sha256,
        };
      },
      command,
      repositories: this.repositories,
      storageUsagePercent: createAgentStorageThresholdSnapshot({
        currentBytes: readDurableObjectSqlDatabaseSizeBytes(this.durableObjectStorage),
      }).currentPercent,
    });
    if (!result.replayed) {
      this.requestSchedulerWake({
        reason: 'event_accepted',
        requestedAtMs: command.context.requestedAtMs,
      });
    }
    return result;
  }

  /**
   * Return one Agent Event after Agent-local authorization.
   */
  getEvent(query: GetAgentEventQuery): AgentEventView {
    return getEventFromStore({ agentId: this.name, query, repositories: this.repositories });
  }

  /**
   * Return ordered Agent Events with scoped cursor pagination.
   */
  listEvents(query: ListAgentEventsQuery): ListAgentEventsResult {
    return listEventsFromStore({ agentId: this.name, query, repositories: this.repositories });
  }

  /**
   * Return Agent-scoped Thread summaries with cursor-scoped pagination.
   */
  listThreads(query: ListAgentThreadsQuery): ListAgentThreadsResult {
    return listThreadsFromStore({ agentId: this.name, query, repositories: this.repositories });
  }

  /**
   * Return one Agent-scoped Thread with safe latest Event and Run summaries.
   */
  getThread(query: GetAgentThreadQuery): GetAgentThreadResult {
    return getThreadFromStore({ agentId: this.name, query, repositories: this.repositories });
  }

  /**
   * Return Agent-scoped Section summaries ordered by Section ordinal.
   */
  listSections(query: ListAgentSectionsQuery): ListAgentSectionsResult {
    return listSectionsFromStore({ agentId: this.name, query, repositories: this.repositories });
  }

  /**
   * 対象 Thread の latest ready Compaction と digest 付き snapshot 参照を返します。
   */
  getLatestCompaction(
    query: GetLatestAgentThreadCompactionQuery
  ): GetLatestAgentThreadCompactionResult {
    return getLatestCompactionFromStore({
      agentId: this.name,
      query,
      repositories: this.repositories,
    });
  }

  /**
   * 対象 Thread の active ThreadMemory version と lineage 付き items を返します。
   */
  getThreadMemory(query: GetAgentThreadMemoryQuery): GetAgentThreadMemoryResult {
    return getThreadMemoryFromStore({ agentId: this.name, query, repositories: this.repositories });
  }

  /**
   * ready Compaction 由来の ThreadHistory index を filter/cursor 付きで検索します。
   */
  searchThreadHistory(query: SearchAgentThreadHistoryQuery): SearchAgentThreadHistoryResult {
    return searchThreadHistoryFromStore({
      agentId: this.name,
      query,
      repositories: this.repositories,
    });
  }

  /**
   * Return the current Agent-local state and storage threshold snapshot.
   */
  getState(query: AgentScopedQuery): GetAgentStateResult {
    return getAgentStateFromStore({
      agentId: this.name,
      query,
      repositories: this.repositories,
      storageUsageCurrentBytes: readDurableObjectSqlDatabaseSizeBytes(this.durableObjectStorage),
    });
  }

  /**
   * Return one Agent-scoped Run with immutable snapshot metadata.
   */
  getRun(query: GetAgentRunQuery): Promise<GetAgentRunResult> {
    return getRunFromStore({ agentId: this.name, query, repositories: this.repositories });
  }

  /**
   * Return Agent-scoped Runs with Thread, status, time, and cursor filters.
   */
  listRuns(query: ListAgentRunsQuery): ListAgentRunsResult {
    return listRunsFromStore({ agentId: this.name, query, repositories: this.repositories });
  }

  /**
   * Cancel or interrupt unfinished AgentRun work idempotently.
   */
  cancelRun(command: CancelAgentRunCommand): CancelAgentRunResult {
    return cancelRunInStore({ agentId: this.name, command, repositories: this.repositories });
  }

  /**
   * Agent-owned Tool catalog を AgentToolService.ListTools 用に返します。
   *
   * @param query 認証済み principal、Agent scope、installation filter、page size を含む query です。
   * @returns built-in Tool と Provider-backed Tool を統合した catalog view です。
   * @throws Agent identity の不一致、final authorization 不足、storage 読み取り失敗時に domain error を投げます。
   * @example
   * ```ts
   * const result = await agent.listTools({ context, pageSize: 50 });
   * ```
   */
  listTools(query: ListAgentToolsQuery): Promise<ListAgentToolsResult> {
    return listToolsFromStore({ agentId: this.name, query, repositories: this.repositories });
  }

  /**
   * Agent-owned ToolInvocation を一件取得します。
   *
   * @param query 認証済み principal、Agent scope、invocation ID、payload 参照表示条件を含む query です。
   * @returns ToolInvocation、approval、Provider operation の安全な view です。
   * @throws Agent identity の不一致、final authorization 不足、対象 invocation 不在時に domain error を投げます。
   * @example
   * ```ts
   * const result = agent.getToolInvocation({ context, invocationId });
   * ```
   */
  getToolInvocation(query: GetToolInvocationQuery): GetToolInvocationResult {
    return getToolInvocationFromStore({
      agentId: this.name,
      query,
      repositories: this.repositories,
    });
  }

  /**
   * Agent scope 内の ToolInvocation を filter と cursor で一覧します。
   *
   * @param query 認証済み principal、Thread/Run/status/installation filter、page 条件を含む query です。
   * @returns ToolInvocation 一覧と次 page token を含む page 情報です。
   * @throws cursor scope が要求 filter と一致しない場合、または final authorization 不足時に domain error を投げます。
   * @example
   * ```ts
   * const result = agent.listToolInvocations({ context, threadId, pageSize: 25 });
   * ```
   */
  listToolInvocations(query: ListToolInvocationsQuery): ListToolInvocationsResult {
    return listToolInvocationsFromStore({
      agentId: this.name,
      query,
      repositories: this.repositories,
    });
  }

  /**
   * AgentRun harness から ToolInvocation を作成します。
   *
   * @param command Run/Thread/Tool/input 参照と idempotency context を含む command です。
   * @returns 作成済み、または replay された ToolInvocation mutation 結果です。
   * @throws ToolDefinition が存在しない、利用不可、final authorization 不足、idempotency 不正の場合に domain error を投げます。
   * @example
   * ```ts
   * const result = await agent.createToolInvocation(command);
   * ```
   */
  createToolInvocation(
    command: CreateToolInvocationCommand
  ): Promise<ToolInvocationMutationResult> {
    return createToolInvocationInStore({
      agentId: this.name,
      command,
      repositories: this.repositories,
    });
  }

  /**
   * pending approval の ToolInvocation を承認します。
   *
   * @param command invocation ID、理由、idempotency context、承認 principal を含む command です。
   * @returns approval record と audit record を含む mutation 結果です。
   * @throws 対象が pending approval ではない、権限不足、idempotency conflict の場合に domain error を投げます。
   * @example
   * ```ts
   * const result = agent.approveToolInvocation(command);
   * ```
   */
  approveToolInvocation(command: DecideToolInvocationCommand): ToolInvocationMutationResult {
    return approveToolInvocationInStore({
      agentId: this.name,
      command,
      repositories: this.repositories,
    });
  }

  /**
   * pending approval の ToolInvocation を却下し、実行されない状態へ遷移させます。
   *
   * @param command invocation ID、理由、idempotency context、却下 principal を含む command です。
   * @returns rejection approval record と audit record を含む mutation 結果です。
   * @throws 対象が pending approval ではない、権限不足、idempotency conflict の場合に domain error を投げます。
   * @example
   * ```ts
   * const result = agent.rejectToolInvocation(command);
   * ```
   */
  rejectToolInvocation(command: DecideToolInvocationCommand): ToolInvocationMutationResult {
    return rejectToolInvocationInStore({
      agentId: this.name,
      command,
      repositories: this.repositories,
    });
  }

  /**
   * 承認済み ToolInvocation を Provider-facing IntegrationToolService へ送信します。
   *
   * @param command invocation ID、Provider 署名鍵、binary unary transport、idempotency context を含む command です。
   * @returns Provider operation、または同期完了時の result Event を含む mutation 結果です。
   * @throws 状態遷移不正、Provider 定義不備、署名/transport 失敗、final authorization 不足時に domain error を投げます。
   * @example
   * ```ts
   * const result = await agent.executeToolInvocation(command);
   * ```
   */
  async executeToolInvocation(
    command: ExecuteToolInvocationCommand
  ): Promise<ToolInvocationMutationResult> {
    const result = await executeToolInvocationWithProvider({
      agentId: this.name,
      command,
      repositories: this.repositories,
    });
    this.requestWakeAfterToolResult(result, command.context.requestedAtMs);
    return result;
  }

  /**
   * Provider から返った Tool result を同一 Thread の Event として記録します。
   *
   * @param command invocation ID、結果 status、output 参照、idempotency context を含む command です。
   * @returns ToolInvocation 更新結果と、新規 append された result Event を含む mutation 結果です。
   * @throws 重複 result、権限不足、Thread 不在、storage append 失敗時に domain error を投げます。
   * @example
   * ```ts
   * const result = agent.recordToolResult(command);
   * ```
   */
  recordToolResult(command: RecordToolResultCommand): ToolInvocationMutationResult {
    const result = recordToolResultInStore({
      agentId: this.name,
      command,
      repositories: this.repositories,
    });
    this.requestWakeAfterToolResult(result, command.context.requestedAtMs);
    return result;
  }

  /**
   * outcome_unknown の ToolInvocation を Provider operation 状態で照合します。
   *
   * @param command invocation ID、Provider 署名鍵、binary unary transport、idempotency context を含む command です。
   * @returns 照合後の Provider operation、または terminal result Event を含む mutation 結果です。
   * @throws Provider operation 不在、署名/transport 失敗、final authorization 不足時に domain error を投げます。
   * @example
   * ```ts
   * const result = await agent.reconcileToolInvocation(command);
   * ```
   */
  async reconcileToolInvocation(
    command: ReconcileToolInvocationCommand
  ): Promise<ToolInvocationMutationResult> {
    const result = await reconcileToolInvocationInStore({
      agentId: this.name,
      command,
      repositories: this.repositories,
    });
    this.requestWakeAfterToolResult(result, command.context.requestedAtMs);
    return result;
  }

  /**
   * running / outcome_unknown の ToolInvocation を取り消します。
   *
   * @param command invocation ID、任意の Provider 署名鍵/transport、理由、idempotency context を含む command です。
   * @returns 取り消し後の ToolInvocation と Provider operation 状態を含む mutation 結果です。
   * @throws 状態遷移不正、Provider cancel 失敗、final authorization 不足時に domain error を投げます。
   * @example
   * ```ts
   * const result = await agent.cancelToolInvocation(command);
   * ```
   */
  cancelToolInvocation(
    command: CancelToolInvocationCommand
  ): Promise<ToolInvocationMutationResult> {
    return cancelToolInvocationInStore({
      agentId: this.name,
      command,
      repositories: this.repositories,
    });
  }

  /**
   * 署名済み manifest を検証し、Integration Installation を Agent-owned storage に追加します。
   *
   * @param command manifest 参照、要求 grant、idempotency context を含む command です。
   * @returns Installation、Definition、Grant、TrustKey、audit を含む install 結果です。
   * @throws manifest 署名不正、schema 不一致、grant 不一致、final authorization 不足時に domain error を投げます。
   */
  installIntegration(command: InstallIntegrationCommand): Promise<InstallIntegrationResult> {
    return agentIntegrationHandlers.installIntegration(
      this.createIntegrationHandlerContext(),
      command
    );
  }

  /**
   * Integration Installation を uninstall し、関連 capability を無効化します。
   *
   * @param command Installation ID、理由、idempotency context を含む command です。
   * @returns uninstalled Installation と無効化済み Connection 一覧です。
   */
  uninstallIntegration(command: UninstallIntegrationCommand): UninstallIntegrationResult {
    return agentIntegrationHandlers.uninstallIntegration(
      this.createIntegrationHandlerContext(),
      command
    );
  }

  /**
   * Installation の安全な detail を取得します。
   *
   * @param query Installation ID と認証済み context を含む query です。
   * @returns Installation、Definition、Grant の snapshot です。
   */
  getIntegrationInstallation(
    query: GetIntegrationInstallationQuery
  ): GetIntegrationInstallationResult {
    return agentIntegrationHandlers.getInstallation(this.createIntegrationHandlerContext(), query);
  }

  /**
   * Agent scope 内の Integration Installation を一覧します。
   *
   * @param query page 条件と status filter を含む query です。
   * @returns Installation 一覧と page 情報です。
   */
  listIntegrationInstallations(
    query: ListIntegrationInstallationsQuery
  ): ListIntegrationInstallationsResult {
    return agentIntegrationHandlers.listInstallations(
      this.createIntegrationHandlerContext(),
      query
    );
  }

  /**
   * Adapter Connection を Agent-local に作成します。
   *
   * @param command Installation/Adapter ID と任意 metadata を含む command です。
   * @returns 作成済み Connection と audit を返します。
   */
  createAdapterConnection(
    command: CreateAdapterConnectionCommand
  ): AdapterConnectionMutationResult {
    return agentIntegrationHandlers.createAdapterConnection(
      this.createIntegrationHandlerContext(),
      command
    );
  }

  /**
   * Adapter Connection を無効化します。
   *
   * @param command Connection ID と理由を含む command です。
   * @returns 無効化済み Connection と audit を返します。
   */
  deleteAdapterConnection(
    command: DeleteAdapterConnectionCommand
  ): AdapterConnectionMutationResult {
    return agentIntegrationHandlers.deleteAdapterConnection(
      this.createIntegrationHandlerContext(),
      command
    );
  }

  /**
   * Agent scope 内の Adapter Connection を一覧します。
   *
   * @param query Installation、Adapter、status、page filter を含む query です。
   * @returns Connection 一覧と page 情報です。
   */
  listAdapterConnections(query: ListAdapterConnectionsQuery): ListAdapterConnectionsResult {
    return agentIntegrationHandlers.listAdapterConnections(
      this.createIntegrationHandlerContext(),
      query
    );
  }

  /**
   * 署名済み Integration ingress Event を受理し、必要に応じて DeliveryContext を作ります。
   *
   * @param command Connection、Event、signature metadata を含む Provider callback command です。
   * @returns append 済み Event、Thread、任意 DeliveryContext を返します。
   */
  async publishIntegrationEvent(
    command: PublishIntegrationEventCommand
  ): Promise<PublishIntegrationEventResult> {
    return agentIntegrationHandlers.publishEvent(this.createIntegrationHandlerContext(), command);
  }

  /**
   * 署名済み Integration Tool result callback を ToolInvocation に反映します。
   *
   * @param command invocation、結果 status、signature metadata を含む command です。
   * @returns ToolInvocation 更新結果と任意 result Event を返します。
   */
  async publishIntegrationToolResult(
    command: PublishIntegrationToolResultCommand
  ): Promise<ToolInvocationMutationResult> {
    return agentIntegrationHandlers.publishToolResult(
      this.createIntegrationHandlerContext(),
      command
    );
  }

  /**
   * 署名済み Delivery result callback を AdapterDelivery ledger に反映します。
   *
   * @param command delivery ID、status、signature metadata を含む command です。
   * @returns Delivery result view と任意 AdapterDelivery view を返します。
   */
  publishIntegrationDeliveryResult(
    command: PublishIntegrationDeliveryResultCommand
  ): Promise<PublishIntegrationDeliveryResult> {
    return agentIntegrationHandlers.publishDeliveryResult(
      this.createIntegrationHandlerContext(),
      command
    );
  }

  /**
   * DeliveryContext に bind された Provider Delivery RPC を実行します。
   *
   * @param command DeliveryContext、payload 参照、Provider client を含む command です。
   * @returns Provider 応答と AdapterDelivery ledger view です。
   */
  deliverToIntegrationProvider(
    command: DeliverToIntegrationProviderCommand
  ): Promise<DeliverToIntegrationProviderResult> {
    return agentIntegrationHandlers.deliverToProvider(
      this.createIntegrationHandlerContext(),
      command
    );
  }

  private createIntegrationHandlerContext(): AIAgentIntegrationHandlerContext {
    return {
      agentId: this.name,
      durableObjectStorage: this.durableObjectStorage,
      env: this.env,
      repositories: this.repositories,
      requestSchedulerWake: (payload) => {
        this.requestSchedulerWake(payload);
      },
      requestWakeAfterToolResult: (result, requestedAtMs) => {
        this.requestWakeAfterToolResult(result, requestedAtMs);
      },
    };
  }

  /**
   * Agent-owned Schedule を作成し、Agents SDK runtime callback に登録します。
   */
  async createAgentSchedule(
    command: CreateAgentScheduleCommand
  ): Promise<CreateAgentScheduleResult> {
    return createAndRegisterAgentSchedule({
      agentId: this.name,
      cancelRuntimeSchedule: async (runtimeScheduleId) => {
        await this.cancelSchedule(runtimeScheduleId);
      },
      command,
      registerRuntimeSchedule: (result) => this.registerRuntimeSchedule(result),
      repositories: this.repositories,
    });
  }

  /**
   * Agent-owned Schedule を一件取得します。
   */
  getAgentSchedule(query: GetAgentScheduleQuery): GetAgentScheduleResult {
    return getScheduleFromStore({ agentId: this.name, query, repositories: this.repositories });
  }

  /**
   * Agent-owned Schedule を Agent scope 内で一覧します。
   */
  listAgentSchedules(query: ListAgentSchedulesQuery): ListAgentSchedulesResult {
    return listSchedulesFromStore({ agentId: this.name, query, repositories: this.repositories });
  }

  /**
   * Agent-owned Schedule を取り消し、SDK runtime callback も停止します。
   */
  async cancelAgentSchedule(
    command: CancelAgentScheduleCommand
  ): Promise<CancelAgentScheduleResult> {
    const result = cancelScheduleInStore({
      agentId: this.name,
      command,
      repositories: this.repositories,
    });
    if (result.runtimeScheduleId !== undefined) await this.cancelSchedule(result.runtimeScheduleId);
    return result;
  }

  /**
   * Integration disabled/uninstalled 時に所有 Schedule を停止します。
   */
  async cleanupSchedulesForInstallation(
    command: CleanupInstallationSchedulesCommand
  ): Promise<CleanupInstallationSchedulesResult> {
    const result = cleanupInstallationSchedulesInStore({
      agentId: this.name,
      command,
      repositories: this.repositories,
    });
    for (const runtimeScheduleId of result.runtimeScheduleIds) {
      await this.cancelSchedule(runtimeScheduleId);
    }
    return result;
  }

  /**
   * Agents SDK から呼ばれる Schedule callback を Event append に変換します。
   */
  handleAgentScheduleCallback(payload: AgentScheduleCallbackPayload): FireAgentScheduleResult {
    const result = fireScheduleInStore({
      agentId: this.name,
      command: { fireAtMs: Date.now(), scheduleId: payload.scheduleId },
      repositories: this.repositories,
    });
    if (result.eventAppended)
      this.requestSchedulerWake({ reason: 'event_accepted', requestedAtMs: Date.now() });
    return result;
  }

  private requestWakeAfterToolResult(
    result: ToolInvocationMutationResult,
    requestedAtMs: number
  ): void {
    if (!result.replayed && result.resultEvent !== undefined) {
      this.requestSchedulerWake({ reason: 'event_accepted', requestedAtMs });
    }
  }

  private async registerRuntimeSchedule(
    result: CreateAgentScheduleResult
  ): Promise<{ readonly id: string; readonly time?: number }> {
    if (result.runtimePlan === undefined) {
      throw new TypeError('runtime schedule plan is required.');
    }
    const callbackName: keyof this = 'handleAgentScheduleCallback';
    const payload: AgentScheduleCallbackPayload = {
      agentId: this.name,
      scheduleId: result.schedule.scheduleId,
    };
    if (result.runtimePlan.kind === 'interval') {
      const schedule = await this.scheduleEvery(
        result.runtimePlan.intervalSeconds,
        callbackName,
        payload,
        {
          _idempotent: true,
        }
      );
      return { id: schedule.id, time: schedule.time };
    }
    const schedule = await this.schedule(result.runtimePlan.when, callbackName, payload, {
      idempotent: true,
    });
    return { id: schedule.id, time: schedule.time };
  }

  /**
   * Accept an event into the foundation seam without running the model harness.
   */
  acceptFoundationEvent(input: AgentFoundationEventInput): AgentFoundationEventAcceptance {
    return acceptFoundationEventInStore({
      agentId: this.name,
      input,
      repositories: this.repositories,
      requestSchedulerWake: (payload) => this.requestSchedulerWake(payload),
    });
  }

  /**
   * Record an Agent-local Queue scheduler wake intent behind the Connect facade.
   */
  requestSchedulerWake(payload: AgentLocalQueueWakePayload): AgentSchedulerWakeRecord {
    const wake = this.repositories.schedulerWakes.recordWake(payload.requestedAtMs ?? Date.now());
    if (!wake.coalesced) {
      this.enqueueSchedulerWake();
    }
    return wake;
  }

  /**
   * Agent-local Queue scheduler callback entrypoint for bounded AgentRun processing.
   */
  processPendingRuns(payload: AgentLocalQueueProcessPayload): AgentLocalQueueProcessResult {
    const result = processAgentRunSchedulerBatch({
      agentId: this.name,
      maxRuns: payload.maxRuns ?? 1,
      nowMs: Date.now(),
      repositories: this.repositories,
    });
    if (result.reenqueue && this.repositories.pendingRuns.findActiveRun() === undefined) {
      this.enqueueSchedulerWake(result.requestedMaxRuns);
    }
    return {
      agentId: result.agentId,
      pendingCount: result.pendingCount,
      processedCount: result.processedCount,
      queue: 'agent_local',
      reason: payload.reason,
      reenqueue: result.reenqueue,
      remainingPendingCount: result.remainingPendingCount,
      requestedMaxRuns: result.requestedMaxRuns,
      status: result.status,
    };
  }

  /**
   * Return foundation-only Agent health without exposing a public DO fetch route.
   */
  checkHealth(): AgentFoundationHealth {
    const profile = this.repositories.profile.getProfile();
    return {
      agentId: this.name,
      status: (profile?.lifecycleStatus ?? this.state.lifecycleStatus) as AgentLifecycleStatus,
      storage: 'sqlite',
      queue: 'agent_local',
    };
  }

  private enqueueSchedulerWake(maxRuns?: number): void {
    const payload: AgentLocalQueueProcessPayload =
      maxRuns === undefined ? { reason: 'scheduler_wake' } : { maxRuns, reason: 'scheduler_wake' };
    void this.queue('processPendingRuns', payload).catch(() => {
      this.repositories.schedulerWakes.markPending(
        Date.now(),
        this.repositories.pendingRuns.countPendingRuns()
      );
    });
  }
}
