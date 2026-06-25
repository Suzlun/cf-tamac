'use server';

import { revalidatePath } from 'next/cache';

import {
  toRegistrationModelPolicyFieldErrors,
  type RegistrationPolicyValidationResult,
} from '../../components/schemas/agent-registration';
import { deriveActingUserContext } from '../agent-rpc/acting-user';
import {
  toBrowserSafeCredentialReference,
  type BrowserSafeCredentialReference,
} from '../credentials/browser-safe';
import {
  createCredentialReferenceRepository,
  createManagedAgentRepository,
  type ManagedAgentRecord,
} from '../db';
import { getClientWorkerEnv } from '../env';

import { initializeAgentWithDefaultModelPolicy } from './agent-lifecycle';
import {
  persistManagedAgentRegistration,
  validateManagedAgentRegistrationInput,
  type ManagedAgentRegistrationInput,
  type ManagedAgentRegistrationOptions,
  type ManagedAgentRegistrationResult,
} from './managed-agent-registration';
import { validateModelPolicyForRegistration } from './model-policies';
import { safeModelPolicyErrorMessage } from './model-policy-view-models';

const INTEGRATION_MANAGEMENT_DENIED_REASON = 'You do not have permission to manage Integrations.';

/**
 * Client D1 の管理対象 Agent 台帳へ登録または更新する入力です。
 *
 * @remarks
 * `agentId` と `agentRpcOrigin` は Agent Service を識別する metadata であり、credential secret や Agent domain snapshot は含めません。
 * `displayOrder` は Client-owned list の表示順だけに使われ、Agent Worker の状態は変更しません。
 *
 * @example
 * ```ts
 * const input: RegisterManagedAgentInput = {
 *   agentId: 'agent-alpha',
 *   agentRpcOrigin: 'https://agent.example.com',
 *   displayName: 'Agent Alpha',
 * };
 * ```
 */
export interface RegisterManagedAgentInput {
  readonly agentId: string;
  readonly agentRpcOrigin: string;
  readonly displayName: string;
  readonly displayOrder?: number;
}

/**
 * 平文 secret を含めずに credential 参照 metadata を保存する入力です。
 *
 * @remarks
 * `credentialRef` は server-side secret 解決の lookup key であり、Browser へ返す Server Action result からは除外します。
 * `publicFingerprint` と `maskedHint` は operator が識別できる metadata で、private key や raw shared secret は扱いません。
 *
 * @example
 * ```ts
 * const input: SaveCredentialReferenceInput = {
 *   agentId: 'agent-alpha',
 *   credentialRef: 'wrangler-secret:agent-alpha',
 *   keyId: 'key-2026-06',
 *   publicFingerprint: 'sha256:abc123',
 *   maskedHint: 'ed25519:ab…12',
 *   status: 'active',
 * };
 * ```
 */
export interface SaveCredentialReferenceInput {
  readonly agentId: string;
  readonly credentialRef: string;
  readonly keyId: string;
  readonly publicFingerprint: string;
  readonly maskedHint: string;
  readonly status: string;
}

/**
 * Client-owned 管理対象 Agent metadata を登録または更新します。
 *
 * @param input - Agent ID、RPC origin、表示名、任意の表示順を含む台帳入力です。
 * @returns upsert 後に Client D1 から読み戻した `ManagedAgentRecord` を返します。
 * @throws D1 binding が利用できない場合、または repository validation/persistence に失敗した場合に error を投げます。
 * @remarks
 * この Server Action は Client D1 の registry metadata だけを書き換え、Agent Worker へは RPC しません。成功後は Agent list と
 * detail route を revalidate します。
 *
 * @example
 * ```ts
 * await registerManagedAgent({
 *   agentId: 'agent-alpha',
 *   agentRpcOrigin: 'https://agent.example.com',
 *   displayName: 'Agent Alpha',
 * });
 * ```
 */
export async function registerManagedAgent(
  input: RegisterManagedAgentInput
): Promise<ManagedAgentRecord> {
  const env = getClientWorkerEnv();
  const record = await createManagedAgentRepository(env.CLIENT_DB).upsertManagedAgent(input);
  revalidatePath('/agents');
  revalidatePath(`/agents/${record.agentId}`);
  return record;
}

/**
 * management shell から Agent を開いた時刻を Client D1 台帳へ記録します。
 *
 * @param agentId - 最終閲覧時刻を更新する管理対象 Agent ID です。
 * @returns 対象が存在する場合は更新後の record、存在しない場合は `undefined` を返します。
 * @throws D1 read/write に失敗した場合に error を投げます。
 * @remarks
 * Agent Worker の domain state は変更せず、Client-owned `lastOpenedAtMs` と `updatedAtMs` だけを更新します。
 */
export async function markManagedAgentOpened(
  agentId: string
): Promise<ManagedAgentRecord | undefined> {
  const env = getClientWorkerEnv();
  const record = await createManagedAgentRepository(env.CLIENT_DB).markManagedAgentOpened(agentId);
  revalidatePath('/agents');
  return record;
}

/**
 * Client-owned credential reference を保存し、browser-safe な表示用 metadata だけを返します。
 *
 * @param input - Agent ID、credential lookup reference、key ID、fingerprint、masked hint、status を含む保存入力です。
 * @returns `credentialRef` と `publicFingerprint` を除外した `BrowserSafeCredentialReference` を返します。
 * @throws D1 write、validation、read-back に失敗した場合に error を投げます。
 * @remarks
 * Server Action result が Browser bundle や HTML に secret lookup material を漏らさないよう、保存後すぐ browser-safe 変換を行います。
 * 成功後は settings route を revalidate します。
 */
export async function saveCredentialReference(
  input: SaveCredentialReferenceInput
): Promise<BrowserSafeCredentialReference> {
  const env = getClientWorkerEnv();
  const record = await createCredentialReferenceRepository(env.CLIENT_DB).upsertCredentialReference(
    input
  );
  revalidatePath(`/agents/${record.agentId}/settings`);
  return toBrowserSafeCredentialReference(record);
}

/**
 * settings form から渡された browser-safe credential lookup metadata を保存します。
 *
 * @param input - UI field 名の `referenceValue` / `fingerprintValue` を含む reference metadata です。
 * @returns browser-safe credential reference metadata を返します。
 * @throws `saveCredentialReference` と同じ validation/D1 error を投げます。
 * @remarks
 * UI field 名を server repository 入力へ変換する薄い Server Action wrapper です。平文 secret は受け取らず、Agent RPC も呼びません。
 */
export async function saveAgentAccessLookup(input: {
  readonly agentId: string;
  readonly referenceValue: string;
  readonly keyId: string;
  readonly publicFingerprint: string;
  readonly maskedHint: string;
  readonly status: string;
}): Promise<BrowserSafeCredentialReference> {
  return saveCredentialReference({
    agentId: input.agentId,
    credentialRef: input.referenceValue,
    keyId: input.keyId,
    publicFingerprint: input.publicFingerprint,
    maskedHint: input.maskedHint,
    status: input.status,
  });
}

/**
 * managed Agent registration を検証し、UI 操作単位で原子的に永続化します。
 *
 * @param input - Agent 台帳 metadata と credential reference metadata を含む registration form 入力です。
 * @param options - test や上位 flow が既存 Agent 判定などを差し替えるための任意 option です。
 * @returns 成功時は登録済み Agent ID、失敗時は field-level/form-level error を含む browser-safe result を返します。
 * @throws 予期しない D1 障害など、rollback 不能な infrastructure error は呼び出し元へ伝播します。
 * @remarks
 * validation は Client D1 write より前に完了します。credential metadata 保存が registry row 作成後に失敗した場合は row を削除し、
 * UI に partial registration を残しません。
 */
export async function submitManagedAgentRegistration(
  input: ManagedAgentRegistrationInput,
  options: ManagedAgentRegistrationOptions = {}
): Promise<ManagedAgentRegistrationResult> {
  const validation = validateManagedAgentRegistrationInput(input);
  if (!validation.ok) {
    return {
      ok: false,
      fieldErrors: validation.fieldErrors,
      formError: 'Correct the highlighted fields before registering the Agent.',
    };
  }

  const policyValidation = await validateModelPolicyForRegistration({
    agentId: validation.value.agentId,
    agentRpcOrigin: validation.value.agentRpcOrigin,
    credentialReference: validation.value.referenceValue,
    keyId: validation.value.keyId,
    modelPolicy: validation.value.modelPolicy,
  });
  if (!policyValidation.ok) {
    return {
      ok: false,
      fieldErrors: toRegistrationModelPolicyFieldErrors(policyValidation.fieldErrors),
      formError: policyValidation.formError ?? 'The default model policy could not be validated.',
    };
  }

  const env = getClientWorkerEnv();
  const result = await persistManagedAgentRegistration(
    validation.value,
    {
      agents: createManagedAgentRepository(env.CLIENT_DB),
      credentials: createCredentialReferenceRepository(env.CLIENT_DB),
    },
    options
  );

  if (result.ok) {
    try {
      await initializeAgentWithDefaultModelPolicy(
        result.agentId,
        buildRegistrationIdempotencyKey(result.agentId),
        validation.value.displayName,
        validation.value.modelPolicy
      );
      revalidatePath('/agents');
      revalidatePath(`/agents/${result.agentId}`);
      revalidatePath(`/agents/${result.agentId}/settings`);
    } catch (error) {
      await rollbackFailedAgentInitialization(env.CLIENT_DB, result.agentId);
      return {
        ok: false,
        fieldErrors: {},
        formError: safeModelPolicyErrorMessage(error),
      };
    }
  }
  return result;
}

/**
 * Registration form の Validate policy button から Agent RPC validation を実行します。
 *
 * @param input - Registration form 全体の browser-safe 入力です。
 * @returns policy draft の validation 結果を registration field 名で返します。
 * @remarks
 * Client D1 へは書き込まず、Agent RPC validation だけを server-only credential 解決で実行します。
 * Browser には safe warning/error だけを返し、credential secret や generated RPC payload は返しません。
 */
export async function validateManagedAgentRegistrationModelPolicy(
  input: ManagedAgentRegistrationInput
): Promise<RegistrationPolicyValidationResult> {
  const validation = validateManagedAgentRegistrationInput(input);
  if (!validation.ok) {
    return {
      ok: false,
      fieldErrors: validation.fieldErrors,
      formError: 'Correct the highlighted fields before validating the policy.',
    };
  }
  const result = await validateModelPolicyForRegistration({
    agentId: validation.value.agentId,
    agentRpcOrigin: validation.value.agentRpcOrigin,
    credentialReference: validation.value.referenceValue,
    keyId: validation.value.keyId,
    modelPolicy: validation.value.modelPolicy,
  });
  if (result.ok) {
    return { ok: true, warnings: result.warnings };
  }
  return {
    ok: false,
    fieldErrors: toRegistrationModelPolicyFieldErrors(result.fieldErrors),
    formError: result.formError,
    warnings: result.warnings,
  };
}

function buildRegistrationIdempotencyKey(agentId: string): string {
  return `registration:${agentId}:${Date.now().toString(36)}`;
}

async function rollbackFailedAgentInitialization(d1: D1Database, agentId: string): Promise<void> {
  try {
    await createManagedAgentRepository(d1).deleteManagedAgent(agentId);
  } catch {
    // 初期化失敗の safe error を優先して返す。cleanup 失敗の詳細は Browser へ出さない。
  }
}

/**
 * confirmation UI に表示する現在の acting user の operator ID を返します。
 *
 * @returns mutation confirmation に表示できる browser-safe operator identifier です。
 * @remarks
 * acting user の scopes を含む完全な context は server-side に閉じ、browser には operator identifier だけを公開します。
 * Worker env が未設定の場合は `deriveActingUserContext` が production runtime で fail closed します。
 */
export async function getActingOperatorId(): Promise<string> {
  const actingUser = deriveActingUserContext();
  return await Promise.resolve(actingUser.operatorId);
}

/**
 * Integration management UI に渡す browser-safe permission 状態です。
 *
 * @remarks
 * Server-side acting user scopes を直接 browser へ返さず、Integration install/uninstall を許可するかどうかと、拒否時に表示する
 * wireframe copy だけを公開します。Agent RPC credential、scope 一覧、authorization metadata は含めません。
 *
 * @example
 * ```ts
 * const permission = await getIntegrationManagementPermission();
 * if (!permission.canManageIntegrations) {
 *   // permission.deniedReason を disabled UI の説明に使う。
 * }
 * ```
 */
export interface BrowserSafeIntegrationManagementPermission {
  readonly canManageIntegrations: boolean;
  readonly deniedReason?: string;
}

/**
 * Integration install/uninstall UI の操作許可を server-side acting user から導出します。
 *
 * @returns Integration 管理操作を許可するかどうかと、拒否時の browser-safe copy を返します。
 * @remarks
 * `agent:write` scope を持つ operator だけが Integration install/uninstall を実行できます。scope 一覧は browser に出さず、
 * UI は boolean と copy だけを受け取ります。Worker env が未設定の production runtime では `deriveActingUserContext` が fail closed します。
 */
export async function getIntegrationManagementPermission(): Promise<BrowserSafeIntegrationManagementPermission> {
  const actingUser = deriveActingUserContext();
  if (actingUser.scopes.includes('agent:write')) {
    return await Promise.resolve({ canManageIntegrations: true });
  }
  return await Promise.resolve({
    canManageIntegrations: false,
    deniedReason: INTEGRATION_MANAGEMENT_DENIED_REASON,
  });
}

/**
 * route shell 表示に使う managed Agent metadata を Client D1 から取得します。
 *
 * @param agentId - 取得対象の管理対象 Agent ID です。
 * @returns 対象 record が存在する場合は `ManagedAgentRecord`、存在しない場合は `undefined` を返します。
 * @throws D1 read に失敗した場合に error を投げます。
 * @remarks
 * 返す値は Client-owned 台帳 metadata だけで、credential secret や Agent domain snapshot は含みません。
 */
export async function getManagedAgentForDisplay(
  agentId: string
): Promise<ManagedAgentRecord | undefined> {
  const env = getClientWorkerEnv();
  return createManagedAgentRepository(env.CLIENT_DB).getManagedAgent(agentId);
}

/**
 * Client D1 registry に登録されたすべての managed Agent を一覧します。
 *
 * @returns pin、表示順、最終閲覧時刻で repository が並べた `ManagedAgentRecord` 配列を返します。
 * @throws D1 read に失敗した場合に error を投げます。
 * @remarks
 * この一覧は Client-owned 台帳だけを読み、Agent Worker への横断 list RPC は行いません。
 */
export async function listManagedAgents(): Promise<readonly ManagedAgentRecord[]> {
  const env = getClientWorkerEnv();
  return createManagedAgentRepository(env.CLIENT_DB).listManagedAgents();
}

/**
 * managed Agent list row に表示する browser-safe credential 状態 hint です。
 *
 * @remarks
 * `credentialRef`、`publicFingerprint`、secret material は含めず、list UI が必要とする表示 metadata と credential status だけを持ちます。
 * Agent domain state の snapshot ではなく、Client D1 の registry/credential reference metadata から導出されます。
 */
export interface ManagedAgentCredentialHint {
  readonly agentId: string;
  readonly displayName: string;
  readonly agentRpcOrigin: string;
  readonly pinned: boolean;
  readonly displayOrder: number;
  readonly lastOpenedAtMs?: number;
  readonly credentialStatus: string;
}

/**
 * managed Agent 一覧に browser-safe credential status hint を付けて返します。
 *
 * @returns registry metadata と credential status を結合した `ManagedAgentCredentialHint` 配列です。
 * @throws D1 read に失敗した場合に error を投げます。
 * @remarks
 * credential reference そのものや secret lookup material は返しません。`client_agent_credential_refs` の状態だけを集約し、
 * Browser には list 表示に必要な安全な文字列だけを渡します。
 */
export async function listManagedAgentsWithCredentialStatus(): Promise<
  readonly ManagedAgentCredentialHint[]
> {
  const env = getClientWorkerEnv();
  const agents = await createManagedAgentRepository(env.CLIENT_DB).listManagedAgents();
  const credentialRepo = createCredentialReferenceRepository(env.CLIENT_DB);

  const results: ManagedAgentCredentialHint[] = [];
  for (const agent of agents) {
    const refs = await credentialRepo.listCredentialReferences(agent.agentId);
    const active = refs.find((ref) => ref.status === 'active');
    const status = active?.status ?? refs[0]?.status ?? 'pending';
    results.push({
      agentId: agent.agentId,
      displayName: agent.displayName,
      agentRpcOrigin: agent.agentRpcOrigin,
      pinned: agent.pinned,
      displayOrder: agent.displayOrder,
      lastOpenedAtMs: agent.lastOpenedAtMs,
      credentialStatus: status,
    });
  }
  return results;
}

/**
 * edit form の初期表示に使う managed Agent と active credential metadata を取得します。
 *
 * @param agentId - 取得対象の管理対象 Agent ID です。
 * @returns Agent record と browser-safe credential metadata を返します。Agent が存在しない場合は両方 `undefined` です。
 * @throws D1 read に失敗した場合に error を投げます。
 * @remarks
 * credential secret material と lookup path は result から除外し、edit form は metadata と空の reference 入力だけを扱います。
 */
export async function getManagedAgentForEdit(agentId: string): Promise<{
  readonly agent: ManagedAgentRecord | undefined;
  readonly credential: BrowserSafeCredentialReference | undefined;
}> {
  const env = getClientWorkerEnv();
  const agent = await createManagedAgentRepository(env.CLIENT_DB).getManagedAgent(agentId);
  if (agent === undefined) {
    return { agent: undefined, credential: undefined };
  }
  const refs = await createCredentialReferenceRepository(env.CLIENT_DB).listCredentialReferences(
    agentId
  );
  const active = refs.find((ref) => ref.status === 'active');
  return {
    agent,
    credential: active === undefined ? undefined : toBrowserSafeCredentialReference(active),
  };
}

/**
 * managed Agent の表示名だけを変更します。
 *
 * @param agentId - rename 対象の管理対象 Agent ID です。
 * @param displayName - 新しい Client UI 表示名です。
 * @returns 対象が存在する場合は更新後 record、存在しない場合は `undefined` を返します。
 * @throws 空の入力や D1 write に失敗した場合に error を投げます。
 * @remarks
 * 表示順、pin 状態、Agent Worker domain state は変更しません。成功後は list と detail route を revalidate します。
 */
export async function renameManagedAgent(
  agentId: string,
  displayName: string
): Promise<ManagedAgentRecord | undefined> {
  const env = getClientWorkerEnv();
  const record = await createManagedAgentRepository(env.CLIENT_DB).renameManagedAgent({
    agentId,
    displayName,
  });
  revalidatePath('/agents');
  revalidatePath(`/agents/${agentId}`);
  return record;
}

/**
 * managed Agent の pin 状態を Client D1 registry で切り替えます。
 *
 * @param agentId - pin 状態を変更する管理対象 Agent ID です。
 * @param pinned - `true` の場合は pin、`false` の場合は unpin します。
 * @returns 対象が存在する場合は更新後 record、存在しない場合は `undefined` を返します。
 * @throws D1 write に失敗した場合に error を投げます。
 * @remarks
 * Client UI の並び順 metadata だけを変更し、Agent Worker へは RPC しません。
 */
export async function setManagedAgentPinned(
  agentId: string,
  pinned: boolean
): Promise<ManagedAgentRecord | undefined> {
  const env = getClientWorkerEnv();
  const record = await createManagedAgentRepository(env.CLIENT_DB).setManagedAgentPinned(
    agentId,
    pinned
  );
  revalidatePath('/agents');
  return record;
}

/**
 * managed Agent の表示順を Client D1 registry で一括更新します。
 *
 * @param entries - Agent ID と新しい表示順の組み合わせです。空配列の場合は現在の一覧を返します。
 * @returns 更新後の managed Agent 一覧を repository の標準順序で返します。
 * @throws 空の Agent ID、不正な表示順、D1 write に失敗した場合に error を投げます。
 * @remarks
 * Client-owned order metadata だけを変更し、Agent domain state や credential reference は変更しません。
 */
export async function reorderManagedAgents(
  entries: readonly { readonly agentId: string; readonly displayOrder: number }[]
): Promise<readonly ManagedAgentRecord[]> {
  const env = getClientWorkerEnv();
  const records = await createManagedAgentRepository(env.CLIENT_DB).reorderManagedAgents(entries);
  revalidatePath('/agents');
  return records;
}

/**
 * managed Agent を Client D1 registry から削除します。
 *
 * @param agentId - 削除対象の管理対象 Agent ID です。
 * @returns 削除が完了したら `void` を返します。
 * @throws D1 delete に失敗した場合に error を投げます。
 * @remarks
 * Client の台帳 metadata だけを削除します。Agent Worker の aggregate 破壊は settings の lifecycle Server Action が担当します。
 */
export async function deleteManagedAgent(agentId: string): Promise<void> {
  const env = getClientWorkerEnv();
  await createManagedAgentRepository(env.CLIENT_DB).deleteManagedAgent(agentId);
  revalidatePath('/agents');
  revalidatePath(`/agents/${agentId}`);
}
