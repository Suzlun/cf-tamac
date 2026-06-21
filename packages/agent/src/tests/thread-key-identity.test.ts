import { describe, expect, it } from 'vitest';

import { createThreadKeyIdentity, maxThreadKeyUtf8Bytes } from '../threads';

describe('Thread key identity', () => {
  it('[AGENT-PLATFORM-S013] Thread key identity is normalized and Agent-scoped', () => {
    const composed = createThreadKeyIdentity('agent-1', 'caf\u00e9');
    const decomposed = createThreadKeyIdentity('agent-1', 'cafe\u0301');
    const differentCase = createThreadKeyIdentity('agent-1', 'Cafe\u0301');
    const otherAgent = createThreadKeyIdentity('agent-2', 'cafe\u0301');
    const maxLength = createThreadKeyIdentity('agent-1', 'a'.repeat(maxThreadKeyUtf8Bytes));

    expect(composed.normalizedThreadKey).toBe(decomposed.normalizedThreadKey);
    expect(composed.agentId).toBe(decomposed.agentId);
    expect(differentCase.normalizedThreadKey).not.toBe(composed.normalizedThreadKey);
    expect(otherAgent.normalizedThreadKey).toBe(composed.normalizedThreadKey);
    expect(otherAgent.agentId).not.toBe(composed.agentId);
    expect(maxLength.normalizedThreadKey).toHaveLength(maxThreadKeyUtf8Bytes);

    expect(composed.normalizedThreadKey).toBe('caf\u00e9');
    expect(composed.normalizedThreadKey).not.toContain('integration:');
    expect(composed.normalizedThreadKey).not.toContain('adapter:');
    expect(composed.normalizedThreadKey).not.toContain('connection:');
    expect(composed.normalizedThreadKey).not.toContain('principal:');
  });
});
