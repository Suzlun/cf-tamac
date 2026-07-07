import { Agent, type AgentContext } from 'agents';

import { acceptFoundationEventInStore } from './AIAgent.foundation-events';
import {
  type AgentConfigView,
  type AgentEventView,
  type AgentIdentity,
  type AgentModelExecutionCapabilityView,
  type ClientServiceJwtReplayReservationInput,
  type ClientServiceJwtReplayReservationResult,
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
  type ListAgentModelPoliciesQuery,
  type ListAgentModelPoliciesResult,
  type PublishAgentEventCommand,
  type PublishAgentEventResult,
  type RotateAgentCredentialCommand,
  type RotateAgentCredentialResult,
  type UpsertAgentModelPolicyCommand,
  type UpsertAgentModelPolicyResult,
  type GetAgentModelPolicyQuery,
  type AgentModelPolicyView,
  type ArchiveAgentModelPolicyCommand,
  type ArchiveAgentModelPolicyResult,
  type ValidateAgentModelPolicyQuery,
  type ValidateAgentModelPolicyResult,
  type SearchAgentThreadHistoryQuery,
  type SearchAgentThreadHistoryResult,
  type UpdateAgentConfigCommand,
  type UpdateAgentConfigResult,
} from './domain';
import { agentCoreHandlers } from './durable-object/core-handlers';
import { agentEventRunToolHandlers as facadeHandlers } from './durable-object/event-run-tool-handlers';
import {
  createAIAgentHandlerContextFactory,
  type AIAgentHandlerContextFactory,
} from './durable-object/handler-contexts';
import {
  checkAgentFoundationHealth,
  readAgentModelExecutionCapability,
} from './durable-object/health';
import { agentIntegrationHandlers } from './durable-object/integration-handlers';
import { processAgentLocalQueuePendingRuns } from './durable-object/pending-runs';
import { registerAgentRuntimeSchedule } from './durable-object/runtime-schedule';
import { agentScheduleHandlers } from './durable-object/schedule-handlers';
import {
  enqueueAgentSchedulerWake,
  requestAgentSchedulerWake,
} from './durable-object/scheduler-wake';
import { createAgentStorageRepositories, type AgentStorageRepositories } from './storage';

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
import type {
  CancelAgentRunCommand,
  CancelAgentRunResult,
  GetAgentRunQuery,
  GetAgentRunResult,
  ListAgentRunsQuery,
  ListAgentRunsResult,
} from './runs';
import type {
  AgentScheduleCallbackPayload,
  CancelAgentScheduleCommand,
  CancelAgentScheduleResult,
  CleanupInstallationSchedulesCommand,
  CleanupInstallationSchedulesResult,
  CreateAgentScheduleCommand,
  CreateAgentScheduleResult,
  FireAgentScheduleResult,
  GetAgentScheduleQuery,
  GetAgentScheduleResult,
  ListAgentSchedulesQuery,
  ListAgentSchedulesResult,
} from './schedules';
import type { ThreadKeyIdentity } from './threads';
import type {
  CancelToolInvocationCommand,
  CreateToolInvocationCommand,
  DecideToolInvocationCommand,
  ExecuteToolInvocationCommand,
  GetToolInvocationQuery,
  GetToolInvocationResult,
  ListAgentToolsQuery,
  ListAgentToolsResult,
  ListToolInvocationsQuery,
  ListToolInvocationsResult,
  ReconcileToolInvocationCommand,
  RecordToolResultCommand,
  ToolInvocationMutationResult,
} from './tools';

/**
 * `AIAgent` は 1 Agent aggregate を所有する Cloudflare Agents SDK Durable Object です。
 *
 * @remarks
 * Agent ID ごとに独立した Agent-owned SQLite/R2 state と Protobuf RPC dispatcher から呼ばれる public method を保持します。
 * Client D1、生成物、REST surface へ責務を広げず、Agent aggregate root の境界を固定します。
 * 各 method は受け取った command/query を domain handler へ委譲し、下位層が検証・認可・永続化に失敗した場合はその例外を伝播します。
 *
 * @example
 * ```ts
 * export { AIAgent };
 * ```
 */
export class AIAgent extends Agent<AgentWorkerEnv, AIAgentState> {
  private readonly handlerContexts: AIAgentHandlerContextFactory;
  private readonly repositories: AgentStorageRepositories;
  private readonly durableObjectStorage: DurableObjectStorage;

  /**
   * Cloudflare Durable Object runtime から渡された context と Worker binding で Agent aggregate root を構築します。
   *
   * @remarks
   * この constructor は Durable Object instance ごとに Agent-owned repository、Agents SDK storage、handler context factory を結線します。
   * Client D1 や REST surface を接続せず、後続の public method が同じ Agent ID scope だけを扱うための境界を作ります。
   *
   * @param ctx Agents SDK が提供する Durable Object context です。SQLite storage、queue、schedule API の入口を含みます。
   * @param env Agent Worker の binding です。AI binding や Agent-owned blob storage など、Agent package だけが所有する依存を含みます。
   * @throws Durable Object runtime から不正な context が渡された場合や repository 初期化が失敗した場合は、下位層の例外がそのまま伝播します。
   * @example
   * ```ts
   * // 通常は Cloudflare runtime が AIAgent を生成し、RPC dispatcher が instance method を呼び出します。
   * const agent = new AIAgent(ctx, env);
   * ```
   */
  constructor(ctx: AgentContext, env: AgentWorkerEnv) {
    super(ctx, env);
    this.durableObjectStorage = ctx.storage;
    this.repositories = createAgentStorageRepositories(this.name, ctx.storage);
    this.handlerContexts = createAIAgentHandlerContextFactory({
      agentId: this.name,
      cancelRuntimeSchedule: async (runtimeScheduleId) => {
        await this.cancelSchedule(runtimeScheduleId);
      },
      durableObjectStorage: this.durableObjectStorage,
      env: this.env,
      readModelExecutionCapability: () => this.readModelExecutionCapability(),
      readNowMs: () => Date.now(),
      registerRuntimeSchedule: (result) => this.registerRuntimeSchedule(result),
      repositories: this.repositories,
      requestSchedulerWake: (payload) => {
        this.requestSchedulerWake(payload);
      },
      requestWakeAfterToolResult: (result, requestedAtMs) => {
        this.requestWakeAfterToolResult(result, requestedAtMs);
      },
    });
  }

  /**
   * 新しい Agent Durable Object instance が永続 profile を読む前に使う lifecycle state です。
   *
   * @remarks
   * Agents SDK の `initialState` を override し、未初期化の aggregate を `initializing` として安全に扱います。
   * 実際の永続状態は初期化 handler が Agent-owned SQLite に保存した profile を正とし、この値は起動直後の fallback だけに使います。
   *
   * @example
   * ```ts
   * const status = agent.initialState.lifecycleStatus;
   * ```
   */
  override initialState: AIAgentState = {
    lifecycleStatus: 'initializing',
  };

  /**
   * この Durable Object instance が所有する Agent identity を返します。
   *
   * @remarks
   * Agent ID は Durable Object name に固定され、RPC adapter が `agent_id` から解決した aggregate scope と一致します。
   * この method は identity 読み取りを core handler へ委譲し、追加の runtime side effect を発生させません。
   *
   * @returns Agent ID と aggregate root の identity 情報です。
   * @throws handler context の構築や下位 storage 読み取りで失敗した場合は、委譲先の例外が伝播します。
   * @example
   * ```ts
   * const identity = agent.getAgentIdentity();
   * ```
   */
  getAgentIdentity(): AgentIdentity {
    return agentCoreHandlers.getAgentIdentity(this.handlerContexts.core());
  }

  /**
   * public RPC request で受け取った Thread key を、この Agent scope の Thread identity に変換します。
   *
   * @remarks
   * 正規化と検証は core handler に委譲します。空文字、NFC 正規化、長さ制限、Agent scope の扱いは下位層の Thread key policy が判定します。
   *
   * @param threadKey 呼び出し元が指定した public Thread key です。
   * @returns Agent-local Thread ID と正規化済み Thread key の identity です。
   * @throws Thread key が policy に違反する場合や保存済み Thread identity の読み取りに失敗した場合は、委譲先の domain error が伝播します。
   * @example
   * ```ts
   * const thread = agent.createThreadIdentity('support-thread');
   * ```
   */
  createThreadIdentity(threadKey: string): ThreadKeyIdentity {
    return agentCoreHandlers.createThreadIdentity(this.handlerContexts.core(), threadKey);
  }

  /**
   * Client Service JWT の `jti` を Agent-owned SQLite replay ledger に予約します。
   *
   * @remarks
   * RPC facade は domain mutation に到達する前にこの method を呼び、同じ principal と同じ Agent scope で
   * 同一 `jti` が再利用された場合に fail closed します。保存値は issuer/kid/jti などの安全な識別子だけで、
   * 生 JWT、署名、公開鍵全文、秘密鍵 material は含めません。
   *
   * @param input principalReplayId、jwtId、期限、現在時刻を含む replay reservation 入力です。
   * @returns 新規予約、または replay 検出時の初回観測時刻です。
   * @throws 期限切れ、scope 不一致、SQLite 書き込み失敗などを下位 replay ledger が検出した場合は、委譲先の例外が伝播します。
   * @example
   * ```ts
   * const reservation = agent.reserveClientServiceJwtId(input);
   * ```
   */
  reserveClientServiceJwtId(
    input: ClientServiceJwtReplayReservationInput
  ): ClientServiceJwtReplayReservationResult {
    return agentCoreHandlers.reserveClientServiceJwtId(this.handlerContexts.core(), input);
  }

  /**
   * Agent aggregate の profile、config、credential verifier、system Thread、audit Event を初期化します。
   *
   * @remarks
   * 実際の認可、idempotency、profile/config/event の永続化は core handler に委譲します。
   * この Durable Object method は RPC dispatcher から受け取った command を Agent-owned storage 境界へ渡す入口です。
   *
   * @param command 初期 profile、safe config、credential verifier metadata、idempotency context を含む command です。
   * @returns 初期化済み Agent profile、config、system Thread、audit Event、replay 状態を含む結果です。
   * @throws Agent ID scope 不一致、認可不足、idempotency conflict、永続化失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const result = agent.initializeAgent(command);
   * ```
   */
  initializeAgent(command: InitializeAgentCommand): InitializeAgentResult {
    return agentCoreHandlers.initializeAgent(this.handlerContexts.core(), command);
  }

  /**
   * Agent aggregate profile と現在の安全な configuration snapshot を返します。
   *
   * @remarks
   * plaintext secret や Client-owned data は返さず、core handler が Agent-owned storage から読み取った安全な view だけを返します。
   *
   * @param query 認証済み principal と Agent scope を含む query です。
   * @returns Agent profile と safe configuration snapshot を含む読み取り結果です。
   * @throws Agent scope 不一致、読み取り権限不足、未初期化 profile、storage 読み取り失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const agentView = agent.getAgent(query);
   * ```
   */
  getAgent(query: AgentScopedQuery): GetAgentResult {
    return agentCoreHandlers.getAgent(this.handlerContexts.core(), query);
  }

  /**
   * Agent aggregate を destroyed 状態へ遷移させ、以後の mutation を拒否できるようにします。
   *
   * @remarks
   * 削除方針、audit 記録、idempotency の扱いは core handler に委譲します。
   * この method 自体は storage schema や public API contract を変更しません。
   *
   * @param command 破棄理由、認証済み context、idempotency context を含む command です。
   * @returns destroyed 状態の Agent profile、audit、replay 状態を含む結果です。
   * @throws 認可不足、既存状態との precondition 不一致、idempotency conflict、永続化失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const result = agent.destroyAgent(command);
   * ```
   */
  destroyAgent(command: DestroyAgentCommand): DestroyAgentResult {
    return agentCoreHandlers.destroyAgent(this.handlerContexts.core(), command);
  }

  /**
   * plaintext secret を保存せずに Agent credential verifier metadata を rotation します。
   *
   * @remarks
   * 新しい verifier digest、key metadata、audit、idempotency の処理は core handler に委譲します。
   * この Durable Object は secret material を受け渡し先に残さず、Agent-owned SQLite には検証用 metadata だけを保存します。
   *
   * @param command credential verifier metadata、rotation 理由、認証済み context、idempotency context を含む command です。
   * @returns rotation 後の credential view、audit、replay 状態を含む結果です。
   * @throws 認可不足、metadata validation 失敗、idempotency conflict、永続化失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const result = agent.rotateAgentCredential(command);
   * ```
   */
  rotateAgentCredential(command: RotateAgentCredentialCommand): RotateAgentCredentialResult {
    return agentCoreHandlers.rotateAgentCredential(this.handlerContexts.core(), command);
  }

  /**
   * Agent configuration を更新し、Agent-local config version を進めます。
   *
   * @remarks
   * 入力 config の検証、version precondition、audit、idempotency の判定は core handler に委譲します。
   * 戻り値は safe configuration snapshot だけで、secret material や Client-owned state は含みません。
   *
   * @param command 変更後の safe config、期待 version、認証済み context、idempotency context を含む command です。
   * @returns 更新後の config view、version、audit、replay 状態を含む結果です。
   * @throws 認可不足、validation 失敗、version conflict、idempotency conflict、永続化失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const result = agent.updateConfig(command);
   * ```
   */
  updateConfig(command: UpdateAgentConfigCommand): UpdateAgentConfigResult {
    return agentCoreHandlers.updateConfig(this.handlerContexts.core(), command);
  }

  /**
   * 現在の safe Agent configuration snapshot を返します。
   *
   * @remarks
   * core handler が Agent-owned storage から読み取った設定 view を返し、credential secret や Client D1 由来の値は含めません。
   *
   * @param query 認証済み principal と Agent scope を含む query です。
   * @returns 現在保存されている safe configuration view です。
   * @throws Agent scope 不一致、読み取り権限不足、未初期化 config、storage 読み取り失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const config = agent.getConfig(query);
   * ```
   */
  getConfig(query: AgentScopedQuery): AgentConfigView {
    return agentCoreHandlers.getConfig(this.handlerContexts.core(), query);
  }

  /**
   * Agent-owned model policy を検証して upsert します。
   *
   * @param command 認証済み context と secret-free policy 入力を含む command です。
   * @returns 保存済み policy、安全な validation、audit、replay 状態を返します。
   * @throws validation、authorization、digest precondition、永続化に失敗した場合は、委譲先 handler の AgentDomainError が伝播します。
   * @example
   * ```ts
   * const result = agent.upsertModelPolicy(command);
   * ```
   */
  upsertModelPolicy(command: UpsertAgentModelPolicyCommand): UpsertAgentModelPolicyResult {
    return agentCoreHandlers.upsertModelPolicy(this.handlerContexts.core(), command);
  }

  /**
   * Agent-owned model policy を一件取得します。
   *
   * @param query 認証済み context と policy ref を含む query です。
   * @returns secret-free な model policy view です。
   * @throws policy が存在しない、read 権限が不足する、または storage 読み取りに失敗した場合は、委譲先 handler の AgentDomainError が伝播します。
   * @example
   * ```ts
   * const policy = agent.getModelPolicy(query);
   * ```
   */
  getModelPolicy(query: GetAgentModelPolicyQuery): AgentModelPolicyView {
    return agentCoreHandlers.getModelPolicy(this.handlerContexts.core(), query);
  }

  /**
   * Agent scope 内の model policy を一覧します。
   *
   * @param query 認証済み context、status filter、page 条件を含む query です。
   * @returns Agent-scoped policy 一覧と page metadata です。
   * @throws cursor scope 不一致、read 権限不足、または storage 読み取り失敗時は、委譲先 handler の AgentDomainError が伝播します。
   * @example
   * ```ts
   * const page = agent.listModelPolicies(query);
   * ```
   */
  listModelPolicies(query: ListAgentModelPoliciesQuery): ListAgentModelPoliciesResult {
    return agentCoreHandlers.listModelPolicies(this.handlerContexts.core(), query);
  }

  /**
   * Agent-owned model policy を archived に遷移させます。
   *
   * @param command 認証済み context、policy ref、理由を含む command です。
   * @returns archived policy、audit、replay 状態を返します。
   * @throws policy 不在、authorization 不足、idempotency conflict、永続化失敗時は、委譲先 handler の AgentDomainError が伝播します。
   * @example
   * ```ts
   * const result = agent.archiveModelPolicy(command);
   * ```
   */
  archiveModelPolicy(command: ArchiveAgentModelPolicyCommand): ArchiveAgentModelPolicyResult {
    return agentCoreHandlers.archiveModelPolicy(this.handlerContexts.core(), command);
  }

  /**
   * Model policy 入力を状態変更なしで検証します。
   *
   * @param query 認証済み context と policy 入力を含む query です。
   * @returns validation 結果と保存前 preview を返します。
   * @throws read/validation 権限が不足する、または入力 policy を検証できない場合は、委譲先 handler の AgentDomainError が伝播します。
   * @example
   * ```ts
   * const validation = agent.validateModelPolicy(query);
   * ```
   */
  validateModelPolicy(query: ValidateAgentModelPolicyQuery): ValidateAgentModelPolicyResult {
    return agentCoreHandlers.validateModelPolicy(this.handlerContexts.core(), query);
  }

  /**
   * 外部から受け付けた Event を Agent-owned mailbox と Event Log に append します。
   *
   * @remarks
   * Thread key 正規化、認可、idempotency、pending Run wake 要求は Event facade handler に委譲します。
   * この method は REST/JSON surface を追加せず、RPC dispatcher から受け取った command を Agent-owned storage 境界へ渡します。
   *
   * @param command Event payload、Thread key、producer metadata、認証済み context、idempotency context を含む command です。
   * @returns append された Event、Thread identity、必要に応じて予約された Run/wake 情報を含む結果です。
   * @throws Thread key policy 違反、認可不足、idempotency conflict、storage append 失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const result = await agent.publishEvent(command);
   * ```
   */
  async publishEvent(command: PublishAgentEventCommand): Promise<PublishAgentEventResult> {
    return facadeHandlers.events.publishEvent(this.handlerContexts.sideEffect(), command);
  }

  /**
   * Agent-local authorization 後に Agent Event を一件返します。
   *
   * @remarks
   * Event の存在確認、Agent scope、visibility、payload 参照の扱いは Event facade handler に委譲します。
   *
   * @param query Event ID、認証済み context、Agent scope、payload 参照の取得条件を含む query です。
   * @returns 対象 Event の安全な view です。
   * @throws Event 不在、Agent scope 不一致、読み取り権限不足、storage 読み取り失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const event = agent.getEvent(query);
   * ```
   */
  getEvent(query: GetAgentEventQuery): AgentEventView {
    return facadeHandlers.events.getEvent(this.handlerContexts.sideEffect(), query);
  }

  /**
   * Agent scope 内の Event を順序付き cursor pagination で返します。
   *
   * @remarks
   * Thread filter、cursor scope、時刻順序、権限判定は Event facade handler に委譲します。
   *
   * @param query Thread/status/time filter、page 条件、認証済み context を含む query です。
   * @returns Event 一覧と次 page token を含む page 結果です。
   * @throws cursor scope 不一致、読み取り権限不足、storage 読み取り失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const page = agent.listEvents(query);
   * ```
   */
  listEvents(query: ListAgentEventsQuery): ListAgentEventsResult {
    return facadeHandlers.events.listEvents(this.handlerContexts.sideEffect(), query);
  }

  /**
   * Agent scope 内の Thread summary を cursor pagination で返します。
   *
   * @remarks
   * Thread 一覧の filter、cursor scope、latest Event/Run summary の整形は core handler に委譲します。
   *
   * @param query 認証済み context、Thread filter、page 条件を含む query です。
   * @returns Thread summary 一覧と page metadata を含む結果です。
   * @throws cursor scope 不一致、読み取り権限不足、storage 読み取り失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const page = agent.listThreads(query);
   * ```
   */
  listThreads(query: ListAgentThreadsQuery): ListAgentThreadsResult {
    return agentCoreHandlers.listThreads(this.handlerContexts.core(), query);
  }

  /**
   * Agent scope 内の Thread を一件取得し、安全な latest Event/Run summary を添えて返します。
   *
   * @remarks
   * Thread ID または Thread key の解決、Agent scope、権限、summary 構築は core handler に委譲します。
   *
   * @param query Thread identity、認証済み context、Agent scope を含む query です。
   * @returns Thread detail と latest Event/Run summary を含む結果です。
   * @throws Thread 不在、Agent scope 不一致、読み取り権限不足、storage 読み取り失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const thread = agent.getThread(query);
   * ```
   */
  getThread(query: GetAgentThreadQuery): GetAgentThreadResult {
    return agentCoreHandlers.getThread(this.handlerContexts.core(), query);
  }

  /**
   * Agent scope 内の Section summary を Section ordinal 順で返します。
   *
   * @remarks
   * Section は Thread history/compaction の読み取り単位として扱い、query filter と権限判定は core handler に委譲します。
   *
   * @param query Thread/Section filter、認証済み context、page 条件を含む query です。
   * @returns Section summary 一覧と page metadata を含む結果です。
   * @throws Thread/Section scope 不一致、読み取り権限不足、storage 読み取り失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const sections = agent.listSections(query);
   * ```
   */
  listSections(query: ListAgentSectionsQuery): ListAgentSectionsResult {
    return agentCoreHandlers.listSections(this.handlerContexts.core(), query);
  }

  /**
   * 対象 Thread の latest ready Compaction と digest 付き snapshot 参照を返します。
   *
   * @param query Thread identity、認証済み context、snapshot 参照の取得条件を含む query です。
   * @returns latest ready Compaction の summary、digest、snapshot 参照を含む結果です。
   * @throws Thread 不在、ready Compaction 不在、読み取り権限不足、storage 読み取り失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const compaction = agent.getLatestCompaction(query);
   * ```
   */
  getLatestCompaction(
    query: GetLatestAgentThreadCompactionQuery
  ): GetLatestAgentThreadCompactionResult {
    return agentCoreHandlers.getLatestCompaction(this.handlerContexts.core(), query);
  }

  /**
   * 対象 Thread の active ThreadMemory version と lineage 付き items を返します。
   *
   * @param query Thread identity、認証済み context、memory item filter を含む query です。
   * @returns active ThreadMemory version、lineage、item 一覧を含む結果です。
   * @throws Thread 不在、読み取り権限不足、storage 読み取り失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const memory = agent.getThreadMemory(query);
   * ```
   */
  getThreadMemory(query: GetAgentThreadMemoryQuery): GetAgentThreadMemoryResult {
    return agentCoreHandlers.getThreadMemory(this.handlerContexts.core(), query);
  }

  /**
   * ready Compaction 由来の ThreadHistory index を filter/cursor 付きで検索します。
   *
   * @param query Thread identity、検索 filter、cursor/page 条件、認証済み context を含む query です。
   * @returns ThreadHistory item 一覧と page metadata を含む検索結果です。
   * @throws cursor scope 不一致、読み取り権限不足、storage 検索失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const history = agent.searchThreadHistory(query);
   * ```
   */
  searchThreadHistory(query: SearchAgentThreadHistoryQuery): SearchAgentThreadHistoryResult {
    return agentCoreHandlers.searchThreadHistory(this.handlerContexts.core(), query);
  }

  /**
   * 現在の Agent-local state と storage threshold snapshot を返します。
   *
   * @remarks
   * Agents SDK state と Agent-owned SQLite の storage 閾値情報を core handler が安全な view に変換します。
   *
   * @param query 認証済み principal と Agent scope を含む query です。
   * @returns lifecycle state、storage threshold、runtime capability の安全な snapshot を含む結果です。
   * @throws Agent scope 不一致、読み取り権限不足、storage 読み取り失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const state = agent.getState(query);
   * ```
   */
  getState(query: AgentScopedQuery): GetAgentStateResult {
    return agentCoreHandlers.getState(this.handlerContexts.core(), query);
  }

  /**
   * Agent scope 内の Run を一件取得し、immutable snapshot metadata とともに返します。
   *
   * @remarks
   * Run の存在確認、Thread scope、payload/snapshot 参照、権限判定は Run facade handler に委譲します。
   *
   * @param query Run ID、認証済み context、Agent scope、payload/snapshot 参照条件を含む query です。
   * @returns Run detail と immutable snapshot metadata を含む結果です。
   * @throws Run 不在、Agent scope 不一致、読み取り権限不足、storage 読み取り失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const run = await agent.getRun(query);
   * ```
   */
  getRun(query: GetAgentRunQuery): Promise<GetAgentRunResult> {
    return facadeHandlers.runs.getRun(this.handlerContexts.sideEffect(), query);
  }

  /**
   * Thread、status、time、cursor filter を使って Agent scope 内の Run を一覧します。
   *
   * @remarks
   * filter の scope 整合性と page token の検証は Run facade handler に委譲します。
   *
   * @param query Thread/status/time filter、page 条件、認証済み context を含む query です。
   * @returns Run 一覧と page metadata を含む結果です。
   * @throws cursor scope 不一致、読み取り権限不足、storage 読み取り失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const runs = agent.listRuns(query);
   * ```
   */
  listRuns(query: ListAgentRunsQuery): ListAgentRunsResult {
    return facadeHandlers.runs.listRuns(this.handlerContexts.sideEffect(), query);
  }

  /**
   * 未完了の AgentRun を idempotent に cancel または interrupt します。
   *
   * @remarks
   * Run 状態遷移、pending queue 調整、audit、idempotency は Run facade handler に委譲します。
   * この method 自体は model harness を直接停止せず、Run ledger の状態更新を入口として扱います。
   *
   * @param command Run ID、cancel reason、認証済み context、idempotency context を含む command です。
   * @returns cancel 後または replay 後の Run view、audit、replay 状態を含む結果です。
   * @throws Run 不在、終了済み Run への不正遷移、認可不足、idempotency conflict、storage 更新失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const result = agent.cancelRun(command);
   * ```
   */
  cancelRun(command: CancelAgentRunCommand): CancelAgentRunResult {
    return facadeHandlers.runs.cancelRun(this.handlerContexts.sideEffect(), command);
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
    return facadeHandlers.tools.listTools(this.handlerContexts.sideEffect(), query);
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
    return facadeHandlers.tools.getToolInvocation(this.handlerContexts.sideEffect(), query);
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
    return facadeHandlers.tools.listToolInvocations(this.handlerContexts.sideEffect(), query);
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
    return facadeHandlers.tools.createToolInvocation(this.handlerContexts.sideEffect(), command);
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
    return facadeHandlers.tools.approveToolInvocation(this.handlerContexts.sideEffect(), command);
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
    return facadeHandlers.tools.rejectToolInvocation(this.handlerContexts.sideEffect(), command);
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
    return facadeHandlers.tools.executeToolInvocation(this.handlerContexts.sideEffect(), command);
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
    return facadeHandlers.tools.recordToolResult(this.handlerContexts.sideEffect(), command);
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
    return facadeHandlers.tools.reconcileToolInvocation(this.handlerContexts.sideEffect(), command);
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
    return facadeHandlers.tools.cancelToolInvocation(this.handlerContexts.sideEffect(), command);
  }

  /**
   * 署名済み manifest を検証し、Integration Installation を Agent-owned storage に追加します。
   *
   * @param command manifest 参照、要求 grant、idempotency context を含む command です。
   * @returns Installation、Definition、Grant、TrustKey、audit を含む install 結果です。
   * @throws manifest 署名不正、schema 不一致、grant 不一致、final authorization 不足、idempotency conflict、永続化失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const result = await agent.installIntegration(command);
   * ```
   */
  installIntegration(command: InstallIntegrationCommand): Promise<InstallIntegrationResult> {
    return agentIntegrationHandlers.installIntegration(this.handlerContexts.sideEffect(), command);
  }

  /**
   * Integration Installation を uninstall し、関連 capability を無効化します。
   *
   * @param command Installation ID、理由、idempotency context を含む command です。
   * @returns uninstalled Installation と無効化済み Connection 一覧です。
   * @throws Installation 不在、final authorization 不足、idempotency conflict、関連 capability の更新失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const result = agent.uninstallIntegration(command);
   * ```
   */
  uninstallIntegration(command: UninstallIntegrationCommand): UninstallIntegrationResult {
    return agentIntegrationHandlers.uninstallIntegration(
      this.handlerContexts.sideEffect(),
      command
    );
  }

  /**
   * Installation の安全な detail を取得します。
   *
   * @param query Installation ID と認証済み context を含む query です。
   * @returns Installation、Definition、Grant の snapshot です。
   * @throws Installation 不在、Agent scope 不一致、final authorization 不足、storage 読み取り失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const installation = agent.getIntegrationInstallation(query);
   * ```
   */
  getIntegrationInstallation(
    query: GetIntegrationInstallationQuery
  ): GetIntegrationInstallationResult {
    return agentIntegrationHandlers.getInstallation(this.handlerContexts.sideEffect(), query);
  }

  /**
   * Agent scope 内の Integration Installation を一覧します。
   *
   * @param query page 条件と status filter を含む query です。
   * @returns Installation 一覧と page 情報です。
   * @throws cursor scope 不一致、final authorization 不足、storage 読み取り失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const page = agent.listIntegrationInstallations(query);
   * ```
   */
  listIntegrationInstallations(
    query: ListIntegrationInstallationsQuery
  ): ListIntegrationInstallationsResult {
    return agentIntegrationHandlers.listInstallations(this.handlerContexts.sideEffect(), query);
  }

  /**
   * Adapter Connection を Agent-local に作成します。
   *
   * @param command Installation/Adapter ID と任意 metadata を含む command です。
   * @returns 作成済み Connection と audit を返します。
   * @throws Installation/Adapter 不在、final authorization 不足、idempotency conflict、metadata validation 失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const result = agent.createAdapterConnection(command);
   * ```
   */
  createAdapterConnection(
    command: CreateAdapterConnectionCommand
  ): AdapterConnectionMutationResult {
    return agentIntegrationHandlers.createAdapterConnection(
      this.handlerContexts.sideEffect(),
      command
    );
  }

  /**
   * Adapter Connection を無効化します。
   *
   * @param command Connection ID と理由を含む command です。
   * @returns 無効化済み Connection と audit を返します。
   * @throws Connection 不在、final authorization 不足、idempotency conflict、状態遷移不正を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const result = agent.deleteAdapterConnection(command);
   * ```
   */
  deleteAdapterConnection(
    command: DeleteAdapterConnectionCommand
  ): AdapterConnectionMutationResult {
    return agentIntegrationHandlers.deleteAdapterConnection(
      this.handlerContexts.sideEffect(),
      command
    );
  }

  /**
   * Agent scope 内の Adapter Connection を一覧します。
   *
   * @param query Installation、Adapter、status、page filter を含む query です。
   * @returns Connection 一覧と page 情報です。
   * @throws cursor scope 不一致、final authorization 不足、storage 読み取り失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const page = agent.listAdapterConnections(query);
   * ```
   */
  listAdapterConnections(query: ListAdapterConnectionsQuery): ListAdapterConnectionsResult {
    return agentIntegrationHandlers.listAdapterConnections(
      this.handlerContexts.sideEffect(),
      query
    );
  }

  /**
   * 署名済み Integration ingress Event を受理し、必要に応じて DeliveryContext を作ります。
   *
   * @param command Connection、Event、signature metadata を含む Provider callback command です。
   * @returns append 済み Event、Thread、任意 DeliveryContext を返します。
   * @throws callback 署名不正、Connection 不在、Thread key policy 違反、重複 Event、永続化失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const result = await agent.publishIntegrationEvent(command);
   * ```
   */
  async publishIntegrationEvent(
    command: PublishIntegrationEventCommand
  ): Promise<PublishIntegrationEventResult> {
    return agentIntegrationHandlers.publishEvent(this.handlerContexts.sideEffect(), command);
  }

  /**
   * 署名済み Integration Tool result callback を ToolInvocation に反映します。
   *
   * @param command invocation、結果 status、signature metadata を含む command です。
   * @returns ToolInvocation 更新結果と任意 result Event を返します。
   * @throws callback 署名不正、invocation 不在、状態遷移不正、重複 result、永続化失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const result = await agent.publishIntegrationToolResult(command);
   * ```
   */
  async publishIntegrationToolResult(
    command: PublishIntegrationToolResultCommand
  ): Promise<ToolInvocationMutationResult> {
    return agentIntegrationHandlers.publishToolResult(this.handlerContexts.sideEffect(), command);
  }

  /**
   * 署名済み Delivery result callback を AdapterDelivery ledger に反映します。
   *
   * @param command delivery ID、status、signature metadata を含む command です。
   * @returns Delivery result view と任意 AdapterDelivery view を返します。
   * @throws callback 署名不正、delivery 不在、状態遷移不正、重複 result、永続化失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const result = await agent.publishIntegrationDeliveryResult(command);
   * ```
   */
  publishIntegrationDeliveryResult(
    command: PublishIntegrationDeliveryResultCommand
  ): Promise<PublishIntegrationDeliveryResult> {
    return agentIntegrationHandlers.publishDeliveryResult(
      this.handlerContexts.sideEffect(),
      command
    );
  }

  /**
   * DeliveryContext に bind された Provider Delivery RPC を実行します。
   *
   * @param command DeliveryContext、payload 参照、Provider client を含む command です。
   * @returns Provider 応答と AdapterDelivery ledger view です。
   * @throws DeliveryContext 不正、Provider 署名/transport 失敗、AdapterDelivery ledger 更新失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const result = await agent.deliverToIntegrationProvider(command);
   * ```
   */
  deliverToIntegrationProvider(
    command: DeliverToIntegrationProviderCommand
  ): Promise<DeliverToIntegrationProviderResult> {
    return agentIntegrationHandlers.deliverToProvider(this.handlerContexts.sideEffect(), command);
  }

  /**
   * Agent-owned Schedule を作成し、Agents SDK runtime callback に登録します。
   *
   * @remarks
   * schedule 定義の検証、idempotency、Agent-owned SQLite への保存、Agents SDK schedule API への登録は schedule handler に委譲します。
   * この method は runtime callback の登録結果を永続 schedule view と結びつける Durable Object 内部入口です。
   *
   * @param command schedule 種別、発火条件、payload、認証済み context、idempotency context を含む command です。
   * @returns 作成済み Schedule view、runtime schedule ID、audit、replay 状態を含む結果です。
   * @throws schedule validation 失敗、認可不足、idempotency conflict、SDK schedule 登録失敗、永続化失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const result = await agent.createAgentSchedule(command);
   * ```
   */
  async createAgentSchedule(
    command: CreateAgentScheduleCommand
  ): Promise<CreateAgentScheduleResult> {
    return agentScheduleHandlers.createAgentSchedule(this.handlerContexts.schedule(), command);
  }

  /**
   * Agent-owned Schedule を一件取得します。
   *
   * @remarks
   * Schedule ID の Agent scope、visibility、関連 Integration との整合性は schedule handler に委譲します。
   *
   * @param query Schedule ID、認証済み context、Agent scope を含む query です。
   * @returns 対象 Schedule の安全な view です。
   * @throws Schedule 不在、Agent scope 不一致、読み取り権限不足、storage 読み取り失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const schedule = agent.getAgentSchedule(query);
   * ```
   */
  getAgentSchedule(query: GetAgentScheduleQuery): GetAgentScheduleResult {
    return agentScheduleHandlers.getAgentSchedule(this.handlerContexts.schedule(), query);
  }

  /**
   * Agent-owned Schedule を Agent scope 内で一覧します。
   *
   * @remarks
   * status、Installation、time range、cursor scope の判定は schedule handler に委譲します。
   *
   * @param query filter、page 条件、認証済み context、Agent scope を含む query です。
   * @returns Schedule 一覧と page metadata を含む結果です。
   * @throws cursor scope 不一致、読み取り権限不足、storage 読み取り失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const page = agent.listAgentSchedules(query);
   * ```
   */
  listAgentSchedules(query: ListAgentSchedulesQuery): ListAgentSchedulesResult {
    return agentScheduleHandlers.listAgentSchedules(this.handlerContexts.schedule(), query);
  }

  /**
   * Agent-owned Schedule を取り消し、SDK runtime callback も停止します。
   *
   * @remarks
   * cancel の状態遷移、audit、idempotency、Agents SDK runtime schedule の停止は schedule handler に委譲します。
   *
   * @param command Schedule ID、cancel reason、認証済み context、idempotency context を含む command です。
   * @returns cancel 後または replay 後の Schedule view、audit、runtime 停止結果を含む結果です。
   * @throws Schedule 不在、認可不足、idempotency conflict、SDK runtime cancel 失敗、永続化失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const result = await agent.cancelAgentSchedule(command);
   * ```
   */
  async cancelAgentSchedule(
    command: CancelAgentScheduleCommand
  ): Promise<CancelAgentScheduleResult> {
    return agentScheduleHandlers.cancelAgentSchedule(this.handlerContexts.schedule(), command);
  }

  /**
   * Integration disabled/uninstalled 時に所有 Schedule を停止します。
   *
   * @remarks
   * Integration の無効化や uninstall に伴い、その Installation が所有する active Schedule を schedule handler がまとめて停止します。
   * 呼び出し元は Integration mutation であり、この method は Schedule ledger と runtime callback の整合を保つために使います。
   *
   * @param command Installation ID、cleanup reason、認証済み context、idempotency context を含む command です。
   * @returns 停止した Schedule 一覧、audit、runtime cancel 結果を含む cleanup 結果です。
   * @throws Installation scope 不一致、認可不足、SDK runtime cancel 失敗、永続化失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const result = await agent.cleanupSchedulesForInstallation(command);
   * ```
   */
  async cleanupSchedulesForInstallation(
    command: CleanupInstallationSchedulesCommand
  ): Promise<CleanupInstallationSchedulesResult> {
    return agentScheduleHandlers.cleanupSchedulesForInstallation(
      this.handlerContexts.schedule(),
      command
    );
  }

  /**
   * Agents SDK から呼ばれる Schedule callback を Event append に変換します。
   *
   * @remarks
   * Runtime callback payload の Schedule lookup、overlap policy、Event append、次回 wake 要求は schedule handler に委譲します。
   * この method は public HTTP endpoint ではなく、Agents SDK schedule callback name から呼ばれる Durable Object method です。
   *
   * @param payload Agents SDK schedule callback から渡される Schedule ID、発火時刻、runtime metadata を含む payload です。
   * @returns 発火結果、append された Event、overlap 判定、次回処理情報を含む結果です。
   * @throws payload が保存済み Schedule と一致しない、Schedule が無効、overlap policy で拒否、storage append 失敗を委譲先 handler が検出した場合に domain error が伝播します。
   * @example
   * ```ts
   * const fired = agent.handleAgentScheduleCallback(payload);
   * ```
   */
  handleAgentScheduleCallback(payload: AgentScheduleCallbackPayload): FireAgentScheduleResult {
    return agentScheduleHandlers.handleAgentScheduleCallback(
      this.handlerContexts.schedule(),
      payload
    );
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
    // Agents SDK schedule API の副作用は Durable Object helper に閉じ、AIAgent は SDK method を注入するだけにします。
    return registerAgentRuntimeSchedule({
      agentId: this.name,
      result,
      schedule: (when, callbackName, payload, options) =>
        this.schedule(when, callbackName, payload, options),
      scheduleEvery: (intervalSeconds, callbackName, payload, options) =>
        this.scheduleEvery(intervalSeconds, callbackName, payload, options),
    });
  }

  /**
   * pending Run 処理用の Agent-local Queue wake を coalescing ledger 経由で要求します。
   *
   * @remarks
   * wake の重複抑制、ledger 更新、queue enqueue の fallback は durable-object helper に委譲します。
   * Queue は scheduler wake boundary に限定し、Run/Event の source of truth は Agent-owned SQLite に残します。
   *
   * @param payload wake 理由、要求時刻、任意の処理上限を含む Agent-local Queue payload です。
   * @returns coalescing ledger に記録された wake record です。
   * @throws wake payload 不正、ledger 更新失敗、queue enqueue helper が扱えない失敗を検出した場合は、委譲先 helper の例外が伝播します。
   * @example
   * ```ts
   * const wake = agent.requestSchedulerWake({ reason: 'event_accepted', requestedAtMs: Date.now() });
   * ```
   */
  requestSchedulerWake(payload: AgentLocalQueueWakePayload): AgentSchedulerWakeRecord {
    return requestAgentSchedulerWake({
      enqueueSchedulerWake: () => {
        this.enqueueSchedulerWake();
      },
      payload,
      repositories: this.repositories,
    });
  }

  /**
   * Agent-local Queue callback から pending Run を bounded batch として処理します。
   *
   * @remarks
   * pending Run の取得、model harness 実行、Run/Event ledger 更新、継続 wake の判定は durable-object helper に委譲します。
   * この method は Cloudflare Queues product binding ではなく、Agents SDK queue callback と Agent-owned SQLite の境界です。
   *
   * @param payload queue callback が渡す処理上限、wake record、要求時刻を含む payload です。
   * @returns 処理件数、成功/失敗、次回 wake 要否を含む batch 処理結果です。
   * @throws payload 不正、pending Run 読み取り失敗、model execution 失敗、Run/Event 更新失敗を委譲先 helper が検出した場合に例外が伝播します。
   * @example
   * ```ts
   * const processed = await agent.processPendingRuns(payload);
   * ```
   */
  async processPendingRuns(
    payload: AgentLocalQueueProcessPayload
  ): Promise<AgentLocalQueueProcessResult> {
    return processAgentLocalQueuePendingRuns({
      agentId: this.name,
      ai: this.env.AI,
      enqueueSchedulerWake: (maxRuns) => {
        this.enqueueSchedulerWake(maxRuns);
      },
      payload,
      repositories: this.repositories,
    });
  }

  /**
   * Agent foundation の安全な health view を返します。
   *
   * @remarks
   * profile が未初期化の間は Agents SDK state を fallback とし、AI binding の有無と storage 種別を安全な view に変換します。
   * secret、raw credential、Client-owned state は返しません。
   *
   * @returns Agent ID、lifecycle status、model execution capability、queue/storage 種別を含む health view です。
   * @throws Agent-owned storage の profile 読み取りで下位 repository が失敗した場合は、その例外が伝播します。
   * @example
   * ```ts
   * const health = agent.checkHealth();
   * ```
   */
  checkHealth(): AgentFoundationHealth {
    return checkAgentFoundationHealth({
      agentId: this.name,
      bindingPresent: this.env.AI !== undefined,
      repositories: this.repositories,
      state: this.state,
    });
  }

  /**
   * provider secret を露出せず model execution capability を読み取ります。
   */
  private readModelExecutionCapability(): AgentModelExecutionCapabilityView {
    return readAgentModelExecutionCapability({
      bindingPresent: this.env.AI !== undefined,
      repositories: this.repositories,
    });
  }

  private enqueueSchedulerWake(maxRuns?: number): void {
    // Queue 失敗時の fallback と payload 構築は helper に寄せ、ここでは Agents SDK queue method だけを注入します。
    enqueueAgentSchedulerWake({
      maxRuns,
      queue: (methodName, queuedPayload) => this.queue(methodName, queuedPayload),
      repositories: this.repositories,
    });
  }

  /**
   * model harness を実行せず foundation seam へ Event を受理します。
   *
   * @remarks
   * Agent-local Queue wake や Event append の挙動を foundation tests から検証するための seam です。
   * 実際の model harness 実行は行わず、Agent-owned storage への Event acceptance と wake request だけを helper に委譲します。
   *
   * @param input 受理する Event、Thread identity、要求時刻、foundation 検証用 metadata を含む入力です。
   * @returns Event acceptance、Thread、wake request の結果を含む foundation seam の戻り値です。
   * @throws Event input 不正、Thread scope 不一致、storage append 失敗、wake ledger 更新失敗を委譲先 helper が検出した場合に例外が伝播します。
   * @example
   * ```ts
   * const accepted = agent.acceptFoundationEvent(input);
   * ```
   */
  acceptFoundationEvent(input: AgentFoundationEventInput): AgentFoundationEventAcceptance {
    return acceptFoundationEventInStore({
      agentId: this.name,
      input,
      repositories: this.repositories,
      requestSchedulerWake: (payload) => this.requestSchedulerWake(payload),
    });
  }
}
