'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import {
  toBrowserSafeSigningKey,
  toBrowserSafeSigningKeys,
  type BrowserSafeSigningKey,
} from '../credentials/browser-safe';
import {
  generateEd25519SigningKeyMaterial,
  resolveDefaultSigningIssuer,
} from '../credentials/signing-keys';
import { createSigningKeyRepository } from '../db';
import { getClientWorkerEnv } from '../env';

import type { ClientSigningKeyStatus } from '../credentials/signing-keys';

/**
 * Global Settings 配下の署名鍵管理 Server Actions。
 *
 * @remarks
 * すべての操作は server-only で実行され、Ed25519 秘密鍵 plaintext / 暗号化 envelope / 生 JWT を
 * 戻り値へ絶対に含めない。戻り値は常に `BrowserSafeSigningKey` へ正規化し、
 * Global Settings の署名鍵管理 UI と trust config export が利用できる公開情報だけを返す。
 * Agent が 0 件でも Client-wide 操作として利用できる。
 */

/**
 * signing key generation action に渡す browser-safe 入力。
 *
 * @remarks 既定 issuer は server-side で決定するが、明示的な issuer 指定も許容する。
 * private material は一切受け取らない。
 */
export interface GenerateSigningKeyInput {
  readonly issuer?: string;
}

/**
 * Global Settings 配下で新規 Ed25519 署名鍵を生成する。
 *
 * @param input - 任意の issuer。省略時は既定の Client Service issuer を使う。
 * @returns private material を除外した browser-safe signing key view。
 * @throws 暗号化鍵が未設定や D1 write に失敗した場合は error を投げる。
 * @remarks
 * private JWK は server-only memory 上で暗号化され、即座に scope から落とされる。
 * 戻り値の `BrowserSafeSigningKey` は HTML/Server Action result/browser bundle に渡しても安全。
 */
export async function generateSigningKey(
  input: GenerateSigningKeyInput = {}
): Promise<BrowserSafeSigningKey> {
  const env = getClientWorkerEnv();
  const issuer =
    input.issuer !== undefined && input.issuer !== ''
      ? input.issuer
      : resolveDefaultSigningIssuer();
  const material = await generateEd25519SigningKeyMaterial(
    env.CLIENT_CREDENTIAL_ENCRYPTION_KEY,
    issuer
  );
  const repository = createSigningKeyRepository(env.CLIENT_DB);
  const record = await repository.createSigningKey({
    issuer: material.issuer,
    keyId: material.keyId,
    publicJwk: JSON.stringify(material.publicJwk),
    publicFingerprint: material.publicFingerprint,
    privateJwkCiphertext: material.privateJwkCiphertext,
  });
  revalidatePath('/global-settings');
  revalidatePath('/global-settings/signing-keys');
  revalidatePath('/global-settings/trust-config-export');
  return toBrowserSafeSigningKey(record);
}

/**
 * Global Settings 配下で全署名鍵を一覧する。
 *
 * @returns private material を除外した browser-safe signing key 一覧。
 * @remarks Agent が 0 件でも空配列を返し、Global Settings の empty state 表示に使う。
 */
export async function listSigningKeys(): Promise<readonly BrowserSafeSigningKey[]> {
  const env = getClientWorkerEnv();
  const records = await createSigningKeyRepository(env.CLIENT_DB).listSigningKeys();
  return toBrowserSafeSigningKeys(records);
}

/**
 * 署名鍵の lifecycle status を更新する。
 *
 * @param issuer - 対象 issuer。
 * @param keyId - 対象 key id。
 * @param status - 新しい status (`active` / `disabled` / `deleted`)。
 * @returns 更新後の browser-safe signing key view。
 * @throws 対象鍵が存在しない場合や status が不正の場合。
 * @remarks `disabled` / `deleted` に変更した鍵は以降の JWT 署名に使われない。
 */
export async function updateSigningKeyStatus(
  issuer: string,
  keyId: string,
  status: ClientSigningKeyStatus
): Promise<BrowserSafeSigningKey | undefined> {
  const env = getClientWorkerEnv();
  const record = await createSigningKeyRepository(env.CLIENT_DB).updateSigningKeyStatus(
    issuer,
    keyId,
    status
  );
  revalidatePath('/global-settings');
  revalidatePath('/global-settings/signing-keys');
  revalidatePath('/global-settings/trust-config-export');
  return record === undefined ? undefined : toBrowserSafeSigningKey(record);
}

/**
 * 既定署名鍵を選択する。
 *
 * @param issuer - 既定にする issuer。
 * @param keyId - 既定にする key id。
 * @returns 更新後の browser-safe signing key view。
 * @throws 対象鍵が存在しない、または `active` でない場合。
 * @remarks 既定鍵は登録前の Agent RPC validation でも署名 source になる。
 */
export async function setDefaultSigningKey(
  issuer: string,
  keyId: string
): Promise<BrowserSafeSigningKey | undefined> {
  const env = getClientWorkerEnv();
  const record = await createSigningKeyRepository(env.CLIENT_DB).setDefaultSigningKey(
    issuer,
    keyId
  );
  revalidatePath('/global-settings');
  revalidatePath('/global-settings/signing-keys');
  revalidatePath('/global-settings/trust-config-export');
  return record === undefined ? undefined : toBrowserSafeSigningKey(record);
}

/**
 * 署名鍵を行ごと完全削除する。
 *
 * @param issuer - 削除対象 issuer。
 * @param keyId - 削除対象 key id。
 * @remarks private material を含め行全体を取り除く。tombstone を残す場合は
 * `updateSigningKeyStatus('deleted')` を使う。
 */
export async function deleteSigningKey(issuer: string, keyId: string): Promise<void> {
  const env = getClientWorkerEnv();
  await createSigningKeyRepository(env.CLIENT_DB).deleteSigningKey(issuer, keyId);
  revalidatePath('/global-settings');
  revalidatePath('/global-settings/signing-keys');
  revalidatePath('/global-settings/trust-config-export');
}
