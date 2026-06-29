import { describe, expect, it } from 'vitest';

import {
  ControlPlaneTrustConfigError,
  parseControlPlaneTrustConfig,
  resolveControlPlaneTrustKey,
  verifyClientServiceJwt,
} from '../domain/security';

import {
  createClientServiceJwtPayload,
  createEd25519TrustFixture,
  signEd25519ClientJwt,
} from './ed25519-jwt-test-helpers';

describe('Agent control-plane trust config', () => {
  it('[AGENT-SECURITY-S010] 信頼設定が issuer と Ed25519 public key policy を解決する', async () => {
    const fixture = await createEd25519TrustFixture({
      allowedAgentIds: ['agent-alpha'],
      allowedScopes: ['agent:read'],
    });
    const config = await parseControlPlaneTrustConfig(fixture.trustConfigJson, 1_700_000_000_000);
    const key = resolveControlPlaneTrustKey(config, fixture.issuer, fixture.kid);

    expect(config.diagnostic).toMatchObject({
      issuerCount: 1,
      keyCount: 1,
      status: 'serving',
      version: '1',
    });
    expect(key).toMatchObject({ status: 'found' });
    if (key.status !== 'found') throw new Error('expected trust key');
    expect(key.key).toMatchObject({
      allowedAgentIds: ['agent-alpha'],
      allowedScopes: ['agent:read'],
      fingerprint: fixture.fingerprint,
      principalType: 'CLIENT_SERVICE',
      status: 'active',
    });
  });

  it('[AGENT-SECURITY-S010] ADMIN_OPERATOR trust key は break-glass principal として伝搬される', async () => {
    const fixture = await createEd25519TrustFixture({
      allowedScopes: ['agent:admin'],
      principalType: 'ADMIN_OPERATOR',
    });
    const config = await parseControlPlaneTrustConfig(fixture.trustConfigJson, 1_700_000_000_000);
    const token = await signEd25519ClientJwt({
      kid: fixture.kid,
      payload: createClientServiceJwtPayload({
        actingUserId: 'operator-1',
        fingerprint: fixture.fingerprint,
        issuer: fixture.issuer,
        scopes: ['agent:admin'],
        subject: 'admin-operator-principal',
      }),
      privateKey: fixture.privateKey,
    });

    const result = await verifyClientServiceJwt(token, {
      expectedAudience: 'test-audience',
      requiredScopes: ['agent:admin'],
      trustConfig: config,
    });

    expect(result).toMatchObject({
      principal: {
        actingUserId: 'operator-1',
        principalId: 'admin-operator-principal',
        principalType: 'ADMIN_OPERATOR',
        trustSummary: { principalType: 'ADMIN_OPERATOR' },
      },
      status: 'verified',
    });
  });

  it('[AGENT-SECURITY-S011] 不正な trust config は安全側で拒否される', async () => {
    await expect(parseControlPlaneTrustConfig('{')).rejects.toMatchObject({
      reason: 'malformed_json',
    });
    await expect(
      parseControlPlaneTrustConfig(
        JSON.stringify({
          audiences: ['test-audience'],
          issuers: [
            {
              issuer: 'client',
              keys: [
                {
                  allowedAgentIds: ['agent-alpha'],
                  allowedScopes: ['agent:read'],
                  crv: 'Ed25519',
                  d: 'private-parameter',
                  kid: 'kid-1',
                  kty: 'OKP',
                  principalType: 'CLIENT_SERVICE',
                  status: 'active',
                  x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
                },
              ],
            },
          ],
          version: 1,
        })
      )
    ).rejects.toBeInstanceOf(ControlPlaneTrustConfigError);

    const revokedFixture = await createEd25519TrustFixture({ status: 'revoked' });
    const config = await parseControlPlaneTrustConfig(revokedFixture.trustConfigJson);
    const token = await signEd25519ClientJwt({
      kid: revokedFixture.kid,
      payload: createClientServiceJwtPayload({
        fingerprint: revokedFixture.fingerprint,
        issuer: revokedFixture.issuer,
      }),
      privateKey: revokedFixture.privateKey,
    });
    const result = await verifyClientServiceJwt(token, {
      expectedAudience: 'test-audience',
      trustConfig: config,
    });
    expect(result).toMatchObject({ reason: 'revoked_key', status: 'rejected' });
    expect(resolveControlPlaneTrustKey(config, 'unknown', revokedFixture.kid)).toMatchObject({
      reason: 'unknown_issuer',
    });
    expect(resolveControlPlaneTrustKey(config, revokedFixture.issuer, 'unknown')).toMatchObject({
      reason: 'unknown_kid',
    });
  });

  it('[AGENT-SECURITY-S012] retiring key は bounded token window 内だけ検証される', async () => {
    const fixture = await createEd25519TrustFixture({ status: 'retiring' });
    const config = await parseControlPlaneTrustConfig(fixture.trustConfigJson);
    const valid = await signEd25519ClientJwt({
      kid: fixture.kid,
      payload: createClientServiceJwtPayload({
        expiresInSeconds: 120,
        fingerprint: fixture.fingerprint,
        issuer: fixture.issuer,
      }),
      privateKey: fixture.privateKey,
    });
    const overlong = await signEd25519ClientJwt({
      kid: fixture.kid,
      payload: createClientServiceJwtPayload({
        expiresInSeconds: 600,
        fingerprint: fixture.fingerprint,
        issuer: fixture.issuer,
        notBeforeOffsetSeconds: 0,
      }),
      privateKey: fixture.privateKey,
    });

    await expect(
      verifyClientServiceJwt(valid, { expectedAudience: 'test-audience', trustConfig: config })
    ).resolves.toMatchObject({ status: 'verified' });
    await expect(
      verifyClientServiceJwt(overlong, { expectedAudience: 'test-audience', trustConfig: config })
    ).resolves.toMatchObject({ reason: 'ttl_exceeded', status: 'rejected' });
  });
});
