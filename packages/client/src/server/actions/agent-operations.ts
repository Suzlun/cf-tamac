'use server';

import { revalidatePath } from 'next/cache';

import { loadAgentRpcClients } from '../agent-rpc/agent-loader';

import {
  toBrowserSafeAdapterConnection,
  toBrowserSafeApproval,
  toBrowserSafeCleanupResult,
  toBrowserSafeInstallationSummary,
  toBrowserSafeInvocationSummary,
  toBrowserSafeProviderOperation,
  toBrowserSafeScheduleSummary,
  toBrowserSafeToolSummary,
  type BrowserSafeInstallationSummary,
  type BrowserSafeInvocationDetail,
  type BrowserSafeInvocationSummary,
  type BrowserSafeScheduleSummary,
  type BrowserSafeToolSummary,
  type ListInstallationsOptions,
  type ListInvocationsOptions,
  type ListSchedulesOptions,
  type ListToolsOptions,
} from './agent-operation-view-models';
import {
  buildScopedPageRequest,
  toBrowserSafePageInfo,
  type BrowserSafePagedResult,
} from './browser-safe-helpers';
import { upsertModelPolicyForManagedAgent } from './model-policies';
import {
  createModelPolicyFailureResult,
  safeModelPolicyErrorCategory,
  safeModelPolicyErrorMessage,
  toBrowserSafeModelPolicyMetadata,
} from './model-policy-view-models';

import type {
  BrowserSafeModelPolicySaveResult,
  ModelPolicyDraftValues,
} from '../../components/schemas/model-policy';

/** AgentScheduleService.ListSchedules を cursor pagination 付きで呼び出す。 */
export async function listSchedules(
  agentId: string,
  options: ListSchedulesOptions = {}
): Promise<BrowserSafePagedResult<BrowserSafeScheduleSummary>> {
  const { clients } = await loadAgentRpcClients(agentId);
  const response = await clients.withErrorNormalization(() =>
    clients.schedules.listSchedules({
      agentId,
      page: buildScopedPageRequest(agentId, 'schedules', options.page),
      threadId: options.threadId,
      installationId: options.installationId,
      status: options.status,
    })
  );

  return {
    items: response.schedules.map((schedule) => toBrowserSafeScheduleSummary(schedule)),
    page: toBrowserSafePageInfo(response.page),
  };
}

/** AgentScheduleService.CreateSchedule を acting user context 付き server-side RPC として呼び出す。 */
export async function createSchedule(
  agentId: string,
  idempotencyKey: string,
  threadId: string,
  scheduleSpec: string,
  overlapPolicy: string
): Promise<BrowserSafeScheduleSummary> {
  const { clients } = await loadAgentRpcClients(agentId);
  const response = await clients.withErrorNormalization(() =>
    clients.schedules.createSchedule({
      agentId,
      idempotencyKey,
      threadId,
      scheduleSpec,
      overlapPolicy: overlapPolicy === '' ? undefined : overlapPolicy,
    })
  );

  revalidatePath(`/agents/${agentId}/schedules`);
  return toBrowserSafeScheduleSummary(response.schedule, undefined, 'active');
}

/** AgentScheduleService.CancelSchedule を idempotency key 付きで呼び出す。 */
export async function cancelSchedule(
  agentId: string,
  scheduleId: string,
  idempotencyKey: string,
  reason: string
): Promise<BrowserSafeScheduleSummary> {
  const { clients } = await loadAgentRpcClients(agentId);
  const response = await clients.withErrorNormalization(() =>
    clients.schedules.cancelSchedule({
      agentId,
      idempotencyKey,
      scheduleId,
      reason: reason === '' ? undefined : reason,
    })
  );

  revalidatePath(`/agents/${agentId}/schedules`);
  return toBrowserSafeScheduleSummary(response.schedule, scheduleId, 'cancelled');
}

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

/** AgentToolService.ListTools を cursor pagination 付きで呼び出す。 */
export async function listTools(
  agentId: string,
  options: ListToolsOptions = {}
): Promise<BrowserSafePagedResult<BrowserSafeToolSummary>> {
  const { clients } = await loadAgentRpcClients(agentId);
  const response = await clients.withErrorNormalization(() =>
    clients.tools.listTools({
      agentId,
      page: buildScopedPageRequest(agentId, 'tools', options.page),
      includeUnavailable: options.includeUnavailable ?? false,
      installationId: options.installationId,
    })
  );

  return {
    items: response.tools.map(toBrowserSafeToolSummary),
    page: toBrowserSafePageInfo(response.page),
  };
}

/** AgentToolService.ListInvocations を filter と cursor pagination 付きで呼び出す。 */
export async function listInvocations(
  agentId: string,
  options: ListInvocationsOptions = {}
): Promise<BrowserSafePagedResult<BrowserSafeInvocationSummary>> {
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

  return {
    items: response.invocations.map((invocation) => toBrowserSafeInvocationSummary(invocation)),
    page: toBrowserSafePageInfo(response.page),
  };
}

/** AgentToolService.GetInvocation を呼び、承認 drawer 用 detail を返す。 */
export async function getInvocation(
  agentId: string,
  invocationId: string
): Promise<BrowserSafeInvocationDetail> {
  const { clients } = await loadAgentRpcClients(agentId);
  const response = await clients.withErrorNormalization(() =>
    clients.tools.getInvocation({ agentId, invocationId, includePayloadRefs: true })
  );

  return {
    ...toBrowserSafeInvocationSummary(response.invocation, invocationId),
    approval: toBrowserSafeApproval(response.approval),
    providerOperation: toBrowserSafeProviderOperation(response.providerOperation),
  };
}

/** AgentToolService.ApproveInvocation を explicit confirmation 後に呼び出す。 */
export async function approveInvocation(
  agentId: string,
  invocationId: string,
  idempotencyKey: string,
  reason: string
): Promise<BrowserSafeInvocationSummary> {
  const { clients } = await loadAgentRpcClients(agentId);
  const response = await clients.withErrorNormalization(() =>
    clients.tools.approveInvocation({
      agentId,
      idempotencyKey,
      invocationId,
      reason: reason === '' ? undefined : reason,
    })
  );

  revalidatePath(`/agents/${agentId}/tools`);
  return toBrowserSafeInvocationSummary(response.invocation, invocationId, 'approved');
}

/** AgentToolService.RejectInvocation を explicit confirmation 後に呼び出す。 */
export async function rejectInvocation(
  agentId: string,
  invocationId: string,
  idempotencyKey: string,
  reason: string
): Promise<BrowserSafeInvocationSummary> {
  const { clients } = await loadAgentRpcClients(agentId);
  const response = await clients.withErrorNormalization(() =>
    clients.tools.rejectInvocation({
      agentId,
      idempotencyKey,
      invocationId,
      reason: reason === '' ? undefined : reason,
    })
  );

  revalidatePath(`/agents/${agentId}/tools`);
  return toBrowserSafeInvocationSummary(response.invocation, invocationId, 'rejected');
}

/** AgentIntegrationService.ListInstallations を detail enrichment 付きで呼び出す。 */
export async function listInstallations(
  agentId: string,
  options: ListInstallationsOptions = {}
): Promise<BrowserSafePagedResult<BrowserSafeInstallationSummary>> {
  const { clients } = await loadAgentRpcClients(agentId);
  const response = await clients.withErrorNormalization(() =>
    clients.integrations.listInstallations({
      agentId,
      page: buildScopedPageRequest(agentId, 'integrations', options.page),
      status: options.status,
    })
  );

  const items = await Promise.all(
    response.installations.map(async (installation) =>
      enrichInstallationSummary(agentId, installation, clients)
    )
  );
  return { items, page: toBrowserSafePageInfo(response.page) };
}

/** AgentIntegrationService.InstallIntegration を signed manifest 参照で呼び出す。 */
export async function installIntegration(
  agentId: string,
  idempotencyKey: string,
  integrationId: string,
  manifestRef: string,
  requestedGrants: readonly string[]
): Promise<BrowserSafeInstallationSummary> {
  const { clients } = await loadAgentRpcClients(agentId);
  const response = await clients.withErrorNormalization(() =>
    clients.integrations.installIntegration({
      agentId,
      idempotencyKey,
      integrationId,
      manifestRef,
      requestedGrants: [...requestedGrants],
    })
  );

  revalidatePath(`/agents/${agentId}/integrations`);
  return toBrowserSafeInstallationSummary(response.installation, response);
}

/** AgentIntegrationService.UninstallIntegration を cleanup 表示付きで呼び出す。 */
export async function uninstallIntegration(
  agentId: string,
  installationId: string,
  idempotencyKey: string,
  reason: string
): Promise<BrowserSafeInstallationSummary> {
  const { clients } = await loadAgentRpcClients(agentId);
  const response = await clients.withErrorNormalization(() =>
    clients.integrations.uninstallIntegration({
      agentId,
      idempotencyKey,
      installationId,
      reason: reason === '' ? undefined : reason,
    })
  );

  const disabledConnections = response.disabledConnections.map(toBrowserSafeAdapterConnection);
  revalidatePath(`/agents/${agentId}/integrations`);
  return toBrowserSafeInstallationSummary(response.installation, response, {
    adapterConnections: disabledConnections,
    cleanupResult: toBrowserSafeCleanupResult(response, disabledConnections.length),
  });
}

async function enrichInstallationSummary(
  agentId: string,
  installation: unknown,
  clients: Awaited<ReturnType<typeof loadAgentRpcClients>>['clients']
): Promise<BrowserSafeInstallationSummary> {
  const base = toBrowserSafeInstallationSummary(installation);
  const [detailResult, connectionsResult, toolsResult] = await Promise.allSettled([
    clients.withErrorNormalization(() =>
      clients.integrations.getInstallation({ agentId, installationId: base.installationId })
    ),
    clients.withErrorNormalization(() =>
      clients.integrations.listAdapterConnections({
        agentId,
        installationId: base.installationId,
        page: buildScopedPageRequest(agentId, `adapter-connections:${base.installationId}`),
      })
    ),
    clients.withErrorNormalization(() =>
      clients.tools.listTools({
        agentId,
        installationId: base.installationId,
        includeUnavailable: true,
        page: buildScopedPageRequest(agentId, `tools:${base.installationId}`),
      })
    ),
  ]);

  const detail = detailResult.status === 'fulfilled' ? detailResult.value : undefined;
  const connections =
    connectionsResult.status === 'fulfilled' ? connectionsResult.value.connections : [];
  const tools = toolsResult.status === 'fulfilled' ? toolsResult.value.tools : [];
  return toBrowserSafeInstallationSummary(installation, detail, {
    adapterConnections: connections.map(toBrowserSafeAdapterConnection),
    tools: tools.map(toBrowserSafeToolSummary),
  });
}
