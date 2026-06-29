/**
 * Marker used when observability output removes secret-bearing material.
 */
export const agentRedactedValue = '[REDACTED]';

/**
 * Return whether an observability key is considered secret-bearing.
 */
export function isSensitiveObservabilityKey(key: string): boolean {
  const normalized = key.toLowerCase();
  if (normalized.endsWith('digest') || normalized.endsWith('summary')) return false;
  return (
    normalized.includes('authorization') ||
    normalized.includes('bearer') ||
    normalized.includes('chainofthought') ||
    normalized.includes('chain_of_thought') ||
    normalized.includes('completiontext') ||
    normalized.includes('credential') ||
    normalized.includes('encryptedprivatejwk') ||
    normalized.includes('hiddenreasoning') ||
    normalized.includes('jwk') ||
    normalized.includes('jwt') ||
    normalized.includes('keymaterial') ||
    normalized.includes('password') ||
    normalized.includes('prompttext') ||
    normalized.includes('private') ||
    normalized.includes('publickey') ||
    normalized.includes('rawcompletion') ||
    normalized.includes('raw_completion') ||
    normalized.includes('rawjwt') ||
    normalized.includes('rawprompt') ||
    normalized.includes('raw_prompt') ||
    normalized.includes('rawreasoning') ||
    normalized.includes('raw_reasoning') ||
    normalized === 'reasoning' ||
    normalized.includes('secret') ||
    normalized.includes('set-cookie') ||
    normalized.includes('signature') ||
    normalized.includes('token') ||
    normalized === 'x'
  );
}

/**
 * Redact a single secret value without preserving length or prefixes.
 */
export function redactSecretValue(_value: unknown): string {
  return agentRedactedValue;
}

/**
 * Recursively redact secret-bearing fields from an observability value.
 */
export function redactObservabilityValue(value: unknown): unknown {
  return redactObservabilityValueAtDepth(value, 0);
}

/**
 * Redact secret-bearing fields from an object destined for logs or audit records.
 */
export function redactObservabilityRecord(
  record: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      isSensitiveObservabilityKey(key) ? redactSecretValue(value) : redactObservabilityValue(value),
    ])
  );
}

function redactObservabilityValueAtDepth(value: unknown, depth: number): unknown {
  if (depth > 6) {
    return '[MAX_DEPTH]';
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactObservabilityValueAtDepth(entry, depth + 1));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        isSensitiveObservabilityKey(key)
          ? redactSecretValue(nestedValue)
          : redactObservabilityValueAtDepth(nestedValue, depth + 1),
      ])
    );
  }
  return value;
}
