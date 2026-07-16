import { validateRegistrationModelPolicyValues } from '../../components/schemas/agent-registration';

import type { ModelPolicyDraftValues } from '../../components/schemas/model-policy';
const AGENT_ID_PATTERN = /^[\da-z][\da-z-]{0,62}$/;
const VALID_CREDENTIAL_STATUSES = ['active', 'pending', 'rotating'] as const;

type RegistrationFieldName =
  | 'agentId'
  | 'agentRpcOrigin'
  | 'displayName'
  | 'displayOrder'
  | 'modelPolicy.policyRef'
  | 'modelPolicy.provider'
  | 'modelPolicy.model'
  | 'modelPolicy.temperature'
  | 'modelPolicy.topP'
  | 'modelPolicy.maxOutputTokens'
  | 'referenceValue'
  | 'keyId'
  | 'publicFingerprint'
  | 'maskedHint'
  | 'status';

type RegistrationFieldErrors = Partial<Record<RegistrationFieldName, string>>;

/**
 * Server Action が正規化・検証した Agent 登録入力です。
 *
 * @remarks
 * Client D1 へ書き込む直前の値だけを表します。`agentRpcOrigin` は呼び出し元で allowlist と照合済みの
 * canonical HTTPS origin に差し替えられ、credential は参照 metadata だけを保持します。
 */
export interface NormalizedManagedAgentRegistrationInput {
  readonly agentId: string;
  readonly agentRpcOrigin: string;
  readonly displayName: string;
  readonly displayOrder: number;
  readonly modelPolicy: ModelPolicyDraftValues;
  readonly referenceValue: string;
  readonly keyId: string;
  readonly publicFingerprint: string;
  readonly maskedHint: string;
  readonly status: string;
}

/**
 * Browser から Server Action へ渡す安全なフィールド名の Agent 登録入力です。
 *
 * @remarks
 * この型は平文 secret や署名鍵を含みません。Server Action は正規化後に allowlist、Client D1、
 * server-only SDK adapter へ順番に渡します。
 */
export interface ManagedAgentRegistrationInput {
  readonly agentId: string;
  readonly agentRpcOrigin: string;
  readonly displayName: string;
  readonly displayOrder: string;
  readonly modelPolicy: ModelPolicyDraftValues;
  readonly referenceValue: string;
  readonly keyId: string;
  readonly publicFingerprint: string;
  readonly maskedHint: string;
  readonly status: string;
}

/**
 * 編集対象の identity を含む、登録永続化の任意設定です。
 *
 * @remarks
 * `existingAgentId` を指定した場合は既存 record の更新として扱い、新規 record を暗黙に作成しません。
 */
export interface ManagedAgentRegistrationOptions {
  readonly existingAgentId?: string;
}

/**
 * Client D1 書き込み前に行う Server Action 登録検証の結果です。
 *
 * @remarks
 * 失敗時は Browser フィールド名と安全な案内文だけを保持し、raw error や credential 情報は含めません。
 */
export type ManagedAgentRegistrationValidationResult =
  | { readonly ok: true; readonly value: NormalizedManagedAgentRegistrationInput }
  | { readonly ok: false; readonly fieldErrors: RegistrationFieldErrors };

/**
 * Client D1 に触れずに管理対象 Agent 登録フィールドを検証します。
 *
 * @param input - Browser-safe field 名で受け取った未正規化の登録入力です。
 * @returns 成功時は正規化値、失敗時はフィールドごとの安全な案内文を返します。
 * @remarks
 * origin allowlist との照合は、env を読む `submitManagedAgentRegistration` で永続化直前に行います。
 */
export function validateManagedAgentRegistrationInput(
  input: ManagedAgentRegistrationInput
): ManagedAgentRegistrationValidationResult {
  const normalized = normalizeRegistrationInput(input);
  const fieldErrors = collectRegistrationFieldErrors(normalized, input.displayOrder);
  if (hasFieldErrors(fieldErrors)) {
    return { ok: false, fieldErrors };
  }
  return { ok: true, value: normalized };
}

function normalizeRegistrationInput(
  input: ManagedAgentRegistrationInput
): NormalizedManagedAgentRegistrationInput {
  return {
    agentId: input.agentId.trim(),
    agentRpcOrigin: input.agentRpcOrigin.trim(),
    displayName: input.displayName.trim(),
    displayOrder: parseDisplayOrder(input.displayOrder),
    modelPolicy: normalizeModelPolicyDraft(input.modelPolicy),
    referenceValue: input.referenceValue.trim(),
    keyId: input.keyId.trim(),
    publicFingerprint: input.publicFingerprint.trim(),
    maskedHint: input.maskedHint.trim(),
    status: input.status.trim(),
  };
}

function normalizeModelPolicyDraft(modelPolicy: ModelPolicyDraftValues): ModelPolicyDraftValues {
  return {
    policyRef: modelPolicy.policyRef.trim(),
    provider: modelPolicy.provider,
    model: modelPolicy.model.trim(),
    temperature: modelPolicy.temperature.trim(),
    topP: modelPolicy.topP.trim(),
    maxOutputTokens: modelPolicy.maxOutputTokens.trim(),
  };
}

function collectRegistrationFieldErrors(
  input: NormalizedManagedAgentRegistrationInput,
  rawDisplayOrder: string
): RegistrationFieldErrors {
  const errors: RegistrationFieldErrors = {};
  addAgentIdentityErrors(errors, input);
  addModelPolicyErrors(errors, input.modelPolicy);
  addCredentialLookupErrors(errors, input);
  if (rawDisplayOrder.trim() !== '' && !/^\d+$/.test(rawDisplayOrder.trim())) {
    errors.displayOrder = '表示順は0以上の整数で入力してください。';
  }
  if (!isValidCredentialStatus(input.status)) {
    errors.status = '状態はactive、pending、rotatingのいずれかを選択してください。';
  }
  return errors;
}

function addModelPolicyErrors(
  errors: RegistrationFieldErrors,
  modelPolicy: ModelPolicyDraftValues
): void {
  const mappedErrors = validateRegistrationModelPolicyValues(modelPolicy);
  setRegistrationError(errors, 'modelPolicy.policyRef', mappedErrors['modelPolicy.policyRef']);
  setRegistrationError(errors, 'modelPolicy.provider', mappedErrors['modelPolicy.provider']);
  setRegistrationError(errors, 'modelPolicy.model', mappedErrors['modelPolicy.model']);
  setRegistrationError(errors, 'modelPolicy.temperature', mappedErrors['modelPolicy.temperature']);
  setRegistrationError(errors, 'modelPolicy.topP', mappedErrors['modelPolicy.topP']);
  setRegistrationError(
    errors,
    'modelPolicy.maxOutputTokens',
    mappedErrors['modelPolicy.maxOutputTokens']
  );
}

function addAgentIdentityErrors(
  errors: RegistrationFieldErrors,
  input: NormalizedManagedAgentRegistrationInput
): void {
  if (input.agentId === '') {
    errors.agentId = 'Agent IDを入力してください。';
  } else if (!AGENT_ID_PATTERN.test(input.agentId)) {
    errors.agentId = 'Agent IDは63文字以内の小文字kebab-caseで入力してください。';
  }
  if (!isValidHttpsUrl(input.agentRpcOrigin) || input.agentRpcOrigin.length > 2048) {
    errors.agentRpcOrigin = '有効なHTTPS Agent RPC originを入力してください。';
  } else if (!hasOriginComponentsOnly(input.agentRpcOrigin)) {
    errors.agentRpcOrigin = 'scheme、host、任意のportで構成されたoriginを入力してください。';
  }
  if (input.displayName === '' || input.displayName.length > 80) {
    errors.displayName = '表示名を1〜80文字で入力してください。';
  }
}

function addCredentialLookupErrors(
  errors: RegistrationFieldErrors,
  input: NormalizedManagedAgentRegistrationInput
): void {
  if (input.referenceValue === '' || input.referenceValue.length > 512) {
    errors.referenceValue = 'credential参照を1〜512文字で入力してください。';
  }
  if (input.keyId === '' || input.keyId.length > 128) {
    errors.keyId = 'キーIDを1〜128文字で入力してください。';
  }
  if (input.publicFingerprint === '' || input.publicFingerprint.length > 128) {
    errors.publicFingerprint = '公開フィンガープリントを1〜128文字で入力してください。';
  }
  if (input.maskedHint === '' || input.maskedHint.length > 64) {
    errors.maskedHint = 'マスク済みヒントを1〜64文字で入力してください。';
  }
}

function parseDisplayOrder(value: string): number {
  const trimmed = value.trim();
  if (trimmed === '' || !/^\d+$/.test(trimmed)) {
    return 0;
  }
  return Number.parseInt(trimmed, 10);
}

function isValidCredentialStatus(status: string): boolean {
  return VALID_CREDENTIAL_STATUSES.includes(status as (typeof VALID_CREDENTIAL_STATUSES)[number]);
}

function isValidHttpsUrl(value: string): boolean {
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
    // Browser schema と Server Action の前段検証を揃え、path、query、fragment、userinfo を拒否します。
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

function hasFieldErrors(errors: RegistrationFieldErrors): boolean {
  return (
    errors.agentId !== undefined ||
    errors.agentRpcOrigin !== undefined ||
    errors.displayName !== undefined ||
    errors.displayOrder !== undefined ||
    errors['modelPolicy.policyRef'] !== undefined ||
    errors['modelPolicy.provider'] !== undefined ||
    errors['modelPolicy.model'] !== undefined ||
    errors['modelPolicy.temperature'] !== undefined ||
    errors['modelPolicy.topP'] !== undefined ||
    errors['modelPolicy.maxOutputTokens'] !== undefined ||
    errors.referenceValue !== undefined ||
    errors.keyId !== undefined ||
    errors.publicFingerprint !== undefined ||
    errors.maskedHint !== undefined ||
    errors.status !== undefined
  );
}

function setRegistrationError(
  errors: RegistrationFieldErrors,
  fieldName: RegistrationFieldName,
  message: string | undefined
): void {
  if (message === undefined) {
    return;
  }
  if (fieldName === 'modelPolicy.policyRef') errors['modelPolicy.policyRef'] = message;
  if (fieldName === 'modelPolicy.provider') errors['modelPolicy.provider'] = message;
  if (fieldName === 'modelPolicy.model') errors['modelPolicy.model'] = message;
  if (fieldName === 'modelPolicy.temperature') errors['modelPolicy.temperature'] = message;
  if (fieldName === 'modelPolicy.topP') errors['modelPolicy.topP'] = message;
  if (fieldName === 'modelPolicy.maxOutputTokens') errors['modelPolicy.maxOutputTokens'] = message;
}
