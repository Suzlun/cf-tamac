import 'server-only';

import type { ClientServiceSigningContext } from '@cf-tamac/sdk';

import { resolveEd25519PrivateKey } from '../credentials/signing-keys';
import {
  type ClientSigningKeyRecord,
  createManagedAgentRepository,
  createSigningKeyRepository,
  type ManagedAgentRecord,
} from '../db';
import { getClientWorkerEnv } from '../env';

import { deriveActingUserContext } from './acting-user';
import { createServerAgentRpcClients, type ServerAgentRpcClients } from './create-client';
import { createE2eFakeAgentRpcClients, isE2eFakeAgentRpcEnabled } from './e2e-fake-clients';
import { approveAgentRpcOrigin, parseApprovedAgentRpcOrigins } from './origin-policy';

/**
 * managed Agent 用の server-side Agent RPC clients 読み込み結果。
 *
 * @remarks
 * `managedAgent` は Client-owned registry metadata (署名 identity metadata 含む) だけを保持する。
 * `clients` は Ed25519 signing key store から解決した context を SDK へ渡す server-only clients を保持し、
 * browser-visible module へ渡してはならない。
 */
export interface AgentRpcClientLoadResult {
  readonly clients: ServerAgentRpcClients;
  readonly managedAgent: ManagedAgentRecord;
}

/**
 * Client D1 の managed Agent record と選択済み Ed25519 signing key から SDK-backed server-only clients を作成する。
 *
 * @param agentId - Client registry に登録済みの managed Agent ID。
 * @returns managed Agent metadata と generated Agent RPC clients の server-only bundle。
 * @throws TypeError `agentId` が空文字の場合。
 * @throws Error managed Agent record が存在しない場合、署名鍵が未選択の場合、選択鍵が
 * `active` でない場合、fingerprint が managed Agent metadata と一致しない場合。
 * @remarks
 * この helper は Client server boundary と Ed25519 signing key store を強制する。
 * Agent RPC bearer JWT の署名 source は Client D1 の `client_signing_keys` と
 * `CLIENT_CREDENTIAL_ENCRYPTION_KEY` だけに限定し、SDK には復号済み signing context と acting user context だけを渡す。
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

  // Client D1 読み取り直後に現在の allowlist を適用し、署名鍵、acting user、SDK transport を解決する前に
  // 保存済み metadata の origin を fail closed にします。運用ポリシーの変更は即時に次の操作へ反映されます。
  const approvedOrigin = approveAgentRpcOrigin(
    managedAgent.agentRpcOrigin,
    parseApprovedAgentRpcOrigins(env.AGENT_RPC_ALLOWED_ORIGINS)
  );

  if (isE2eFakeAgentRpcEnabled()) {
    // E2E では Client D1 の registry/signing metadata 読み取りまでは実経路を通し、
    // private key 復号と外部 Agent RPC だけを server-only fake に置き換える。
    assertManagedAgentSigningMetadataSelected(managedAgent);
    return { clients: createE2eFakeAgentRpcClients(agentId, managedAgent), managedAgent };
  }

  const signingContext = await resolveManagedAgentSigningContext(env, managedAgent);
  // Browser input ではない Client server-side policy から acting user を導出して SDK adapter へ渡します。
  const actingUser = deriveActingUserContext();
  const clients = createServerAgentRpcClients({
    agentRpcOrigin: approvedOrigin,
    actingUser,
    signingContext,
  });

  return { clients, managedAgent };
}

/**
 * 登録前 model policy validation 用に、Client D1 の既定 signing key と acting user から SDK-backed clients を作成する。
 *
 * @param input - Client D1 record をまだ持たない Agent ID と、登録フォームで検証済みの HTTPS RPC origin です。
 * @returns default Client Service signing key を使う server-only SDK adapter clients。
 * @throws 既定 signing key が未設定または active でない場合、または private key の復号に失敗した場合。
 * @remarks
 * registration validation は managed Agent record を保存する前に Agent RPC を呼ぶため、Client D1 の既定 signing key を
 * 明示的に選びます。provider credential reference は model provider 用 metadata であり、Agent RPC JWT signing source には使いません。
 */
export async function loadRegistrationAgentRpcClients(input: {
  readonly agentId: string;
  readonly agentRpcOrigin: string;
}): Promise<ServerAgentRpcClients> {
  const env = getClientWorkerEnv();
  // 登録前 validation でも signing key / acting user を解決する前に同じ policy を適用し、
  // Browser 入力由来の任意 origin に Client Service JWT を送らないようにします。
  const approvedOrigin = approveAgentRpcOrigin(
    input.agentRpcOrigin,
    parseApprovedAgentRpcOrigins(env.AGENT_RPC_ALLOWED_ORIGINS)
  );
  const signingKeys = createSigningKeyRepository(env.CLIENT_DB);
  const signingKey = await signingKeys.getDefaultSigningKey();
  if (signingKey === undefined) {
    throw new Error('No active default Client Service signing key is configured.');
  }
  if (signingKey.status !== 'active') {
    throw new Error('The default Client Service signing key is not active.');
  }
  // Client D1 encrypted key record を SDK が必要とする signing context へ限定して変換します。
  const signingContext = await createClientServiceSigningContext(
    env,
    input.agentId,
    env.AGENT_RPC_AUDIENCE,
    signingKey
  );
  return createServerAgentRpcClients({
    agentRpcOrigin: approvedOrigin,
    actingUser: deriveActingUserContext(),
    signingContext,
  });
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
 * managed Agent metadata と Ed25519 signing key store から SDK 用の server-only signing context を解決する。
 *
 * @remarks
 * signing key 未選択状態では署名経路に入る前に fail-closed する。
 * fingerprint 不一致・disabled/deleted key は Agent RPC 呼び出し前に拒否する。
 * 戻り値の `privateKey` は SDK の JWT signing 処理だけで使用し、server-only scope の外へ出さない。
 */
async function resolveManagedAgentSigningContext(
  env: ReturnType<typeof getClientWorkerEnv>,
  managedAgent: ManagedAgentRecord
): Promise<ClientServiceSigningContext> {
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

  return await createClientServiceSigningContext(
    env,
    managedAgent.agentId,
    env.AGENT_RPC_AUDIENCE,
    signingKey
  );
}

/**
 * Client D1 の encrypted signing key record を SDK が受け取る最小の signing context へ変換する。
 *
 * @param env - Client Worker の D1 binding と encrypted private JWK 復号鍵を持つ server-only env です。
 * @param agentId - JWT と generated request body を同じ aggregate に固定する Agent ID です。
 * @param agentRpcAudience - Agent Worker の `AGENT_RPC_AUDIENCE` と trust config に一致する JWT audience です。
 * @param signingKey - Client D1 が所有する active signing key record です。
 * @returns private key を含むが、Client server boundary の外へ出さない SDK signing context。
 * @throws private JWK envelope の復号に失敗した場合、JWT signing 前に error を送出します。
 * @remarks
 * SDK は D1、Worker env、暗号化 envelope を知りません。この helper が Client ownership を保持したまま、
 * SDK に必要な public identity、private CryptoKey、last-used audit callback だけを明示的に受け渡します。
 */
async function createClientServiceSigningContext(
  env: ReturnType<typeof getClientWorkerEnv>,
  agentId: string,
  agentRpcAudience: string,
  signingKey: ClientSigningKeyRecord
): Promise<ClientServiceSigningContext> {
  // encrypted Client D1 record を server-only でだけ復号し、plain private JWK を object/Browser payload に保持しません。
  const privateKey = await resolveEd25519PrivateKey(
    env.CLIENT_CREDENTIAL_ENCRYPTION_KEY,
    signingKey.privateJwkCiphertext
  );
  const signingKeys = createSigningKeyRepository(env.CLIENT_DB);
  // SDK が必要とする signing identity と audit callback だけを作り、public JWK JSON や D1 row 全体は渡しません。
  return {
    audience: agentRpcAudience,
    credential: {
      agentId,
      issuer: signingKey.issuer,
      keyId: signingKey.keyId,
      publicFingerprint: signingKey.publicFingerprint,
    },
    privateKey,
    // SDK の JWT 署名完了後にだけ Client D1 の server-only repository で利用時刻を更新します。
    // callback が失敗した場合は SDK が fail-closed し、Agent RPC を送信しません。
    onJwtSigned: () => signingKeys.touchSigningKeyLastUsed(signingKey.issuer, signingKey.keyId),
  };
}
