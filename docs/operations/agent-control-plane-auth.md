# Agent control-plane authentication operations

この runbook は、Management Client から Agent Worker へ送る本番 Client Service RPC を Ed25519 JWT と `AGENT_CONTROL_PLANE_TRUST` で安全に運用するための手順です。Agent public API は Connect unary binary Protobuf だけであり、REST/JSON auth route、bootstrap RPC、AgentTrustRegistry Durable Object、HS256 shared secret、`AGENT_CREDENTIAL_*` Worker Secret を Client Service 認証の正本にしません。

## 1. 運用境界

- Agent Worker は `AGENT_CONTROL_PLANE_TRUST` と `AGENT_AUDIT_HASH_PEPPER` を required secret として読み、公開鍵、issuer、kid、status、allowed Agent、allowed scope、audience だけを認証に信頼し、監査上の利用者識別子は secret pepper 付き HMAC で相関します。
- Management Client は `CLIENT_CREDENTIAL_ENCRYPTION_KEY` を required secret として使い、Client D1 の encrypted Client Service signing key store に private JWK を暗号化保存します。
- Browser、HTML、Client bundle、public Client route、log、D1 の平文列、Worker variables には private JWK plaintext、encrypted private JWK、生 JWT、署名 logic、完全な public key value を出しません。
- Client private signing key JSON を Worker Secret へ手貼りする運用は禁止です。Worker Secret は暗号化 root key と Agent 側 public-only trust config に限定します。
- Client Service JWT の送信先は Client Worker の server-managed `AGENT_RPC_ALLOWED_ORIGINS` だけです。この値は unique canonical HTTPS origins の non-empty JSON array とし、Browser registration input と Client D1 の stored origin は signing key、acting user、SDK transport の解決前に exact-match で再検証します。
- `TamacAgentClient` の Client Service JWT surface と `TamacProviderIngressClient` の Provider detached-signature surface を混在させません。Provider は Client D1、acting user、Client Service JWT を受け取らず、`PublishEvent`、`PublishToolResult`、`PublishDeliveryResult` だけを呼びます。
- SDK-backed Server Action は成功・失敗とも `displayData`、`safeStatus`、`safeErrorCategory`、secret-free `correlationId` だけを Browser に返します。raw Connect/SDK diagnostic、origin policy detail、credential、JWT、signing material、D1 record は server-side security/observability context に閉じます。

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
4. Agent Worker に trust config と監査 hash pepper を secret として設定します。`AGENT_AUDIT_HASH_PEPPER` は監査 record の `actingUserIdHash` / `subjectHash` だけに使う長いランダム値で、Client signing key や trust config とは分離します。

   ```bash
   wrangler secret put --config packages/agent/wrangler.toml AGENT_AUDIT_HASH_PEPPER
   wrangler secret put --config packages/agent/wrangler.toml AGENT_CONTROL_PLANE_TRUST
   ```

5. managed Agent record に既存 global signing key の issuer/kid/fingerprint を選択し、`AgentHealthService.Check` を実行します。成功時は trust config fingerprint、issuer、kid、fingerprint、last verified at を key material なしで確認できます。
6. Client Worker の `AGENT_RPC_ALLOWED_ORIGINS` に、Client Service JWT を送る Agent Worker origin を canonical HTTPS JSON array として設定します。例は `AGENT_RPC_ALLOWED_ORIGINS='["https://agent.example.com"]'` です。各 literal は `URL.origin` と完全一致し、path、query、fragment、userinfo、duplicate、non-canonical default `:443` を含めません。
7. `AGENT_RPC_AUDIENCE` が Agent Worker の `AGENT_RPC_AUDIENCE` と `AGENT_CONTROL_PLANE_TRUST.audiences` に一致することを確認します。audience は origin や secret ではありません。

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
- canonical allowlist origin の managed Agent registration と health operation が成功し、policy から外した stored origin が signing-key/acting-user/SDK transport の解決前に `configuration` category の safe failure になることを確認します。
- successful / failed SDK-backed Server Action の Browser result が `displayData`、`safeStatus`、`safeErrorCategory`、`correlationId` だけを持つことを確認します。Browser へ raw diagnostic や secret を返さず、correlation ID で Client/Agent の server-side logs を照合します。
- Provider staging では、Provider-owned Ed25519 signer が unsigned Protobuf digest と canonical request identity を detached-sign した three-method request だけを送ります。Agent が active Installation/trust key、identity、digest、signature、Agent-owned fixed `300_000` ms window を検証して `INTEGRATION_INSTALLATION` principal を作ること、invalid signature、inactive key/Installation、window 外 timestamp、reused nonce を拒否することを確認します。
- Browser response、storage、bundle、public Client route に private JWK、encrypted private JWK、生 JWT、signing material、Agent credential forwarding が含まれないことを確認します。
- Client D1 は managed Agent records、外部 credential references (external credential references)、encrypted Client Service signing key store だけを持ち、Agent domain snapshots と plaintext secrets を持たないことを確認します。

## 8. Provider ingress Rate Limiting の運用

1. `PROVIDER_INGRESS_RATE_LIMITER` は production と staging で異なる Cloudflare Rate Limiting namespace を使い、各 namespace の policy は `100` requests / `60` seconds に固定します。namespace ID は Worker deployment configuration にだけ保持し、Client D1、Browser、application log へ記録しません。deploy artifact generatorへ `CF_TAMAC_AGENT_RATE_LIMIT_NAMESPACE_PRODUCTION` と `CF_TAMAC_AGENT_RATE_LIMIT_NAMESPACE_STAGING` を明示し、未指定・不正値・同一値を拒否したうえで、各環境専用IDを生成artifactへ注入します。`packages/agent/wrangler.toml` の値は repository test fixtureであり、Deploy Button branchへ直接コピーしません。
2. Provider ingress は Cloudflare proxied route と、運用者が設定する WAF/route allowlist または同等の edge control を通して受けます。Worker 内の trusted-source check は Cloudflare が付与する単一の `CF-Connecting-IP` と generated Provider RPC procedure を limiter key の入力として検査し、direct origin、DNS-only route、Worker subrequest、欠落または複数の source header を fail closed にします。この header 形式検査だけを network provenance や Provider authentication の証明として扱わず、edge control を省略しません。
3. HTTP 429 または `agent.provider_ingress_rate_limit_denied` counter を調査するときは、service、method、`PROVIDER_INGRESS_PRE_AUTH`、timestamp、request ID、correlation ID を相関します。detached signature、raw request body、nonce、Provider credential、key material は log、ticket、runbook の記録へ出しません。
4. staging で RateLimit binding の欠落、binding exception、異常 outcome を再現する smoke を実行します。valid binary Protobuf Provider ingress が固定 safe HTTP 429 / `resource_exhausted` となり、Agent state mutation や高コスト処理が開始されないことを確認します。

## 9. Registration と model-policy reconciliation

1. managed Agent registration の `InitializeAgent` response が timeout、response loss、または ledger active 確定 failure により未確定になった場合、Management Client の `登録状態を確認` action を使います。同じ attempt の idempotency key、registration request digest、correlation ID で `GetAgent` を照合し、Agent profile/config/default policyと、Agent-owned initialization receiptのkey/digestがすべて完全一致した場合だけ ledger を `active` として確定します。
2. `GetAgent` が `not_found` を返した場合だけ、同じ attempt の Client-owned ledger、credential reference、signing metadataをatomic cleanupして再登録可能な状態へ戻します。`destroyed`、missing receipt、profile/config/default policyまたはreceiptの部分一致、query errorはAgentの状態を断定せず`reconciliation_required`を保持し、同じcorrelation IDで安全な再確認actionを案内します。Browser responseとlogにはsafe status、safe error category、correlation ID、allowlisted display dataだけを出します。
3. model-policy の `UpdateConfig` response が未確定な場合は、同一 operation context の `GetConfig` で desired/previous model policy reference と config version を照合します。Management Client の `適用状態を確認` action だけを次操作として使い、別 idempotency context で重複 mutation を発行しません。
4. registration/model-policy の調査では attempt ID、phase、safe error category、request/correlation ID を server-side observability で照合します。private JWK、encrypted private JWK、raw JWT、Agent credential、Provider signature、request payload は表示、log、手順記録へ含めません。

## 10. Source and deploy verification commands

source、codegen policy、Client destination policy、または deploy artifact を更新する maintainer は repository root で次を実行します。

```bash
pnpm check:codegen
pnpm lint:eslint
pnpm lint:governance
pnpm lint:openspec
pnpm test:agent
pnpm test:client
pnpm test:governance
pnpm gen:deploy-artifacts && pnpm check:deploy-artifacts
```

Provider or Agent contract を変更した場合は、先に `pnpm gen:agent:proto && pnpm gen:agent:rpc` を実行し、4つの command-owned generated roots を手編集せずに `pnpm check:codegen` を通します。
