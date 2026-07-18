import { z } from 'zod';

const POLICY_REF_RE = /^[\da-z][\da-z-]{0,63}$/;
const WORKERS_AI_PROVIDER = 'workers-ai' as const;
const FIRST_PRINTABLE_ASCII_CODE_POINT = 0x20;
const DELETE_CONTROL_CODE_POINT = 0x7f;

/**
 * Management Client がブラウザへ渡してよい model policy provider です。
 *
 * @remarks
 * この変更では Workers AI だけを UI から選択可能にします。provider credential や
 * secret material は provider 名ではなく server-only 境界で解決されるため、この union は
 * 表示と validation のための安全な識別子だけを表します。
 */
export type BrowserSafeModelPolicyProvider = typeof WORKERS_AI_PROVIDER;

/**
 * ブラウザに表示できる model policy status の一覧です。
 *
 * @remarks
 * Agent RPC から返る status を UI の badge/copy へ写すための安全な値です。
 * `active` 以外は Run selection に使えない状態として表示し、秘密値や raw model payload は
 * 一切含みません。
 */
export type BrowserSafeModelPolicyStatus =
  | 'active'
  | 'disabled'
  | 'archived'
  | 'validation_pending'
  | 'unavailable';

/**
 * Browser が UI 分岐に使ってよい model policy error 分類です。
 *
 * @remarks
 * Agent RPC の例外 object や stack trace を Browser へ渡さず、permission denied のような
 * 操作制御に必要な安全な category だけを Server Action が変換して返します。
 */
export type BrowserSafeModelPolicyErrorCategory =
  | 'invalid_argument'
  | 'permission_denied'
  | 'not_found'
  | 'failed_precondition'
  | 'unavailable'
  | 'unknown';

/**
 * Model policy 入力欄の field 名です。
 *
 * @remarks
 * Registration と Settings の両方で同じ順序の validation summary と focus 移動を行うために使います。
 */
export const MODEL_POLICY_FIELD_ORDER = [
  'policyRef',
  'provider',
  'model',
  'temperature',
  'topP',
  'maxOutputTokens',
] as const;

/**
 * Model policy field 名の union です。
 *
 * @remarks
 * Server Action から返る field-level error と React Hook Form の field 名を一致させます。
 */
export type ModelPolicyFieldName = (typeof MODEL_POLICY_FIELD_ORDER)[number];

/**
 * Browser-safe な generation parameter 表示値です。
 *
 * @remarks
 * 値は UI 表示と form 送信のために文字列で保持します。Server Action が Agent RPC payload を
 * 作る直前に数値へ正規化し、Client D1 へ正本として保存しません。
 */
export interface BrowserSafeModelPolicyGenerationParameters {
  readonly temperature: string;
  readonly topP: string;
  readonly maxOutputTokens: string;
}

/**
 * Browser-safe な model policy validation warning です。
 *
 * @remarks
 * `message` は server-side normalization 後の安全な文言だけを保持します。stack trace、
 * endpoint、raw request/response、prompt、completion、reasoning、secret は含めません。
 */
export interface BrowserSafeModelPolicyWarning {
  readonly code: string;
  readonly message: string;
  readonly severity?: string;
  readonly target?: string;
  readonly retryable?: boolean;
}

/**
 * Browser に表示できる current/default model policy metadata です。
 *
 * @remarks
 * Agent-owned policy body の正本ではなく、Agent RPC から取得または mutation 成功時に返された
 * ref/digest/provider/model/status/version だけを保持します。Provider credential、Agent credential、
 * raw prompt、raw completion、raw reasoning は property として持ちません。
 */
export interface BrowserSafeModelPolicyMetadata {
  readonly policyRef: string;
  readonly digest: string;
  readonly provider: BrowserSafeModelPolicyProvider;
  readonly model: string;
  readonly version: string;
  readonly status: BrowserSafeModelPolicyStatus;
  readonly configVersion?: string;
  readonly decisionSchemaVersion?: string;
  readonly generationParameters?: BrowserSafeModelPolicyGenerationParameters;
  readonly warnings: readonly BrowserSafeModelPolicyWarning[];
}

/**
 * Model policy field ごとの browser-safe error map です。
 *
 * @remarks
 * Server Action は Agent RPC error をこの map と form-level safe copy へ変換し、raw exception を
 * browser payload へ渡しません。
 */
export type BrowserSafeModelPolicyFieldErrors = Partial<Record<ModelPolicyFieldName, string>>;

/**
 * Validate/upsert/archive/get 系 model policy mutation の browser-safe result です。
 *
 * @remarks
 * 成功時は safe metadata、失敗時は field-level/form-level の安全な文言だけを返します。
 * generated RPC message をそのまま Client Component に渡さないための UI 境界 contract です。
 */
export interface BrowserSafeModelPolicyMutationResult {
  readonly ok: boolean;
  readonly metadata?: BrowserSafeModelPolicyMetadata;
  readonly fieldErrors: BrowserSafeModelPolicyFieldErrors;
  readonly errorCategory?: BrowserSafeModelPolicyErrorCategory;
  readonly formError?: string;
  readonly warnings: readonly BrowserSafeModelPolicyWarning[];
}

/**
 * Settings の default model policy 保存結果です。
 *
 * @remarks
 * `configVersion` は Agent RPC の `UpdateConfig` 成功後にだけ設定します。Browser はこの値を
 * 楽観的に生成せず、server response 由来の値だけを表示します。
 */
export interface BrowserSafeModelPolicySaveResult extends BrowserSafeModelPolicyMutationResult {
  readonly configVersion?: string;
}

/**
 * Model policy form が保持する browser-safe draft 値です。
 *
 * @remarks
 * Provider/model/generation parameter だけを含みます。credential lookup path や direct Agent RPC
 * transport 情報は持たせず、Server Action が server-only 境界で必要な credential を解決します。
 */
export interface ModelPolicyDraftValues {
  readonly policyRef: string;
  readonly provider: BrowserSafeModelPolicyProvider;
  readonly model: string;
  readonly temperature: string;
  readonly topP: string;
  readonly maxOutputTokens: string;
}

/**
 * 新規作成と Settings の初期表示に使う default model policy draft です。
 *
 * @remarks
 * UI の placeholder/default を固定し、Server Action へ渡す前に同じ Zod schema で検証します。
 */
export const DEFAULT_MODEL_POLICY_DRAFT_VALUES = {
  policyRef: 'workers-ai-default',
  provider: WORKERS_AI_PROVIDER,
  model: '@cf/meta/llama-3.1-8b-instruct',
  temperature: '0.20',
  topP: '0.90',
  maxOutputTokens: '1024',
} as const satisfies ModelPolicyDraftValues;

/**
 * Model policy draft の browser/server 共通 Zod schema です。
 *
 * @remarks
 * Client-side validation は operator feedback 用、Server Action 側の同じ schema は Agent RPC 前の
 * fail-closed guard として使います。Agent-owned policy の正本保存可否は Agent Service の
 * `ValidateModelPolicy` / `UpsertModelPolicy` が最終判定します。
 */
export const modelPolicyDraftSchema = z.object({
  policyRef: z
    .string()
    .trim()
    .min(1, 'Policy ref is required.')
    .regex(POLICY_REF_RE, 'Policy ref must be lowercase kebab-case (max 64 chars).'),
  provider: z.literal(WORKERS_AI_PROVIDER, {
    message: 'Only workers-ai provider is available for this change.',
  }),
  model: z
    .string()
    .trim()
    .min(1, 'Model ID is required.')
    .max(160, 'Model ID must be 160 characters or fewer.')
    .refine(isSafeModelIdentifier, 'Model ID must not contain whitespace or control characters.'),
  temperature: decimalStringSchema('Temperature', 0, 2, true),
  topP: decimalStringSchema('Top P', 0.01, 1, true),
  maxOutputTokens: z
    .string()
    .trim()
    .min(1, 'Max output tokens is required.')
    .refine((value) => /^\d+$/.test(value), 'Max output tokens must be an integer.')
    .refine((value) => {
      const parsed = Number(value);
      return parsed >= 1 && parsed <= 8192;
    }, 'Max output tokens must be between 1 and 8192.'),
});

/**
 * default model policy draft の fresh copy を作ります。
 *
 * @returns form defaultValues に渡せる browser-safe draft 値です。
 * @remarks
 * object を毎回作り直し、React Hook Form の mutation が shared constant に波及しないようにします。
 */
export function buildDefaultModelPolicyDraftValues(): ModelPolicyDraftValues {
  return { ...DEFAULT_MODEL_POLICY_DRAFT_VALUES };
}

/**
 * Model policy draft 値を schema で検査し、field error map に変換します。
 *
 * @param values - Browser または Server Action 境界から受け取った draft 値です。
 * @returns field ごとの安全な error message map です。error がない場合は空 object を返します。
 */
export function validateModelPolicyDraftValues(
  values: ModelPolicyDraftValues
): BrowserSafeModelPolicyFieldErrors {
  const result = modelPolicyDraftSchema.safeParse(values);
  if (result.success) {
    return {};
  }
  return modelPolicyZodErrorToFieldErrors(result.error);
}

/**
 * Model policy draft を trim 済みの schema 成功値へ正規化します。
 *
 * @param values - 未正規化の form draft 値です。
 * @returns schema を通過した browser-safe draft 値です。
 * @throws draft が不正な場合は `TypeError` を投げます。呼び出し側は field error map へ変換して表示します。
 */
export function normalizeModelPolicyDraftValues(
  values: ModelPolicyDraftValues
): ModelPolicyDraftValues {
  const result = modelPolicyDraftSchema.safeParse(values);
  if (!result.success) {
    throw new TypeError('Model policy draft is invalid.');
  }
  return result.data;
}

function decimalStringSchema(label: string, min: number, max: number, scale2: boolean) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .refine((value) => /^\d+(?:\.\d+)?$/.test(value), `${label} must be a number.`)
    .refine((value) => !scale2 || /^\d+(?:\.\d{1,2})?$/.test(value), {
      message: `${label} supports up to 2 decimal places.`,
    })
    .refine(
      (value) => {
        const parsed = Number(value);
        return parsed >= min && parsed <= max;
      },
      `${label} must be between ${String(min)} and ${String(max)}.`
    );
}

function isSafeModelIdentifier(value: string): boolean {
  return !/\s/.test(value) && !containsControlCodePoint(value);
}

function containsControlCodePoint(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      (codePoint < FIRST_PRINTABLE_ASCII_CODE_POINT || codePoint === DELETE_CONTROL_CODE_POINT)
    ) {
      return true;
    }
  }
  return false;
}

function modelPolicyZodErrorToFieldErrors(error: z.ZodError): BrowserSafeModelPolicyFieldErrors {
  const errors: BrowserSafeModelPolicyFieldErrors = {};
  for (const issue of error.issues) {
    const fieldName = issue.path[0];
    if (isModelPolicyFieldName(fieldName)) {
      setModelPolicyFieldError(errors, fieldName, issue.message);
    }
  }
  return errors;
}

function setModelPolicyFieldError(
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

function isModelPolicyFieldName(fieldName: unknown): fieldName is ModelPolicyFieldName {
  return (
    typeof fieldName === 'string' &&
    MODEL_POLICY_FIELD_ORDER.includes(fieldName as ModelPolicyFieldName)
  );
}
