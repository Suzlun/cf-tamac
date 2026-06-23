const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

/**
 * Decode base64url text into bytes without accepting padding-sensitive variants silently.
 */
export function decodeBase64UrlBytes(input: string): Uint8Array {
  if (input.length % 4 === 1) {
    throw new TypeError('Invalid base64url length.');
  }
  const normalized = normalizeBase64Url(input);
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/**
 * Encode bytes using unpadded base64url text.
 */
export function encodeBase64UrlBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

/**
 * Decode a base64url JSON object and return undefined for non-object payloads.
 */
export function decodeBase64UrlJsonObject(input: string): Record<string, unknown> | undefined {
  const text = textDecoder.decode(decodeBase64UrlBytes(input));
  const parsed: unknown = JSON.parse(text);
  if (isRecord(parsed)) {
    return parsed;
  }
  return undefined;
}

/**
 * Encode a JSON-compatible value as unpadded base64url text.
 */
export function encodeBase64UrlJson(value: unknown): string {
  return encodeBase64UrlBytes(textEncoder.encode(JSON.stringify(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeBase64Url(input: string): string {
  const normalized = input.replaceAll('-', '+').replaceAll('_', '/');
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  return `${normalized}${'='.repeat(paddingLength)}`;
}
