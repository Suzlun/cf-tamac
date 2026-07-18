'use server';

import { revalidatePath } from 'next/cache';

import { loadAgentRpcClients } from '../../agent-rpc/agent-loader';
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
  if (!upsertResult.ok) {
    return { ...upsertResult, configVersion: undefined };
  }
  if (upsertResult.metadata === undefined) {
    return {
      ...createModelPolicyFailureResult(
        'Default model policy could not be saved. Retry after verifying the highlighted fields.'
      ),
      configVersion: undefined,
    };
  }
  if (upsertResult.metadata.status !== 'active') {
    return {
      ...createModelPolicyFailureResult(
        'Only active model policies can be attached as the Agent default.'
      ),
      configVersion: undefined,
    };
  }

  try {
    const { clients } = await loadAgentRpcClients(agentId);
    const response = await clients.withErrorNormalization(() =>
      clients.state.updateConfig({
        agentId,
        idempotencyKey: `${idempotencyKey}:config`,
        config: {
          agentId,
          modelPolicyRef: upsertResult.metadata?.policyRef,
        } as never,
      })
    );
    const updatedConfig = response.config as Record<string, unknown> | undefined;
    const configVersion =
      typeof updatedConfig?.configVersion === 'string' ? updatedConfig.configVersion : '';
    const metadata =
      toBrowserSafeModelPolicyMetadata(response.defaultModelPolicy, {
        configVersion,
        fallbackGenerationParameters: upsertResult.metadata.generationParameters,
        warnings: upsertResult.warnings,
      }) ?? upsertResult.metadata;
    revalidatePath(`/agents/${agentId}`);
    revalidatePath(`/agents/${agentId}/settings`);
    return {
      ok: true,
      metadata: { ...metadata, configVersion },
      fieldErrors: {},
      warnings: upsertResult.warnings,
      configVersion,
    };
  } catch (error) {
    return {
      ...createModelPolicyFailureResult(
        safeModelPolicyErrorMessage(error),
        {},
        [],
        safeModelPolicyErrorCategory(error)
      ),
      configVersion: undefined,
    };
  }
}
