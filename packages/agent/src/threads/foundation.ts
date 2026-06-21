/**
 * Maximum UTF-8 byte length for a normalized thread key.
 */
export const maxThreadKeyUtf8Bytes = 512;

/**
 * Thread key identity input used by validation and storage seams.
 */
export interface ThreadKeyIdentity {
  readonly agentId: string;
  readonly threadKey: string;
  readonly normalizedThreadKey: string;
}

/**
 * Normalize a thread key for Agent-scoped identity comparisons.
 */
export function normalizeThreadKey(threadKey: string): string {
  return threadKey.normalize('NFC');
}

/**
 * Return the UTF-8 byte length used by thread key validation.
 */
export function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/**
 * Validate and normalize a public thread key.
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
