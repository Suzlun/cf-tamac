import { and, asc, eq, gt } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from '../schema/agent-storage';

import {
  formatAgentModelPolicyGenerationNumber,
  readAgentModelPolicyGenerationParameters,
} from './model-policy-generation-parameters';

import type { AgentStorageDatabase } from '../database';

/**
 * `AgentModelPolicyStatus` は Agent Service の内部境界で共有する exported 型です。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export type AgentModelPolicyStatus = 'active' | 'disabled' | 'archived';

/**
 * Policy metadata ref のうち、保存対象 ref/digest と検証用 inline safe JSON を受け取る入力です。
 *
 * @remarks
 * `inlineBytes` は Agent 側 validation と generation parameter 抽出だけに使い、policy row には保存しません。
 * 保存されるのは ref、digest、storage class、検証済み generation parameter の数値列だけです。
 */
export interface AgentModelPolicyPayloadRefInput {
  readonly byteSize?: number;
  readonly contentType?: string;
  readonly inlineBytes?: Uint8Array;
  readonly ref: string;
  readonly sha256?: string;
  readonly storageClass?: 'inline' | 'r2' | 'reference';
}

/**
 * Model policy から抽出した Workers AI generation parameter です。
 *
 * @remarks
 * UI と Agent RPC で受け取った safe JSON から、Provider credential や raw prompt/completion を含まない
 * 数値設定だけを取り出します。Run snapshot と provider adapter はこの値だけを参照します。
 */
export interface AgentModelPolicyGenerationParametersRecord {
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
  readonly topP?: number;
}

/**
 * `AgentModelPolicyInputRecord` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentModelPolicyInputRecord {
  readonly budgetMetadataRef?: AgentModelPolicyPayloadRefInput;
  readonly credentialRef?: string;
  readonly decisionSchemaVersion: string;
  readonly expectedPolicyDigest?: string;
  readonly generationParametersRef?: AgentModelPolicyPayloadRefInput;
  readonly modelId: string;
  readonly policyRef: string;
  readonly provider: string;
  readonly safeMetadataRef?: AgentModelPolicyPayloadRefInput;
  readonly safetyMetadataRef?: AgentModelPolicyPayloadRefInput;
  readonly status?: string;
}

/**
 * `AgentModelPolicyValidationIssueRecord` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentModelPolicyValidationIssueRecord {
  readonly code: string;
  readonly retryable: boolean;
  readonly safeMessage: string;
  readonly severity: 'error' | 'warning';
  readonly target?: string;
}

/**
 * `AgentModelPolicyValidationRecord` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentModelPolicyValidationRecord {
  readonly checkedAtMs: number;
  readonly issues: readonly AgentModelPolicyValidationIssueRecord[];
  readonly modelId: string;
  readonly ok: boolean;
  readonly policyDigest?: string;
  readonly policyRef: string;
  readonly provider: string;
  readonly safeMetadataRef?: AgentModelPolicyPayloadRefInput;
  readonly status: AgentModelPolicyStatus;
  readonly warnings: readonly AgentModelPolicyValidationIssueRecord[];
}

/**
 * `AgentModelPolicyRow` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentModelPolicyRow {
  readonly archivedAtMs: number | null;
  readonly budgetMetadataRef: string | null;
  readonly budgetMetadataSha256: string | null;
  readonly createdAtMs: number;
  readonly createdByPrincipalId: string | null;
  readonly credentialRef: string | null;
  readonly decisionSchemaVersion: string;
  readonly generationMaxOutputTokens: number | null;
  readonly generationParametersRef: string | null;
  readonly generationParametersSha256: string | null;
  readonly generationTemperature: string | null;
  readonly generationTopP: string | null;
  readonly modelId: string;
  readonly policyDigest: string;
  readonly policyRef: string;
  readonly provider: string;
  readonly safeMetadataRef: string | null;
  readonly safeMetadataSha256: string | null;
  readonly safetyMetadataRef: string | null;
  readonly safetyMetadataSha256: string | null;
  readonly status: string;
  readonly updatedAtMs: number;
  readonly updatedByPrincipalId: string | null;
  readonly validatedAtMs: number | null;
  readonly version: number;
}

/**
 * `UpsertAgentModelPolicyInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface UpsertAgentModelPolicyInput {
  readonly nowMs: number;
  readonly policy: AgentModelPolicyInputRecord;
  readonly principalId?: string;
}

/**
 * `ArchiveAgentModelPolicyInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface ArchiveAgentModelPolicyInput {
  readonly nowMs: number;
  readonly policyRef: string;
  readonly principalId?: string;
}

/**
 * `ListAgentModelPoliciesInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface ListAgentModelPoliciesInput {
  readonly afterPolicyRef?: string;
  readonly limit: number;
  readonly status?: string;
}

/**
 * `AgentModelPolicyRepository` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentModelPolicyRepository {
  readonly tableName: 'agent_model_policies';
  archivePolicy(input: ArchiveAgentModelPolicyInput): AgentModelPolicyRow | undefined;
  computePolicyDigest(policy: AgentModelPolicyInputRecord, version: number): string;
  getActivePolicy(policyRef: string): AgentModelPolicyRow | undefined;
  getPolicy(policyRef: string): AgentModelPolicyRow | undefined;
  listPolicies(input: ListAgentModelPoliciesInput): AgentModelPolicyRow[];
  upsertPolicy(input: UpsertAgentModelPolicyInput): AgentModelPolicyRow;
  validatePolicy(
    policy: AgentModelPolicyInputRecord,
    checkedAtMs: number
  ): AgentModelPolicyValidationRecord;
}

/**
 * Agent-owned model policy repository を作成します。
 *
 * @param agentId repository が所属する Agent ID です。
 * @param database Durable Object SQLite に接続する Drizzle adapter です。
 * @returns Model policy の upsert/get/list/archive/validate API です。
 * 返却された method が query/transaction を実行して失敗した場合は、各 method の呼び出し元へ伝播します。
 * @throws この factory 自体は query/transaction を実行せず、repository object を組み立てるだけのため例外を投げません。
 */
export function createAgentModelPolicyRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentModelPolicyRepository {
  const table = agentStorageDrizzleSchema.agentModelPolicies;
  return {
    tableName: 'agent_model_policies',
    archivePolicy(input) {
      const existing = getPolicy(agentId, database, input.policyRef);
      if (existing === undefined) return undefined;
      const digest = computeAgentModelPolicyDigest(
        rowToDigestInput(existing, 'archived'),
        existing.version + 1
      );
      database
        .update(table)
        .set({
          archivedAtMs: input.nowMs,
          policyDigest: digest,
          status: 'archived',
          updatedAtMs: input.nowMs,
          updatedByPrincipalId: input.principalId ?? null,
          version: existing.version + 1,
        })
        .where(and(eq(table.agentId, agentId), eq(table.policyRef, input.policyRef)))
        .run();
      return getPolicy(agentId, database, input.policyRef);
    },
    computePolicyDigest: computeAgentModelPolicyDigest,
    getActivePolicy(policyRef) {
      const policy = getPolicy(agentId, database, policyRef);
      return policy?.status === 'active' ? policy : undefined;
    },
    getPolicy: (policyRef) => getPolicy(agentId, database, policyRef),
    listPolicies(input) {
      return database
        .select()
        .from(table)
        .where(
          and(
            eq(table.agentId, agentId),
            input.status === undefined || input.status === ''
              ? undefined
              : eq(table.status, input.status),
            input.afterPolicyRef === undefined
              ? undefined
              : gt(table.policyRef, input.afterPolicyRef)
          )
        )
        .orderBy(asc(table.policyRef))
        .limit(Math.min(Math.max(input.limit, 1), 101))
        .all();
    },
    upsertPolicy(input) {
      const validation = validateAgentModelPolicy(input.policy, input.nowMs);
      if (!validation.ok) {
        throw new Error('model policy validation failed');
      }
      const existing = getPolicy(agentId, database, input.policy.policyRef);
      if (
        input.policy.expectedPolicyDigest !== undefined &&
        existing?.policyDigest !== input.policy.expectedPolicyDigest
      ) {
        throw new Error('model policy digest precondition failed');
      }
      const version = (existing?.version ?? 0) + 1;
      const status = normalizeModelPolicyStatus(input.policy.status);
      const generationParameters = readAgentModelPolicyGenerationParameters(
        input.policy
      ).parameters;
      const policyDigest = computeAgentModelPolicyDigest(input.policy, version);
      const values = {
        agentId,
        archivedAtMs: status === 'archived' ? input.nowMs : null,
        budgetMetadataRef: input.policy.budgetMetadataRef?.ref ?? null,
        budgetMetadataSha256: input.policy.budgetMetadataRef?.sha256 ?? null,
        createdAtMs: existing?.createdAtMs ?? input.nowMs,
        createdByPrincipalId: existing?.createdByPrincipalId ?? input.principalId ?? null,
        credentialRef: input.policy.credentialRef ?? null,
        decisionSchemaVersion: input.policy.decisionSchemaVersion,
        generationMaxOutputTokens: generationParameters.maxOutputTokens ?? null,
        generationParametersRef: input.policy.generationParametersRef?.ref ?? null,
        generationParametersSha256: input.policy.generationParametersRef?.sha256 ?? null,
        generationTemperature: formatAgentModelPolicyGenerationNumber(
          generationParameters.temperature
        ),
        generationTopP: formatAgentModelPolicyGenerationNumber(generationParameters.topP),
        modelId: input.policy.modelId,
        policyDigest,
        policyRef: input.policy.policyRef,
        provider: input.policy.provider,
        safeMetadataRef: input.policy.safeMetadataRef?.ref ?? null,
        safeMetadataSha256: input.policy.safeMetadataRef?.sha256 ?? null,
        safetyMetadataRef: input.policy.safetyMetadataRef?.ref ?? null,
        safetyMetadataSha256: input.policy.safetyMetadataRef?.sha256 ?? null,
        status,
        updatedAtMs: input.nowMs,
        updatedByPrincipalId: input.principalId ?? null,
        validatedAtMs: input.nowMs,
        version,
      };
      if (existing === undefined) {
        database.insert(table).values(values).run();
      } else {
        database
          .update(table)
          .set(values)
          .where(and(eq(table.agentId, agentId), eq(table.policyRef, input.policy.policyRef)))
          .run();
      }
      const row = getPolicy(agentId, database, input.policy.policyRef);
      if (row === undefined) throw new Error('model policy upsert did not return a row.');
      return row;
    },
    validatePolicy: validateAgentModelPolicy,
  };
}

/**
 * Model policy の deterministic digest を計算します。
 *
 * @param policy digest 対象の secret-free policy 入力です。
 * @param version policy version です。
 * @returns 64 文字の lowercase hexadecimal digest です。
 * @throws deterministic stringify または SHA-256 digest 計算が失敗した場合に呼び出し元へ伝播します。
 */
export function computeAgentModelPolicyDigest(
  policy: AgentModelPolicyInputRecord,
  version: number
): string {
  return stableHexDigest(
    stableStringify({
      budgetMetadataRef: normalizePayloadRef(policy.budgetMetadataRef),
      credentialRef: policy.credentialRef ?? null,
      decisionSchemaVersion: policy.decisionSchemaVersion,
      generationParametersRef: normalizePayloadRef(policy.generationParametersRef),
      modelId: policy.modelId,
      policyRef: policy.policyRef,
      provider: policy.provider,
      safeMetadataRef: normalizePayloadRef(policy.safeMetadataRef),
      safetyMetadataRef: normalizePayloadRef(policy.safetyMetadataRef),
      status: normalizeModelPolicyStatus(policy.status),
      version,
    })
  );
}

/**
 * Model policy 入力を保存前に検証します。
 *
 * @param policy 検証対象の policy 入力です。
 * @param checkedAtMs 検証時刻です。
 * @returns 状態変更なしで返せる validation 結果です。
 * @throws この関数は validation issue を戻り値へ格納するため例外を投げません。
 */
export function validateAgentModelPolicy(
  policy: AgentModelPolicyInputRecord,
  checkedAtMs: number
): AgentModelPolicyValidationRecord {
  const issues: AgentModelPolicyValidationIssueRecord[] = [];
  const warnings: AgentModelPolicyValidationIssueRecord[] = [];
  const generationParameters = readAgentModelPolicyGenerationParameters(policy);
  issues.push(...generationParameters.issues);
  if (policy.policyRef.trim() === '') {
    issues.push(createIssue('policy_ref_required', 'policy_ref must not be empty.', 'policy_ref'));
  }
  if (policy.provider !== 'workers-ai') {
    issues.push(
      createIssue('unsupported_provider', 'Only workers-ai provider is supported.', 'provider')
    );
  }
  if (!isSupportedWorkersAiModel(policy.modelId)) {
    issues.push(
      createIssue('unsupported_model', 'Workers AI model_id must use an @cf/ model.', 'model_id')
    );
  }
  if (policy.decisionSchemaVersion !== 'v1') {
    issues.push(
      createIssue(
        'unsupported_decision_schema',
        'Only decision schema version v1 is supported.',
        'decision_schema_version'
      )
    );
  }
  if (normalizeModelPolicyStatus(policy.status) === 'archived') {
    warnings.push(
      createIssue(
        'archived_on_write',
        'Archived policy cannot be selected by new Runs.',
        'status',
        'warning'
      )
    );
  }
  if (containsSecretLikeValue(policy.credentialRef)) {
    issues.push(
      createIssue(
        'unsafe_credential_reference',
        'credential_reference must be a safe reference, not secret material.',
        'credential_reference'
      )
    );
  }
  const ok = issues.length === 0;
  return {
    checkedAtMs,
    issues,
    modelId: policy.modelId,
    ok,
    policyDigest: ok ? computeAgentModelPolicyDigest(policy, 1) : undefined,
    policyRef: policy.policyRef,
    provider: policy.provider,
    safeMetadataRef: policy.safeMetadataRef,
    status: normalizeModelPolicyStatus(policy.status),
    warnings,
  };
}

/**
 * `normalizeModelPolicyStatus` は Agent Service の内部境界で利用する exported 関数です。
 *
 * @remarks
 * この関数は Agent-owned Durable Object / storage / RPC adapter の責務内で呼び出されます。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 * @param value 正規化する model policy status 文字列、または未指定値です。
 * @returns Agent model policy status として保存できる `active`、`disabled`、または `archived` です。
 * @throws この関数は未知値を `active` に正規化するため例外を投げません。
 */
export function normalizeModelPolicyStatus(value: string | undefined): AgentModelPolicyStatus {
  if (value === 'disabled' || value === 'archived') return value;
  return 'active';
}

function getPolicy(
  agentId: string,
  database: AgentStorageDatabase,
  policyRef: string
): AgentModelPolicyRow | undefined {
  const table = agentStorageDrizzleSchema.agentModelPolicies;
  return database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.policyRef, policyRef)))
    .limit(1)
    .get();
}

function rowToDigestInput(
  row: AgentModelPolicyRow,
  status: AgentModelPolicyStatus
): AgentModelPolicyInputRecord {
  return {
    budgetMetadataRef: refFromRow(row.budgetMetadataRef, row.budgetMetadataSha256),
    credentialRef: row.credentialRef ?? undefined,
    decisionSchemaVersion: row.decisionSchemaVersion,
    generationParametersRef: refFromRow(
      row.generationParametersRef,
      row.generationParametersSha256
    ),
    modelId: row.modelId,
    policyRef: row.policyRef,
    provider: row.provider,
    safeMetadataRef: refFromRow(row.safeMetadataRef, row.safeMetadataSha256),
    safetyMetadataRef: refFromRow(row.safetyMetadataRef, row.safetyMetadataSha256),
    status,
  };
}

function refFromRow(
  ref: string | null,
  sha256: string | null
): AgentModelPolicyPayloadRefInput | undefined {
  return ref === null ? undefined : { ref, sha256: sha256 ?? undefined, storageClass: 'reference' };
}

function createIssue(
  code: string,
  safeMessage: string,
  target: string,
  severity: 'error' | 'warning' = 'error'
): AgentModelPolicyValidationIssueRecord {
  return { code, retryable: false, safeMessage, severity, target };
}

function isSupportedWorkersAiModel(modelId: string): boolean {
  return modelId.startsWith('@cf/') && modelId.length <= 256;
}

function containsSecretLikeValue(value: string | undefined): boolean {
  if (value === undefined || value === '') return false;
  return /bearer|secret|token|sk-|-{5}begin/i.test(value);
}

function normalizePayloadRef(ref: AgentModelPolicyPayloadRefInput | undefined) {
  if (ref === undefined) return null;
  return {
    byteSize: ref.byteSize ?? 0,
    contentType: ref.contentType ?? 'application/octet-stream',
    ref: ref.ref,
    sha256: ref.sha256 ?? '',
    storageClass: ref.storageClass ?? 'reference',
  };
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>).sort(([left], [right]) =>
          left.localeCompare(right)
        )
      );
    }
    return item;
  });
}

function stableHexDigest(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }
  const chunk = hash.toString(16).padStart(16, '0');
  return `${chunk}${chunk}${chunk}${chunk}`;
}
