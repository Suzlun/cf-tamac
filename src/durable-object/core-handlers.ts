import { readDurableObjectSqlDatabaseSizeBytes } from '../agent-foundation-state';
import {
  destroyAgentInStore,
  getAgentConfigFromStore,
  getAgentFromStore,
  initializeAgentInStore,
  rotateAgentCredentialInStore,
  updateAgentConfigInStore,
} from '../domain/lifecycle-operations';
import {
  archiveAgentModelPolicyInStore,
  getAgentModelPolicyFromStore,
  listAgentModelPoliciesFromStore,
  upsertAgentModelPolicyInStore,
  validateAgentModelPolicyInStore,
} from '../domain/model-policy-operations';
import { getAgentStateFromStore } from '../domain/state-operations';
import {
  createThreadKeyIdentity,
  getLatestCompactionFromStore,
  getThreadFromStore,
  getThreadMemoryFromStore,
  listSectionsFromStore,
  listThreadsFromStore,
  searchThreadHistoryFromStore,
  type ThreadKeyIdentity,
} from '../threads';

import type {
  AgentConfigView,
  AgentIdentity,
  AgentModelExecutionCapabilityView,
  AgentModelPolicyView,
  AgentScopedQuery,
  ArchiveAgentModelPolicyCommand,
  ArchiveAgentModelPolicyResult,
  ClientServiceJwtReplayReservationInput,
  ClientServiceJwtReplayReservationResult,
  DestroyAgentCommand,
  DestroyAgentResult,
  GetAgentModelPolicyQuery,
  GetAgentResult,
  GetAgentStateResult,
  GetAgentThreadMemoryQuery,
  GetAgentThreadMemoryResult,
  GetAgentThreadQuery,
  GetAgentThreadResult,
  GetLatestAgentThreadCompactionQuery,
  GetLatestAgentThreadCompactionResult,
  InitializeAgentCommand,
  InitializeAgentResult,
  ListAgentModelPoliciesQuery,
  ListAgentModelPoliciesResult,
  ListAgentSectionsQuery,
  ListAgentSectionsResult,
  ListAgentThreadsQuery,
  ListAgentThreadsResult,
  RotateAgentCredentialCommand,
  RotateAgentCredentialResult,
  SearchAgentThreadHistoryQuery,
  SearchAgentThreadHistoryResult,
  UpdateAgentConfigCommand,
  UpdateAgentConfigResult,
  UpsertAgentModelPolicyCommand,
  UpsertAgentModelPolicyResult,
  ValidateAgentModelPolicyQuery,
  ValidateAgentModelPolicyResult,
} from '../domain';
import type { AgentStorageRepositories } from '../storage';

/**
 * `AIAgent` の lifecycle/config/model-policy/state/thread facade が共有する実行 context です。
 *
 * @remarks
 * Durable Object class だけが知っている Agent ID、SQLite repository 集約、storage 使用量の観測点、
 * model execution capability の読み取り境界を一つにまとめます。handler は public method 名や
 * Durable Object class を増やさず、Agent-owned storage/query operation へだけ委譲します。
 *
 * @property agentId Durable Object 名から得た Agent aggregate ID です。
 * @property durableObjectStorage SQLite 使用量を読むための Durable Object storage です。
 * @property readModelExecutionCapability provider secret を含まない model execution capability を読む関数です。
 * @property repositories Agent-owned SQLite repository 集約です。
 * @example
 * ```ts
 * const context: AIAgentCoreHandlerContext = {
 *   agentId,
 *   durableObjectStorage,
 *   readModelExecutionCapability,
 *   repositories,
 * };
 * agentCoreHandlers.getAgent(context, query);
 * ```
 */
export interface AIAgentCoreHandlerContext {
  readonly agentId: string;
  readonly durableObjectStorage: DurableObjectStorage;
  readonly readModelExecutionCapability: () => AgentModelExecutionCapabilityView;
  readonly repositories: AgentStorageRepositories;
}

/**
 * `AIAgent` の安全な core/query public methods から呼び出す handler 群です。
 *
 * @remarks
 * lifecycle、config、model policy、state、thread query の委譲だけを集約します。
 * Event publish、Run 実行、Tool、Schedule、Integration の wake 副作用はこの handler へ入れず、
 * Phase 3b-1 の対象を storage/query facade に限定します。戻り値と例外は各 domain operation の
 * 契約をそのまま返すため、公開 Durable Object method の名前・引数・返却型は `AIAgent` 側で維持します。
 *
 * @example
 * ```ts
 * const result = agentCoreHandlers.initializeAgent(context, command);
 * ```
 */
export const agentCoreHandlers = {
  archiveModelPolicy,
  createThreadIdentity,
  destroyAgent,
  getAgent,
  getAgentIdentity,
  getConfig,
  getLatestCompaction,
  getModelPolicy,
  getState,
  getThread,
  getThreadMemory,
  initializeAgent,
  listModelPolicies,
  listSections,
  listThreads,
  reserveClientServiceJwtId,
  rotateAgentCredential,
  searchThreadHistory,
  updateConfig,
  upsertModelPolicy,
  validateModelPolicy,
} as const;

function getAgentIdentity(context: AIAgentCoreHandlerContext): AgentIdentity {
  // Durable Object 名をそのまま Agent ID として返し、別の公開識別子を生成しません。
  return { agentId: context.agentId };
}

function createThreadIdentity(
  context: AIAgentCoreHandlerContext,
  threadKey: string
): ThreadKeyIdentity {
  // Thread key の正規化と検証は threads layer に委譲し、Agent scope だけを DO 境界から渡します。
  return createThreadKeyIdentity(context.agentId, threadKey);
}

function reserveClientServiceJwtId(
  context: AIAgentCoreHandlerContext,
  input: ClientServiceJwtReplayReservationInput
): ClientServiceJwtReplayReservationResult {
  // Durable Object 名と JWT scope がずれた要求は replay として扱い、別 Agent への横流しを fail closed します。
  if (input.agentId !== context.agentId) {
    return { firstSeenUnixMs: input.nowUnixMs, status: 'replay' };
  }
  // 生 JWT や署名 material は保存せず、principal scope と jti だけを Agent-owned nonce ledger へ予約します。
  const reservation = context.repositories.requestNonces.reserveNonce({
    createdAtMs: input.nowUnixMs,
    expiresAtMs: input.expiresAtUnixMs,
    nonce: input.jwtId,
    principalId: input.principalReplayId,
  });
  if (reservation.status === 'replay') {
    return { firstSeenUnixMs: reservation.firstSeenAtMs, status: 'replay' };
  }
  return { status: 'reserved' };
}

function initializeAgent(
  context: AIAgentCoreHandlerContext,
  command: InitializeAgentCommand
): InitializeAgentResult {
  // 初期化時の profile/config/credential/audit 生成は lifecycle domain operation に閉じます。
  return initializeAgentInStore({
    agentId: context.agentId,
    command,
    repositories: context.repositories,
  });
}

function getAgent(context: AIAgentCoreHandlerContext, query: AgentScopedQuery): GetAgentResult {
  // Query は Agent scope を明示して domain operation に渡し、cross-Agent 読み取りを提供しません。
  return getAgentFromStore({ agentId: context.agentId, query, repositories: context.repositories });
}

function destroyAgent(
  context: AIAgentCoreHandlerContext,
  command: DestroyAgentCommand
): DestroyAgentResult {
  // Destroy は lifecycle state の遷移だけを domain operation に任せ、DO class の public surface は変えません。
  return destroyAgentInStore({
    agentId: context.agentId,
    command,
    repositories: context.repositories,
  });
}

function rotateAgentCredential(
  context: AIAgentCoreHandlerContext,
  command: RotateAgentCredentialCommand
): RotateAgentCredentialResult {
  // credential rotation は plaintext secret を受け取らず、安全な verifier metadata だけを永続化します。
  return rotateAgentCredentialInStore({
    agentId: context.agentId,
    command,
    repositories: context.repositories,
  });
}

function updateConfig(
  context: AIAgentCoreHandlerContext,
  command: UpdateAgentConfigCommand
): UpdateAgentConfigResult {
  // config versioning と model policy ref 検証は lifecycle domain operation へ集約します。
  return updateAgentConfigInStore({
    agentId: context.agentId,
    command,
    repositories: context.repositories,
  });
}

function getConfig(context: AIAgentCoreHandlerContext, query: AgentScopedQuery): AgentConfigView {
  // 返却する config は secret-free view に限定し、Agent-owned repository から読みます。
  return getAgentConfigFromStore({
    agentId: context.agentId,
    query,
    repositories: context.repositories,
  });
}

function upsertModelPolicy(
  context: AIAgentCoreHandlerContext,
  command: UpsertAgentModelPolicyCommand
): UpsertAgentModelPolicyResult {
  // policy validation、digest、audit、idempotency は model-policy domain operation に閉じます。
  return upsertAgentModelPolicyInStore({
    agentId: context.agentId,
    command,
    repositories: context.repositories,
  });
}

function getModelPolicy(
  context: AIAgentCoreHandlerContext,
  query: GetAgentModelPolicyQuery
): AgentModelPolicyView {
  // Secret を含まない model policy view だけを Agent scope 内で取得します。
  return getAgentModelPolicyFromStore({
    agentId: context.agentId,
    query,
    repositories: context.repositories,
  });
}

function listModelPolicies(
  context: AIAgentCoreHandlerContext,
  query: ListAgentModelPoliciesQuery
): ListAgentModelPoliciesResult {
  // Cursor と status filter は repository/domain 側へ渡し、Agent 横断の一覧は作りません。
  return listAgentModelPoliciesFromStore({
    agentId: context.agentId,
    query,
    repositories: context.repositories,
  });
}

function archiveModelPolicy(
  context: AIAgentCoreHandlerContext,
  command: ArchiveAgentModelPolicyCommand
): ArchiveAgentModelPolicyResult {
  // Archive は状態遷移として記録し、既存 ledger を削除せず監査可能性を維持します。
  return archiveAgentModelPolicyInStore({
    agentId: context.agentId,
    command,
    repositories: context.repositories,
  });
}

function validateModelPolicy(
  context: AIAgentCoreHandlerContext,
  query: ValidateAgentModelPolicyQuery
): ValidateAgentModelPolicyResult {
  // 検証 query は永続化副作用を持たず、保存前 preview と validation 結果だけを返します。
  return validateAgentModelPolicyInStore({
    agentId: context.agentId,
    query,
    repositories: context.repositories,
  });
}

function listThreads(
  context: AIAgentCoreHandlerContext,
  query: ListAgentThreadsQuery
): ListAgentThreadsResult {
  // Thread summary は Agent scope と cursor scope を repository/domain operation に委譲します。
  return listThreadsFromStore({
    agentId: context.agentId,
    query,
    repositories: context.repositories,
  });
}

function getThread(
  context: AIAgentCoreHandlerContext,
  query: GetAgentThreadQuery
): GetAgentThreadResult {
  // Thread detail は latest Event/Run summary を含む安全な view として取得します。
  return getThreadFromStore({
    agentId: context.agentId,
    query,
    repositories: context.repositories,
  });
}

function listSections(
  context: AIAgentCoreHandlerContext,
  query: ListAgentSectionsQuery
): ListAgentSectionsResult {
  // Section ordering と Agent scope 検証は threads operation 側に閉じます。
  return listSectionsFromStore({
    agentId: context.agentId,
    query,
    repositories: context.repositories,
  });
}

function getLatestCompaction(
  context: AIAgentCoreHandlerContext,
  query: GetLatestAgentThreadCompactionQuery
): GetLatestAgentThreadCompactionResult {
  // Compaction body ではなく digest 付き snapshot 参照を返し、payload 再露出を避けます。
  return getLatestCompactionFromStore({
    agentId: context.agentId,
    query,
    repositories: context.repositories,
  });
}

function getThreadMemory(
  context: AIAgentCoreHandlerContext,
  query: GetAgentThreadMemoryQuery
): GetAgentThreadMemoryResult {
  // Active ThreadMemory version と lineage は Agent-owned memory repository から読みます。
  return getThreadMemoryFromStore({
    agentId: context.agentId,
    query,
    repositories: context.repositories,
  });
}

function searchThreadHistory(
  context: AIAgentCoreHandlerContext,
  query: SearchAgentThreadHistoryQuery
): SearchAgentThreadHistoryResult {
  // Ready compaction 由来の index だけを検索対象にし、未確定 payload を公開しません。
  return searchThreadHistoryFromStore({
    agentId: context.agentId,
    query,
    repositories: context.repositories,
  });
}

function getState(
  context: AIAgentCoreHandlerContext,
  query: AgentScopedQuery
): GetAgentStateResult {
  // storage 使用量と model execution capability は Durable Object 境界で観測し、state view にだけ反映します。
  return getAgentStateFromStore({
    agentId: context.agentId,
    modelExecution: context.readModelExecutionCapability(),
    query,
    repositories: context.repositories,
    storageUsageCurrentBytes: readDurableObjectSqlDatabaseSizeBytes(context.durableObjectStorage),
  });
}
