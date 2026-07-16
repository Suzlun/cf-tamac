'use server';

import { revalidatePath } from 'next/cache';

import { loadAgentRpcClients } from '../../agent-rpc/agent-loader';
import {
  browserSafeErrorTitle,
  createBrowserSafeAgentRpcFailure,
  createBrowserSafeAgentRpcFailureForCategory,
  createBrowserSafeAgentRpcSuccess,
  type BrowserSafeAgentRpcErrorCategory,
} from '../../agent-rpc/safe-results';
import { upsertModelPolicyWithClients } from '../model-policies';
import {
  createModelPolicyFailureResult,
  toBrowserSafeModelPolicyMetadata,
} from '../model-policy-view-models';

import type {
  BrowserSafeModelPolicyMetadata,
  BrowserSafeModelPolicySaveResult,
  ModelPolicyDraftValues,
} from '../../../components/schemas/model-policy';
import type { ServerAgentRpcClients } from '../../agent-rpc/create-client';

/**
 * Settings の default model policy を同一 SDK invocation context で保存し、必要時は read-side reconciliation を実行します。
 *
 * @param agentId - Client registry に登録済みの Agent ID です。
 * @param idempotencyKey - UI operation ごとに一度生成する親 key です。policy/config は `:policy` / `:config` を導出します。
 * @param draft - Browser-safe default model policy draft です。
 * @returns policy metadata、safe config version、または唯一の状態確認 action を持つ Browser-safe result です。
 * @throws 例外を Browser へ送出せず、すべて四属性 safe result へ正規化します。
 *
 * @remarks
 * `UpsertModelPolicy`、`UpdateConfig`、不確定時の`GetConfig`は同じ `ServerAgentRpcClients` と correlation context を共有します。
 * UpdateConfig response が未確定なら、desired ref、直前の confirmed ref、unknown を区別し、policy body や raw diagnostic は返しません。
 *
 * @example
 * ```ts
 * const result = await saveDefaultModelPolicy('agent-alpha', 'save-42', draft);
 * ```
 */
export async function saveDefaultModelPolicy(
  agentId: string,
  idempotencyKey: string,
  draft: ModelPolicyDraftValues
): Promise<BrowserSafeModelPolicySaveResult> {
  try {
    const { clients } = await loadAgentRpcClients(agentId);
    // policy mutation 前に confirmed previous ref を読む。後続 response が不確定なとき、Agent-owned state を安全に識別する基準にする。
    const previous = await readCurrentConfig(clients, agentId);
    const upsertResult = await upsertModelPolicyWithClients(
      clients,
      agentId,
      `${idempotencyKey}:policy`,
      draft
    );
    if (upsertResult.safeStatus === 'failed') {
      return {
        ...upsertResult,
        displayData: { ...upsertResult.displayData, configVersion: undefined },
      };
    }
    const metadata = upsertResult.displayData.metadata;
    if (!upsertResult.displayData.ok || metadata?.status !== 'active') {
      return createBrowserSafeAgentRpcFailureForCategory(
        {
          ...createModelPolicyFailureResult(
            'active状態のモデルポリシーだけを既定値に設定できます。',
            {},
            upsertResult.displayData.warnings,
            'failed_precondition'
          ),
          configVersion: undefined,
        },
        'failed_precondition',
        clients.invocation.correlationId
      );
    }

    try {
      const response = await clients.withErrorNormalization(() =>
        clients.state.updateConfig({
          agentId,
          idempotencyKey: `${idempotencyKey}:config`,
          config: { agentId, modelPolicyRef: metadata.policyRef } as never,
        })
      );
      const confirmed = toConfirmedConfig(response);
      if (confirmed.configVersion === undefined) {
        return invalidConfigVersionResult(clients, upsertResult.displayData.warnings);
      }
      const responseMetadata = toBrowserSafeModelPolicyMetadata(response.defaultModelPolicy, {
        configVersion: confirmed.configVersion,
        fallbackGenerationParameters: metadata.generationParameters,
        warnings: upsertResult.displayData.warnings,
      }) ?? { ...metadata, configVersion: confirmed.configVersion };
      return successfulSaveResult(
        agentId,
        responseMetadata,
        confirmed.configVersion,
        upsertResult.displayData.warnings,
        clients.invocation.correlationId
      );
    } catch (error) {
      // UpdateConfig の transport failure は mutation 未実行と断定できないため、同じ clients/correlation で GetConfig を照合する。
      return await reconcileUpdateConfig(
        clients,
        agentId,
        metadata,
        previous.modelPolicyRef,
        upsertResult.displayData.warnings,
        error
      );
    }
  } catch (error) {
    const failure = createBrowserSafeAgentRpcFailure(
      error,
      globalThis.crypto.randomUUID(),
      undefined
    );
    return createBrowserSafeAgentRpcFailureForCategory(
      {
        ...createModelPolicyFailureResult(
          '既定モデルポリシーを保存できませんでした。時間をおいてもう一度実行してください。',
          {},
          [],
          toModelPolicyErrorCategory(failure.safeErrorCategory)
        ),
        configVersion: undefined,
      },
      failure.safeErrorCategory,
      failure.correlationId
    );
  }
}

/**
 * 不確定な default model policy 保存の適用状態を、同じ parent operation key で読み取り照合します。
 *
 * @param agentId - 状態確認する managed Agent ID です。
 * @param operationKey - UI が保持する元の save parent key です。新しい command key を生成しないことを検査します。
 * @param draft - UI が保持する policy draft。desired policy ref の照合だけに使います。
 * @returns desired ref が確認できた success、または確認 action を継続する four-field safe result です。
 * @throws 例外は raw diagnostic を含めない safe result へ変換します。
 *
 * @remarks
 * この action は UpsertModelPolicy/UpdateConfig を送信しません。Agent-owned config を GetConfig で読むだけなので、
 * UI は同じ idempotency context の「適用状態を確認」だけを有効化できます。
 */
export async function reconcileDefaultModelPolicy(
  agentId: string,
  operationKey: string,
  draft: ModelPolicyDraftValues
): Promise<BrowserSafeModelPolicySaveResult> {
  if (operationKey.trim().length === 0) {
    return createBrowserSafeAgentRpcFailureForCategory(
      {
        ...createModelPolicyFailureResult(
          '保存操作を確認できませんでした。入力内容を確認してもう一度保存してください。',
          {},
          [],
          'invalid_argument'
        ),
        configVersion: undefined,
      },
      'invalid_argument',
      globalThis.crypto.randomUUID()
    );
  }
  try {
    const { clients } = await loadAgentRpcClients(agentId);
    const response = await clients.withErrorNormalization(() =>
      clients.state.getConfig({ agentId })
    );
    const confirmed = toConfirmedConfig(response);
    if (confirmed.modelPolicyRef !== draft.policyRef) {
      return reconciliationRequiredResult('unavailable', clients.invocation.correlationId, []);
    }
    if (confirmed.configVersion === undefined) {
      return invalidConfigVersionResult(clients, []);
    }
    const metadata = toBrowserSafeModelPolicyMetadata(response.defaultModelPolicy, {
      configVersion: confirmed.configVersion,
      warnings: [],
    });
    // current config が desired ref を示した後だけ、UI に success heading と summary update を許可します。
    revalidatePath(`/agents/${agentId}`);
    revalidatePath(`/agents/${agentId}/settings`);
    return createBrowserSafeAgentRpcSuccess(
      {
        configVersion: confirmed.configVersion,
        fieldErrors: {},
        message: `「${draft.policyRef}」の適用を確認し、設定バージョン v${confirmed.configVersion} を読み込みました。`,
        metadata,
        ok: true,
        title: '既定モデルポリシーの適用を確認しました',
        warnings: [],
      },
      clients.invocation.correlationId
    );
  } catch (error) {
    const failure = createBrowserSafeAgentRpcFailure(
      error,
      globalThis.crypto.randomUUID(),
      undefined
    );
    return reconciliationRequiredResult(failure.safeErrorCategory, failure.correlationId, []);
  }
}

interface ConfirmedConfig {
  readonly configVersion?: string;
  readonly modelPolicyRef?: string;
}

async function reconcileUpdateConfig(
  clients: ServerAgentRpcClients,
  agentId: string,
  desired: BrowserSafeModelPolicyMetadata,
  previousRef: string | undefined,
  warnings: BrowserSafeModelPolicySaveResult['displayData']['warnings'],
  updateError: unknown
): Promise<BrowserSafeModelPolicySaveResult> {
  const updateFailure = createBrowserSafeAgentRpcFailure(
    updateError,
    clients.invocation.correlationId,
    undefined
  );
  try {
    const response = await clients.withErrorNormalization(() =>
      clients.state.getConfig({ agentId })
    );
    const confirmed = toConfirmedConfig(response);
    if (confirmed.modelPolicyRef === desired.policyRef) {
      if (confirmed.configVersion === undefined) {
        return invalidConfigVersionResult(clients, warnings);
      }
      // desired ref が Agent-owned config に確認できた場合は response loss 後でも成功として summary/draft を確定する。
      return successfulSaveResult(
        agentId,
        { ...desired, configVersion: confirmed.configVersion },
        confirmed.configVersion,
        warnings,
        clients.invocation.correlationId
      );
    }
    if (confirmed.modelPolicyRef === previousRef) {
      // confirmed previous ref は UpdateConfig 未適用を示す。保存済み policy は Agent-owned history に残し、UI は draft/summary を保持する。
      return createBrowserSafeAgentRpcFailureForCategory(
        {
          ...createModelPolicyFailureResult(
            '既定モデルポリシーを適用できませんでした。直前に確認済みの設定を保持しています。',
            {},
            warnings,
            toModelPolicyErrorCategory(updateFailure.safeErrorCategory)
          ),
          configVersion: undefined,
        },
        updateFailure.safeErrorCategory,
        updateFailure.correlationId
      );
    }
  } catch (error) {
    const reconciliationFailure = createBrowserSafeAgentRpcFailure(
      error,
      clients.invocation.correlationId,
      undefined
    );
    return reconciliationRequiredResult(
      reconciliationFailure.safeErrorCategory,
      reconciliationFailure.correlationId,
      warnings
    );
  }
  // desired/previous どちらにも一致しない config は Browser が安全に判定できないため、確認 action だけを有効化する。
  return reconciliationRequiredResult(
    updateFailure.safeErrorCategory,
    updateFailure.correlationId,
    warnings
  );
}

async function readCurrentConfig(
  clients: ServerAgentRpcClients,
  agentId: string
): Promise<ConfirmedConfig> {
  const response = await clients.withErrorNormalization(() => clients.state.getConfig({ agentId }));
  return toConfirmedConfig(response);
}

function toConfirmedConfig(response: Record<string, unknown>): ConfirmedConfig {
  const config = asRecord(response.config);
  const rawVersion = config?.configVersion;
  const rawRef = config?.modelPolicyRef;
  return {
    configVersion:
      typeof rawVersion === 'string' && rawVersion.trim().length > 0
        ? rawVersion.trim()
        : undefined,
    modelPolicyRef: typeof rawRef === 'string' && rawRef.trim().length > 0 ? rawRef : undefined,
  };
}

function invalidConfigVersionResult(
  clients: ServerAgentRpcClients,
  warnings: BrowserSafeModelPolicySaveResult['displayData']['warnings']
): BrowserSafeModelPolicySaveResult {
  return createBrowserSafeAgentRpcFailureForCategory(
    {
      ...createModelPolicyFailureResult(
        '設定バージョンを確認できませんでした。入力内容を確認してもう一度保存してください。',
        {},
        warnings,
        'invalid_argument'
      ),
      configVersion: undefined,
    },
    'invalid_argument',
    clients.invocation.correlationId
  );
}

function reconciliationRequiredResult(
  category: BrowserSafeAgentRpcErrorCategory,
  correlationId: string,
  warnings: BrowserSafeModelPolicySaveResult['displayData']['warnings']
): BrowserSafeModelPolicySaveResult {
  return createBrowserSafeAgentRpcFailureForCategory(
    {
      ...createModelPolicyFailureResult(
        '設定の適用状態をサーバー側で確認します。直前に確認済みの概要と入力内容を保持しています。問い合わせIDを控え、「適用状態を確認」を実行してください。',
        {},
        warnings,
        toModelPolicyErrorCategory(category)
      ),
      configVersion: undefined,
      reconciliationRequired: true,
      title: browserSafeErrorTitle(category),
    },
    category,
    correlationId
  );
}

function successfulSaveResult(
  agentId: string,
  metadata: BrowserSafeModelPolicyMetadata,
  configVersion: string,
  warnings: BrowserSafeModelPolicySaveResult['displayData']['warnings'],
  correlationId: string
): BrowserSafeModelPolicySaveResult {
  // UpdateConfig response で確認した non-empty config version だけを success metadata に採用する。
  revalidatePath(`/agents/${agentId}`);
  revalidatePath(`/agents/${agentId}/settings`);
  return createBrowserSafeAgentRpcSuccess(
    {
      configVersion,
      fieldErrors: {},
      message: `「${metadata.policyRef}」を保存し、設定バージョン v${configVersion} を適用しました。`,
      metadata,
      ok: true,
      title: '既定モデルポリシーを保存しました',
      warnings,
    },
    correlationId
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function toModelPolicyErrorCategory(
  category: BrowserSafeAgentRpcErrorCategory
):
  | 'invalid_argument'
  | 'permission_denied'
  | 'not_found'
  | 'failed_precondition'
  | 'unavailable'
  | 'internal'
  | 'unknown' {
  if (
    category === 'invalid_argument' ||
    category === 'permission_denied' ||
    category === 'not_found' ||
    category === 'failed_precondition' ||
    category === 'unavailable' ||
    category === 'internal'
  ) {
    return category;
  }
  return 'unknown';
}
