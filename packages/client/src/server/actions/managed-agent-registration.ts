import { validateRegistrationModelPolicyValues } from '../../components/schemas/agent-registration';

import type { ModelPolicyDraftValues } from '../../components/schemas/model-policy';
import type {
  CredentialReferenceRepository,
  ManagedAgentRecord,
  ManagedAgentRepository,
} from '../db';

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
 * 検証済み Agent 登録永続化の内部結果です。
 *
 * @remarks
 * この内部結果は Server Action が Browser-safe four-field result へ写像する前にだけ使います。
 */
export type ManagedAgentRegistrationResult =
  | { readonly ok: true; readonly agentId: string }
  | {
      readonly ok: false;
      readonly fieldErrors: RegistrationFieldErrors;
      readonly formError?: string;
    };

/**
 * 検証済みの管理対象 Agent 登録を保存するための Client D1 repository 集合です。
 *
 * @remarks
 * Agent domain snapshot や秘密情報を保存する repository は含めません。
 */
export interface RegistrationRepositories {
  readonly agents: ManagedAgentRepository;
  readonly credentials: CredentialReferenceRepository;
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

/**
 * 検証済みの登録を注入された Client D1 repository で永続化します。
 *
 * @param input - 正規化済みで、呼び出し元が origin policy を確認した登録入力です。
 * @param repositories - managed Agent record と credential reference を保存する Client D1 repository です。
 * @param options - 新規登録または編集登録を決める任意の identity 設定です。
 * @returns 成功時は Agent ID、失敗時は安全な field error を返します。
 * @remarks
 * 部分書き込みを防ぐため、credential 保存が失敗した場合は登録 record を rollback します。
 */
export async function persistManagedAgentRegistration(
  input: NormalizedManagedAgentRegistrationInput,
  repositories: RegistrationRepositories,
  options: ManagedAgentRegistrationOptions = {}
): Promise<ManagedAgentRegistrationResult> {
  const mode = await determineRegistrationMode(input, repositories.agents, options);
  if (!mode.ok) {
    return registrationFieldErrorResult(mode.fieldErrors);
  }

  try {
    await writeRegistrationRecords(input, repositories, mode.action);
    return { ok: true, agentId: input.agentId };
  } catch (error) {
    await rollbackRegistrationWrite(input, repositories.agents, mode.action, mode.previousAgent);
    if (isLikelyDuplicateAgentError(error)) {
      return registrationFieldErrorResult({ agentId: 'Agent ID is already registered.' });
    }
    return {
      ok: false,
      fieldErrors: {},
      formError: 'Could not register the Agent. Retrying will not duplicate the record.',
    };
  }
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

function registrationFieldErrorResult(
  fieldErrors: RegistrationFieldErrors
): ManagedAgentRegistrationResult {
  return {
    ok: false,
    fieldErrors,
    formError: 'Correct the highlighted fields before registering the Agent.',
  };
}

async function determineRegistrationMode(
  input: NormalizedManagedAgentRegistrationInput,
  agents: ManagedAgentRepository,
  options: ManagedAgentRegistrationOptions
): Promise<
  | {
      readonly ok: true;
      readonly action: 'create' | 'update';
      readonly previousAgent?: ManagedAgentRecord;
    }
  | { readonly ok: false; readonly fieldErrors: RegistrationFieldErrors }
> {
  if (options.existingAgentId !== undefined && options.existingAgentId !== input.agentId) {
    return { ok: false, fieldErrors: { agentId: 'Agent ID cannot be changed while editing.' } };
  }
  const existing = await agents.getManagedAgent(input.agentId);
  if (options.existingAgentId === undefined && existing !== undefined) {
    return { ok: false, fieldErrors: { agentId: 'Agent ID is already registered.' } };
  }
  // edit mode は既存台帳行の存在を必須とする。存在しない edit target を upsert で新規作成せず、
  // 安全側で formError を返す (partial row / default-key prerequisite 回避を防ぐ)。
  if (options.existingAgentId !== undefined && existing === undefined) {
    return {
      ok: false,
      fieldErrors: {
        agentId: 'This Agent is no longer registered. Refresh the registry and retry.',
      },
    };
  }
  return {
    ok: true,
    action: options.existingAgentId === undefined ? 'create' : 'update',
    previousAgent: existing,
  };
}

async function writeRegistrationRecords(
  input: NormalizedManagedAgentRegistrationInput,
  repositories: RegistrationRepositories,
  action: 'create' | 'update'
): Promise<void> {
  const agentInput = {
    agentId: input.agentId,
    agentRpcOrigin: input.agentRpcOrigin,
    displayName: input.displayName,
    displayOrder: input.displayOrder,
  };
  if (action === 'create') {
    await repositories.agents.createManagedAgent(agentInput);
  } else {
    await repositories.agents.upsertManagedAgent(agentInput);
  }
  await repositories.credentials.upsertCredentialReference({
    agentId: input.agentId,
    credentialRef: input.referenceValue,
    keyId: input.keyId,
    publicFingerprint: input.publicFingerprint,
    maskedHint: input.maskedHint,
    status: input.status,
  });
}

async function rollbackRegistrationWrite(
  input: NormalizedManagedAgentRegistrationInput,
  agents: ManagedAgentRepository,
  action: 'create' | 'update',
  previousAgent: ManagedAgentRecord | undefined
): Promise<void> {
  try {
    if (action === 'create') {
      await agents.deleteManagedAgent(input.agentId);
    } else if (previousAgent !== undefined) {
      await agents.upsertManagedAgent(previousAgent);
    }
  } catch {
    // The original persistence error remains the user-facing failure cause.
  }
}

function isLikelyDuplicateAgentError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /unique|constraint|primary key/i.test(error.message);
}
