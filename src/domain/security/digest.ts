import type { AgentRawBodyDigest } from './types';

/**
 * Compute a lowercase SHA-256 hex digest for protobuf request bytes.
 */
export async function computeSha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return toHex(new Uint8Array(digest));
}

/**
 * Create the raw body digest object shared by replay, signature, and audit seams.
 */
export async function createRawBodyDigest(bytes: Uint8Array): Promise<AgentRawBodyDigest> {
  return {
    algorithm: 'sha-256',
    byteLength: bytes.byteLength,
    digestHex: await computeSha256Hex(bytes),
  };
}

/**
 * Compare digest hex strings without early return on matching prefixes.
 */
export function timingSafeEqualHex(left: string, right: string): boolean {
  const normalizedLeft = left.toLowerCase();
  const normalizedRight = right.toLowerCase();
  const maxLength = Math.max(normalizedLeft.length, normalizedRight.length);
  let difference = normalizedLeft.length ^ normalizedRight.length;
  for (let index = 0; index < maxLength; index += 1) {
    difference |= readCharCode(normalizedLeft, index) ^ readCharCode(normalizedRight, index);
  }
  return difference === 0;
}

function readCharCode(value: string, index: number): number {
  const code = value.charCodeAt(index);
  return Number.isNaN(code) ? 0 : code;
}

function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}
