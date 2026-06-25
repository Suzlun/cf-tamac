import 'server-only';

import { resolveCredentialSecret } from '../credentials/secret-resolution';
import {
  createCredentialReferenceRepository,
  createManagedAgentRepository,
  type ManagedAgentRecord,
} from '../db';
import { getClientWorkerEnv } from '../env';

import { deriveActingUserContext } from './acting-user';
import { createServerAgentRpcClients, type ServerAgentRpcClients } from './create-client';
import { createE2eFakeAgentRpcClients, isE2eFakeAgentRpcEnabled } from './e2e-fake-clients';

/**
 * managed Agent 用の server-side Agent RPC clients 読み込み結果。
 *
 * @remarks
 * `managedAgent` は Client-owned registry metadata だけを保持する。
 * `clients` は server-only credential reference metadata を使う generated Connect clients を保持し、
 * browser-visible module へ渡してはならない。
 */
export interface AgentRpcClientLoadResult {
  readonly clients: ServerAgentRpcClients;
  readonly managedAgent: ManagedAgentRecord;
}

/**
 * Client D1 の managed Agent record と active credential reference から server-only Agent RPC clients を作成する。
 *
 * @param agentId - Client registry に登録済みの managed Agent ID。
 * @returns managed Agent metadata と generated Agent RPC clients の server-only bundle。
 * @throws TypeError `agentId` が空文字の場合。
 * @throws Error managed Agent record または active credential reference が Client D1 に存在しない場合。
 * @remarks
 * この helper は Client server boundary を強制する。Client D1 は registry metadata と credential reference
 * だけを返し、secret material は Worker binding 経由で server-side 解決する。Agent RPC clients は
 * `createServerAgentRpcClients` で構築し、Agent domain snapshot を Client D1 から読んだり書いたりしない。
 * Acting user context も browser input ではなく server-side state から導出する。
 */
export async function loadAgentRpcClients(agentId: string): Promise<AgentRpcClientLoadResult> {
  if (agentId === '') {
    throw new TypeError('agentId must not be empty.');
  }

  const env = getClientWorkerEnv();
  const managedAgent = await createManagedAgentRepository(env.CLIENT_DB).getManagedAgent(agentId);
  if (managedAgent === undefined) {
    throw new Error('Managed Agent not found in Client registry.');
  }

  const credentials = await createCredentialReferenceRepository(
    env.CLIENT_DB
  ).listCredentialReferences(agentId);
  const activeCredential = credentials.find((ref) => ref.status === 'active');
  if (activeCredential === undefined) {
    throw new Error('No active credential reference found for managed Agent.');
  }

  if (isE2eFakeAgentRpcEnabled()) {
    // E2E では Client D1 の registry/credential metadata 読み取りまでは実経路を通し、外部 Agent RPC だけを server-only fake に置き換える。
    return { clients: createE2eFakeAgentRpcClients(agentId, managedAgent), managedAgent };
  }

  const resolvedSecret = await resolveCredentialSecret(
    env,
    agentId,
    activeCredential.credentialRef
  );

  const actingUser = deriveActingUserContext();

  const clients = createServerAgentRpcClients({
    agentRpcOrigin: managedAgent.agentRpcOrigin,
    credential: {
      agentId,
      credentialRef: activeCredential.credentialRef,
      keyId: activeCredential.keyId,
      secretMaterial: resolvedSecret.secretMaterial,
      actingUser,
    },
  });

  return { clients, managedAgent };
}
