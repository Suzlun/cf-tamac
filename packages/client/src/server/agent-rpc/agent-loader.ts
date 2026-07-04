import 'server-only';

import { resolveEd25519PrivateKey } from '../credentials/signing-keys';
import {
  createManagedAgentRepository,
  createSigningKeyRepository,
  type ManagedAgentRecord,
} from '../db';
import { getClientWorkerEnv } from '../env';

import { deriveActingUserContext } from './acting-user';
import { type ResolvedAgentRpcCredential } from './authentication';
import { createServerAgentRpcClients, type ServerAgentRpcClients } from './create-client';
import { createE2eFakeAgentRpcClients, isE2eFakeAgentRpcEnabled } from './e2e-fake-clients';

/**
 * managed Agent 用の server-side Agent RPC clients 読み込み結果。
 *
 * @remarks
 * `managedAgent` は Client-owned registry metadata (署名 identity metadata 含む) だけを保持する。
 * `clients` は Ed25519 signing key store から署名した generated Connect clients を保持し、
 * browser-visible module へ渡してはならない。
 */
export interface AgentRpcClientLoadResult {
  readonly clients: ServerAgentRpcClients;
  readonly managedAgent: ManagedAgentRecord;
}

/**
 * Client D1 の managed Agent record と選択済み Ed25519 signing key から server-only Agent RPC clients を作成する。
 *
 * @param agentId - Client registry に登録済みの managed Agent ID。
 * @returns managed Agent metadata と generated Agent RPC clients の server-only bundle。
 * @throws TypeError `agentId` が空文字の場合。
 * @throws Error managed Agent record が存在しない場合、署名鍵が未選択の場合、選択鍵が
 * `active` でない場合、fingerprint が managed Agent metadata と一致しない場合。
 * @remarks
 * この helper は Client server boundary と Ed25519 signing key store を強制する。
 * Agent RPC bearer JWT の署名 source は Client D1 の `client_signing_keys` と
 * `CLIENT_CREDENTIAL_ENCRYPTION_KEY` だけに限定し、外部 credential 参照や共有鍵方式を一切使わない。
 *
 * key 未選択状態では Agent RPC 実行前に fail-closed で明示的な signing key selection を要求する。
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

  if (isE2eFakeAgentRpcEnabled()) {
    // E2E では Client D1 の registry/signing metadata 読み取りまでは実経路を通し、
    // private key 復号と外部 Agent RPC だけを server-only fake に置き換える。
    assertManagedAgentSigningMetadataSelected(managedAgent);
    return { clients: createE2eFakeAgentRpcClients(agentId, managedAgent), managedAgent };
  }

  const resolvedCredential = await resolveAgentRpcCredential(env, managedAgent);

  const actingUser = deriveActingUserContext();
  const clients = createServerAgentRpcClients({
    agentRpcOrigin: managedAgent.agentRpcOrigin,
    credential: { ...resolvedCredential, actingUser },
  });

  return { clients, managedAgent };
}

/**
 * E2E fake RPC でも managed Agent が署名鍵選択済みであることを検査する。
 *
 * @param managedAgent - Client D1 から読んだ managed Agent metadata。
 * @throws Error issuer / key id / fingerprint のいずれかが未設定の場合。
 * @remarks
 * E2E fake では秘密鍵復号と JWT 署名を避ける一方で、UI が signing key selection を完了してから
 * Agent 操作へ進む product invariant は維持する。
 */
function assertManagedAgentSigningMetadataSelected(managedAgent: ManagedAgentRecord): void {
  if (
    managedAgent.signingIssuer === undefined ||
    managedAgent.signingKeyId === undefined ||
    managedAgent.signingPublicFingerprint === undefined
  ) {
    throw new Error('Managed Agent has no Client Service signing key selected.');
  }
}

/**
 * managed Agent metadata と Ed25519 signing key store から server-only Agent RPC credential を解決する。
 *
 * @remarks
 * signing key 未選択状態では署名経路に入る前に fail-closed する。
 * fingerprint 不一致・disabled/deleted key は Agent RPC 呼び出し前に拒否する。
 * 戻り値の `privateKey` は server-only scope の外へ出さない。
 */
async function resolveAgentRpcCredential(
  env: ReturnType<typeof getClientWorkerEnv>,
  managedAgent: ManagedAgentRecord
): Promise<ResolvedAgentRpcCredential> {
  const issuer = managedAgent.signingIssuer;
  const keyId = managedAgent.signingKeyId;
  const expectedFingerprint = managedAgent.signingPublicFingerprint;

  if (issuer === undefined || keyId === undefined || expectedFingerprint === undefined) {
    throw new Error('Managed Agent has no Client Service signing key selected.');
  }

  const signingKeys = createSigningKeyRepository(env.CLIENT_DB);
  const signingKey = await signingKeys.getSigningKey(issuer, keyId);
  if (signingKey === undefined) {
    throw new Error('The selected Client Service signing key was not found.');
  }
  if (signingKey.status !== 'active') {
    throw new Error('The selected Client Service signing key is not active.');
  }
  if (signingKey.publicFingerprint !== expectedFingerprint) {
    // managed Agent metadata と signing key store の公開鍵が一致しない場合は署名前に拒否する。
    throw new Error('The selected signing key fingerprint does not match the registry record.');
  }

  let publicJwk: { readonly kty: 'OKP'; readonly crv: 'Ed25519'; readonly x: string };
  try {
    publicJwk = JSON.parse(signingKey.publicJwk) as {
      readonly kty: 'OKP';
      readonly crv: 'Ed25519';
      readonly x: string;
    };
  } catch {
    throw new Error('The selected signing key public JWK is malformed.');
  }

  const privateKey = await resolveEd25519PrivateKey(
    env.CLIENT_CREDENTIAL_ENCRYPTION_KEY,
    signingKey.privateJwkCiphertext
  );

  return {
    agentId: managedAgent.agentId,
    issuer: signingKey.issuer,
    keyId: signingKey.keyId,
    publicFingerprint: signingKey.publicFingerprint,
    publicJwk,
    privateKey,
    // JWT 署名完了後にだけ server-only repository で利用時刻を更新する。
    // callback が失敗した場合は authentication layer が fail-closed し、Agent RPC を送信しない。
    onJwtSigned: () => signingKeys.touchSigningKeyLastUsed(signingKey.issuer, signingKey.keyId),
  };
}
