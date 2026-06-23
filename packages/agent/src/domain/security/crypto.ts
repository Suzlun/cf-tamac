const textEncoder = new TextEncoder();

type AgentSubtleKeyUsage = 'sign' | 'verify';

/**
 * Signature algorithms supported by the dependency-free Agent security foundation.
 */
export const agentSignatureAlgorithms = ['HS256', 'RS256', 'ES256'] as const;

/**
 * Signature algorithm value supported by Agent security primitives.
 */
export type AgentSignatureAlgorithm = (typeof agentSignatureAlgorithms)[number];

/**
 * Key material accepted by Agent signature verification and signing helpers.
 */
export type AgentSignatureKeyMaterial = CryptoKey | JsonWebKey | Uint8Array | string;

/**
 * Return whether a value is a supported Agent signature algorithm.
 */
export function isAgentSignatureAlgorithm(value: string): value is AgentSignatureAlgorithm {
  return value === 'HS256' || value === 'RS256' || value === 'ES256';
}

/**
 * Verify bytes with Web Crypto using Agent-supported JWT/signature algorithms.
 */
export async function verifyBytesWithAgentKey(input: {
  readonly algorithm: AgentSignatureAlgorithm;
  readonly data: Uint8Array;
  readonly key: AgentSignatureKeyMaterial;
  readonly signature: Uint8Array;
}): Promise<boolean> {
  const key = await importAgentSignatureKey(input.algorithm, input.key, ['verify']);
  return crypto.subtle.verify(
    getSubtleSignVerifyAlgorithm(input.algorithm),
    key,
    input.signature,
    input.data
  );
}

/**
 * Sign bytes with Web Crypto using Agent-supported provider metadata algorithms.
 */
export async function signBytesWithAgentKey(input: {
  readonly algorithm: AgentSignatureAlgorithm;
  readonly data: Uint8Array;
  readonly key: AgentSignatureKeyMaterial;
}): Promise<Uint8Array> {
  const key = await importAgentSignatureKey(input.algorithm, input.key, ['sign']);
  const signature = await crypto.subtle.sign(
    getSubtleSignVerifyAlgorithm(input.algorithm),
    key,
    input.data
  );
  return new Uint8Array(signature);
}

async function importAgentSignatureKey(
  algorithm: AgentSignatureAlgorithm,
  material: AgentSignatureKeyMaterial,
  usages: readonly AgentSubtleKeyUsage[]
): Promise<CryptoKey> {
  if (isCryptoKeyLike(material)) {
    return material;
  }
  if (algorithm === 'HS256') {
    return importHmacKey(material, usages);
  }
  if (!isJsonWebKeyMaterial(material)) {
    throw new TypeError(`${algorithm} requires CryptoKey or JWK key material.`);
  }
  return crypto.subtle.importKey('jwk', material, getSubtleImportAlgorithm(algorithm), false, [
    ...usages,
  ]);
}

function importHmacKey(
  material: AgentSignatureKeyMaterial,
  usages: readonly AgentSubtleKeyUsage[]
): Promise<CryptoKey> {
  if (isJsonWebKeyMaterial(material)) {
    return crypto.subtle.importKey('jwk', material, hmacImportAlgorithm, false, [...usages]);
  }
  const rawKey = typeof material === 'string' ? textEncoder.encode(material) : material;
  if (!(rawKey instanceof Uint8Array)) {
    throw new TypeError('HS256 raw key material must be bytes or string.');
  }
  return crypto.subtle.importKey('raw', rawKey, hmacImportAlgorithm, false, [...usages]);
}

function getSubtleImportAlgorithm(algorithm: AgentSignatureAlgorithm) {
  if (algorithm === 'RS256') {
    return { hash: 'SHA-256', name: 'RSASSA-PKCS1-v1_5' };
  }
  if (algorithm === 'ES256') {
    return { name: 'ECDSA', namedCurve: 'P-256' };
  }
  return hmacImportAlgorithm;
}

function getSubtleSignVerifyAlgorithm(algorithm: AgentSignatureAlgorithm) {
  if (algorithm === 'RS256') {
    return { hash: 'SHA-256', name: 'RSASSA-PKCS1-v1_5' };
  }
  if (algorithm === 'ES256') {
    return { hash: 'SHA-256', name: 'ECDSA' };
  }
  return { name: 'HMAC' };
}

const hmacImportAlgorithm = { hash: 'SHA-256', name: 'HMAC' };

function isCryptoKeyLike(value: AgentSignatureKeyMaterial): value is CryptoKey {
  return typeof value === 'object' && 'algorithm' in value && 'type' in value && 'usages' in value;
}

function isJsonWebKeyMaterial(value: AgentSignatureKeyMaterial): value is JsonWebKey {
  return typeof value === 'object' && !(value instanceof Uint8Array) && !isCryptoKeyLike(value);
}
