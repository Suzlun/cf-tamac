import type {
  ArchiveModelPolicyResponseSchema,
  GetModelPolicyResponseSchema,
  ListModelPoliciesResponseSchema,
  UpsertModelPolicyResponseSchema,
  ValidateModelPolicyResponseSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import type {
  AgentModelPolicyCommandInput,
  AgentModelPolicySummaryView,
  AgentModelPolicyValidationView,
  AgentPayloadMetadataView,
} from '../domain';
import type {
  AgentModelPolicyView,
  ArchiveAgentModelPolicyResult,
  ListAgentModelPoliciesResult,
  UpsertAgentModelPolicyResult,
  ValidateAgentModelPolicyResult,
} from '../domain/model-policy-operations';
import type { MessageInitShape } from '@bufbuild/protobuf';

/**
 * generated AgentModelPolicyInput を Agent-local command 入力へ変換します。
 *
 * @param policy generated RPC request に含まれる policy 入力です。
 * @returns storage/domain が扱う secret-free policy command です。
 * @throws TypeError policy が省略された場合に発生します。
 */
export function mapModelPolicyCommandInput(
  policy:
    | {
        readonly budgetMetadataRef?: GeneratedPolicyPayloadRef;
        readonly credentialReference?: string;
        readonly decisionSchemaVersion: string;
        readonly expectedPolicyDigest?: string;
        readonly generationParametersRef?: GeneratedPolicyPayloadRef;
        readonly modelId: string;
        readonly policyRef: string;
        readonly provider: string;
        readonly safeMetadataRef?: GeneratedPolicyPayloadRef;
        readonly safetyMetadataRef?: GeneratedPolicyPayloadRef;
        readonly status?: string;
      }
    | undefined
): AgentModelPolicyCommandInput {
  if (policy === undefined) throw new TypeError('policy is required.');
  return {
    budgetMetadataRef: mapPayloadRef(policy.budgetMetadataRef),
    credentialReference: policy.credentialReference,
    decisionSchemaVersion: policy.decisionSchemaVersion,
    expectedPolicyDigest: policy.expectedPolicyDigest,
    generationParametersRef: mapPayloadRef(policy.generationParametersRef),
    modelId: policy.modelId,
    policyRef: policy.policyRef,
    provider: policy.provider,
    safeMetadataRef: mapPayloadRef(policy.safeMetadataRef),
    safetyMetadataRef: mapPayloadRef(policy.safetyMetadataRef),
    status: policy.status,
  };
}

interface GeneratedPolicyPayloadRef {
  readonly byteSize: bigint;
  readonly contentType: string;
  readonly inlineBytes?: Uint8Array;
  readonly ref: string;
  readonly sha256: string;
  readonly storageClass: string;
}

/**
 * UpsertModelPolicy domain 結果を generated response shape へ変換します。
 */
export function mapUpsertModelPolicyResponse(
  result: UpsertAgentModelPolicyResult
): MessageInitShape<typeof UpsertModelPolicyResponseSchema> {
  return {
    audit: result.audit === undefined ? undefined : mapAudit(result.audit),
    policy: mapAgentModelPolicy(result.policy),
    replayed: result.replayed,
    validation: mapAgentModelPolicyValidation(result.validation),
  };
}

/**
 * GetModelPolicy domain 結果を generated response shape へ変換します。
 */
export function mapGetModelPolicyResponse(
  policy: AgentModelPolicyView
): MessageInitShape<typeof GetModelPolicyResponseSchema> {
  return { policy: mapAgentModelPolicy(policy) };
}

/**
 * ListModelPolicies domain 結果を generated response shape へ変換します。
 */
export function mapListModelPoliciesResponse(
  result: ListAgentModelPoliciesResult
): MessageInitShape<typeof ListModelPoliciesResponseSchema> {
  return {
    page: {
      cursorScope: result.page.cursorScope,
      nextPageToken: result.page.nextPageToken,
      resultCount: result.page.resultCount,
    },
    policies: result.policies.map(mapAgentModelPolicy),
  };
}

/**
 * ArchiveModelPolicy domain 結果を generated response shape へ変換します。
 */
export function mapArchiveModelPolicyResponse(
  result: ArchiveAgentModelPolicyResult
): MessageInitShape<typeof ArchiveModelPolicyResponseSchema> {
  return {
    audit: result.audit === undefined ? undefined : mapAudit(result.audit),
    policy: mapAgentModelPolicy(result.policy),
    replayed: result.replayed,
  };
}

/**
 * ValidateModelPolicy domain 結果を generated response shape へ変換します。
 */
export function mapValidateModelPolicyResponse(
  result: ValidateAgentModelPolicyResult
): MessageInitShape<typeof ValidateModelPolicyResponseSchema> {
  return {
    policyPreview:
      result.policyPreview === undefined
        ? undefined
        : mapAgentModelPolicySummary(result.policyPreview),
    validation: mapAgentModelPolicyValidation(result.validation),
  };
}

/**
 * Model policy summary view を generated message shape へ変換します。
 */
export function mapAgentModelPolicySummary(policy: AgentModelPolicySummaryView) {
  return {
    agentId: policy.agentId,
    decisionSchemaVersion: policy.decisionSchemaVersion,
    modelId: policy.modelId,
    policyDigest: policy.policyDigest,
    policyRef: policy.policyRef,
    provider: policy.provider,
    safeMetadataRef: mapPayload(policy.safeMetadataRef),
    status: policy.status,
    validatedAtUnixMs: optionalBigInt(policy.checkedAtMs),
    version: BigInt(policy.version),
  };
}

/**
 * Model policy validation view を generated message shape へ変換します。
 */
export function mapAgentModelPolicyValidation(
  validation: AgentModelPolicyValidationView | undefined
) {
  if (validation === undefined) return undefined;
  return {
    checkedAtUnixMs: optionalBigInt(validation.checkedAtMs),
    issues: validation.issues.map(mapValidationIssue),
    modelId: validation.modelId,
    ok: validation.ok,
    policyDigest: validation.policyDigest,
    policyRef: validation.policyRef,
    provider: validation.provider,
    safeMetadataRef: mapPayload(validation.safeMetadataRef),
    status: validation.status,
    warnings: validation.warnings.map(mapValidationIssue),
  };
}

/**
 * Full model policy view を generated message shape へ変換します。
 */
export function mapAgentModelPolicy(policy: AgentModelPolicyView) {
  return {
    ...mapAgentModelPolicySummary(policy),
    archivedAtUnixMs: optionalBigInt(policy.archivedAtMs),
    createdAtUnixMs: BigInt(policy.createdAtMs),
    createdByPrincipalId: policy.createdByPrincipalId,
    safeBudgetMetadataRef: mapPayload(policy.safeBudgetMetadataRef),
    safeGenerationParametersRef: mapPayload(policy.safeGenerationParametersRef),
    safeSafetyMetadataRef: mapPayload(policy.safeSafetyMetadataRef),
    updatedAtUnixMs: BigInt(policy.updatedAtMs),
    updatedByPrincipalId: policy.updatedByPrincipalId,
  };
}

function mapAudit(audit: NonNullable<UpsertAgentModelPolicyResult['audit']>) {
  return {
    agentId: audit.agentId,
    auditEventId: audit.auditEventId,
    correlationId: audit.correlationId,
    occurredAtUnixMs: BigInt(audit.occurredAtMs),
    operation: audit.operation,
    principalId: audit.principalId,
    result: audit.result,
    safeDetailRef: audit.safeDetailRef,
    systemThreadId: audit.systemThreadId,
  };
}

function mapValidationIssue(issue: AgentModelPolicyValidationView['issues'][number]) {
  return {
    code: issue.code,
    retryable: issue.retryable,
    safeMessage: issue.safeMessage,
    severity: issue.severity,
    target: issue.target,
  };
}

function mapPayload(payload: AgentPayloadMetadataView | undefined) {
  if (payload === undefined) return undefined;
  return {
    byteSize: BigInt(payload.byteSize),
    contentType: payload.contentType,
    inlineBytes: payload.inlineBytes,
    ref: payload.ref,
    sha256: payload.sha256,
    storageClass: payload.storageClass,
  };
}

function mapPayloadRef(
  payload: GeneratedPolicyPayloadRef | undefined
): AgentPayloadMetadataView | undefined {
  if (payload === undefined) return undefined;
  return {
    byteSize: Number(payload.byteSize),
    contentType: payload.contentType,
    inlineBytes: payload.inlineBytes,
    ref: payload.ref,
    sha256: payload.sha256,
    storageClass: normalizeStorageClass(payload.storageClass),
  };
}

function normalizeStorageClass(value: string): 'inline' | 'r2' | 'reference' {
  if (value === 'r2' || value === 'reference') return value;
  return 'inline';
}

function optionalBigInt(value: number | undefined): bigint | undefined {
  return value === undefined ? undefined : BigInt(value);
}
