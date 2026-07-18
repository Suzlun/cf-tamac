import {
  assertAgentContext,
  authorizeAgentOperation,
  checkAgentIdempotency,
  recordAgentIdempotency,
  reserveAgentNonce,
} from './agent-operation-utils';
import { createAgentDomainError } from './errors';
import { createInlineSafeJsonMetadataView } from './safe-inline-json';

import type {
  AgentAuditView,
  AgentCoreRequestContext,
  AgentModelPolicyCommandInput,
  AgentModelPolicySummaryView,
  AgentModelPolicyValidationView,
  AgentPageView,
  AgentPayloadMetadataView,
  AgentScopedQuery,
} from './agent-core';
import type {
  AgentModelPolicyInputRecord,
  AgentModelPolicyPayloadRefInput,
  AgentModelPolicyRow,
  AgentModelPolicyValidationRecord,
  AgentStorageRepositories,
} from '../storage';

const modelPolicyServiceName = 'cftamac.agent.v1.AgentModelPolicyService';
const upsertOperationName = 'AgentModelPolicyService.UpsertModelPolicy';
const archiveOperationName = 'AgentModelPolicyService.ArchiveModelPolicy';
const defaultPolicyRef = 'workers-ai-default';
const defaultWorkersAiModel = '@cf/meta/llama-3.1-8b-instruct';

/**
 * AgentModelPolicyService.UpsertModelPolicy が Durable Object に渡す command です。
 */
export interface UpsertAgentModelPolicyCommand {
  readonly context: AgentCoreRequestContext;
  readonly policy: AgentModelPolicyCommandInput;
}

/**
 * AgentModelPolicyService.GetModelPolicy が Durable Object に渡す query です。
 */
export interface GetAgentModelPolicyQuery extends AgentScopedQuery {
  readonly policyRef: string;
}

/**
 * AgentModelPolicyService.ListModelPolicies が Durable Object に渡す query です。
 */
export interface ListAgentModelPoliciesQuery extends AgentScopedQuery {
  readonly pageCursorScope?: string;
  readonly pageSize?: number;
  readonly pageToken?: string;
  readonly status?: string;
}

/**
 * AgentModelPolicyService.ArchiveModelPolicy が Durable Object に渡す command です。
 */
export interface ArchiveAgentModelPolicyCommand {
  readonly context: AgentCoreRequestContext;
  readonly policyRef: string;
  readonly reason?: string;
}

/**
 * AgentModelPolicyService.ValidateModelPolicy が Durable Object に渡す query です。
 */
export interface ValidateAgentModelPolicyQuery extends AgentScopedQuery {
  readonly policy: AgentModelPolicyCommandInput;
}

/**
 * Agent-owned model policy の完全な安全 view です。
 */
export interface AgentModelPolicyView extends AgentModelPolicySummaryView {
  readonly archivedAtMs?: number;
  readonly createdAtMs: number;
  readonly createdByPrincipalId?: string;
  readonly safeBudgetMetadataRef?: AgentPayloadMetadataView;
  readonly safeGenerationParametersRef?: AgentPayloadMetadataView;
  readonly safeSafetyMetadataRef?: AgentPayloadMetadataView;
  readonly updatedAtMs: number;
  readonly updatedByPrincipalId?: string;
}

/**
 * UpsertModelPolicy の domain 結果です。
 */
export interface UpsertAgentModelPolicyResult {
  readonly audit?: AgentAuditView;
  readonly policy: AgentModelPolicyView;
  readonly replayed: boolean;
  readonly validation: AgentModelPolicyValidationView;
}

/**
 * ListModelPolicies の domain 結果です。
 */
export interface ListAgentModelPoliciesResult {
  readonly page: AgentPageView;
  readonly policies: readonly AgentModelPolicyView[];
}

/**
 * ArchiveModelPolicy の domain 結果です。
 */
export interface ArchiveAgentModelPolicyResult {
  readonly audit?: AgentAuditView;
  readonly policy: AgentModelPolicyView;
  readonly replayed: boolean;
}

/**
 * ValidateModelPolicy の domain 結果です。
 */
export interface ValidateAgentModelPolicyResult {
  readonly policyPreview?: AgentModelPolicySummaryView;
  readonly validation: AgentModelPolicyValidationView;
}

/**
 * Agent 初期化で policy seed が省略された場合に使う明示的な bootstrap seed を作成します。
 *
 * @returns Workers AI default policy を指す secret-free policy 入力です。
 */
export function createDefaultAgentModelPolicySeed(): AgentModelPolicyCommandInput {
  return {
    decisionSchemaVersion: 'v1',
    modelId: defaultWorkersAiModel,
    policyRef: defaultPolicyRef,
    provider: 'workers-ai',
    status: 'active',
  };
}

/**
 * InitializeAgent の transaction 中で default model policy seed を保存します。
 *
 * @param input Agent ID、repository set、command context、任意の seed を含む入力です。
 * @returns 保存済み default policy の summary です。
 */
export function seedInitialAgentModelPolicy(input: {
  readonly agentId: string;
  readonly context: AgentCoreRequestContext;
  readonly policy?: AgentModelPolicyCommandInput;
  readonly repositories: AgentStorageRepositories;
}): AgentModelPolicySummaryView {
  const policy = input.policy ?? createDefaultAgentModelPolicySeed();
  const validation = input.repositories.modelPolicies.validatePolicy(
    mapPolicyCommandToRecord(policy),
    input.context.requestedAtMs
  );
  if (!validation.ok) throwValidationError(validation);
  const row = input.repositories.modelPolicies.upsertPolicy({
    nowMs: input.context.requestedAtMs,
    policy: mapPolicyCommandToRecord(policy),
    principalId: input.context.principal.principalId,
  });
  return mapAgentModelPolicySummaryRow(input.agentId, row);
}

/**
 * UpsertModelPolicy command を Agent-owned storage に反映します。
 */
export function upsertAgentModelPolicyInStore(input: {
  readonly agentId: string;
  readonly command: UpsertAgentModelPolicyCommand;
  readonly repositories: AgentStorageRepositories;
}): UpsertAgentModelPolicyResult {
  assertAgentContext(input.agentId, input.command.context);
  const replay = checkAgentIdempotency<UpsertAgentModelPolicyResult>({
    context: input.command.context,
    operationName: upsertOperationName,
    repositories: input.repositories,
  });
  if (replay.status === 'replay') return { ...replay.response, replayed: true };
  reserveAgentNonce(input.repositories, input.command.context);
  authorizeModelPolicyMutation(
    input.repositories,
    input.command.context,
    'model_policy.upsert',
    'UpsertModelPolicy'
  );
  const validation = input.repositories.modelPolicies.validatePolicy(
    mapPolicyCommandToRecord(input.command.policy),
    input.command.context.requestedAtMs
  );
  if (!validation.ok) throwValidationError(validation);
  const row = upsertPolicyOrDomainError(input.repositories, input.command);
  const result = {
    audit: recordModelPolicyAudit(
      input.agentId,
      input.repositories,
      input.command.context,
      'upsert',
      row.policyRef
    ),
    policy: mapAgentModelPolicyRow(input.agentId, row),
    replayed: false,
    validation: mapValidationRecord(validation),
  };
  recordAgentIdempotency({
    context: input.command.context,
    operationName: upsertOperationName,
    repositories: input.repositories,
    response: result,
  });
  return result;
}

/**
 * GetModelPolicy query を Agent-owned storage から返します。
 */
export function getAgentModelPolicyFromStore(input: {
  readonly agentId: string;
  readonly query: GetAgentModelPolicyQuery;
  readonly repositories: AgentStorageRepositories;
}): AgentModelPolicyView {
  assertAgentContext(input.agentId, input.query.context);
  authorizeModelPolicyRead(
    input.repositories,
    input.query.context,
    'model_policy.get',
    'GetModelPolicy'
  );
  const row = input.repositories.modelPolicies.getPolicy(input.query.policyRef);
  if (row === undefined) {
    throw createAgentDomainError({ kind: 'not_found', message: 'Model policy not found.' });
  }
  return mapAgentModelPolicyRow(input.agentId, row);
}

/**
 * ListModelPolicies query を Agent scope 内で処理します。
 */
export function listAgentModelPoliciesFromStore(input: {
  readonly agentId: string;
  readonly query: ListAgentModelPoliciesQuery;
  readonly repositories: AgentStorageRepositories;
}): ListAgentModelPoliciesResult {
  assertAgentContext(input.agentId, input.query.context);
  authorizeModelPolicyRead(
    input.repositories,
    input.query.context,
    'model_policy.list',
    'ListModelPolicies'
  );
  const cursorScope = `${input.agentId}:model_policies:${input.query.status ?? 'all'}`;
  if (input.query.pageCursorScope !== undefined && input.query.pageCursorScope !== cursorScope) {
    throw createAgentDomainError({
      kind: 'authorization',
      message: 'Pagination cursor is outside this Agent model policy scope.',
    });
  }
  const pageSize = Math.min(Math.max(input.query.pageSize ?? 50, 1), 100);
  const rows = input.repositories.modelPolicies.listPolicies({
    afterPolicyRef: input.query.pageToken,
    limit: pageSize + 1,
    status: input.query.status,
  });
  const pageRows = rows.slice(0, pageSize);
  return {
    page: {
      cursorScope,
      nextPageToken: rows.length > pageSize ? pageRows.at(-1)?.policyRef : undefined,
      resultCount: pageRows.length,
    },
    policies: pageRows.map((row) => mapAgentModelPolicyRow(input.agentId, row)),
  };
}

/**
 * ArchiveModelPolicy command を Agent-owned storage に反映します。
 */
export function archiveAgentModelPolicyInStore(input: {
  readonly agentId: string;
  readonly command: ArchiveAgentModelPolicyCommand;
  readonly repositories: AgentStorageRepositories;
}): ArchiveAgentModelPolicyResult {
  assertAgentContext(input.agentId, input.command.context);
  const replay = checkAgentIdempotency<ArchiveAgentModelPolicyResult>({
    context: input.command.context,
    operationName: archiveOperationName,
    repositories: input.repositories,
  });
  if (replay.status === 'replay') return { ...replay.response, replayed: true };
  reserveAgentNonce(input.repositories, input.command.context);
  authorizeModelPolicyMutation(
    input.repositories,
    input.command.context,
    'model_policy.archive',
    'ArchiveModelPolicy'
  );
  const row = input.repositories.modelPolicies.archivePolicy({
    nowMs: input.command.context.requestedAtMs,
    policyRef: input.command.policyRef,
    principalId: input.command.context.principal.principalId,
  });
  if (row === undefined) {
    throw createAgentDomainError({ kind: 'not_found', message: 'Model policy not found.' });
  }
  const result = {
    audit: recordModelPolicyAudit(
      input.agentId,
      input.repositories,
      input.command.context,
      'archive',
      row.policyRef
    ),
    policy: mapAgentModelPolicyRow(input.agentId, row),
    replayed: false,
  };
  recordAgentIdempotency({
    context: input.command.context,
    operationName: archiveOperationName,
    repositories: input.repositories,
    response: result,
  });
  return result;
}

/**
 * ValidateModelPolicy query を状態変更なしで処理します。
 */
export function validateAgentModelPolicyInStore(input: {
  readonly agentId: string;
  readonly query: ValidateAgentModelPolicyQuery;
  readonly repositories: AgentStorageRepositories;
}): ValidateAgentModelPolicyResult {
  assertAgentContext(input.agentId, input.query.context);
  authorizeModelPolicyRead(
    input.repositories,
    input.query.context,
    'model_policy.validate',
    'ValidateModelPolicy'
  );
  const validation = input.repositories.modelPolicies.validatePolicy(
    mapPolicyCommandToRecord(input.query.policy),
    input.query.context.requestedAtMs
  );
  return {
    policyPreview: validation.ok ? createValidationPreview(input.agentId, validation) : undefined,
    validation: mapValidationRecord(validation),
  };
}

/**
 * active model policy ref だけを config/default/run selection に使用できるよう検証します。
 */
export function requireActiveAgentModelPolicy(input: {
  readonly agentId: string;
  readonly policyRef: string | undefined;
  readonly repositories: AgentStorageRepositories;
}): AgentModelPolicyRow {
  const policyRef = input.policyRef?.trim() ?? '';
  if (policyRef === '') {
    throw createAgentDomainError({
      kind: 'precondition',
      message: 'Active model policy ref is required.',
    });
  }
  const policy = input.repositories.modelPolicies.getActivePolicy(policyRef);
  if (policy === undefined) {
    throw createAgentDomainError({
      kind: 'precondition',
      message: 'Model policy ref is not active for this Agent.',
      target: 'model_policy_ref',
    });
  }
  return policy;
}

/**
 * Model policy row を safe summary view へ変換します。
 */
export function mapAgentModelPolicySummaryRow(
  agentId: string,
  row: AgentModelPolicyRow
): AgentModelPolicySummaryView {
  return {
    agentId,
    checkedAtMs: row.validatedAtMs ?? undefined,
    decisionSchemaVersion: row.decisionSchemaVersion,
    modelId: row.modelId,
    policyDigest: row.policyDigest,
    policyRef: row.policyRef,
    provider: row.provider,
    safeMetadataRef: mapSafeModelPolicyMetadataRef(row),
    status: row.status,
    version: row.version,
  };
}

/**
 * Model policy row を full safe view へ変換します。
 */
export function mapAgentModelPolicyRow(
  agentId: string,
  row: AgentModelPolicyRow
): AgentModelPolicyView {
  return {
    ...mapAgentModelPolicySummaryRow(agentId, row),
    archivedAtMs: row.archivedAtMs ?? undefined,
    createdAtMs: row.createdAtMs,
    createdByPrincipalId: row.createdByPrincipalId ?? undefined,
    safeBudgetMetadataRef: mapOptionalPolicyRef(row.budgetMetadataRef, row.budgetMetadataSha256),
    safeGenerationParametersRef: mapSafeGenerationParametersRef(row),
    safeSafetyMetadataRef: mapOptionalPolicyRef(row.safetyMetadataRef, row.safetyMetadataSha256),
    updatedAtMs: row.updatedAtMs,
    updatedByPrincipalId: row.updatedByPrincipalId ?? undefined,
  };
}

/**
 * Validation record を safe view へ変換します。
 */
export function mapValidationRecord(
  validation: AgentModelPolicyValidationRecord
): AgentModelPolicyValidationView {
  return {
    checkedAtMs: validation.checkedAtMs,
    issues: validation.issues.map((issue) => ({
      code: issue.code,
      retryable: issue.retryable,
      safeMessage: issue.safeMessage,
      severity: issue.severity,
      target: issue.target,
    })),
    modelId: validation.modelId,
    ok: validation.ok,
    policyDigest: validation.policyDigest,
    policyRef: validation.policyRef,
    provider: validation.provider,
    safeMetadataRef: mapPolicyPayloadRef(validation.safeMetadataRef),
    status: validation.status,
    warnings: validation.warnings.map((issue) => ({
      code: issue.code,
      retryable: issue.retryable,
      safeMessage: issue.safeMessage,
      severity: issue.severity,
      target: issue.target,
    })),
  };
}

/**
 * RPC/domain policy command を storage repository 入力へ変換します。
 */
export function mapPolicyCommandToRecord(
  policy: AgentModelPolicyCommandInput
): AgentModelPolicyInputRecord {
  return {
    budgetMetadataRef: mapPayloadViewToPolicyRef(policy.budgetMetadataRef),
    credentialRef: policy.credentialReference,
    decisionSchemaVersion: policy.decisionSchemaVersion,
    expectedPolicyDigest: policy.expectedPolicyDigest,
    generationParametersRef: mapPayloadViewToPolicyRef(policy.generationParametersRef),
    modelId: policy.modelId,
    policyRef: policy.policyRef,
    provider: policy.provider,
    safeMetadataRef: mapPayloadViewToPolicyRef(policy.safeMetadataRef),
    safetyMetadataRef: mapPayloadViewToPolicyRef(policy.safetyMetadataRef),
    status: policy.status,
  };
}

function upsertPolicyOrDomainError(
  repositories: AgentStorageRepositories,
  command: UpsertAgentModelPolicyCommand
): AgentModelPolicyRow {
  try {
    return repositories.modelPolicies.upsertPolicy({
      nowMs: command.context.requestedAtMs,
      policy: mapPolicyCommandToRecord(command.policy),
      principalId: command.context.principal.principalId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'model policy write failed';
    throw createAgentDomainError({
      kind: 'precondition',
      message: `Model policy write rejected: ${message}`,
    });
  }
}

function authorizeModelPolicyMutation(
  repositories: AgentStorageRepositories,
  context: AgentCoreRequestContext,
  action: string,
  method: string
): void {
  authorizeAgentOperation({
    action,
    allowMissingProfile: false,
    context,
    method,
    repositories,
    requiredGrants: ['agent.model_policy'],
    requiredPrincipalTypes: ['CLIENT_SERVICE', 'ADMIN_OPERATOR', 'INTERNAL_SERVICE'],
    requiredScopes: ['agent.model_policy'],
    service: modelPolicyServiceName,
  });
}

function authorizeModelPolicyRead(
  repositories: AgentStorageRepositories,
  context: AgentCoreRequestContext,
  action: string,
  method: string
): void {
  authorizeAgentOperation({
    action,
    context,
    method,
    repositories,
    requiredPrincipalTypes: ['CLIENT_SERVICE', 'ADMIN_OPERATOR', 'INTERNAL_SERVICE'],
    requiredScopes: ['agent.read', 'agent.model_policy'],
    service: modelPolicyServiceName,
  });
}

function throwValidationError(validation: AgentModelPolicyValidationRecord): never {
  const firstIssue = validation.issues[0];
  throw createAgentDomainError({
    kind: firstIssue?.code === 'unsupported_model' ? 'precondition' : 'validation',
    message: firstIssue?.safeMessage ?? 'Model policy validation failed.',
    target: firstIssue?.target,
  });
}

function recordModelPolicyAudit(
  agentId: string,
  repositories: AgentStorageRepositories,
  context: AgentCoreRequestContext,
  operation: string,
  policyRef: string
): AgentAuditView {
  const auditEventId = `model-policy:${operation}:${policyRef}:${context.idempotencyKey ?? context.bodyDigest.digestHex}`;
  repositories.audit.insertAuditEvent({
    auditId: auditEventId,
    createdAtMs: context.requestedAtMs,
    eventType: `agent.model_policy.${operation}`,
    principalRef: context.principal.principalId,
    requestDigest: context.bodyDigest.digestHex,
  });
  return {
    agentId,
    auditEventId,
    correlationId: context.correlationId,
    occurredAtMs: context.requestedAtMs,
    operation: `AgentModelPolicyService.${operation}`,
    principalId: context.principal.principalId,
    result: 'succeeded',
    safeDetailRef: `agent-model-policy://${encodeURIComponent(policyRef)}`,
    systemThreadId: repositories.profile.getProfile()?.systemThreadId ?? '',
  };
}

function createValidationPreview(
  agentId: string,
  validation: AgentModelPolicyValidationRecord
): AgentModelPolicySummaryView {
  return {
    agentId,
    checkedAtMs: validation.checkedAtMs,
    decisionSchemaVersion: 'v1',
    modelId: validation.modelId,
    policyDigest: validation.policyDigest ?? '',
    policyRef: validation.policyRef,
    provider: validation.provider,
    safeMetadataRef: mapPolicyPayloadRef(validation.safeMetadataRef),
    status: validation.status,
    version: 0,
  };
}

function mapOptionalPolicyRef(
  ref: string | null,
  sha256: string | null
): AgentPayloadMetadataView | undefined {
  if (ref === null) return undefined;
  return {
    byteSize: 0,
    contentType: 'application/octet-stream',
    ref,
    sha256: sha256 ?? '',
    storageClass: 'reference',
  };
}

function mapSafeGenerationParametersRef(
  row: AgentModelPolicyRow
): AgentPayloadMetadataView | undefined {
  const generationParameters = buildSafeGenerationParameters(row);
  if (generationParameters === undefined) {
    return mapOptionalPolicyRef(row.generationParametersRef, row.generationParametersSha256);
  }
  return buildInlineSafeJsonMetadataRef({
    fallbackRef: `agent-model-policy-generation:${row.policyRef}:v${row.version.toString()}`,
    payload: generationParameters,
    ref: row.generationParametersRef,
  });
}

function mapSafeModelPolicyMetadataRef(
  row: AgentModelPolicyRow
): AgentPayloadMetadataView | undefined {
  const generationParameters = buildSafeGenerationParameters(row);
  if (generationParameters === undefined) {
    return mapOptionalPolicyRef(row.safeMetadataRef, row.safeMetadataSha256);
  }
  return buildInlineSafeJsonMetadataRef({
    fallbackRef: `agent-model-policy-safe:${row.policyRef}:v${row.version.toString()}`,
    payload: {
      generationParameters,
      model: row.modelId,
      policyRef: row.policyRef,
      provider: row.provider,
    },
    ref: row.safeMetadataRef,
  });
}

function buildSafeGenerationParameters(
  row: AgentModelPolicyRow
): Record<string, string> | undefined {
  if (
    row.generationMaxOutputTokens === null &&
    row.generationTemperature === null &&
    row.generationTopP === null
  ) {
    return undefined;
  }
  return {
    maxOutputTokens: row.generationMaxOutputTokens?.toString() ?? '',
    temperature: row.generationTemperature ?? '',
    topP: row.generationTopP ?? '',
  };
}

function buildInlineSafeJsonMetadataRef(input: {
  readonly fallbackRef: string;
  readonly payload: Record<string, unknown>;
  readonly ref: string | null;
}): AgentPayloadMetadataView {
  return createInlineSafeJsonMetadataView({
    payload: input.payload,
    ref: input.ref ?? input.fallbackRef,
  });
}

function mapPayloadViewToPolicyRef(
  ref: AgentPayloadMetadataView | undefined
): AgentModelPolicyPayloadRefInput | undefined {
  return ref === undefined
    ? undefined
    : {
        byteSize: ref.byteSize,
        contentType: ref.contentType,
        inlineBytes: ref.inlineBytes,
        ref: ref.ref,
        sha256: ref.sha256,
        storageClass: ref.storageClass,
      };
}

function mapPolicyPayloadRef(
  ref: AgentModelPolicyPayloadRefInput | undefined
): AgentPayloadMetadataView | undefined {
  return ref === undefined
    ? undefined
    : {
        byteSize: ref.byteSize ?? 0,
        contentType: ref.contentType ?? 'application/octet-stream',
        ref: ref.ref,
        sha256: ref.sha256 ?? '',
        storageClass: ref.storageClass ?? 'reference',
      };
}
