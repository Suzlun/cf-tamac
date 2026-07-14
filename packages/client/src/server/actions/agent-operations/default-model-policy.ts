'use server';

import { revalidatePath } from 'next/cache';

import { loadAgentRpcClients } from '../../agent-rpc/agent-loader';
import {
  createBrowserSafeAgentRpcFailure,
  createBrowserSafeAgentRpcFailureForCategory,
  createBrowserSafeAgentRpcSuccess,
} from '../../agent-rpc/safe-results';
import { upsertModelPolicyForManagedAgent } from '../model-policies';
import {
  createModelPolicyFailureResult,
  safeModelPolicyErrorCategory,
  safeModelPolicyErrorMessage,
  toBrowserSafeModelPolicyMetadata,
} from '../model-policy-view-models';

import type {
  BrowserSafeModelPolicySaveResult,
  ModelPolicyDraftValues,
} from '../../../components/schemas/model-policy';

/**
 * Settings から default model policy を upsert し、成功した ref だけを Agent config へ添付します。
 *
 * @param agentId - Client registry に登録済みの Agent ID です。
 * @param idempotencyKey - policy upsert と config update を関連付ける冪等性 key です。
 * @param draft - Browser-safe default model policy draft です。
 * @returns policy metadata と config version を含む Browser-safe result です。
 * @remarks
 * 処理順序は `UpsertModelPolicy` → `UpdateConfig` です。Upsert が失敗または非 active status を
 * 返した場合、`UpdateConfig` は呼びません。Client D1 には policy body を保存せず、Agent RPC 由来の
 * safe metadata だけを Browser へ返します。
 */
export async function saveDefaultModelPolicy(
  agentId: string,
  idempotencyKey: string,
  draft: ModelPolicyDraftValues
): Promise<BrowserSafeModelPolicySaveResult> {
  const upsertResult = await upsertModelPolicyForManagedAgent(agentId, idempotencyKey, draft);
  if (upsertResult.safeStatus === 'failed') {
    return {
      ...upsertResult,
      displayData: { ...upsertResult.displayData, configVersion: undefined },
    };
  }
  const upsertDisplay = upsertResult.displayData;
  const upsertMetadata = upsertDisplay.metadata;
  if (!upsertDisplay.ok || upsertMetadata === undefined) {
    return createBrowserSafeAgentRpcFailureForCategory(
      {
        ...createModelPolicyFailureResult(
          '既定モデルポリシーを保存できませんでした。強調表示されたフィールドを確認してください。'
        ),
        configVersion: undefined,
      },
      'failed_precondition',
      upsertResult.correlationId
    );
  }
  if (upsertMetadata.status !== 'active') {
    return createBrowserSafeAgentRpcFailureForCategory(
      {
        ...createModelPolicyFailureResult('active状態のモデルポリシーだけを既定値に設定できます。'),
        configVersion: undefined,
      },
      'failed_precondition',
      upsertResult.correlationId
    );
  }

  try {
    const { clients } = await loadAgentRpcClients(agentId);
    const response = await clients.withErrorNormalization(() =>
      clients.state.updateConfig({
        agentId,
        idempotencyKey: `${idempotencyKey}:config`,
        config: {
          agentId,
          modelPolicyRef: upsertMetadata.policyRef,
        } as never,
      })
    );
    const updatedConfig = response.config as Record<string, unknown> | undefined;
    const configVersion =
      typeof updatedConfig?.configVersion === 'string' ? updatedConfig.configVersion : '';
    const metadata =
      toBrowserSafeModelPolicyMetadata(response.defaultModelPolicy, {
        configVersion,
        fallbackGenerationParameters: upsertMetadata.generationParameters,
        warnings: upsertDisplay.warnings,
      }) ?? upsertMetadata;
    revalidatePath(`/agents/${agentId}`);
    revalidatePath(`/agents/${agentId}/settings`);
    return createBrowserSafeAgentRpcSuccess(
      {
        configVersion,
        fieldErrors: {},
        message: `「${metadata.policyRef}」を保存し、設定バージョン v${configVersion} を適用しました。`,
        metadata: { ...metadata, configVersion },
        ok: true,
        title: '既定モデルポリシーを保存しました',
        warnings: upsertDisplay.warnings,
      },
      clients.invocation.correlationId
    );
  } catch (error) {
    return createBrowserSafeAgentRpcFailure(error, globalThis.crypto.randomUUID(), {
      ...createModelPolicyFailureResult(
        safeModelPolicyErrorMessage(error),
        {},
        [],
        safeModelPolicyErrorCategory(error)
      ),
      configVersion: undefined,
    });
  }
}
