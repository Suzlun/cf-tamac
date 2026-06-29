# Agent control-plane authentication operations

この runbook は、Management Client から Agent Worker へ送る本番 Client Service RPC を Ed25519 JWT と `AGENT_CONTROL_PLANE_TRUST` で安全に運用するための手順です。Agent public API は Connect unary binary Protobuf だけであり、REST/JSON auth route、bootstrap RPC、AgentTrustRegistry Durable Object、HS256 shared secret、`AGENT_CREDENTIAL_*` Worker Secret を Client Service 認証の正本にしません。

## 1. 運用境界

- Agent Worker は `AGENT_CONTROL_PLANE_TRUST` を required secret として読み、公開鍵、issuer、kid、status、allowed Agent、allowed scope、audience だけを信頼します。
- Management Client は `CLIENT_CREDENTIAL_ENCRYPTION_KEY` を required secret として使い、Client D1 の encrypted Client Service signing key store に private JWK を暗号化保存します。
- Browser、HTML、Client bundle、public Client route、log、D1 の平文列、Worker variables には private JWK plaintext、encrypted private JWK、生 JWT、署名 logic、完全な public key value を出しません。
- Client private signing key JSON を Worker Secret へ手貼りする運用は禁止です。Worker Secret は暗号化 root key と Agent 側 public-only trust config に限定します。

## 2. `AGENT_CONTROL_PLANE_TRUST` schema

Agent Worker に設定する値は public-only JSON です。秘密鍵 parameter `d`、private JWK plaintext、encrypted private JWK、生 JWT を含めてはいけません。

```json
{
  "version": 1,
  "audiences": ["https://agent.example.com"],
  "issuers": [
    {
      "issuer": "cf-tamac-client",
      "keys": [
        {
          "kid": "client-key-2026-06",
          "kty": "OKP",
          "crv": "Ed25519",
          "x": "BASE64URL_PUBLIC_KEY",
          "status": "active",
          "principalType": "CLIENT_SERVICE",
          "allowedAgentIds": ["agent-alpha"],
          "allowedScopes": ["agent:read", "agent:write"],
          "fingerprint": "sha256:..."
        }
      ]
    }
  ]
}
```

`status` は `active`、`retiring`、`revoked` のいずれかです。`active` は通常署名に使う鍵、`retiring` は短命 token window 内の移行用、`revoked` は署名が正しくても拒否する緊急失効用です。`allowedAgentIds` と `allowedScopes` は必要な Agent と method scope に絞り、`ADMIN_OPERATOR` 用 issuer/key は break-glass recovery だけに使います。

## 3. 初期セットアップ / Client signing key generation

1. Management Client に `CLIENT_CREDENTIAL_ENCRYPTION_KEY` を設定します。

   ```bash
   wrangler secret put --config packages/client/wrangler.toml CLIENT_CREDENTIAL_ENCRYPTION_KEY
   ```

2. Management Client の `Global Settings > Signing Keys` で Ed25519 signing key pair を生成します。Client server は private JWK を `CLIENT_CREDENTIAL_ENCRYPTION_KEY` で暗号化し、Client D1 の encrypted signing key store に保存します。
3. `Global Settings > Trust Config Export` で public-only `AGENT_CONTROL_PLANE_TRUST` JSON を生成します。export に `d`、private JWK、encrypted private JWK、生 JWT がないことを確認します。
4. Agent Worker に trust config を secret として設定します。

   ```bash
   wrangler secret put --config packages/agent/wrangler.toml AGENT_CONTROL_PLANE_TRUST
   ```

5. managed Agent record に既存 global signing key の issuer/kid/fingerprint を選択し、`AgentHealthService.Check` を実行します。成功時は trust config fingerprint、issuer、kid、fingerprint、last verified at を key material なしで確認できます。

## 4. Rotation

1. `Global Settings > Signing Keys` で新しい Ed25519 key を生成します。
2. Trust Config Export で旧 key を `retiring`、新 key を `active` とする JSON を生成し、Agent Worker の `AGENT_CONTROL_PLANE_TRUST` を更新します。
3. Agent settings で managed Agent の signing key selection を新 key に切り替えます。
4. `AgentHealthService.Check` が新 key で成功することを確認します。
5. token TTL と replay window が十分に経過した後、旧 key を `revoked` に更新します。

## 5. Emergency revoke

private key 漏えい、誤配布、広すぎる scope の誤設定を確認した場合は、該当 `issuer + kid` を trust config 上で即時 `revoked` にします。Agent Worker secret を更新した後、該当 key で署名された JWT が `unauthenticated` または `permission_denied` として拒否されることを Agent health verification で確認します。Client D1 側では該当 signing key を `disabled` または `deleted` にし、JWT signing に使われない状態にします。

## 6. Break-glass recovery

Management Client が利用不能な場合でも、Cloudflare Dashboard、Cloudflare API、または Wrangler で Agent Worker の `AGENT_CONTROL_PLANE_TRUST` を更新できます。break-glass 用の `ADMIN_OPERATOR` issuer/key は Client-managed signing key store とは別管理にし、通常の Client Service key と同じ D1 store に保存しません。復旧後は `ADMIN_OPERATOR` key を `revoked` に戻し、監査記録と health verification 結果を確認します。

## 7. Local / staging smoke

- Agent と Client の required secrets が設定されていることを確認します。
- `AgentHealthService.Check` を generated Connect client から binary Protobuf で呼び、REST `/health`、Connect JSON、HTTP GET unary が成功 path にならないことを確認します。
- Browser response、storage、bundle、public Client route に private JWK、encrypted private JWK、生 JWT、signing material、Agent credential forwarding が含まれないことを確認します。
- Client D1 は managed Agent records、外部 credential references、encrypted Client Service signing key store だけを持ち、Agent domain snapshots と plaintext secrets を持たないことを確認します。
