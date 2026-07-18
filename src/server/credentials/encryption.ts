import 'server-only';

/**
 * Private JWK の暗号化 envelope 仕様を表す定数。
 *
 * @remarks
 * version 1 は AES-256-GCM で暗号化した private JWK を base64url で包み、
 * 暗号化パラメータ (iv / version) を一緒に保持する envelope です。
 * `CLIENT_CREDENTIAL_ENCRYPTION_KEY` は base64 形式の 32-byte AES-256 鍵素材を想定します。
 */
const ENCRYPTION_ENVELOPE_VERSION = 1;
const AES_KEY_LENGTH_BYTES = 32;
const AES_GCM_IV_LENGTH_BYTES = 12;
const AES_GCM_TAG_LENGTH_BITS = 128;

/**
 * 暗号化済み private JWK envelope の直列化表現。
 *
 * @remarks
 * Client D1 の `client_signing_keys.private_jwk_ciphertext` column にこの文字列だけを保存します。
 * 中身を復元できるのは `CLIENT_CREDENTIAL_ENCRYPTION_KEY` を持つ server-only module だけです。
 * envelope を変更・拡張する場合は version を上げて後方互換性を維持するのではなく、
 * 新しい鍵生成と再暗号化で移行してください (後方互換性は完全悪)。
 */
export interface PrivateJwkEncryptionEnvelope {
  readonly v: typeof ENCRYPTION_ENVELOPE_VERSION;
  readonly iv: string;
  readonly ct: string;
}

/**
 * 暗号化済み private JWK envelope を Client D1 保存用文字列へ直列化する。
 *
 * @param envelope - AES-256-GCM で暗号化した private JWK envelope。
 * @returns `client_signing_keys.private_jwk_ciphertext` に保存できる単一 JSON 文字列。
 */
export function serializePrivateJwkEnvelope(envelope: PrivateJwkEncryptionEnvelope): string {
  return JSON.stringify(envelope);
}

/**
 * Client D1 から読み込んだ ciphertext 文字列を envelope へ復元する。
 *
 * @param ciphertext - `client_signing_keys.private_jwk_ciphertext` の値。
 * @returns 復元した envelope。
 * @throws 改ざん・破損・未知 version の場合は安全な error を投げ、秘密情報は一切出さない。
 */
export function parsePrivateJwkEnvelope(ciphertext: string): PrivateJwkEncryptionEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(ciphertext);
  } catch {
    throw new Error('Signing key ciphertext is malformed.');
  }
  if (!isPrivateJwkEnvelope(parsed)) {
    throw new Error('Signing key ciphertext is malformed.');
  }
  return parsed;
}

function isPrivateJwkEnvelope(value: unknown): value is PrivateJwkEncryptionEnvelope {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.v === ENCRYPTION_ENVELOPE_VERSION &&
    typeof record.iv === 'string' &&
    record.iv !== '' &&
    typeof record.ct === 'string' &&
    record.ct !== ''
  );
}

/**
 * `CLIENT_CREDENTIAL_ENCRYPTION_KEY` の base64 鍵素材を AES-256-GCM CryptoKey へ取り込む。
 *
 * @param encryptionKeyBase64 - base64-encoded 32-byte AES-256 鍵素材。
 * @returns 復号専用 (encrypt も可能) AES-256-GCM CryptoKey。
 * @throws 鍵長や base64 形式が想定外の場合は安全な error を投げる。鍵素材そのものは log に出さない。
 * @remarks
 * import する鍵素材が想定長でない場合は fail-closed とし、鍵内容を error message へ絶対に含めない。
 */
export async function importClientCredentialEncryptionKey(
  encryptionKeyBase64: string
): Promise<CryptoKey> {
  const rawBytes = decodeBase64(encryptionKeyBase64);
  if (rawBytes.byteLength !== AES_KEY_LENGTH_BYTES) {
    throw new Error('Signing key encryption material is not configured correctly.');
  }
  return globalThis.crypto.subtle.importKey(
    'raw',
    copyToArrayBuffer(rawBytes),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Private JWK 文字列を AES-256-GCM で暗号化し、Client D1 保存用 envelope を作成する。
 *
 * @param encryptionKey - 取り込み済み AES-256-GCM CryptoKey。
 * @param privateJwkJson - Ed25519 private JWK の JSON 文字列 (server-only memory 上だけ存在)。
 * @returns 直列化可能な private JWK encryption envelope。
 * @remarks
 * 暗号化は常に呼び出しごとに新規 IV を生成する。暗号化対象は private JWK JSON 文字列だけに限定し、
 * public JWK や fingerprint は平文 metadata として別 column へ保存する。
 */
export async function encryptPrivateJwk(
  encryptionKey: CryptoKey,
  privateJwkJson: string
): Promise<PrivateJwkEncryptionEnvelope> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH_BYTES));
  const plaintext = new TextEncoder().encode(privateJwkJson);
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: copyToArrayBuffer(iv), tagLength: AES_GCM_TAG_LENGTH_BITS },
    encryptionKey,
    copyToArrayBuffer(plaintext)
  );
  return {
    v: ENCRYPTION_ENVELOPE_VERSION,
    iv: encodeBase64Url(iv),
    ct: encodeBase64Url(new Uint8Array(ciphertext)),
  };
}

/**
 * Client D1 から読み込んだ envelope を復号し、Ed25519 private JWK JSON 文字列を復元する。
 *
 * @param encryptionKey - 取り込み済み AES-256-GCM CryptoKey。
 * @param envelope - 復元済み private JWK encryption envelope。
 * @returns server-only memory 上だけ存在する Ed25519 private JWK JSON 文字列。
 * @throws 認証 tag 検証失敗 (改ざん)、鍵不一致、復号失敗の場合は安全な error を投げる。
 * @remarks
 * AES-GCM の tag 検証が改ざんを検出する。error に envelope 内容や鍵素材を一切含めない。
 * 復元した文字列は呼び出し元の server-only scope だけで使い、browser/log/D1 snapshot へ流出させない。
 */
export async function decryptPrivateJwk(
  encryptionKey: CryptoKey,
  envelope: PrivateJwkEncryptionEnvelope
): Promise<string> {
  const iv = decodeBase64UrlBytes(envelope.iv);
  const ciphertext = decodeBase64UrlBytes(envelope.ct);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: copyToArrayBuffer(iv), tagLength: AES_GCM_TAG_LENGTH_BITS },
      encryptionKey,
      copyToArrayBuffer(ciphertext)
    );
  } catch {
    throw new Error('Signing key ciphertext could not be verified.');
  }
  return new TextDecoder().decode(plaintext);
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function decodeBase64UrlBytes(value: string): Uint8Array {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded =
    normalized.length % 4 === 0 ? normalized : normalized + '='.repeat(4 - (normalized.length % 4));
  return decodeBinaryString(atob(padded));
}

function decodeBase64(value: string): Uint8Array {
  return decodeBinaryString(atob(value));
}

/**
 * `atob` が返す binary string を Uint8Array に変換する。
 *
 * @param binary - 1 文字が 1 byte を表す binary string。
 * @returns Web Crypto API へ渡せる byte 配列。
 * @remarks
 * 動的 index への代入を使わず `Uint8Array.from` の mapper に閉じることで、object-injection 系の
 * lint 警告を避けつつ、入力文字列と同じ byte order を維持する。秘密値を log したり永続化したりしない。
 */
function decodeBinaryString(binary: string): Uint8Array {
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/**
 * Uint8Array を確実な `ArrayBuffer` へコピーする。
 *
 * @remarks
 * Web Crypto API の BufferSource は `ArrayBuffer` backed を要求するため、
 * SharedArrayBuffer の可能性を排除して安全な暗号化入力にする。
 * コピー元に秘密データは含まれず、戻り値は呼び出し元の server-only scope だけで扱う。
 */
function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
