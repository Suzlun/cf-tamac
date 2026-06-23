'use server';

import { revalidatePath } from 'next/cache';

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

import {
  persistManagedAgentRegistration,
  validateManagedAgentRegistrationInput,
  type ManagedAgentRegistrationInput,
  type ManagedAgentRegistrationOptions,
  type ManagedAgentRegistrationResult,
} from './managed-agent-registration';

const INTEGRATION_MANAGEMENT_DENIED_REASON = 'You do not have permission to manage Integrations.';

/**
 * Input for registering a managed Agent in the Client ledger.
 */
export interface RegisterManagedAgentInput {
  readonly agentId: string;
  readonly agentRpcOrigin: string;
  readonly displayName: string;
  readonly displayOrder?: number;
}

/**
 * Input for saving a credential reference without secret material.
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
 * Register or update Client-owned managed Agent metadata.
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
 * Mark a managed Agent as opened by the management shell.
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
 * Save a Client-owned credential reference and return a browser-safe view.
 *
 * The returned `BrowserSafeCredentialReference` excludes `credentialRef` and
 * `publicFingerprint` so that Server Action results cannot leak secret lookup
 * material to browser bundles or rendered HTML.
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
 * Save credential lookup metadata from browser-safe settings forms.
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
 * Validate and persist a managed Agent registration atomically at UI level.
 *
 * Validation completes before any Client D1 write. If the credential metadata
 * write fails after creating a new registry row, the registry row is removed so
 * the UI never leaves a partially created managed Agent.
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
    revalidatePath('/agents');
    revalidatePath(`/agents/${result.agentId}`);
    revalidatePath(`/agents/${result.agentId}/settings`);
  }
  return result;
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
 * Fetch browser-safe managed Agent display metadata for route shells.
 */
export async function getManagedAgentForDisplay(
  agentId: string
): Promise<ManagedAgentRecord | undefined> {
  const env = getClientWorkerEnv();
  return createManagedAgentRepository(env.CLIENT_DB).getManagedAgent(agentId);
}

/**
 * List all managed Agents from the Client D1 registry.
 */
export async function listManagedAgents(): Promise<readonly ManagedAgentRecord[]> {
  const env = getClientWorkerEnv();
  return createManagedAgentRepository(env.CLIENT_DB).listManagedAgents();
}

/**
 * Browser-safe credential status hint for a managed Agent list row.
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
 * List managed Agents with a browser-safe credential status hint.
 *
 * The credential reference itself and any secret lookup material are never
 * returned; only the aggregate status from `client_agent_credential_refs`.
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
 * Fetch a managed Agent and its active credential reference for editing.
 *
 * Returns browser-safe credential metadata only; secret material and the
 * credential reference lookup path are excluded from the result.
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
 * Rename a managed Agent without changing order or pin state.
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
 * Pin or unpin a managed Agent in the registry.
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
 * Reorder managed Agents in the registry.
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
 * Delete a managed Agent from the Client D1 registry.
 */
export async function deleteManagedAgent(agentId: string): Promise<void> {
  const env = getClientWorkerEnv();
  await createManagedAgentRepository(env.CLIENT_DB).deleteManagedAgent(agentId);
  revalidatePath('/agents');
  revalidatePath(`/agents/${agentId}`);
}
