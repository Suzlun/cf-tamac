/**
 * 公開 `thread_key` を NFC 正規化した後に許可する最大 UTF-8 byte 数です。
 *
 * @remarks
 * Agent public RPC の thread identity は Agent ID と正規化済み thread key の組で決まります。
 * この上限は TypeSpec/生成 RPC の検証 metadata と同じ 512 bytes に固定し、保存層と
 * Durable Object 層で同じ境界を参照できるようにします。
 */
export const maxThreadKeyUtf8Bytes = 512;

/**
 * Thread key 検証後に storage seam へ渡す Agent-scoped identity です。
 *
 * @remarks
 * `agentId` は Durable Object aggregate を、`threadKey` は呼び出し元が送った元の値を、
 * `normalizedThreadKey` は NFC 正規化済みの比較キーを表します。case-sensitive 比較を維持するため、
 * 大文字小文字の折り畳みや Integration 由来の暗黙 prefix はここで行いません。
 */
export interface ThreadKeyIdentity {
  readonly agentId: string;
  readonly threadKey: string;
  readonly normalizedThreadKey: string;
}

/**
 * Thread key を Agent-scoped identity 比較で使う NFC 形式へ正規化します。
 *
 * @param threadKey RPC request または内部 command から受け取った公開 Thread key です。
 * @returns Unicode NFC へ正規化した Thread key です。
 * @throws この関数自体は検証を行わないため例外を投げません。
 * @example
 * ```ts
 * const normalized = normalizeThreadKey(command.threadKey);
 * ```
 */
export function normalizeThreadKey(threadKey: string): string {
  return threadKey.normalize('NFC');
}

/**
 * Thread key validation で使う UTF-8 byte 長を計算します。
 *
 * @param value UTF-8 byte 長を測りたい文字列です。
 * @returns `TextEncoder` で符号化した byte 数です。
 * @throws `TextEncoder` の runtime 実装が利用できない環境では runtime 例外が発生します。
 * @example
 * ```ts
 * if (getUtf8ByteLength(normalized) > maxThreadKeyUtf8Bytes) throw new TypeError('too long');
 * ```
 */
export function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/**
 * 公開 Thread key を検証し、Agent ID と正規化済み key の identity に変換します。
 *
 * @param agentId Durable Object instance と一致する Agent aggregate ID です。
 * @param threadKey RPC request から受け取った未正規化の Thread key です。
 * @returns 元の key と NFC 正規化済み key を持つ Thread identity です。
 * @throws TypeError 正規化後の key が空、または 512 UTF-8 bytes を超える場合に発生します。
 * @example
 * ```ts
 * const identity = createThreadKeyIdentity(agentId, request.threadKey);
 * ```
 */
export function createThreadKeyIdentity(agentId: string, threadKey: string): ThreadKeyIdentity {
  const normalizedThreadKey = normalizeThreadKey(threadKey);
  if (normalizedThreadKey === '') {
    throw new TypeError('thread_key must not be empty.');
  }
  if (getUtf8ByteLength(normalizedThreadKey) > maxThreadKeyUtf8Bytes) {
    throw new TypeError('thread_key must be at most 512 UTF-8 bytes after NFC normalization.');
  }
  return { agentId, threadKey, normalizedThreadKey };
}
