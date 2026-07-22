import { z } from 'zod';

import {
  buildDefaultModelPolicyDraftValues,
  MODEL_POLICY_FIELD_ORDER,
  modelPolicyDraftSchema,
  normalizeModelPolicyDraftValues,
  validateModelPolicyDraftValues,
  type ModelPolicyDraftValues,
  type ModelPolicyFieldName,
} from './model-policy';

import type {
  BrowserSafeAgentRpcResult,
  BrowserSafeOperationDisplayData,
} from './browser-safe-result';

const AGENT_ID_RE = /^[\da-z][\da-z-]{0,62}$/;
const VALID_STATUSES = ['active', 'pending', 'rotating'] as const;

/**
 * Agent 登録 form の validation summary と focus 制御に使う field 順序です。
 *
 * @remarks
 * `react-hook-form` と server validation の error を user-facing な順序で表示するために使います。
 * この配列自体に副作用はなく、field 名の source of truth として form helper から参照されます。
 */
export const REGISTRATION_FIELD_ORDER = [
  'agentId',
  'agentRpcOrigin',
  'displayName',
  'displayOrder',
  'modelPolicy.policyRef',
  'modelPolicy.provider',
  'modelPolicy.model',
  'modelPolicy.temperature',
  'modelPolicy.topP',
  'modelPolicy.maxOutputTokens',
  'referenceValue',
  'keyId',
  'publicFingerprint',
  'maskedHint',
  'status',
] as const;

/**
 * add/edit Agent form が受け付ける登録 field 名です。
 *
 * @remarks
 * `REGISTRATION_FIELD_ORDER` から導出し、schema、error map、focus helper の field 名取り違えを防ぎます。
 */
export type RegistrationFieldName = (typeof REGISTRATION_FIELD_ORDER)[number];

/**
 * form-level error summary に表示する登録 field label の対応表です。
 *
 * @remarks
 * validation message を operator が修正しやすい表示名へ変換します。Server Action や credential 解決には使いません。
 */
export const FIELD_LABELS: Record<RegistrationFieldName, string> = {
  agentId: 'Agent ID',
  agentRpcOrigin: 'Agent RPC origin',
  displayName: '表示名',
  displayOrder: '表示順（任意）',
  'modelPolicy.policyRef': 'ポリシー参照',
  'modelPolicy.provider': 'プロバイダー',
  'modelPolicy.model': 'モデルID',
  'modelPolicy.temperature': '温度',
  'modelPolicy.topP': 'Top P',
  'modelPolicy.maxOutputTokens': '最大出力トークン数',
  referenceValue: 'credential参照',
  keyId: 'キーID',
  publicFingerprint: '公開フィンガープリント',
  maskedHint: 'マスク済みヒント',
  status: '状態',
};

/**
 * server-side Agent registration validation を mirrored する Zod schema です。
 *
 * @remarks
 * Client-side validation は operator の即時 feedback 用であり、最終的な write 可否は Server Action と Client D1 repository が判定します。
 * plaintext secret は扱わず、credential reference と metadata だけを検査します。schema は DOM/network 副作用を持ちません。
 *
 * @example
 * ```ts
 * const result = registrationSchema.safeParse(values);
 * ```
 */
export const registrationSchema = z.object({
  agentId: z
    .string()
    .trim()
    .min(1, 'Agent IDを入力してください。')
    .regex(AGENT_ID_RE, 'Agent IDは63文字以内の小文字kebab-caseで入力してください。'),
  agentRpcOrigin: z
    .string()
    .trim()
    .min(1, '有効なHTTPS Agent RPC originを入力してください。')
    .max(2048, '有効なHTTPS Agent RPC originを入力してください。')
    .refine(isHttpsUrl, '有効なHTTPS Agent RPC originを入力してください。')
    .refine(
      hasOriginComponentsOnly,
      'scheme、host、任意のportで構成されたoriginを入力してください。'
    ),
  displayName: z
    .string()
    .trim()
    .min(1, '表示名を1〜80文字で入力してください。')
    .max(80, '表示名を1〜80文字で入力してください。'),
  displayOrder: z
    .string()
    .trim()
    .refine((value) => value === '' || /^\d+$/.test(value), {
      message: '表示順は0以上の整数で入力してください。',
    }),
  modelPolicy: modelPolicyDraftSchema,
  referenceValue: z
    .string()
    .trim()
    .min(1, 'credential参照を1〜512文字で入力してください。')
    .max(512, 'credential参照を1〜512文字で入力してください。'),
  keyId: z
    .string()
    .trim()
    .min(1, 'キーIDを1〜128文字で入力してください。')
    .max(128, 'キーIDを1〜128文字で入力してください。'),
  publicFingerprint: z
    .string()
    .trim()
    .min(1, '公開フィンガープリントを1〜128文字で入力してください。')
    .max(128, '公開フィンガープリントを1〜128文字で入力してください。'),
  maskedHint: z
    .string()
    .trim()
    .min(1, 'マスク済みヒントを1〜64文字で入力してください。')
    .max(64, 'マスク済みヒントを1〜64文字で入力してください。'),
  status: z.string().refine(isAllowedStatus, {
    message: '状態はactive、pending、rotatingのいずれかを選択してください。',
  }),
});

/**
 * Agent registration form が収集する入力値です。
 *
 * @remarks
 * `registrationSchema` から導出し、form field、schema、Server Action payload の型を揃えます。
 * secret 本体ではなく credential reference metadata だけを含みます。
 */
export type RegistrationValues = z.infer<typeof registrationSchema>;

/**
 * 登録 attempt の server-side 確定状態を Browser-safe 表示へ対応付ける値です。
 *
 * @remarks
 * `active` は Agent の完全一致確認済み、`reconciliation_required` は同じ attempt の確認継続中、
 * `re_registration_ready` は normalized `not_found` と Client cleanup 完了後に新しい登録を開始できる状態です。
 * attempt ID、idempotency key、request digest はこの値へ含めません。
 */
export type RegistrationOutcome = 'active' | 'reconciliation_required' | 're_registration_ready';

/**
 * Registration flow の policy 検証 button が受け取る browser-safe result です。
 *
 * @remarks
 * Agent 作成前の draft validation は Server Action 経由で Agent RPC に閉じます。成功時は
 * safe warning だけ、失敗時は registration field 名に変換済みの error だけを返し、credential secret や
 * direct RPC payload は Browser に渡しません。Server Action の検証失敗や transport 障害は例外として
 * Browser へ送出せず、`safeStatus='failed'` と安全な分類・表示文言へ正規化します。
 *
 * @example
 * ```ts
 * const result: RegistrationPolicyValidationResult = await validatePolicy(values);
 * if (result.safeStatus === 'failed') {
 *   form.setError('root', { message: result.displayData.message });
 * }
 * ```
 */
export type RegistrationPolicyValidationResult = BrowserSafeAgentRpcResult<
  BrowserSafeOperationDisplayData & {
    readonly warnings: readonly { readonly code: string; readonly message: string }[];
    readonly fieldErrors: Partial<Record<RegistrationFieldName, string>>;
  }
>;

/**
 * Agent registration form が受け取る Server Action result です。
 *
 * @remarks
 * 成功時は登録済み Agent ID を返し、失敗時は field-level error と form-level error を返します。
 * credential secret material は含めず、browser-safe な表示情報だけを返す contract です。response loss などで
 * Agent profile/config 照合が必要な場合は `reconciliationRequired` だけを明示し、固定 idempotency key/digest は Browser に公開しません。
 * 入力不正、認証・認可失敗、設定不備、transport 障害、照合継続は例外として送出せず、失敗側の四属性
 * `displayData`、`safeStatus`、`safeErrorCategory`、`correlationId`で表現します。
 *
 * @example
 * ```ts
 * const result: RegistrationSubmitResult = await submitRegistration(values);
 * if (result.displayData.reconciliationRequired === true) {
 *   // 「登録状態を確認」だけを有効化し、入力を保持する。
 * }
 * ```
 */
export type RegistrationSubmitResult = BrowserSafeAgentRpcResult<
  BrowserSafeOperationDisplayData & {
    readonly agentId?: string;
    readonly displayName?: string;
    readonly fieldErrors: Partial<Record<RegistrationFieldName, string>>;
    readonly reconciliationRequired?: boolean;
    readonly registrationOutcome?: RegistrationOutcome;
  }
>;

/**
 * registration 入力を検査し、field error map に変換します。
 *
 * @param values - `registrationSchema` と同じ形の registration 入力です。
 * @returns field ごとの error message map です。error がない場合は空 object を返します。
 * @remarks
 * Server Action 前の補助 validation と tests のための helper です。D1 write や Agent RPC 呼び出しは行いません。
 */
export function validateRegistrationValues(
  values: RegistrationValues
): Partial<Record<RegistrationFieldName, string>> {
  const result = registrationSchema.safeParse(values);
  if (result.success) {
    return {};
  }
  return zodErrorToFieldErrors(result.error);
}

/**
 * Registration form 用の default 値に入れる model policy draft を作ります。
 *
 * @returns 新規 Agent 作成時に使う browser-safe default policy draft です。
 * @remarks
 * 既存編集時も policy input は Agent-owned policy の正本ではなく draft なので、Agent RPC から取得した
 * safe metadata がない場合はこの default から開始します。
 */
export function buildRegistrationModelPolicyDefaults(): ModelPolicyDraftValues {
  return buildDefaultModelPolicyDraftValues();
}

/**
 * Registration Server Action が受け取った model policy draft を正規化します。
 *
 * @param values - registration form 内の `modelPolicy` field 値です。
 * @returns trim と schema validation を通過した draft 値です。
 * @throws 不正な値の場合は `TypeError` を投げます。通常は `validateRegistrationValues` で事前に field error へ変換します。
 */
export function normalizeRegistrationModelPolicyValues(
  values: ModelPolicyDraftValues
): ModelPolicyDraftValues {
  return normalizeModelPolicyDraftValues(values);
}

/**
 * Model policy field error を registration field 名へ変換します。
 *
 * @param fieldErrors - policy field 名を key にした error map です。
 * @returns `modelPolicy.*` 形式へ変換した registration error map です。
 * @remarks
 * Server Action は Agent RPC validation の target をこの helper で form field へ戻し、
 * focus と error summary を既存 registration form の順序へ揃えます。
 */
export function toRegistrationModelPolicyFieldErrors(
  fieldErrors: Partial<Record<ModelPolicyFieldName, string>>
): Partial<Record<RegistrationFieldName, string>> {
  const errors: Partial<Record<RegistrationFieldName, string>> = {};
  for (const fieldName of MODEL_POLICY_FIELD_ORDER) {
    const message = getModelPolicyFieldError(fieldErrors, fieldName);
    if (message !== undefined) {
      setRegistrationFieldError(errors, `modelPolicy.${fieldName}`, message);
    }
  }
  return errors;
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function hasOriginComponentsOnly(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.username === '' &&
      url.password === '' &&
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
}

function isAllowedStatus(status: string): boolean {
  return VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number]);
}

function zodErrorToFieldErrors(error: z.ZodError): Partial<Record<RegistrationFieldName, string>> {
  const errors: Partial<Record<RegistrationFieldName, string>> = {};
  for (const issue of error.issues) {
    const fieldName = pathToRegistrationFieldName(issue.path);
    if (isRegistrationFieldName(fieldName)) {
      setRegistrationFieldError(errors, fieldName, issue.message);
    }
  }
  return errors;
}

function setRegistrationFieldError(
  errors: Partial<Record<RegistrationFieldName, string>>,
  fieldName: RegistrationFieldName,
  message: string
): void {
  if (fieldName === 'agentId' && errors.agentId === undefined) errors.agentId = message;
  if (fieldName === 'agentRpcOrigin' && errors.agentRpcOrigin === undefined) {
    errors.agentRpcOrigin = message;
  }
  if (fieldName === 'displayName' && errors.displayName === undefined) {
    errors.displayName = message;
  }
  if (fieldName === 'displayOrder' && errors.displayOrder === undefined) {
    errors.displayOrder = message;
  }
  if (fieldName === 'modelPolicy.policyRef' && errors['modelPolicy.policyRef'] === undefined) {
    errors['modelPolicy.policyRef'] = message;
  }
  if (fieldName === 'modelPolicy.provider' && errors['modelPolicy.provider'] === undefined) {
    errors['modelPolicy.provider'] = message;
  }
  if (fieldName === 'modelPolicy.model' && errors['modelPolicy.model'] === undefined) {
    errors['modelPolicy.model'] = message;
  }
  if (fieldName === 'modelPolicy.temperature' && errors['modelPolicy.temperature'] === undefined) {
    errors['modelPolicy.temperature'] = message;
  }
  if (fieldName === 'modelPolicy.topP' && errors['modelPolicy.topP'] === undefined) {
    errors['modelPolicy.topP'] = message;
  }
  if (
    fieldName === 'modelPolicy.maxOutputTokens' &&
    errors['modelPolicy.maxOutputTokens'] === undefined
  ) {
    errors['modelPolicy.maxOutputTokens'] = message;
  }
  if (fieldName === 'referenceValue' && errors.referenceValue === undefined) {
    errors.referenceValue = message;
  }
  if (fieldName === 'keyId' && errors.keyId === undefined) errors.keyId = message;
  if (fieldName === 'publicFingerprint' && errors.publicFingerprint === undefined) {
    errors.publicFingerprint = message;
  }
  if (fieldName === 'maskedHint' && errors.maskedHint === undefined) {
    errors.maskedHint = message;
  }
  if (fieldName === 'status' && errors.status === undefined) errors.status = message;
}

function isRegistrationFieldName(fieldName: unknown): fieldName is RegistrationFieldName {
  return (
    typeof fieldName === 'string' &&
    REGISTRATION_FIELD_ORDER.includes(fieldName as RegistrationFieldName)
  );
}

function pathToRegistrationFieldName(path: readonly (string | number | symbol)[]): unknown {
  const first = path[0];
  const second = path[1];
  if (first === 'modelPolicy' && typeof second === 'string') {
    return `modelPolicy.${second}`;
  }
  return first;
}

function getModelPolicyFieldError(
  fieldErrors: Partial<Record<ModelPolicyFieldName, string>>,
  fieldName: ModelPolicyFieldName
): string | undefined {
  if (fieldName === 'policyRef') return fieldErrors.policyRef;
  if (fieldName === 'provider') return fieldErrors.provider;
  if (fieldName === 'model') return fieldErrors.model;
  if (fieldName === 'temperature') return fieldErrors.temperature;
  if (fieldName === 'topP') return fieldErrors.topP;
  return fieldErrors.maxOutputTokens;
}

/**
 * Registration model policy draft だけを検査し、registration field 名の error map へ変換します。
 *
 * @param values - `modelPolicy` object の draft 値です。
 * @returns registration form にそのまま適用できる field error map です。
 */
export function validateRegistrationModelPolicyValues(
  values: ModelPolicyDraftValues
): Partial<Record<RegistrationFieldName, string>> {
  return toRegistrationModelPolicyFieldErrors(validateModelPolicyDraftValues(values));
}
