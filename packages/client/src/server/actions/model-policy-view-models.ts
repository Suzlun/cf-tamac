import 'server-only';

import {
  MODEL_POLICY_FIELD_ORDER,
  normalizeModelPolicyDraftValues,
} from '../../components/schemas/model-policy';

import {
  toOptionalString,
  toSafeRecord,
  toSafeString,
  toSafeStringFromInt64,
} from './browser-safe-helpers';

import type {
  BrowserSafeModelPolicyFieldErrors,
  BrowserSafeModelPolicyErrorCategory,
  BrowserSafeModelPolicyGenerationParameters,
  BrowserSafeModelPolicyMetadata,
  BrowserSafeModelPolicyMutationResult,
  BrowserSafeModelPolicyProvider,
  BrowserSafeModelPolicyStatus,
  BrowserSafeModelPolicyWarning,
  ModelPolicyDraftValues,
  ModelPolicyFieldName,
} from '../../components/schemas/model-policy';

const DEFAULT_DECISION_SCHEMA_VERSION = 'v1';
const SAFE_JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const INLINE_STORAGE_CLASS = 'inline-safe-json';

/**
 * Agent RPC の model policy input に渡す plain object payload です。
 *
 * @remarks
 * Protobuf-ES の generated Message instance は server action 境界では plain object で構築します。
 * 値は provider/model/generation parameter の安全な draft と inline safe JSON 参照だけで、
 * Provider credential や raw model payload は含めません。
 */
export type AgentModelPolicyInputPayload = Record<string, unknown>;

/**
 * Browser-safe result の failure 形を作ります。
 *
 * @param formError - UI に表示する secret-free form-level error です。
 * @param fieldErrors - 任意の field-level error map です。
 * @param warnings - Agent RPC validation 由来の safe warning です。
 * @param errorCategory - UI の disabled/focus 制御に使う safe error 分類です。
 * @returns `ok: false` の mutation result です。
 */
export function createModelPolicyFailureResult(
  formError: string,
  fieldErrors: BrowserSafeModelPolicyFieldErrors = {},
  warnings: readonly BrowserSafeModelPolicyWarning[] = [],
  errorCategory: BrowserSafeModelPolicyErrorCategory = 'unknown'
): BrowserSafeModelPolicyMutationResult {
  return { ok: false, errorCategory, fieldErrors, formError, warnings };
}

/**
 * Browser draft から Agent RPC `AgentModelPolicyInput` 互換 payload を作ります。
 *
 * @param draft - Browser-safe model policy draft です。
 * @returns generated Agent RPC client へ渡す policy payload です。
 * @throws draft が schema に違反する場合は `TypeError` を投げます。
 * @remarks
 * generation parameter は safe JSON として inline payload reference に格納します。この payload は
 * Agent Service へ server-side RPC で送るためのもので、Client D1 には保存しません。
 */
export async function buildAgentModelPolicyInput(
  draft: ModelPolicyDraftValues
): Promise<AgentModelPolicyInputPayload> {
  const normalized = normalizeModelPolicyDraftValues(draft);
  const generationParameters = toGenerationParameters(normalized);
  const generationParametersRef = await buildInlineSafeJsonReference(
    `model-policy-generation:${normalized.policyRef}`,
    generationParameters
  );
  const safeMetadataRef = await buildInlineSafeJsonReference(
    `model-policy-safe:${normalized.policyRef}`,
    {
      generationParameters,
      model: normalized.model,
      policyRef: normalized.policyRef,
      provider: normalized.provider,
    }
  );

  return {
    policyRef: normalized.policyRef,
    provider: normalized.provider,
    modelId: normalized.model,
    status: 'active',
    decisionSchemaVersion: DEFAULT_DECISION_SCHEMA_VERSION,
    generationParametersRef,
    safeMetadataRef,
  };
}

/**
 * Agent RPC の policy/summary response を Browser-safe metadata へ変換します。
 *
 * @param value - `AgentModelPolicy` または `AgentModelPolicySummary` 互換の未検証 response 値です。
 * @param options - config version、fallback generation parameters、warning を補う任意値です。
 * @returns Browser に渡してよい metadata。値がない場合は `undefined` を返します。
 * @remarks
 * generated response をそのまま Client Component へ渡さず、safe fields だけを抽出します。
 * inline bytes があっても raw payload として返さず、許可した generation parameter だけを読み出します。
 */
export function toBrowserSafeModelPolicyMetadata(
  value: unknown,
  options: {
    readonly configVersion?: string;
    readonly fallbackGenerationParameters?: BrowserSafeModelPolicyGenerationParameters;
    readonly warnings?: readonly BrowserSafeModelPolicyWarning[];
  } = {}
): BrowserSafeModelPolicyMetadata | undefined {
  const record = toSafeRecord(value);
  if (record === undefined) {
    return undefined;
  }
  const generationParameters =
    readGenerationParameters(record.safeGenerationParametersRef) ??
    readGenerationParameters(record.safeMetadataRef) ??
    options.fallbackGenerationParameters;
  return {
    policyRef: toSafeString(record.policyRef),
    digest: toSafeString(record.policyDigest),
    provider: toBrowserSafeProvider(record.provider),
    model: toSafeString(record.modelId),
    version: toSafeStringFromInt64(record.version),
    status: toBrowserSafeStatus(record.status),
    configVersion: options.configVersion,
    decisionSchemaVersion: toOptionalString(record.decisionSchemaVersion),
    generationParameters,
    warnings: options.warnings ?? [],
  };
}

/**
 * Agent RPC validation response を Browser-safe mutation result へ変換します。
 *
 * @param validation - `AgentModelPolicyValidationResult` 互換の未検証値です。
 * @param preview - 任意の policy preview metadata です。
 * @param fallbackDraft - response に generation parameter がない場合に表示へ補う draft です。
 * @returns validation 成否、field error、safe warning を含む result です。
 */
export function toBrowserSafeModelPolicyValidationResult(
  validation: unknown,
  preview: unknown,
  fallbackDraft: ModelPolicyDraftValues
): BrowserSafeModelPolicyMutationResult {
  const record = toSafeRecord(validation);
  const warnings = toBrowserSafeModelPolicyWarnings(record?.warnings);
  const issues = toBrowserSafeModelPolicyWarnings(record?.issues);
  const metadata = toBrowserSafeModelPolicyMetadata(preview ?? validation, {
    fallbackGenerationParameters: toGenerationParameters(fallbackDraft),
    warnings,
  });
  const ok = record?.ok === true;
  if (ok) {
    return { ok: true, metadata, fieldErrors: {}, warnings };
  }
  return createModelPolicyFailureResult(
    'The policy draft is invalid. Fix the highlighted fields and validate again.',
    issuesToFieldErrors(issues),
    warnings
  );
}

/**
 * Agent RPC validation issue 配列を safe warning 配列へ変換します。
 *
 * @param value - generated validation issue 配列または未定義値です。
 * @returns Browser-safe な code/message/target 配列です。
 */
export function toBrowserSafeModelPolicyWarnings(
  value: unknown
): readonly BrowserSafeModelPolicyWarning[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((issue) => {
    const record = toSafeRecord(issue);
    return {
      code: toSafeString(record?.code, 'model_policy_warning'),
      message: toSafeString(record?.safeMessage, 'Model policy validation returned a warning.'),
      severity: toOptionalString(record?.severity),
      target: toOptionalString(record?.target),
      retryable: typeof record?.retryable === 'boolean' ? record.retryable : undefined,
    };
  });
}

/**
 * Agent RPC / infrastructure error を model policy UI 用の safe copy へ変換します。
 *
 * @param error - server-side RPC 呼び出しで捕捉した error です。
 * @returns Browser に表示してよい固定文言です。
 */
export function safeModelPolicyErrorMessage(error: unknown): string {
  const category = safeModelPolicyErrorCategory(error);
  switch (category) {
    case 'invalid_argument':
      return 'The policy draft is invalid. Fix the highlighted fields and validate again.';
    case 'permission_denied':
      return 'You do not have permission to update the default model policy.';
    case 'not_found':
      return 'The Agent does not have that model policy ref. Save an active policy before attaching it as the default.';
    case 'failed_precondition':
      return 'Only active model policies can be attached as the Agent default.';
    case 'unavailable':
      return 'Agent policy service is temporarily unavailable. Retry validation or save after connectivity is restored.';
    case 'unknown':
      return 'Default model policy could not be saved. Retry after verifying the highlighted fields.';
    default:
      return 'Default model policy could not be saved. Retry after verifying the highlighted fields.';
  }
}

/**
 * Agent RPC error を Browser が扱える model policy error category へ正規化します。
 *
 * @param error - Agent RPC wrapper や Server Action catch で受け取った unknown error です。
 * @returns UI 分岐に使える safe category です。未対応値は `unknown` に丸めます。
 * @remarks
 * Browser には Error instance、stack、transport metadata を渡さず、この category と安全な copy だけを返します。
 */
export function safeModelPolicyErrorCategory(error: unknown): BrowserSafeModelPolicyErrorCategory {
  const category = getErrorCategory(error);
  if (isModelPolicyErrorCategory(category)) {
    return category;
  }
  return 'unknown';
}

/**
 * Policy field error を Registration form の nested field 名へ変換します。
 *
 * @param fieldErrors - policy field 名の error map です。
 * @returns `modelPolicy.*` field 名の error map です。
 */
export function toRegistrationPolicyFieldErrors(
  fieldErrors: BrowserSafeModelPolicyFieldErrors
): Partial<Record<`modelPolicy.${ModelPolicyFieldName}`, string>> {
  const result: Partial<Record<`modelPolicy.${ModelPolicyFieldName}`, string>> = {};
  for (const fieldName of MODEL_POLICY_FIELD_ORDER) {
    const message = getFieldError(fieldErrors, fieldName);
    if (message !== undefined) {
      setRegistrationPolicyFieldError(result, fieldName, message);
    }
  }
  return result;
}

function toGenerationParameters(
  draft: ModelPolicyDraftValues
): BrowserSafeModelPolicyGenerationParameters {
  return {
    temperature: draft.temperature,
    topP: draft.topP,
    maxOutputTokens: draft.maxOutputTokens,
  };
}

async function buildInlineSafeJsonReference(
  ref: string,
  value: unknown
): Promise<Record<string, unknown>> {
  const canonical = JSON.stringify(value);
  const bytes = new TextEncoder().encode(canonical);
  const sha256 = await sha256Hex(bytes);
  return {
    ref,
    contentType: SAFE_JSON_CONTENT_TYPE,
    byteSize: BigInt(bytes.byteLength),
    sha256,
    storageClass: INLINE_STORAGE_CLASS,
    inlineBytes: bytes,
  };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const digestBytes = new Uint8Array(digest);
  let hex = '';
  for (const byte of digestBytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

function readGenerationParameters(
  value: unknown
): BrowserSafeModelPolicyGenerationParameters | undefined {
  const payload = readInlineJsonObject(value);
  const nested = toSafeRecord(payload?.generationParameters);
  const source = nested ?? payload;
  if (source === undefined) {
    return undefined;
  }
  return {
    temperature: toSafeString(source.temperature),
    topP: toSafeString(source.topP),
    maxOutputTokens: toSafeString(source.maxOutputTokens),
  };
}

function readInlineJsonObject(value: unknown): Record<string, unknown> | undefined {
  const record = toSafeRecord(value);
  const inlineBytes = record?.inlineBytes;
  if (!(inlineBytes instanceof Uint8Array)) {
    return undefined;
  }
  try {
    const decoded = new TextDecoder().decode(inlineBytes);
    return toSafeRecord(JSON.parse(decoded) as unknown);
  } catch {
    return undefined;
  }
}

function toBrowserSafeProvider(value: unknown): BrowserSafeModelPolicyProvider {
  return value === 'workers-ai' ? 'workers-ai' : 'workers-ai';
}

function toBrowserSafeStatus(value: unknown): BrowserSafeModelPolicyStatus {
  if (value === 'active' || value === 'disabled' || value === 'archived') {
    return value;
  }
  if (value === 'validation_pending' || value === 'unavailable') {
    return value;
  }
  return 'unavailable';
}

function issuesToFieldErrors(
  issues: readonly BrowserSafeModelPolicyWarning[]
): BrowserSafeModelPolicyFieldErrors {
  const errors: BrowserSafeModelPolicyFieldErrors = {};
  for (const issue of issues) {
    const fieldName = targetToFieldName(issue.target);
    if (fieldName !== undefined) {
      setFieldError(errors, fieldName, issue.message);
    }
  }
  return errors;
}

function targetToFieldName(target: string | undefined): ModelPolicyFieldName | undefined {
  if (target === undefined) return undefined;
  if (target === 'policy_ref' || target === 'policyRef') return 'policyRef';
  if (target === 'provider') return 'provider';
  if (target === 'model_id' || target === 'modelId' || target === 'model') return 'model';
  if (target.includes('temperature')) return 'temperature';
  if (target.includes('top_p') || target.includes('topP')) return 'topP';
  if (target.includes('max_output_tokens') || target.includes('maxOutputTokens')) {
    return 'maxOutputTokens';
  }
  return undefined;
}

function setFieldError(
  errors: BrowserSafeModelPolicyFieldErrors,
  fieldName: ModelPolicyFieldName,
  message: string
): void {
  if (fieldName === 'policyRef' && errors.policyRef === undefined) errors.policyRef = message;
  if (fieldName === 'provider' && errors.provider === undefined) errors.provider = message;
  if (fieldName === 'model' && errors.model === undefined) errors.model = message;
  if (fieldName === 'temperature' && errors.temperature === undefined) errors.temperature = message;
  if (fieldName === 'topP' && errors.topP === undefined) errors.topP = message;
  if (fieldName === 'maxOutputTokens' && errors.maxOutputTokens === undefined) {
    errors.maxOutputTokens = message;
  }
}

function getFieldError(
  fieldErrors: BrowserSafeModelPolicyFieldErrors,
  fieldName: ModelPolicyFieldName
): string | undefined {
  if (fieldName === 'policyRef') return fieldErrors.policyRef;
  if (fieldName === 'provider') return fieldErrors.provider;
  if (fieldName === 'model') return fieldErrors.model;
  if (fieldName === 'temperature') return fieldErrors.temperature;
  if (fieldName === 'topP') return fieldErrors.topP;
  return fieldErrors.maxOutputTokens;
}

function setRegistrationPolicyFieldError(
  errors: Partial<Record<`modelPolicy.${ModelPolicyFieldName}`, string>>,
  fieldName: ModelPolicyFieldName,
  message: string
): void {
  if (fieldName === 'policyRef') errors['modelPolicy.policyRef'] = message;
  if (fieldName === 'provider') errors['modelPolicy.provider'] = message;
  if (fieldName === 'model') errors['modelPolicy.model'] = message;
  if (fieldName === 'temperature') errors['modelPolicy.temperature'] = message;
  if (fieldName === 'topP') errors['modelPolicy.topP'] = message;
  if (fieldName === 'maxOutputTokens') errors['modelPolicy.maxOutputTokens'] = message;
}

function getErrorCategory(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('category' in error)) {
    return undefined;
  }
  const category = (error as { readonly category?: unknown }).category;
  return typeof category === 'string' ? category : undefined;
}

function isModelPolicyErrorCategory(
  category: string | undefined
): category is BrowserSafeModelPolicyErrorCategory {
  return (
    category === 'invalid_argument' ||
    category === 'permission_denied' ||
    category === 'not_found' ||
    category === 'failed_precondition' ||
    category === 'unavailable' ||
    category === 'unknown'
  );
}
