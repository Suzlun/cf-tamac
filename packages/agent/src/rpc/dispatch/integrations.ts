import type {
  CreateAdapterConnectionRequest,
  CreateAdapterConnectionResponseSchema,
  DeleteAdapterConnectionRequest,
  DeleteAdapterConnectionResponseSchema,
  GetInstallationRequest,
  GetInstallationResponseSchema,
  InstallIntegrationRequest,
  InstallIntegrationResponseSchema,
  ListAdapterConnectionsRequest,
  ListAdapterConnectionsResponseSchema,
  ListInstallationsRequest,
  ListInstallationsResponseSchema,
  UninstallIntegrationRequest,
  UninstallIntegrationResponseSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { getAIAgentDurableObjectStub } from '../../agent-routing';
import { createAgentCoreContext } from '../command-context';
import { mapPayloadReference, requireAgentId } from '../mappers/core';
import {
  mapCreateAdapterConnectionResponse,
  mapDeleteAdapterConnectionResponse,
  mapGetInstallationResponse,
  mapInstallIntegrationResponse,
  mapListAdapterConnectionsResponse,
  mapListInstallationsResponse,
  mapUninstallIntegrationResponse,
} from '../mappers/integrations';

import type { AgentCoreRequestContext } from '../../domain';
import type { AgentWorkerEnv } from '../../env';
import type { MessageInitShape } from '@bufbuild/protobuf';

const agentIntegrationServiceName = 'cftamac.agent.v1.AgentIntegrationService';

type InstallIntegrationResponseInit = MessageInitShape<typeof InstallIntegrationResponseSchema>;
type UninstallIntegrationResponseInit = MessageInitShape<typeof UninstallIntegrationResponseSchema>;
type GetInstallationResponseInit = MessageInitShape<typeof GetInstallationResponseSchema>;
type ListInstallationsResponseInit = MessageInitShape<typeof ListInstallationsResponseSchema>;
type CreateAdapterConnectionResponseInit = MessageInitShape<
  typeof CreateAdapterConnectionResponseSchema
>;
type DeleteAdapterConnectionResponseInit = MessageInitShape<
  typeof DeleteAdapterConnectionResponseSchema
>;
type ListAdapterConnectionsResponseInit = MessageInitShape<
  typeof ListAdapterConnectionsResponseSchema
>;

/**
 * AgentIntegrationService.InstallIntegration を Agent-owned Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った integration ID、manifest 参照、要求 grant、idempotency key、security context です。
 * @returns generated InstallIntegrationResponse の初期化値です。
 * @throws Agent ID、idempotency key、manifest 入力、grant、または署名検証が不正な場合に AIAgent 側の例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchInstallIntegration(env, request);
 * ```
 */
export async function dispatchInstallIntegration(
  env: AgentWorkerEnv,
  request: InstallIntegrationRequest
): Promise<InstallIntegrationResponseInit> {
  // Agent ID を必ず public RPC body から検証し、Agent-local Durable Object 以外へ配送しません。
  const agentId = requireAgentId(request.agentId);
  const context = await createIntegrationServiceContext(agentId, request, 'InstallIntegration');

  // Manifest と setup metadata は payload reference に正規化して、保存や検証の責務を AIAgent aggregate へ委譲します。
  const result = await getAIAgentDurableObjectStub(env, agentId).installIntegration({
    context,
    integrationId: request.integrationId,
    manifestPayload: mapPayloadReference(request.manifestPayload),
    manifestRef: request.manifestRef,
    requestedGrants: request.requestedGrants,
    setupMetadataRef: mapPayloadReference(request.setupMetadataRef),
  });
  return mapInstallIntegrationResponse(result);
}

/**
 * AgentIntegrationService.UninstallIntegration を Agent-owned Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った installation ID、理由、idempotency key、security context です。
 * @returns generated UninstallIntegrationResponse の初期化値です。
 * @throws Agent ID、installation ID、idempotency key が不正な場合、または revoke 処理で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchUninstallIntegration(env, request);
 * ```
 */
export async function dispatchUninstallIntegration(
  env: AgentWorkerEnv,
  request: UninstallIntegrationRequest
): Promise<UninstallIntegrationResponseInit> {
  // Uninstall は Agent aggregate 内で capability と ledger を整理するため、入力を Durable Object method へそのまま scope 付きで渡します。
  const agentId = requireAgentId(request.agentId);
  const context = await createIntegrationServiceContext(agentId, request, 'UninstallIntegration');
  const result = await getAIAgentDurableObjectStub(env, agentId).uninstallIntegration({
    context,
    installationId: request.installationId,
    reason: request.reason,
  });
  return mapUninstallIntegrationResponse(result);
}

/**
 * AgentIntegrationService.GetInstallation を Agent-owned Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った Agent ID と installation ID です。
 * @returns generated GetInstallationResponse の初期化値です。
 * @throws Agent ID または installation ID が不正な場合、または参照対象が存在しない場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchGetInstallation(env, request);
 * ```
 */
export async function dispatchGetInstallation(
  env: AgentWorkerEnv,
  request: GetInstallationRequest
): Promise<GetInstallationResponseInit> {
  // 参照系 RPC も Agent ID で Durable Object を固定し、Agent 横断の installation lookup を作りません。
  const agentId = requireAgentId(request.agentId);
  const context = await createIntegrationServiceContext(agentId, request, 'GetInstallation');
  const result = await getAIAgentDurableObjectStub(env, agentId).getIntegrationInstallation({
    context,
    installationId: request.installationId,
  });
  return mapGetInstallationResponse(result);
}

/**
 * AgentIntegrationService.ListInstallations を Agent-owned Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った Agent ID、status filter、pagination 条件です。
 * @returns generated ListInstallationsResponse の初期化値です。
 * @throws Agent ID や pagination 入力が不正な場合、または AIAgent 側の照会で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchListInstallations(env, request);
 * ```
 */
export async function dispatchListInstallations(
  env: AgentWorkerEnv,
  request: ListInstallationsRequest
): Promise<ListInstallationsResponseInit> {
  // List は指定 Agent の installation ledger だけを対象にし、public API に Agent-cross list を増やしません。
  const agentId = requireAgentId(request.agentId);
  const context = await createIntegrationServiceContext(agentId, request, 'ListInstallations');
  const result = await getAIAgentDurableObjectStub(env, agentId).listIntegrationInstallations({
    context,
    pageSize: request.page?.pageSize,
    pageToken: request.page?.pageToken,
    status: request.status,
  });
  return mapListInstallationsResponse(result);
}

/**
 * AgentIntegrationService.CreateAdapterConnection を Agent-owned Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った adapter/installation/subject、metadata、idempotency key、security context です。
 * @returns generated CreateAdapterConnectionResponse の初期化値です。
 * @throws Agent ID、adapter connection 入力、idempotency key、または grant 検証が不正な場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchCreateAdapterConnection(env, request);
 * ```
 */
export async function dispatchCreateAdapterConnection(
  env: AgentWorkerEnv,
  request: CreateAdapterConnectionRequest
): Promise<CreateAdapterConnectionResponseInit> {
  // Adapter Connection の作成は Agent-local ledger に閉じ、metadata は payload reference へ正規化して扱います。
  const agentId = requireAgentId(request.agentId);
  const context = await createIntegrationServiceContext(
    agentId,
    request,
    'CreateAdapterConnection'
  );
  const result = await getAIAgentDurableObjectStub(env, agentId).createAdapterConnection({
    adapterId: request.adapterId,
    connectionKey: request.connectionKey,
    context,
    externalSubject: request.externalSubject,
    installationId: request.installationId,
    metadataRef: mapPayloadReference(request.metadataRef),
  });
  return mapCreateAdapterConnectionResponse(result);
}

/**
 * AgentIntegrationService.DeleteAdapterConnection を Agent-owned Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った connection ID、理由、idempotency key、security context です。
 * @returns generated DeleteAdapterConnectionResponse の初期化値です。
 * @throws Agent ID、connection ID、idempotency key が不正な場合、または AIAgent 側の disable 処理で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchDeleteAdapterConnection(env, request);
 * ```
 */
export async function dispatchDeleteAdapterConnection(
  env: AgentWorkerEnv,
  request: DeleteAdapterConnectionRequest
): Promise<DeleteAdapterConnectionResponseInit> {
  // Delete は物理削除ではなく Agent-owned ledger 上の無効化として Durable Object に処理させます。
  const agentId = requireAgentId(request.agentId);
  const context = await createIntegrationServiceContext(
    agentId,
    request,
    'DeleteAdapterConnection'
  );
  const result = await getAIAgentDurableObjectStub(env, agentId).deleteAdapterConnection({
    connectionId: request.connectionId,
    context,
    reason: request.reason,
  });
  return mapDeleteAdapterConnectionResponse(result);
}

/**
 * AgentIntegrationService.ListAdapterConnections を Agent-owned Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った installation/adapter/status filter と pagination 条件です。
 * @returns generated ListAdapterConnectionsResponse の初期化値です。
 * @throws Agent ID や pagination 入力が不正な場合、または AIAgent 側の照会で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchListAdapterConnections(env, request);
 * ```
 */
export async function dispatchListAdapterConnections(
  env: AgentWorkerEnv,
  request: ListAdapterConnectionsRequest
): Promise<ListAdapterConnectionsResponseInit> {
  // Connection 一覧も Agent-local ledger から取得し、installation/adapter filter を Durable Object 内で評価します。
  const agentId = requireAgentId(request.agentId);
  const context = await createIntegrationServiceContext(agentId, request, 'ListAdapterConnections');
  const result = await getAIAgentDurableObjectStub(env, agentId).listAdapterConnections({
    adapterId: request.adapterId,
    context,
    installationId: request.installationId,
    pageSize: request.page?.pageSize,
    pageToken: request.page?.pageToken,
    status: request.status,
  });
  return mapListAdapterConnectionsResponse(result);
}

async function createIntegrationServiceContext(
  agentId: string,
  request:
    | CreateAdapterConnectionRequest
    | DeleteAdapterConnectionRequest
    | GetInstallationRequest
    | InstallIntegrationRequest
    | ListAdapterConnectionsRequest
    | ListInstallationsRequest
    | UninstallIntegrationRequest,
  method: string
): Promise<AgentCoreRequestContext> {
  // 通常の Integration RPC は generated request 全体を fallback digest seed にし、command 系だけ idempotency/security を渡します。
  return createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    idempotencyKey: 'idempotencyKey' in request ? request.idempotencyKey : undefined,
    method,
    security: 'security' in request ? request.security : undefined,
    service: agentIntegrationServiceName,
  });
}
