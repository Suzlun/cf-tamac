'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { loadAgentRpcClients, loadRegistrationAgentRpcClients } from '../agent-rpc/agent-loader';
import { type ServerAgentRpcClients } from '../agent-rpc/create-client';
import {
  createE2eFakeAgentRpcClients,
  isE2eFakeAgentRpcEnabled,
} from '../agent-rpc/e2e-fake-clients';
import {
  createBrowserSafeAgentRpcFailure,
  createBrowserSafeAgentRpcFailureForCategory,
  createBrowserSafeAgentRpcSuccess,
  executeBrowserSafeAgentRpcQuery,
  type BrowserSafeAgentRpcActionResult,
} from '../agent-rpc/safe-results';

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
  BrowserSafeModelPolicyMutationDisplayData,
  BrowserSafeModelPolicyMutationResult,
  ModelPolicyDraftValues,
} from '../../components/schemas/model-policy';

/**
 * Agent 作成前の model policy validation に必要な browser-safe 入力です。
 *
 * @remarks
 * Browser は Provider / model provider credential の登録 metadata と Agent RPC origin だけを渡します。
 * Server Action は Agent RPC 署名 source として credential 参照を使わず、Client D1 の既定 Ed25519
 * signing key record と `CLIENT_CREDENTIAL_ENCRYPTION_KEY` を Client SDK adapter が解決します。
 */
export interface ModelPolicyRegistrationValidationInput {
  readonly agentId: string;
  readonly agentRpcOrigin: string;
  readonly credentialReference: string;
  readonly keyId: string;
  readonly modelPolicy: ModelPolicyDraftValues;
}

/**
 * 個別 model policy query が Browser へ返す allowlisted display DTO です。
 *
 * @remarks
 * `metadata` は `toBrowserSafeModelPolicyMetadata` の出力だけを保持します。policy body、Provider credential、
 * generated response、raw error は含めません。
 */
export interface BrowserSafeModelPolicyLookupDisplayData {
  readonly metadata?: BrowserSafeModelPolicyMetadata;
}

/**
 * default model policy query が Browser へ返す allowlisted display DTO です。
 *
 * @remarks
 * config version と安全化済み policy metadata だけを返します。config body と SDK diagnostic は含めません。
 */
export interface BrowserSafeDefaultModelPolicyDisplayData extends BrowserSafeModelPolicyLookupDisplayData {
  readonly configVersion: string;
}

/**
 * Agent 作成前の policy draft を server-only Agent RPC で検証します。
 *
 * @param input - Agent ID、RPC origin、Provider credential 登録 metadata、model policy draft を含む入力です。
 * @returns Browser-safe な validation result です。
 * @remarks
 * Client D1 に registry row を作る前に Agent Service の `ValidateModelPolicy` を呼びます。
 * Agent RPC bearer JWT は既定 Ed25519 signing key store から署名し、result には safe warning/error
 * だけを含めます。`credentialReference` と `keyId` は registration metadata であり署名 source ではありません。
 */
export async function validateModelPolicyForRegistration(
  input: ModelPolicyRegistrationValidationInput
): Promise<BrowserSafeModelPolicyMutationResult> {
  try {
    const clients = await createRegistrationAgentRpcClients(input);
    return attachSdkResult(
      await validateModelPolicyWithClients(clients, input.agentId, input.modelPolicy),
      clients
    );
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
    return attachSdkResult(await validateModelPolicyWithClients(clients, agentId, draft), clients);
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
    const result = await upsertModelPolicyWithClients(clients, agentId, idempotencyKey, draft);
    if (result.safeStatus === 'succeeded') {
      revalidatePath(`/agents/${agentId}`);
      revalidatePath(`/agents/${agentId}/settings`);
    }
    return result;
  } catch (error) {
    return createFailureResultFromError(error);
  }
}

/**
 * 解決済みの同一 `ServerAgentRpcClients` で model policy を upsert します。
 *
 * @param clients - 一つの correlation/acting-user/transport context を共有する server-only SDK aggregate です。
 * @param agentId - 対象 managed Agent ID です。
 * @param idempotencyKey - 親 operation key から導出した `:policy` command key です。
 * @param draft - Browser-safe policy draft です。
 * @returns policy metadata を持つ four-field safe result です。
 * @remarks
 * この helper は route revalidate を行いません。`UpdateConfig` と同じ operation の完了前に summary を成功表示しないため、
 * caller が desired config の確定後だけ revalidate します。
 *
 * @example
 * ```ts
 * const result = await upsertModelPolicyWithClients(clients, 'agent-alpha', 'save-1:policy', draft);
 * ```
 */
export async function upsertModelPolicyWithClients(
  clients: ServerAgentRpcClients,
  agentId: string,
  idempotencyKey: string,
  draft: ModelPolicyDraftValues
): Promise<BrowserSafeModelPolicyMutationResult> {
  try {
    // Browser draft を Agent-owned policy payload へ変換し、Client D1 には policy body を保存しません。
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
      return attachSdkResult(validationResult, clients);
    }
    const metadata = toBrowserSafeModelPolicyMetadata(response.policy, {
      fallbackGenerationParameters: validationResult.metadata?.generationParameters,
      warnings: validationResult.warnings,
    });
    if (metadata === undefined) {
      return attachSdkResult(
        createModelPolicyFailureResult(
          '既定モデルポリシーを保存できませんでした。入力内容を確認してください。'
        ),
        clients
      );
    }
    return attachSdkResult(
      {
        fieldErrors: {},
        message: '既定モデルポリシーを保存しました。',
        metadata,
        ok: true,
        title: '既定モデルポリシーを保存しました',
        warnings: validationResult.warnings,
      },
      clients
    );
  } catch (error) {
    return createFailureResultFromError(error, clients.invocation.correlationId);
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
    return attachSdkResult(
      {
        fieldErrors: {},
        message: 'モデルポリシーをアーカイブしました。',
        metadata,
        ok: true,
        title: 'モデルポリシーをアーカイブしました',
        warnings: metadata?.warnings ?? [],
      },
      clients
    );
  } catch (error) {
    return createFailureResultFromError(error);
  }
}

function createFailureResultFromError(
  error: unknown,
  correlationId = globalThis.crypto.randomUUID()
): BrowserSafeModelPolicyMutationResult {
  // Client D1/signing resolution failure も raw error を返さず、SDK helper の固定 status/correlation envelope へ閉じます。
  const displayData = createModelPolicyFailureResult(
    safeModelPolicyErrorMessage(error),
    {},
    [],
    safeModelPolicyErrorCategory(error)
  );
  return createBrowserSafeAgentRpcFailure(error, correlationId, displayData);
}

/**
 * 登録済み managed Agent の model policy を Agent RPC から取得します。
 *
 * @param agentId - Client registry に登録済みの Agent ID です。
 * @param policyRef - 取得する Agent-owned policy ref です。
 * @returns Browser-safe metadata を `displayData` に持つ四属性 envelope を返します。
 */
export async function getModelPolicyForManagedAgent(
  agentId: string,
  policyRef: string
): Promise<BrowserSafeAgentRpcActionResult<BrowserSafeModelPolicyLookupDisplayData>> {
  return executeBrowserSafeAgentRpcQuery(
    async () => {
      // policy response は server-only SDK で取得し、Browser へ client/response を渡しません。
      const { clients } = await loadAgentRpcClients(agentId);
      const response = await clients.withErrorNormalization(() =>
        clients.modelPolicies.getModelPolicy({ agentId, policyRef })
      );
      return { correlationId: clients.invocation.correlationId, response };
    },
    (response) => ({
      // policy body を捨て、明示的な Browser-safe metadata だけを display DTO として返します。
      metadata: toBrowserSafeModelPolicyMetadata(response.policy),
    }),
    'モデルポリシーを取得しました',
    'モデルポリシーの安全な表示情報を読み込みました。',
    'モデルポリシーを確認してください',
    'モデルポリシーを確認できませんでした。時間をおいてもう一度表示してください。'
  );
}

/**
 * Agent config が参照している default model policy を server-side Agent RPC から読みます。
 *
 * @param agentId - Client registry に登録済みの Agent ID です。
 * @returns config version と Browser-safe default policy metadata を持つ四属性 envelope です。
 * @remarks
 * Client D1 を policy truth として読まず、`GetConfig` の default summary と必要時の
 * `GetModelPolicy` だけを使います。Browser には safe metadata のみ返します。
 */
export async function getDefaultModelPolicyForManagedAgent(
  agentId: string
): Promise<BrowserSafeAgentRpcActionResult<BrowserSafeDefaultModelPolicyDisplayData>> {
  return executeBrowserSafeAgentRpcQuery(
    async () => {
      // config と必要時の policy lookup は同一の server-only SDK client から実行します。
      const { clients } = await loadAgentRpcClients(agentId);
      const response = await clients.withErrorNormalization(() =>
        clients.state.getConfig({ agentId })
      );
      return { correlationId: clients.invocation.correlationId, response: { clients, response } };
    },
    async ({ clients, response }) => {
      // GetConfig の generated object から config version と safe policy summary だけを取り出します。
      const config = response.config as Record<string, unknown> | undefined;
      const configVersion = typeof config?.configVersion === 'string' ? config.configVersion : '';
      const summary = response.defaultModelPolicy ?? config?.defaultModelPolicy;
      const metadata = toBrowserSafeModelPolicyMetadata(summary, { configVersion });
      const modelPolicyRef = config?.modelPolicyRef;
      if (metadata !== undefined || typeof modelPolicyRef !== 'string') {
        return { configVersion, metadata };
      }

      // summary が無い場合だけ full policy を取得し、同じ allowlisted metadata mapper を適用します。
      const policyResponse = await clients.withErrorNormalization(() =>
        clients.modelPolicies.getModelPolicy({ agentId, policyRef: modelPolicyRef })
      );
      const fullPolicy = toBrowserSafeModelPolicyMetadata(policyResponse.policy);
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
    },
    '既定モデルポリシーを取得しました',
    '既定モデルポリシーの安全な表示情報を読み込みました。',
    '既定モデルポリシーを確認してください',
    '既定モデルポリシーを確認できませんでした。時間をおいてもう一度表示してください。'
  );
}

async function validateModelPolicyWithClients(
  clients: ServerAgentRpcClients,
  agentId: string,
  draft: ModelPolicyDraftValues
): Promise<BrowserSafeModelPolicyMutationDisplayData> {
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

/**
 * SDK invocation の correlation/status を browser-safe な model policy display data へ追加します。
 *
 * @param result - generated RPC response を safe view model へ変換済みの model policy display data です。
 * @param clients - Client D1/signing/acting-user adapter から受け取った SDK-backed clients です。
 * @returns display data を変更せず、safe status と correlation identifier だけを追加した Browser-safe result。
 * @remarks
 * helper は Agent RPC response を再直列化せず、既存 view model mapper の display-data ownership を保ちます。
 * Browser には SDK client、origin、credential、JWT、raw error を渡さず、問い合わせに必要な correlation だけを返します。
 */
function attachSdkResult(
  result: BrowserSafeModelPolicyMutationDisplayData,
  clients: ServerAgentRpcClients
): BrowserSafeModelPolicyMutationResult {
  // Agent validation が input error を返した場合も raw response を出さず、field association と stable category だけを返します。
  if (!result.ok) {
    return createBrowserSafeAgentRpcFailureForCategory(
      result,
      result.errorCategory ?? 'invalid_argument',
      clients.invocation.correlationId
    );
  }
  // SDK aggregate が request ごとに生成した correlation を、既に safe な model policy display data へ付与します。
  return createBrowserSafeAgentRpcSuccess(result, clients.invocation.correlationId);
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

  // 登録前 validation は managed Agent record が無いため、Client adapter が既定 signing key と acting user を解決します。
  // provider credential reference は SDK signing context へ渡さず、Agent RPC JWT signing source に使いません。
  return await loadRegistrationAgentRpcClients({
    agentRpcOrigin: input.agentRpcOrigin,
    agentId: input.agentId,
  });
}
