import { Code } from '@connectrpc/connect';

import type { AuthenticatedAgentPrincipal } from './authentication';
import type { AgentRpcGuardResult } from './types';
import type { AgentControlPlaneScope } from '../../domain/security';

const textDecoder = new TextDecoder();
const agentReadScope = ['agent:read'] as const satisfies readonly AgentControlPlaneScope[];
const agentWriteScope = ['agent:write'] as const satisfies readonly AgentControlPlaneScope[];
const agentAdminScope = ['agent:admin'] as const satisfies readonly AgentControlPlaneScope[];
const toolApprovalScope = [
  'agent:tool:approve',
] as const satisfies readonly AgentControlPlaneScope[];
const integrationAdminScope = [
  'agent:integration:admin',
] as const satisfies readonly AgentControlPlaneScope[];

/**
 * Agent RPC authorization の入力です。
 */
export interface AgentAuthorizationInput {
  readonly principal: AuthenticatedAgentPrincipal;
  readonly rawBody: Uint8Array;
  readonly request: Request;
}

/**
 * 認証済み Agent RPC request を method scope matrix と Agent scope で認可します。
 *
 * @param input request、raw Protobuf body、認証済み principal を含む入力です。
 * @returns 認可成功時は `undefined`、拒否時は安全な Connect error 分類です。
 */
export function authorizeAgentRequest(input: AgentAuthorizationInput): AgentRpcGuardResult {
  // test seam は Vitest 専用認証で作られた principal だけが利用でき、本番 bearer principal は header を無視します。
  if (
    input.principal.authenticationMode === 'test' &&
    input.request.headers.get('x-agent-test-grant') === 'allow'
  ) {
    return undefined;
  }

  const operation = parseConnectMethodIdentity(new URL(input.request.url).pathname);
  if (isProviderIngressOperation(operation)) {
    return {
      code: Code.PermissionDenied,
      message: 'Integration ingress RPC requires detached Provider signature authentication.',
      reason: 'provider_ingress_auth_required',
    };
  }
  const requiredScopes = getRequiredAgentRpcScopes(operation);
  if (requiredScopes === undefined) {
    return {
      code: Code.PermissionDenied,
      message: 'Agent RPC method is not mapped to a Client Service scope.',
      reason: 'method_scope_unmapped',
    };
  }
  if (!hasRequiredScopes(input.principal.scopes, requiredScopes)) {
    return {
      code: Code.PermissionDenied,
      message: 'Agent RPC method scope is not allowed for the authenticated principal.',
      reason: 'method_scope_denied',
    };
  }

  const requestAgentIdResult = extractAgentIdFromProtobuf(input.rawBody);
  if (requestAgentIdResult.status === 'invalid') {
    return {
      code: Code.InvalidArgument,
      message: 'Agent RPC request agent_id field is malformed.',
      reason: 'invalid_request_agent_id',
    };
  }
  if (requestAgentIdResult.status === 'ambiguous') {
    return {
      code: Code.InvalidArgument,
      message: 'Agent RPC request agent_id must appear exactly once.',
      reason: 'duplicate_request_agent_id',
    };
  }
  const requestAgentId =
    requestAgentIdResult.status === 'found' ? requestAgentIdResult.agentId : undefined;
  if (requestAgentId === undefined || requestAgentId === '') {
    return {
      code: Code.InvalidArgument,
      message: 'Agent RPC request agent_id is required.',
      reason: 'missing_request_agent_id',
    };
  }
  // `allowedAgentIds: ["*"]` は policy 側の広い許可に限定し、principal.agentId 自体は JWT claim 由来の具体 ID として必ず一致させます。
  // ここで完全一致を要求することで、wildcard subject-agent が request body の別 Agent へ横断する抜け道を閉じます。
  if (requestAgentId !== input.principal.agentId) {
    return {
      code: Code.PermissionDenied,
      message: 'Agent RPC request agent_id does not match authenticated principal scope.',
      reason: 'agent_scope_mismatch',
    };
  }
  if (!isAllowedAgentId(input.principal.allowedAgentIds, requestAgentId)) {
    return {
      code: Code.PermissionDenied,
      message: 'Agent RPC request agent_id is outside the authenticated principal policy.',
      reason: 'allowed_agent_denied',
    };
  }
  return undefined;
}

/**
 * RPC service/method に必要な control-plane scope を返します。
 *
 * @param input Connect path から取り出した service/method 名です。
 * @returns Client Service JWT で必要な scope。未登録 method は fail-closed のため `undefined` です。
 */
export function getRequiredAgentRpcScopes(input: {
  readonly method: string;
  readonly service: string;
}): readonly AgentControlPlaneScope[] | undefined {
  const key = `${input.service}/${input.method}`;
  return methodScopeMatrix.get(key);
}

/**
 * Provider callback 専用 RPC かどうかを判定します。
 *
 * @param input Connect path から取り出した service/method 名です。
 * @returns Client Service bearer ではなく detached Provider signature 境界に属する場合は `true` です。
 */
export function isProviderIngressOperation(input: {
  readonly method: string;
  readonly service: string;
}): boolean {
  const key = `${input.service}/${input.method}`;
  return providerIngressOperationKeys.has(key);
}

const providerIngressOperationKeys = new Set<string>([
  'cftamac.agent.v1.IntegrationIngressService/PublishDeliveryResult',
  'cftamac.agent.v1.IntegrationIngressService/PublishEvent',
  'cftamac.agent.v1.IntegrationIngressService/PublishToolResult',
]);

const methodScopeMatrix = new Map<string, readonly AgentControlPlaneScope[]>([
  ['cftamac.agent.v1.AgentHealthService/Check', agentReadScope],
  ['cftamac.agent.v1.AgentLifecycleService/InitializeAgent', agentAdminScope],
  ['cftamac.agent.v1.AgentLifecycleService/GetAgent', agentReadScope],
  ['cftamac.agent.v1.AgentLifecycleService/DestroyAgent', agentAdminScope],
  ['cftamac.agent.v1.AgentLifecycleService/RotateAgentCredential', agentAdminScope],
  ['cftamac.agent.v1.AgentEventService/PublishEvent', agentWriteScope],
  ['cftamac.agent.v1.AgentEventService/GetEvent', agentReadScope],
  ['cftamac.agent.v1.AgentEventService/ListEvents', agentReadScope],
  ['cftamac.agent.v1.AgentStateService/GetState', agentReadScope],
  ['cftamac.agent.v1.AgentStateService/GetConfig', agentReadScope],
  ['cftamac.agent.v1.AgentStateService/UpdateConfig', agentWriteScope],
  ['cftamac.agent.v1.AgentThreadService/ListThreads', agentReadScope],
  ['cftamac.agent.v1.AgentThreadService/GetThread', agentReadScope],
  ['cftamac.agent.v1.AgentThreadService/ListSections', agentReadScope],
  ['cftamac.agent.v1.AgentThreadService/GetLatestCompaction', agentReadScope],
  ['cftamac.agent.v1.AgentThreadService/GetThreadMemory', agentReadScope],
  ['cftamac.agent.v1.AgentThreadService/SearchThreadHistory', agentReadScope],
  ['cftamac.agent.v1.AgentRunService/GetRun', agentReadScope],
  ['cftamac.agent.v1.AgentRunService/ListRuns', agentReadScope],
  ['cftamac.agent.v1.AgentRunService/CancelRun', agentWriteScope],
  ['cftamac.agent.v1.AgentScheduleService/CreateSchedule', agentWriteScope],
  ['cftamac.agent.v1.AgentScheduleService/GetSchedule', agentReadScope],
  ['cftamac.agent.v1.AgentScheduleService/ListSchedules', agentReadScope],
  ['cftamac.agent.v1.AgentScheduleService/CancelSchedule', agentWriteScope],
  ['cftamac.agent.v1.AgentToolService/ListTools', agentReadScope],
  ['cftamac.agent.v1.AgentToolService/GetInvocation', agentReadScope],
  ['cftamac.agent.v1.AgentToolService/ListInvocations', agentReadScope],
  ['cftamac.agent.v1.AgentToolService/ApproveInvocation', toolApprovalScope],
  ['cftamac.agent.v1.AgentToolService/RejectInvocation', toolApprovalScope],
  ['cftamac.agent.v1.AgentIntegrationService/InstallIntegration', integrationAdminScope],
  ['cftamac.agent.v1.AgentIntegrationService/UninstallIntegration', integrationAdminScope],
  ['cftamac.agent.v1.AgentIntegrationService/GetInstallation', agentReadScope],
  ['cftamac.agent.v1.AgentIntegrationService/ListInstallations', agentReadScope],
  ['cftamac.agent.v1.AgentIntegrationService/CreateAdapterConnection', integrationAdminScope],
  ['cftamac.agent.v1.AgentIntegrationService/DeleteAdapterConnection', integrationAdminScope],
  ['cftamac.agent.v1.AgentIntegrationService/ListAdapterConnections', agentReadScope],
  ['cftamac.agent.v1.AgentModelPolicyService/UpsertModelPolicy', agentWriteScope],
  ['cftamac.agent.v1.AgentModelPolicyService/GetModelPolicy', agentReadScope],
  ['cftamac.agent.v1.AgentModelPolicyService/ListModelPolicies', agentReadScope],
  ['cftamac.agent.v1.AgentModelPolicyService/ArchiveModelPolicy', agentWriteScope],
  ['cftamac.agent.v1.AgentModelPolicyService/ValidateModelPolicy', agentReadScope],
]);

function parseConnectMethodIdentity(path: string): {
  readonly method: string;
  readonly service: string;
} {
  const segments = path.split('/').filter((segment) => segment !== '');
  return { method: segments.at(1) ?? 'unknown', service: segments.at(0) ?? 'unknown' };
}

function hasRequiredScopes(
  scopes: readonly string[],
  requiredScopes: readonly AgentControlPlaneScope[]
): boolean {
  if (requiredScopes.length === 0) return true;
  const available = new Set(scopes);
  return requiredScopes.every((scope) => available.has(scope));
}

function isAllowedAgentId(
  allowedAgentIds: readonly string[] | undefined,
  agentId: string
): boolean {
  if (allowedAgentIds === undefined) return true;
  return allowedAgentIds.includes('*') || allowedAgentIds.includes(agentId);
}

interface VarintReadResult {
  readonly offset: number;
  readonly value: number;
}

type AgentIdExtractionResult =
  | { readonly agentId: string; readonly status: 'found' }
  | { readonly status: 'ambiguous' | 'invalid' | 'missing' };

function extractAgentIdFromProtobuf(bytes: Uint8Array): AgentIdExtractionResult {
  let offset = 0;
  let agentId: string | undefined;
  while (offset < bytes.length) {
    const key = readVarint(bytes, offset);
    if (key === undefined) return { status: 'invalid' };
    offset = key.offset;
    const fieldNumber = Math.floor(key.value / 8);
    const wireType = key.value % 8;
    if (fieldNumber === 1 && wireType === 2) {
      const length = readVarint(bytes, offset);
      if (length === undefined) return { status: 'invalid' };
      const start = length.offset;
      const end = start + length.value;
      if (end > bytes.length) return { status: 'invalid' };
      // Protobuf の singular string は重複 field を後勝ちで decode するため、raw 認可 scan では重複を安全側で拒否します。
      // これにより「最初の agent_id は JWT と一致、最後の agent_id は別 Agent」という route 迂回を防ぎます。
      if (agentId !== undefined) return { status: 'ambiguous' };
      agentId = textDecoder.decode(bytes.slice(start, end)).trim();
      offset = end;
      continue;
    }
    offset = skipProtobufValue(bytes, offset, wireType);
    if (offset < 0) return { status: 'invalid' };
  }
  return agentId === undefined ? { status: 'missing' } : { agentId, status: 'found' };
}

function skipProtobufValue(bytes: Uint8Array, offset: number, wireType: number): number {
  if (wireType === 0) return readVarint(bytes, offset)?.offset ?? -1;
  if (wireType === 1) return offset + 8 <= bytes.length ? offset + 8 : -1;
  if (wireType === 2) {
    const length = readVarint(bytes, offset);
    if (length === undefined) return -1;
    const end = length.offset + length.value;
    return end <= bytes.length ? end : -1;
  }
  if (wireType === 5) return offset + 4 <= bytes.length ? offset + 4 : -1;
  return -1;
}

function readVarint(bytes: Uint8Array, startOffset: number): VarintReadResult | undefined {
  let value = 0;
  let multiplier = 1;
  let offset = startOffset;
  for (let index = 0; index < 10; index += 1) {
    const byte = bytes.at(offset);
    if (byte === undefined) return undefined;
    value += (byte & 0x7f) * multiplier;
    offset += 1;
    if ((byte & 0x80) === 0) return Number.isSafeInteger(value) ? { offset, value } : undefined;
    multiplier *= 128;
  }
  return undefined;
}
