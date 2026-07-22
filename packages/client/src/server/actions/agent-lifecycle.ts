'use server';

import { revalidatePath } from 'next/cache';

import { loadAgentRpcClients } from '../agent-rpc/agent-loader';
import {
  createBrowserSafeAgentRpcActionFailure,
  createBrowserSafeAgentRpcActionSuccess,
  executeBrowserSafeAgentRpcQuery,
  type BrowserSafeAgentRpcActionResult,
} from '../agent-rpc/safe-results';

import {
  toBrowserSafeAgentConfigPreview,
  toOptionalString,
  toSafeNumber,
  toSafeString,
} from './browser-safe-helpers';
import {
  buildAgentModelPolicyInput,
  toBrowserSafeModelPolicyMetadata,
} from './model-policy-view-models';

import type { BrowserSafeAgentConfigPreview } from './browser-safe-helpers';
import type {
  BrowserSafeModelPolicyMetadata,
  ModelPolicyDraftValues,
} from '../../components/schemas/model-policy';

/**
 * Browser-safe Agent credential view that excludes secret lookup material.
 *
 * The Agent RPC credential message carries secret reference and verifier
 * material fields. This interface intentionally omits those fields so
 * Server Action results cannot leak secret material to browser bundles
 * or rendered HTML.
 */
export interface BrowserSafeAgentCredential {
  readonly credentialId: string;
  readonly agentId: string;
  readonly status: string;
  readonly keyId?: string;
  readonly generation: number;
}

/**
 * Browser-safe Agent capability summary returned by Agent RPC.
 */
export interface BrowserSafeAgentCapabilitySummary {
  readonly toolCount: number;
  readonly activeInstallationCount: number;
  readonly adapterConnectionCount: number;
  readonly activeScheduleCount: number;
  readonly deliveryCapabilityCount: number;
}

/**
 * Browser-safe Agent overview returned by `getAgentOverview`.
 */
export interface BrowserSafeAgentOverview {
  readonly agentId: string;
  readonly displayName: string;
  readonly status: string;
  readonly configVersion: string;
  readonly credentialGeneration: number;
  readonly credential?: BrowserSafeAgentCredential;
  readonly capabilitySummary?: BrowserSafeAgentCapabilitySummary;
  readonly threadCount?: number;
  readonly activeRunId?: string;
  readonly pendingRunCount?: number;
  readonly scheduleCount?: number;
  readonly toolCount?: number;
  readonly installationCount?: number;
}

/**
 * Browser-safe Agent config returned by `getAgentConfig`.
 */
export interface BrowserSafeAgentConfig {
  readonly agentId: string;
  readonly configVersion: string;
  readonly config: BrowserSafeAgentConfigPreview;
  readonly defaultModelPolicy?: BrowserSafeModelPolicyMetadata;
}

/**
 * Browser-safe Agent state returned by `getAgentState`.
 */
export interface BrowserSafeAgentState {
  readonly agentId: string;
  readonly status: string;
  readonly stateVersion?: string;
  readonly currentRunId?: string;
  readonly schedulerStatus?: string;
  readonly storageStatus?: string;
  readonly configVersion?: string;
  readonly storagePercent?: number;
  readonly capabilitySummary?: BrowserSafeAgentCapabilitySummary;
}

/**
 * Browser-safe credential rotation result.
 */
export interface BrowserSafeCredentialRotationResult {
  readonly credential?: BrowserSafeAgentCredential;
  readonly previousCredential?: BrowserSafeAgentCredential;
}

/**
 * Browser-safe operation result for Agent lifecycle mutations.
 */
export interface BrowserSafeAgentOperationResult {
  readonly agentId: string;
  readonly status: string;
}

/**
 * Convert an Agent RPC credential-shaped object into a browser-safe view.
 */
function toBrowserSafeAgentCredential(
  credential: Record<string, unknown> | undefined
): BrowserSafeAgentCredential | undefined {
  if (credential === undefined) {
    return undefined;
  }
  return {
    credentialId: toSafeString(credential.credentialId),
    agentId: toSafeString(credential.agentId),
    status: toSafeString(credential.status),
    keyId: toOptionalString(credential.keyId),
    generation: toSafeNumber(credential.generation),
  };
}

/**
 * Convert an Agent RPC capability summary into a browser-safe view.
 */
function toBrowserSafeCapabilitySummary(
  summary: Record<string, unknown> | undefined
): BrowserSafeAgentCapabilitySummary | undefined {
  if (summary === undefined) {
    return undefined;
  }
  return {
    toolCount: toSafeNumber(summary.toolCount),
    activeInstallationCount: toSafeNumber(summary.activeInstallationCount),
    adapterConnectionCount: toSafeNumber(summary.adapterConnectionCount),
    activeScheduleCount: toSafeNumber(summary.activeScheduleCount),
    deliveryCapabilityCount: toSafeNumber(summary.deliveryCapabilityCount),
  };
}

/**
 * Agent RPC から overview を取得し、明示的に許可した表示 DTO を四属性 envelope で返します。
 *
 * Client D1 の管理対象レコード、署名鍵、acting user は server-only 側で解決します。
 * generated response は profile/config/credential/capability の許可済み field だけに写像し、
 * credential lookup material、raw diagnostic、SDK response 全体は Browser へ返しません。
 */
export async function getAgentOverview(
  agentId: string
): Promise<BrowserSafeAgentRpcActionResult<BrowserSafeAgentOverview>> {
  return executeBrowserSafeAgentRpcQuery(
    async () => {
      // managed Agent 解決と SDK invocation は server-only 境界に閉じ、Browser に client を渡しません。
      const { clients } = await loadAgentRpcClients(agentId);
      const response = await clients.withErrorNormalization(() =>
        clients.lifecycle.getAgent({ agentId })
      );
      return { correlationId: clients.invocation.correlationId, response };
    },
    (response) => {
      // generated response の object をそのまま返さず、overview 描画で必要な allowlisted field だけを抽出します。
      const agent = response.agent as Record<string, unknown> | undefined;
      const config = response.config as Record<string, unknown> | undefined;
      const credential = response.activeCredential as Record<string, unknown> | undefined;
      const capabilitySummary = toBrowserSafeCapabilitySummary(response.capabilitySummary);
      return {
        agentId: toSafeString(agent?.agentId, agentId),
        displayName: toSafeString(agent?.displayName),
        status: toSafeString(agent?.status),
        configVersion: toSafeString(config?.configVersion, toSafeString(agent?.configVersion)),
        credentialGeneration: toSafeNumber(agent?.credentialGeneration),
        credential: toBrowserSafeAgentCredential(credential),
        capabilitySummary,
        scheduleCount: capabilitySummary?.activeScheduleCount,
        toolCount: capabilitySummary?.toolCount,
        installationCount: capabilitySummary?.activeInstallationCount,
      };
    },
    'Agentの概要を取得しました',
    'Agentの安全な概要情報を表示しています。',
    'Agentの概要を確認してください',
    'Agentの概要を確認できませんでした。時間をおいてもう一度表示してください。'
  );
}

/**
 * Agent RPC から設定を取得し、許可済み config preview を四属性 envelope で返します。
 */
export async function getAgentConfig(
  agentId: string
): Promise<BrowserSafeAgentRpcActionResult<BrowserSafeAgentConfig>> {
  return executeBrowserSafeAgentRpcQuery(
    async () => {
      // server-only SDK が Agent config を取得し、correlation ID だけを result envelope に関連付けます。
      const { clients } = await loadAgentRpcClients(agentId);
      const response = await clients.withErrorNormalization(() =>
        clients.state.getConfig({ agentId })
      );
      return { correlationId: clients.invocation.correlationId, response };
    },
    (response) => {
      // config body や validation/payload reference を除外した preview と safe metadata だけを返します。
      const config = response.config as Record<string, unknown> | undefined;
      const configVersion = toSafeString(config?.configVersion);
      return {
        agentId,
        configVersion,
        config: toBrowserSafeAgentConfigPreview(config),
        defaultModelPolicy: toBrowserSafeModelPolicyMetadata(
          response.defaultModelPolicy ?? config?.defaultModelPolicy,
          { configVersion }
        ),
      };
    },
    'Agent設定を取得しました',
    'Agent設定の安全な表示情報を読み込みました。',
    'Agent設定を確認してください',
    'Agent設定を確認できませんでした。時間をおいてもう一度表示してください。'
  );
}

/**
 * Agent 作成 flow で initial default model policy と `modelPolicyRef` を同時に送信します。
 *
 * @param agentId - 初期化する Agent ID です。
 * @param idempotencyKey - `InitializeAgent` command 用の冪等性 key です。
 * @param displayName - Agent profile と initial config に渡す表示名です。
 * @param modelPolicy - Browser-safe default model policy draft です。
 * @returns 初期化後の Browser-safe config と default model policy metadata を返します。
 * @remarks
 * Client D1 へ registry/credential reference を保存した後、server-only Agent RPC client を読み込みます。
 * policy body は Agent Service へ initial seed として送り、Client D1 には正本として保存しません。
 */
export async function initializeAgentWithDefaultModelPolicy(
  agentId: string,
  idempotencyKey: string,
  displayName: string,
  modelPolicy: ModelPolicyDraftValues
): Promise<BrowserSafeAgentRpcActionResult<BrowserSafeAgentConfig>> {
  try {
    const { clients } = await loadAgentRpcClients(agentId);
    const initialModelPolicy = await buildAgentModelPolicyInput(modelPolicy);
    const response = await clients.withErrorNormalization(() =>
      clients.lifecycle.initializeAgent({
        agentId,
        idempotencyKey,
        displayName,
        initialConfig: {
          agentId,
          displayName,
          modelPolicyRef: modelPolicy.policyRef,
        } as never,
        initialModelPolicy: initialModelPolicy as never,
      })
    );

    const config = response.config as Record<string, unknown> | undefined;
    const configVersion = toSafeString(config?.configVersion);
    revalidatePath('/agents');
    revalidatePath(`/agents/${agentId}`);
    revalidatePath(`/agents/${agentId}/settings`);
    return createBrowserSafeAgentRpcActionSuccess(
      {
        agentId,
        configVersion,
        config: toBrowserSafeAgentConfigPreview(config),
        defaultModelPolicy: toBrowserSafeModelPolicyMetadata(response.defaultModelPolicy, {
          configVersion,
          fallbackGenerationParameters: {
            temperature: modelPolicy.temperature,
            topP: modelPolicy.topP,
            maxOutputTokens: modelPolicy.maxOutputTokens,
          },
        }),
      },
      'Agentを初期化しました',
      '初期の既定モデルポリシーを設定しました。',
      clients.invocation.correlationId
    );
  } catch (error) {
    return createBrowserSafeAgentRpcActionFailure(
      error,
      globalThis.crypto.randomUUID(),
      'Agentの初期化を確認してください',
      '登録情報を保持しました。時間をおいてもう一度登録してください。'
    );
  }
}

/**
 * Agent RPC から状態を取得し、明示的に許可した state metadata を四属性 envelope で返します。
 */
export async function getAgentState(
  agentId: string
): Promise<BrowserSafeAgentRpcActionResult<BrowserSafeAgentState>> {
  return executeBrowserSafeAgentRpcQuery(
    async () => {
      // state RPC の raw response は server-only に留め、Browser へ返す前に allowlist mapper を通します。
      const { clients } = await loadAgentRpcClients(agentId);
      const response = await clients.withErrorNormalization(() =>
        clients.state.getState({ agentId })
      );
      return { correlationId: clients.invocation.correlationId, response };
    },
    (response) => {
      // 未定義の任意 state object を返さず、overview が表示する固定 metadata だけを投影します。
      const state = response.state as Record<string, unknown> | undefined;
      const storage = response.storage as Record<string, unknown> | undefined;
      const capabilitySummary = toBrowserSafeCapabilitySummary(
        state?.capabilitySummary as Record<string, unknown> | undefined
      );
      return {
        agentId,
        status: toSafeString(state?.lifecycleStatus),
        stateVersion: toOptionalString(state?.stateVersion),
        currentRunId: toOptionalString(state?.currentRunId),
        schedulerStatus: toOptionalString(state?.schedulerStatus),
        storageStatus: toOptionalString(state?.storageStatus),
        configVersion: toOptionalString(state?.configVersion),
        storagePercent: storage === undefined ? undefined : toSafeNumber(storage.currentPercent),
        capabilitySummary,
      };
    },
    'Agent状態を取得しました',
    'Agent状態の安全な表示情報を読み込みました。',
    'Agent状態を確認してください',
    'Agent状態を確認できませんでした。時間をおいてもう一度表示してください。'
  );
}

/**
 * Update Agent config via `AgentStateService.UpdateConfig`.
 */
export async function updateAgentConfig(
  agentId: string,
  idempotencyKey: string,
  config: Record<string, unknown>
): Promise<BrowserSafeAgentRpcActionResult<BrowserSafeAgentConfig>> {
  try {
    const { clients } = await loadAgentRpcClients(agentId);
    const configPayload: Record<string, unknown> = { ...config, agentId };
    // Default model policy は専用 action が upsert 後に添付するため、汎用 JSON editor からは上書きさせない。
    delete configPayload.configVersion;
    delete configPayload.modelPolicyRef;
    delete configPayload.defaultModelPolicy;
    delete configPayload.modelPolicyValidation;
    delete configPayload.configBodyRef;
    const response = await clients.withErrorNormalization(() =>
      clients.state.updateConfig({
        agentId,
        idempotencyKey,
        config: configPayload as never,
      })
    );

    const updatedConfig = response.config as Record<string, unknown> | undefined;
    const configVersion = toSafeString(updatedConfig?.configVersion);
    revalidatePath(`/agents/${agentId}`);
    revalidatePath(`/agents/${agentId}/settings`);
    return createBrowserSafeAgentRpcActionSuccess(
      {
        agentId,
        configVersion,
        config: toBrowserSafeAgentConfigPreview(updatedConfig),
        defaultModelPolicy: toBrowserSafeModelPolicyMetadata(response.defaultModelPolicy, {
          configVersion,
        }),
      },
      'Agent設定を保存しました',
      'Agent設定の変更を適用しました。',
      clients.invocation.correlationId
    );
  } catch (error) {
    return createBrowserSafeAgentRpcActionFailure(
      error,
      globalThis.crypto.randomUUID(),
      '操作を再実行できます',
      'Agent設定は直前の確定値を保持しています。時間をおいてもう一度保存してください。'
    );
  }
}

/**
 * Rotate Agent credential via `AgentLifecycleService.RotateAgentCredential`.
 */
export async function rotateAgentCredential(
  agentId: string,
  idempotencyKey: string
): Promise<BrowserSafeAgentRpcActionResult<BrowserSafeCredentialRotationResult>> {
  try {
    const { clients } = await loadAgentRpcClients(agentId);
    const current = await clients.withErrorNormalization(() =>
      clients.lifecycle.getAgent({ agentId })
    );
    const activeCredential = current.activeCredential as Record<string, unknown> | undefined;
    const credentialId = toSafeString(activeCredential?.credentialId);

    if (credentialId === '') {
      throw new Error('No active Agent credential was returned for rotation.');
    }

    const response = await clients.withErrorNormalization(() =>
      clients.lifecycle.rotateAgentCredential({
        agentId,
        idempotencyKey,
        credentialId,
      })
    );

    const credential = response.credential as Record<string, unknown> | undefined;
    const previousCredential = response.previousCredential as Record<string, unknown> | undefined;

    revalidatePath(`/agents/${agentId}/settings`);
    revalidatePath(`/agents/${agentId}`);
    return createBrowserSafeAgentRpcActionSuccess(
      {
        credential: toBrowserSafeAgentCredential(credential),
        previousCredential: toBrowserSafeAgentCredential(previousCredential),
      },
      'credentialをローテーションしました',
      '新しいcredential世代を有効にしました。',
      clients.invocation.correlationId
    );
  } catch (error) {
    return createBrowserSafeAgentRpcActionFailure(
      error,
      globalThis.crypto.randomUUID(),
      '操作を再実行できます',
      'credentialの状態は直前の確定値を保持しています。時間をおいてもう一度実行してください。'
    );
  }
}

/**
 * Destroy Agent via `AgentLifecycleService.DestroyAgent`.
 */
export async function destroyAgent(
  agentId: string,
  idempotencyKey: string,
  reason: string
): Promise<BrowserSafeAgentRpcActionResult<BrowserSafeAgentOperationResult>> {
  try {
    const { clients } = await loadAgentRpcClients(agentId);
    await clients.withErrorNormalization(() =>
      clients.lifecycle.destroyAgent({
        agentId,
        idempotencyKey,
        reason: reason === '' ? undefined : reason,
      })
    );

    revalidatePath('/agents');
    revalidatePath(`/agents/${agentId}`);
    return createBrowserSafeAgentRpcActionSuccess(
      { agentId, status: 'destroyed' },
      'Agentを削除しました',
      '管理対象Agentを削除しました。',
      clients.invocation.correlationId
    );
  } catch (error) {
    return createBrowserSafeAgentRpcActionFailure(
      error,
      globalThis.crypto.randomUUID(),
      'Agentの削除を確認してください',
      'Agentの状態は直前の確定値を保持しています。時間をおいてもう一度実行してください。'
    );
  }
}
