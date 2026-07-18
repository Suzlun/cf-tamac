import 'server-only';

import {
  decryptPrivateJwk,
  encryptPrivateJwk,
  importClientCredentialEncryptionKey,
  parsePrivateJwkEnvelope,
  serializePrivateJwkEnvelope,
  type PrivateJwkEncryptionEnvelope,
} from './encryption';

/**
 * Client Service signing key の server-side lifecycle status。
 *
 * @remarks
 * `active` だけが Agent RPC bearer JWT の署名に使用できる。
 * `disabled` は運用者が一時的に署名対象から外した状態。
 * `deleted` は private material を復号不能または削除済みの tombstone で、
 * trust config 上は `revoked` entry としてだけ残せる。
 */
export type ClientSigningKeyStatus = 'active' | 'disabled' | 'deleted';

/**
 * 生成した Ed25519 鍵ペアから抽出した公開情報と暗号化済み private JWK。
 *
 * @remarks
 * private JWK は必ず暗号化 envelope になり、server-only scope 以外へ出ない。
 * `publicJwk` は Agent trust config export や fingerprint 照合に使う公開情報のみを含む。
 */
export interface GeneratedSigningKeyMaterial {
  readonly issuer: string;
  readonly keyId: string;
  readonly publicJwk: Ed25519PublicJwk;
  readonly publicFingerprint: string;
  readonly privateJwkCiphertext: string;
}

/**
 * JWK 形式の Ed25519 公開鍵 (private parameter `d` を含まない)。
 *
 * @remarks
 * trust config export に直接埋め込める公開情報。`x` は base64url 形式の公開鍵座標。
 */
export interface Ed25519PublicJwk {
  readonly kty: 'OKP';
  readonly crv: 'Ed25519';
  readonly x: string;
}

/**
 * JWK 形式の Ed25519 秘密鍵。server-only memory 上だけ存在する。
 */
export interface Ed25519PrivateJwk extends Ed25519PublicJwk {
  readonly d: string;
}

/**
 * Agent RPC bearer JWT 署名に使う server-only の復号済み署名鍵。
 *
 * @remarks
 * `privateKey` は Web Crypto の CryptoKey であり、browser や log へ絶対に直列化しない。
 * `publicJwk` / `publicFingerprint` は公開情報で、trust config 照合や audit に使う。
 */
export interface ResolvedSigningKeyMaterial {
  readonly issuer: string;
  readonly keyId: string;
  readonly publicFingerprint: string;
  readonly publicJwk: Ed25519PublicJwk;
  readonly privateKey: CryptoKey;
}

const DEFAULT_CLIENT_SERVICE_ISSUER = 'cf-tamac-client';

/**
 * Client Service 既定 issuer 文字列を返す。
 *
 * @remarks
 * 鍵生成の既定 issuer。Agent 側の trust config はこの issuer と `ADMIN_OPERATOR` issuer を区別する。
 */
export function resolveDefaultSigningIssuer(): string {
  return DEFAULT_CLIENT_SERVICE_ISSUER;
}

/**
 * 新しい Ed25519 鍵ペアを Web Crypto で生成し、private JWK を暗号化 envelope へ包む。
 *
 * @param encryptionKeyBase64 - `CLIENT_CREDENTIAL_ENCRYPTION_KEY` の base64 鍵素材。
 * @param issuer - 鍵を関連付ける Client Service issuer。省略時は既定 issuer。
 * @param keyId - 鍵識別子。省略時は random UUID。
 * @returns 公開情報と暗号化済み private JWK をまとめた生成結果。
 * @remarks
 * この関数は server-only module に閉じ、生成した private JWK plaintext は暗号化後に即座に捨てる。
 * 暗号化前の private JWK JSON が戻り値や log に残らないことを保証する。
 */
export async function generateEd25519SigningKeyMaterial(
  encryptionKeyBase64: string,
  issuer: string = DEFAULT_CLIENT_SERVICE_ISSUER,
  keyId: string = globalThis.crypto.randomUUID()
): Promise<GeneratedSigningKeyMaterial> {
  if (issuer === '') {
    throw new TypeError('issuer must not be empty.');
  }
  if (keyId === '') {
    throw new TypeError('keyId must not be empty.');
  }

  const { publicKey, privateKey } = await globalThis.crypto.subtle.generateKey('Ed25519', true, [
    'sign',
  ]);
  const publicJwk = (await globalThis.crypto.subtle.exportKey(
    'jwk',
    publicKey
  )) as Ed25519PublicJwk;
  const privateJwk = (await globalThis.crypto.subtle.exportKey(
    'jwk',
    privateKey
  )) as Ed25519PrivateJwk;

  const safePublicJwk: Ed25519PublicJwk = {
    kty: publicJwk.kty,
    crv: publicJwk.crv,
    x: publicJwk.x,
  };
  const publicFingerprint = await computePublicJwkFingerprint(safePublicJwk);
  const encryptionKey = await importClientCredentialEncryptionKey(encryptionKeyBase64);
  // private JWK JSON を一時変数に置き、暗号化後に scope から落とす。
  const privateJwkJson = JSON.stringify(privateJwk);
  const envelope = await encryptPrivateJwk(encryptionKey, privateJwkJson);
  return {
    issuer,
    keyId,
    publicJwk: safePublicJwk,
    publicFingerprint,
    privateJwkCiphertext: serializePrivateJwkEnvelope(envelope),
  };
}

/**
 * Ed25519 公開 JWK から決定的な fingerprint (SHA-256 base64url) を算出する。
 *
 * @param publicJwk - private parameter `d` を含まない Ed25519 公開 JWK。
 * @returns `sha256_b64u:` prefix 付きの fingerprint 文字列。
 * @remarks
 * canonical JSON は key 順序を固定し、Client D1 の managed Agent metadata と
 * Agent 側 trust config で同一の照合値になることを保証する。
 * 入力は公開情報 (kty/crv/x) のみで、秘密データは含まない。
 */
export async function computePublicJwkFingerprint(publicJwk: Ed25519PublicJwk): Promise<string> {
  const canonical = JSON.stringify({
    crv: publicJwk.crv,
    kty: publicJwk.kty,
    x: publicJwk.x,
  });
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    copyToArrayBuffer(new TextEncoder().encode(canonical))
  );
  return `sha256_b64u:${encodeBase64Url(new Uint8Array(digest))}`;
}

/**
 * Client status を Agent trust config の key status へ mapping する。
 *
 * @param status - Client 側 signing key lifecycle status。
 * @returns Agent 側 trust config の key lifecycle status (`active` / `retiring` / `revoked`)。
 * @remarks
 * Client `active` は trust config 上 `active` または `retiring` として選択可能だが、
 * 既定の安全側 mapping は `active` を返す。`retiring` は明示的な選択として扱う。
 * Client `disabled` / `deleted` は常に `revoked` になり、署名にも使えない。
 */
export function mapClientStatusToTrustStatus(
  status: ClientSigningKeyStatus
): 'active' | 'retiring' | 'revoked' {
  if (status === 'active') {
    return 'active';
  }
  return 'revoked';
}

/**
 * 暗号化済み private JWK ciphertext と `CLIENT_CREDENTIAL_ENCRYPTION_KEY` から署名用 CryptoKey を復元する。
 *
 * @param encryptionKeyBase64 - `CLIENT_CREDENTIAL_ENCRYPTION_KEY` の base64 鍵素材。
 * @param privateJwkCiphertext - Client D1 に保存された暗号化 envelope 文字列。
 * @returns server-only memory 上の Ed25519 private CryptoKey。
 * @throws 復号失敗や鍵 import 失敗の場合は安全な error を投げる。秘密情報は出さない。
 */
export async function resolveEd25519PrivateKey(
  encryptionKeyBase64: string,
  privateJwkCiphertext: string
): Promise<CryptoKey> {
  const encryptionKey = await importClientCredentialEncryptionKey(encryptionKeyBase64);
  const envelope = parsePrivateJwkEnvelope(privateJwkCiphertext);
  const privateJwkJson = await decryptPrivateJwk(encryptionKey, envelope);
  let privateJwk: Ed25519PrivateJwk;
  try {
    privateJwk = JSON.parse(privateJwkJson) as Ed25519PrivateJwk;
  } catch {
    throw new Error('Signing key ciphertext could not be verified.');
  }
  return globalThis.crypto.subtle.importKey('jwk', privateJwk, 'Ed25519', false, ['sign']);
}

/**
 * envelope を構成要素へ分解せず保持したい caller 向けの parse helper。
 *
 * @internal
 */
export function unsafeParseEnvelopeForTests(ciphertext: string): PrivateJwkEncryptionEnvelope {
  return parsePrivateJwkEnvelope(ciphertext);
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

/**
 * Uint8Array を確実な `ArrayBuffer` へコピーする。
 *
 * @remarks
 * Web Crypto API の BufferSource は `ArrayBuffer` backed を要求するため、
 * SharedArrayBuffer の可能性を排除して安全な暗号化入力にする。
 * 戻り値は server-only scope だけで扱う。
 */
function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
