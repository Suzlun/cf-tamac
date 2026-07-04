import type { AgentPayloadMetadataView } from './agent-core';

const sha256InitialHash = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
] as const;

const sha256RoundConstants = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

/**
 * inline safe JSON metadata ref を作成します。
 *
 * @param input - ref と JSON payload です。
 * @returns `inlineBytes` と、その byte 列に一致する SHA-256 hex を持つ metadata view です。
 * @remarks
 * Agent response で合成する safe metadata 用の helper です。Provider credential、raw prompt、raw completion、
 * hidden reasoning は payload に含めず、呼び出し側が渡した安全な JSON だけを bytes 化します。
 *
 * @example
 * ```ts
 * const ref = createInlineSafeJsonMetadataView({ ref: 'safe:policy', payload: { ok: true } });
 * ```
 */
export function createInlineSafeJsonMetadataView(input: {
  readonly payload: Record<string, unknown>;
  readonly ref: string;
}): AgentPayloadMetadataView {
  const inlineBytes = new TextEncoder().encode(JSON.stringify(input.payload));
  return {
    byteSize: inlineBytes.byteLength,
    contentType: 'application/json; charset=utf-8',
    inlineBytes,
    ref: input.ref,
    sha256: computeSha256HexSync(inlineBytes),
    storageClass: 'inline',
  };
}

function computeSha256HexSync(bytes: Uint8Array): string {
  const padded = createSha256PaddedMessage(bytes);
  const hash = [...sha256InitialHash];
  const words: number[] = [];
  for (let offset = 0; offset < padded.length; offset += 64) {
    processSha256Chunk(padded, offset, hash, words);
  }
  return hash.map((word) => word.toString(16).padStart(8, '0')).join('');
}

function createSha256PaddedMessage(bytes: Uint8Array): Uint8Array {
  const paddedLength = Math.ceil((bytes.byteLength + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.byteLength] = 0x80;
  const bitLength = BigInt(bytes.byteLength) * 8n;
  for (let index = 0; index < 8; index += 1) {
    padded[paddedLength - 1 - index] = Number((bitLength >> BigInt(index * 8)) & 0xffn);
  }
  return padded;
}

function processSha256Chunk(
  bytes: Uint8Array,
  offset: number,
  hash: number[],
  words: number[]
): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 64);
  words.length = 0;
  for (let index = 0; index < 16; index += 1) {
    words.push(view.getUint32(index * 4));
  }
  for (let index = 16; index < 64; index += 1) {
    const left = words.at(index - 15) ?? 0;
    const right = words.at(index - 2) ?? 0;
    words.push(
      (smallSigma1(right) +
        (words.at(index - 7) ?? 0) +
        smallSigma0(left) +
        (words.at(index - 16) ?? 0)) >>>
        0
    );
  }
  compressSha256Words(hash, words);
}

function compressSha256Words(hash: number[], words: readonly number[]): void {
  let [a, b, c, d, e, f, g, h] = hash;
  for (let index = 0; index < 64; index += 1) {
    const temp1 =
      ((h ?? 0) +
        bigSigma1(e ?? 0) +
        (((e ?? 0) & (f ?? 0)) ^ (~(e ?? 0) & (g ?? 0))) +
        (sha256RoundConstants.at(index) ?? 0) +
        (words.at(index) ?? 0)) >>>
      0;
    const temp2 =
      (bigSigma0(a ?? 0) +
        (((a ?? 0) & (b ?? 0)) ^ ((a ?? 0) & (c ?? 0)) ^ ((b ?? 0) & (c ?? 0)))) >>>
      0;
    h = g;
    g = f;
    f = e;
    e = ((d ?? 0) + temp1) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (temp1 + temp2) >>> 0;
  }
  hash[0] = ((hash[0] ?? 0) + (a ?? 0)) >>> 0;
  hash[1] = ((hash[1] ?? 0) + (b ?? 0)) >>> 0;
  hash[2] = ((hash[2] ?? 0) + (c ?? 0)) >>> 0;
  hash[3] = ((hash[3] ?? 0) + (d ?? 0)) >>> 0;
  hash[4] = ((hash[4] ?? 0) + (e ?? 0)) >>> 0;
  hash[5] = ((hash[5] ?? 0) + (f ?? 0)) >>> 0;
  hash[6] = ((hash[6] ?? 0) + (g ?? 0)) >>> 0;
  hash[7] = ((hash[7] ?? 0) + (h ?? 0)) >>> 0;
}

function bigSigma0(value: number): number {
  return rotateRight(value, 2) ^ rotateRight(value, 13) ^ rotateRight(value, 22);
}

function bigSigma1(value: number): number {
  return rotateRight(value, 6) ^ rotateRight(value, 11) ^ rotateRight(value, 25);
}

function smallSigma0(value: number): number {
  return rotateRight(value, 7) ^ rotateRight(value, 18) ^ (value >>> 3);
}

function smallSigma1(value: number): number {
  return rotateRight(value, 17) ^ rotateRight(value, 19) ^ (value >>> 10);
}

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}
