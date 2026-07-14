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
  toBrowserSafeApproval,
  toBrowserSafeInvocationSummary,
  toBrowserSafeProviderOperation,
  toBrowserSafeToolSummary,
  type BrowserSafeInvocationDetail,
  type BrowserSafeInvocationSummary,
  type BrowserSafeToolSummary,
  type ListInvocationsOptions,
  type ListToolsOptions,
} from '../agent-operation-view-models';
import {
  buildScopedPageRequest,
  toBrowserSafePageInfo,
  type BrowserSafePagedResult,
} from '../browser-safe-helpers';

/**
 * Tool catalog query が Browser へ返す allowlisted display DTO です。
 *
 * @remarks
 * Tool summary と cursor は mapper が許可した field だけを含み、Provider target body は含めません。
 */
export type BrowserSafeToolListDisplayData = BrowserSafePagedResult<BrowserSafeToolSummary>;

/**
 * Tool invocation 一覧 query が Browser へ返す allowlisted display DTO です。
 *
 * @remarks
 * Invocation input/output は payload reference metadata に限定し、本文や SDK response を含めません。
 */
export type BrowserSafeInvocationListDisplayData =
  BrowserSafePagedResult<BrowserSafeInvocationSummary>;

/**
 * AgentToolService.ListTools を cursor pagination 付きで呼び出す。
 *
 * @param agentId - Tool catalog を読み出す Agent aggregate の ID。
 * @param options - unavailable Tool の有無、Installation scope、cursor 入力。
 * @returns Browser-safe Tool summary と page metadata。
 * @remarks Provider target body や schema body は返さず、参照 metadata だけを返す。
 */
export async function listTools(
  agentId: string,
  options: ListToolsOptions = {}
): Promise<BrowserSafeAgentRpcActionResult<BrowserSafeToolListDisplayData>> {
  return executeBrowserSafeAgentRpcQuery(
    async () => {
      // Tool catalog request は Agent/Installation/cursor scope を server-only SDK にだけ渡します。
      const { clients } = await loadAgentRpcClients(agentId);
      const response = await clients.withErrorNormalization(() =>
        clients.tools.listTools({
          agentId,
          page: buildScopedPageRequest(agentId, 'tools', options.page),
          includeUnavailable: options.includeUnavailable ?? false,
          installationId: options.installationId,
        })
      );
      return { correlationId: clients.invocation.correlationId, response };
    },
    (response) => ({
      // Provider target/schema body は破棄し、Tool summary と page metadata だけを Browser に返します。
      items: response.tools.map(toBrowserSafeToolSummary),
      page: toBrowserSafePageInfo(response.page),
    }),
    'ツール一覧を取得しました',
    'ツールの安全な一覧情報を表示しています。',
    'ツール一覧を確認してください',
    'ツール一覧を確認できませんでした。時間をおいてもう一度表示してください。'
  );
}

/**
 * AgentToolService.ListInvocations を filter と cursor pagination 付きで呼び出す。
 *
 * @param agentId - Invocation を読み出す Agent aggregate の ID。
 * @param options - Thread/Run/Installation/status filter と cursor 入力。
 * @returns Browser-safe invocation summary と page metadata。
 * @remarks input/output body は返さず、payload reference metadata だけを返す。
 */
export async function listInvocations(
  agentId: string,
  options: ListInvocationsOptions = {}
): Promise<BrowserSafeAgentRpcActionResult<BrowserSafeInvocationListDisplayData>> {
  return executeBrowserSafeAgentRpcQuery(
    async () => {
      // Invocation filter は Agent scope を越えない request として SDK に閉じます。
      const { clients } = await loadAgentRpcClients(agentId);
      const response = await clients.withErrorNormalization(() =>
        clients.tools.listInvocations({
          agentId,
          threadId: options.threadId,
          page: buildScopedPageRequest(agentId, 'tool-invocations', options.page),
          runId: options.runId,
          status: options.status,
          installationId: options.installationId,
        })
      );
      return { correlationId: clients.invocation.correlationId, response };
    },
    (response) => ({
      // raw invocation payload を捨て、明示的な invocation summary/page mapper の出力だけを返します。
      items: response.invocations.map((invocation) => toBrowserSafeInvocationSummary(invocation)),
      page: toBrowserSafePageInfo(response.page),
    }),
    'ツール呼び出し一覧を取得しました',
    'ツール呼び出しの安全な一覧情報を表示しています。',
    'ツール呼び出し一覧を確認してください',
    'ツール呼び出し一覧を確認できませんでした。時間をおいてもう一度表示してください。'
  );
}

/**
 * AgentToolService.GetInvocation を呼び、承認 drawer 用 detail を返す。
 *
 * @param agentId - Invocation を所有する Agent aggregate の ID。
 * @param invocationId - detail を取得する invocation ID。
 * @returns Browser-safe invocation detail。
 * @remarks approval と provider operation は audit/ref metadata に丸め、raw payload は返さない。
 */
export async function getInvocation(
  agentId: string,
  invocationId: string
): Promise<BrowserSafeAgentRpcActionResult<BrowserSafeInvocationDetail>> {
  return executeBrowserSafeAgentRpcQuery(
    async () => {
      // invocation detail は payload ref のみ要求し、SDK generated response は server-only に保持します。
      const { clients } = await loadAgentRpcClients(agentId);
      const response = await clients.withErrorNormalization(() =>
        clients.tools.getInvocation({ agentId, invocationId, includePayloadRefs: true })
      );
      return { correlationId: clients.invocation.correlationId, response };
    },
    (response) => ({
      // approval/provider operation は明示的な mapper を通し、raw payload/body を返しません。
      ...toBrowserSafeInvocationSummary(response.invocation, invocationId),
      approval: toBrowserSafeApproval(response.approval),
      providerOperation: toBrowserSafeProviderOperation(response.providerOperation),
    }),
    'ツール呼び出し詳細を取得しました',
    'ツール呼び出しの安全な詳細情報を表示しています。',
    'ツール呼び出し詳細を確認してください',
    'ツール呼び出し詳細を確認できませんでした。時間をおいてもう一度表示してください。'
  );
}

/**
 * AgentToolService.ApproveInvocation を explicit confirmation 後に呼び出す。
 *
 * @param agentId - Invocation を所有する Agent aggregate の ID。
 * @param invocationId - approve 対象 invocation ID。
 * @param idempotencyKey - approve command の冪等性 key。
 * @param reason - operator が入力した理由。空文字は省略する。
 * @returns Browser-safe invocation summary。
 * @remarks Tool approval context は Runs 画面の文脈 detail に移動したため、成功後は Runs と overview を再検証する。
 */
export async function approveInvocation(
  agentId: string,
  invocationId: string,
  idempotencyKey: string,
  reason: string
): Promise<BrowserSafeAgentRpcActionResult<BrowserSafeInvocationSummary>> {
  try {
    const { clients } = await loadAgentRpcClients(agentId);
    const response = await clients.withErrorNormalization(() =>
      clients.tools.approveInvocation({
        agentId,
        idempotencyKey,
        invocationId,
        reason: reason === '' ? undefined : reason,
      })
    );

    // Tool approval context は Runs 画面の文脈 detail に移動したため、/tools ではなく /runs を revalidate する。
    revalidatePath(`/agents/${agentId}/runs`);
    revalidatePath(`/agents/${agentId}`);
    return createBrowserSafeAgentRpcActionSuccess(
      toBrowserSafeInvocationSummary(response.invocation, invocationId, 'approved'),
      'ツール呼び出しを承認しました',
      'ツール呼び出しの実行を承認しました。',
      clients.invocation.correlationId
    );
  } catch (error) {
    return createBrowserSafeAgentRpcActionFailure(
      error,
      globalThis.crypto.randomUUID(),
      'ツール呼び出しを確認してください',
      'ツール呼び出しの状態は直前の確定値を保持しています。時間をおいてもう一度実行してください。'
    );
  }
}

/**
 * AgentToolService.RejectInvocation を explicit confirmation 後に呼び出す。
 *
 * @param agentId - Invocation を所有する Agent aggregate の ID。
 * @param invocationId - reject 対象 invocation ID。
 * @param idempotencyKey - reject command の冪等性 key。
 * @param reason - operator が入力した理由。空文字は省略する。
 * @returns Browser-safe invocation summary。
 * @remarks Tool approval context は Runs 画面の文脈 detail に移動したため、成功後は Runs と overview を再検証する。
 */
export async function rejectInvocation(
  agentId: string,
  invocationId: string,
  idempotencyKey: string,
  reason: string
): Promise<BrowserSafeAgentRpcActionResult<BrowserSafeInvocationSummary>> {
  try {
    const { clients } = await loadAgentRpcClients(agentId);
    const response = await clients.withErrorNormalization(() =>
      clients.tools.rejectInvocation({
        agentId,
        idempotencyKey,
        invocationId,
        reason: reason === '' ? undefined : reason,
      })
    );

    // Tool approval context は Runs 画面の文脈 detail に移動したため、/tools ではなく /runs を revalidate する。
    revalidatePath(`/agents/${agentId}/runs`);
    revalidatePath(`/agents/${agentId}`);
    return createBrowserSafeAgentRpcActionSuccess(
      toBrowserSafeInvocationSummary(response.invocation, invocationId, 'rejected'),
      'ツール呼び出しを却下しました',
      'ツール呼び出しの実行を却下しました。',
      clients.invocation.correlationId
    );
  } catch (error) {
    return createBrowserSafeAgentRpcActionFailure(
      error,
      globalThis.crypto.randomUUID(),
      'ツール呼び出しを確認してください',
      'ツール呼び出しの状態は直前の確定値を保持しています。時間をおいてもう一度実行してください。'
    );
  }
}
