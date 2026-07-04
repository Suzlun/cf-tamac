/**
 * 既存の test seam が使う dummy Ed25519 public key `x` parameter です。
 */
export const testEd25519PublicKeyX = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

/**
 * `x-agent-test-*` seam の既存 tests に供給する public-only trust config JSON です。
 */
export const testControlPlaneTrustConfig = JSON.stringify({
  audiences: ['test-audience'],
  issuers: [
    {
      issuer: 'test-issuer',
      keys: [
        {
          allowedAgentIds: ['*'],
          allowedScopes: [
            'agent:read',
            'agent:write',
            'agent:tool:approve',
            'agent:integration:admin',
            'agent:admin',
          ],
          crv: 'Ed25519',
          kid: 'test-key',
          kty: 'OKP',
          principalType: 'CLIENT_SERVICE',
          status: 'active',
          x: testEd25519PublicKeyX,
        },
      ],
    },
  ],
  version: '1',
});
