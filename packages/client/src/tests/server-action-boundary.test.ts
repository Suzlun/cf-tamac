import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const serverActionPath = new URL('../server/actions/managed-agents.ts', import.meta.url);
const createClientPath = new URL('../server/agent-rpc/create-client.ts', import.meta.url);

describe('Server Action credential boundary', () => {
  it('[CLIENT-REGISTRY-S002] saveCredentialReference returns browser-safe credential reference', () => {
    const source = readFileSync(fileURLToPath(serverActionPath.href), 'utf8');

    expect(source).toContain('toBrowserSafeCredentialReference');
    expect(source).toContain('BrowserSafeCredentialReference');
    expect(source).not.toContain('CredentialReferenceRecord');
  });
});

describe('Server Agent RPC factory error normalization integration', () => {
  it('[CLIENT-REGISTRY-S003] factory exposes withErrorNormalization helper', () => {
    const source = readFileSync(fileURLToPath(createClientPath.href), 'utf8');

    expect(source).toContain('withErrorNormalization');
    expect(source).toContain('withAgentRpcErrorNormalization');
  });
});
