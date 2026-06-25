'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { deriveActingUserContext } from '../agent-rpc/acting-user';
import { loadAgentRpcClients } from '../agent-rpc/agent-loader';
import {
  createServerAgentRpcClients,
  type ServerAgentRpcClients,
} from '../agent-rpc/create-client';
import {
  createE2eFakeAgentRpcClients,
  isE2eFakeAgentRpcEnabled,
} from '../agent-rpc/e2e-fake-clients';
import { resolveCredentialSecret } from '../credentials/secret-resolution';
import { getClientWorkerEnv } from '../env';

import {
  buildAgentModelPolicyInput,
  createModelPolicyFailureResult,
  safeModelPolicyErrorCategory,
  safeModelPolicyErrorMessage,
  toBrowserSafeModelPolicyMetadata,
  toBrowserSafeModelPolicyValidationResult,
} from './model-policy-view-models';

import type {
  BrowserSafeModelPolicyMetadata,
  BrowserSafeModelPolicyMutationResult,
  ModelPolicyDraftValues,
} from '../../components/schemas/model-policy';

/**
 * Agent 作成前の model policy validation に必要な browser-safe 入力です。
 *
 * @remarks
 * Browser は credential secret 本体を渡さず、既存 registration form と同じ lookup reference と
 * Agent RPC origin だけを渡します。Server Action は Worker secret binding から material を解決し、
 * generated Agent RPC client を server-only で作成します。
 */
export interface ModelPolicyRegistrationValidationInput {
  readonly agentId: string;
  readonly agentRpcOrigin: string;
  readonly credentialReference: string;
  readonly keyId: string;
  readonly modelPolicy: ModelPolicyDraftValues;
}

/**
 * Agent 作成前の policy draft を server-only Agent RPC で検証します。
 *
 * @param input - Agent ID、RPC origin、credential lookup reference、model policy draft を含む入力です。
 * @returns Browser-safe な validation result です。
 * @remarks
 * Client D1 に registry row を作る前に Agent Service の `ValidateModelPolicy` を呼びます。credential
 * secret は server-only に解決し、result には safe warning/error だけを含めます。
 */
export async function validateModelPolicyForRegistration(
  input: ModelPolicyRegistrationValidationInput
): Promise<BrowserSafeModelPolicyMutationResult> {
  try {
    const clients = await createRegistrationAgentRpcClients(input);
    return await validateModelPolicyWithClients(clients, input.agentId, input.modelPolicy);
  } catch (error) {
    return createFailureResultFromError(error);
  }
}

/**
 * 登録済み managed Agent の model policy draft を Agent RPC で検証します。
 *
 * @param agentId - Client registry に登録済みの Agent ID です。
 * @param draft - Browser-safe model policy draft です。
 * @returns Browser-safe な validation result です。
 */
export async function validateModelPolicyForManagedAgent(
  agentId: string,
  draft: ModelPolicyDraftValues
): Promise<BrowserSafeModelPolicyMutationResult> {
  try {
    const { clients } = await loadAgentRpcClients(agentId);
    return await validateModelPolicyWithClients(clients, agentId, draft);
  } catch (error) {
    return createFailureResultFromError(error);
  }
}

/**
 * 登録済み managed Agent の model policy を upsert します。
 *
 * @param agentId - Client registry に登録済みの Agent ID です。
 * @param idempotencyKey - Agent RPC command の冪等性 key です。
 * @param draft - Browser-safe model policy draft です。
 * @returns 保存済み policy の Browser-safe metadata と validation warning を返します。
 * @remarks
 * Upsert は Agent-owned policy repository へ server-side RPC で送信し、Client D1 には policy body を
 * 保存しません。generated response は safe metadata に正規化してから返します。
 */
export async function upsertModelPolicyForManagedAgent(
  agentId: string,
  idempotencyKey: string,
  draft: ModelPolicyDraftValues
): Promise<BrowserSafeModelPolicyMutationResult> {
  try {
    const { clients } = await loadAgentRpcClients(agentId);
    const policy = await buildAgentModelPolicyInput(draft);
    const response = await clients.withErrorNormalization(() =>
      clients.modelPolicies.upsertModelPolicy({ agentId, idempotencyKey, policy: policy as never })
    );
    const validationResult = toBrowserSafeModelPolicyValidationResult(
      response.validation,
      response.policy,
      draft
    );
    if (!validationResult.ok) {
      return validationResult;
    }
    const metadata = toBrowserSafeModelPolicyMetadata(response.policy, {
      fallbackGenerationParameters: validationResult.metadata?.generationParameters,
      warnings: validationResult.warnings,
    });
    if (metadata === undefined) {
      return createModelPolicyFailureResult(
        'Default model policy could not be saved. Retry after verifying the highlighted fields.'
      );
    }
    revalidatePath(`/agents/${agentId}`);
    revalidatePath(`/agents/${agentId}/settings`);
    return { ok: true, metadata, fieldErrors: {}, warnings: validationResult.warnings };
  } catch (error) {
    return createFailureResultFromError(error);
  }
}

/**
 * 登録済み managed Agent の model policy を archive します。
 *
 * @param agentId - Client registry に登録済みの Agent ID です。
 * @param idempotencyKey - Agent RPC command の冪等性 key です。
 * @param policyRef - archive 対象の Agent-owned policy ref です。
 * @param reason - 任意の safe reason です。空文字の場合は省略します。
 * @returns archive 後の Browser-safe metadata を返します。
 */
export async function archiveModelPolicyForManagedAgent(
  agentId: string,
  idempotencyKey: string,
  policyRef: string,
  reason: string
): Promise<BrowserSafeModelPolicyMutationResult> {
  try {
    const { clients } = await loadAgentRpcClients(agentId);
    const response = await clients.withErrorNormalization(() =>
      clients.modelPolicies.archiveModelPolicy({
        agentId,
        idempotencyKey,
        policyRef,
        reason: reason === '' ? undefined : reason,
      })
    );
    const metadata = toBrowserSafeModelPolicyMetadata(response.policy);
    revalidatePath(`/agents/${agentId}`);
    revalidatePath(`/agents/${agentId}/settings`);
    return { ok: true, metadata, fieldErrors: {}, warnings: metadata?.warnings ?? [] };
  } catch (error) {
    return createFailureResultFromError(error);
  }
}

function createFailureResultFromError(error: unknown): BrowserSafeModelPolicyMutationResult {
  return createModelPolicyFailureResult(
    safeModelPolicyErrorMessage(error),
    {},
    [],
    safeModelPolicyErrorCategory(error)
  );
}

/**
 * 登録済み managed Agent の model policy を Agent RPC から取得します。
 *
 * @param agentId - Client registry に登録済みの Agent ID です。
 * @param policyRef - 取得する Agent-owned policy ref です。
 * @returns Browser-safe metadata。取得できない場合は `undefined` を返します。
 */
export async function getModelPolicyForManagedAgent(
  agentId: string,
  policyRef: string
): Promise<BrowserSafeModelPolicyMetadata | undefined> {
  try {
    const { clients } = await loadAgentRpcClients(agentId);
    const response = await clients.withErrorNormalization(() =>
      clients.modelPolicies.getModelPolicy({ agentId, policyRef })
    );
    return toBrowserSafeModelPolicyMetadata(response.policy);
  } catch {
    return undefined;
  }
}

/**
 * Agent config が参照している default model policy を server-side Agent RPC から読みます。
 *
 * @param agentId - Client registry に登録済みの Agent ID です。
 * @returns config version と Browser-safe default policy metadata です。
 * @remarks
 * Client D1 を policy truth として読まず、`GetConfig` の default summary と必要時の
 * `GetModelPolicy` だけを使います。Browser には safe metadata のみ返します。
 */
export async function getDefaultModelPolicyForManagedAgent(agentId: string): Promise<{
  readonly configVersion: string;
  readonly metadata?: BrowserSafeModelPolicyMetadata;
}> {
  const { clients } = await loadAgentRpcClients(agentId);
  const response = await clients.withErrorNormalization(() => clients.state.getConfig({ agentId }));
  const config = response.config as Record<string, unknown> | undefined;
  const configVersion = typeof config?.configVersion === 'string' ? config.configVersion : '';
  const summary = response.defaultModelPolicy ?? config?.defaultModelPolicy;
  const metadata = toBrowserSafeModelPolicyMetadata(summary, { configVersion });
  if (metadata !== undefined || typeof config?.modelPolicyRef !== 'string') {
    return { configVersion, metadata };
  }
  const fullPolicy = await getModelPolicyForManagedAgent(agentId, config.modelPolicyRef);
  return {
    configVersion,
    metadata:
      fullPolicy === undefined
        ? undefined
        : {
            ...fullPolicy,
            configVersion,
          },
  };
}

async function validateModelPolicyWithClients(
  clients: ServerAgentRpcClients,
  agentId: string,
  draft: ModelPolicyDraftValues
): Promise<BrowserSafeModelPolicyMutationResult> {
  const policy = await buildAgentModelPolicyInput(draft);
  const response = await clients.withErrorNormalization(() =>
    clients.modelPolicies.validateModelPolicy({ agentId, policy: policy as never })
  );
  return toBrowserSafeModelPolicyValidationResult(
    response.validation,
    response.policyPreview,
    draft
  );
}

async function createRegistrationAgentRpcClients(
  input: ModelPolicyRegistrationValidationInput
): Promise<ServerAgentRpcClients> {
  if (isE2eFakeAgentRpcEnabled()) {
    // 登録前 validation は Client D1 record がまだ存在しないため、明示 E2E env のときだけ Agent ID scope の fake RPC に閉じる。
    return createE2eFakeAgentRpcClients(input.agentId, {
      agentRpcOrigin: input.agentRpcOrigin,
      displayName: input.agentId,
    });
  }

  const env = getClientWorkerEnv();
  const resolvedSecret = await resolveCredentialSecret(
    env,
    input.agentId,
    input.credentialReference
  );
  return createServerAgentRpcClients({
    agentRpcOrigin: input.agentRpcOrigin,
    credential: {
      agentId: input.agentId,
      credentialRef: input.credentialReference,
      keyId: input.keyId,
      secretMaterial: resolvedSecret.secretMaterial,
      actingUser: deriveActingUserContext(),
    },
  });
}
