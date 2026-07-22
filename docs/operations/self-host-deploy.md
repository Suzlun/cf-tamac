# Self-host deployment with Deploy to Cloudflare

この guide は、local clone、local `pnpm install`、local `wrangler` 操作を要求せずに、Cloudflare Dashboard の Deploy flow から `cf-tamac` を導入するための手順です。

## 1. Deploy Buttons

[Deploy Agent to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/Suzlun/cf-tamac/tree/deploy-agent)

[Deploy Client to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/Suzlun/cf-tamac/tree/deploy-client)

## 2. 生成 branch の責務

- `deploy-agent` は Agent Service Worker だけを branch root に持つ generated artifact branch です。
- `deploy-client` は Management Client Worker だけを branch root に持つ generated artifact branch です。
- どちらの branch も手編集しません。`main` または `develop` への push 後、CI が `.deploy/agent` と `.deploy/client` から再生成して publish します。
- Agent と Client は別 Worker として deploy し、binding、secret、rollback、Cloudflare Access policy を分離します。
- Agent artifact の生成時は `CF_TAMAC_AGENT_RATE_LIMIT_NAMESPACE_PRODUCTION` と `CF_TAMAC_AGENT_RATE_LIMIT_NAMESPACE_STAGING` に、Cloudflare accountで割り当てた正整数のnamespace IDを明示します。generatorは未指定・不正値・同一値を拒否し、sourceのlocal example値をdeploy artifactへコピーしません。

## 3. Agent を先に deploy

1. Agent Deploy Button を先に押します。
2. Worker name、account、route を Cloudflare Dashboard で確認します。
3. `AI_AGENT` Durable Object binding、SQLite migration、`AGENT_BLOBS` R2 binding、Workers AI `AI` binding が Deploy flow に含まれることを確認します。
4. `AGENT_RPC_AUDIENCE` は `cf-tamac-agent` のまま開始し、必要に応じて Agent Worker origin または運用上の audience へ変更します。
5. `AGENT_AUDIT_HASH_PEPPER` を長いランダム値として Worker Secret に設定します。

## 4. Client signing key を生成

1. Client Deploy 後に `CLIENT_CREDENTIAL_ENCRYPTION_KEY` を base64 encoded 32-byte AES key として Worker Secret に設定します。
2. Management Client の `Global Settings > Signing Keys` で Ed25519 signing key pair を生成します。
3. private JWK は Client server-side code が `CLIENT_CREDENTIAL_ENCRYPTION_KEY` で暗号化し、Client D1 の encrypted signing key store に保存します。
4. Client private signing key JSON を Worker Secret へ貼りません。private key parameter `d` は Browser、HTML、bundle、log、Agent Worker trust config に出しません。

## 5. Agent trust config を設定

1. Management Client の `Global Settings > Trust Config Export` を開きます。
2. public-only `AGENT_CONTROL_PLANE_TRUST` JSON を生成します。
3. JSON に `version`、`audiences`、`issuers`、`issuer`、`kid`、Ed25519 public key `x`、`status`、`principalType`、`allowedAgentIds`、`allowedScopes`、`fingerprint` が含まれることを確認します。
4. JSON に private key parameter `d`、private JWK、encrypted private JWK、生 JWT が含まれないことを確認します。
5. Cloudflare Dashboard の Agent Worker Variables and Secrets で `AGENT_CONTROL_PLANE_TRUST` に貼り付けます。
6. `AGENT_RPC_AUDIENCE` と `AGENT_CONTROL_PLANE_TRUST.audiences` を一致させます。

## 6. Client を deploy

1. Client Deploy Button を押します。
2. `CLIENT_DB` D1 database を Cloudflare Dashboard で作成または選択します。
3. `src/server/db/migrations` の Client D1 migrations を適用します。
4. `AGENT_RPC_ALLOWED_ORIGINS` は、Cloudflare Dashboard の variable value 欄へ raw JSON array をそのまま入力します。`JSON.stringify(...)` の二重 encode、JSON 全体を囲む追加 quote、path、query、fragment、userinfo、duplicate、non-canonical default `:443` は入力しません。

   ```json
   ["https://agent.example.com", "https://agent-staging.example.com"]
   ```

5. `AGENT_RPC_AUDIENCE` を Agent Worker の `AGENT_RPC_AUDIENCE` と `AGENT_CONTROL_PLANE_TRUST.audiences` に一致させます。audience は destination origin や secret ではありません。
6. `CLIENT_ACTING_OPERATOR_ID` と `CLIENT_ACTING_SCOPES` は運用 policy に合わせて絞ります。
7. `CLIENT_CREDENTIAL_ENCRYPTION_KEY` が Worker Secret として設定済みであることを確認します。

## 7. Cloudflare Access

1. Human / Browser から Management Client への入口には Cloudflare Access を必ず置きます。
2. Management Client は Access 後段の管理 UI と server-side execution boundary として扱います。
3. Browser-visible code に Agent RPC credential、JWT signing material、Provider secret、private JWK、encrypted private JWK、生 JWT が含まれないことを確認します。
4. Client Worker に Agent API proxy route、`/api/client/*`、`/api/agent*`、arbitrary RPC forwarding route を追加しません。

## 8. Provider ingress boundary

1. Integration Provider は Agent/Client Worker と分離した server-side deployment とし、Provider-owned Ed25519 private signing key を Client D1、Client Worker Secret、Browser へ移しません。
2. Provider には `TamacProviderIngressClient` の `PublishEvent`、`PublishToolResult`、`PublishDeliveryResult` だけを使わせます。Client Service JWT、acting user、Client D1 context を Provider request に渡しません。
3. Provider は unsigned generated Protobuf body の digest/length と canonical identity text を detached-sign します。Agent は active Installation/trust key、request identity、digest、Ed25519 signature、Agent-owned fixed `300_000` ms timestamp window を検証し、verified `INTEGRATION_INSTALLATION` principal を作ってから nonce/idempotency reservation と Agent-local final authorization を行います。
4. Provider が request metadata で自己申告する skew を Agent の trust source にしません。

## 8.1 Provider ingress Rate Limiting

1. Agent Worker の `PROVIDER_INGRESS_RATE_LIMITER` は production と staging に別々に割り当てた Cloudflare Rate Limiting namespace を使います。各 namespace は Provider ingress 専用で、`limit = 100`、`period = 60` に設定します。
2. Provider ingress route は Cloudflare proxied にします。trusted source は Cloudflare が付与する単一の `CF-Connecting-IP` と generated Provider RPC procedure で評価されるため、DNS-only route、direct origin、Worker subrequest は信頼済み Provider source として扱いません。
3. Workers Logs/Traces と監視では HTTP 429、`agent.provider_ingress_rate_limit_denied` counter、service、method、`PROVIDER_INGRESS_PRE_AUTH`、request/correlation ID を照合します。detached signature、raw Protobuf body、Provider credential、key material は log へ出しません。
4. staging では valid binary Protobuf Provider request に対する binding 未設定、binding exception、異常 outcome の smoke を行います。いずれも HTTP 429 / `resource_exhausted` となり、Agent Event、Run、state version が変更されないことを確認してから production namespace を有効化します。

## 9. Health verification and staging smoke

1. Management Client で managed Agent record を作成し、allowlist にある Agent Worker origin、Agent ID、signing issuer/kid/fingerprint を設定します。登録 input は canonicalize 後に `AGENT_RPC_ALLOWED_ORIGINS` と exact match しなければなりません。
2. Agent settings から `AgentHealthService.Check` を実行します。
3. 成功結果に serving/degraded metadata、issuer、kid、fingerprint、trust config fingerprint、Browser-safe `correlationId` が表示されることを確認します。
4. allowlist から外した stored origin の record を使う operation が、signing key、acting user、SDK transport の解決前に configuration failure として停止することを staging で確認します。
5. 成功・失敗とも Browser result が `displayData`、`safeStatus`、`safeErrorCategory`、`correlationId` だけを返し、raw diagnostic、JWT、credential、signing material、origin policy detail を含まないことを確認します。問い合わせ時は correlation ID を使って Client/Agent の server-side logs を照合します。
6. REST `/health`、HTTP GET、Connect JSON request、public Durable Object fetch probe が成功 path にならないことを確認します。
7. Provider staging request は three-method detached-signature surface に限定され、invalid signature、inactive Installation/key、window 外 timestamp、reused nonce が受理されないことを確認します。
8. Provider Rate Limiting の allowance 超過、trusted source 不成立、binding failure が固定 safe HTTP 429 / `resource_exhausted` となり、counter と request/correlation ID だけで調査できることを確認します。
9. 失敗時は `docs/operations/agent-control-plane-auth.md` の rotation、emergency revoke、break-glass recovery に従います。

## 10. Maintainer verification commands

source change または generated deploy artifact を更新する maintainer は、repository root で次を実行します。

```bash
export CF_TAMAC_AGENT_RATE_LIMIT_NAMESPACE_PRODUCTION='<production namespace id>'
export CF_TAMAC_AGENT_RATE_LIMIT_NAMESPACE_STAGING='<staging namespace id>'
pnpm check:codegen
pnpm lint:governance
pnpm lint:openspec
pnpm test:client
pnpm test:agent
pnpm test:governance
pnpm gen:deploy-artifacts && pnpm check:deploy-artifacts
```

`pnpm check:deploy-artifacts` は構文・境界検証用の分離したfixture IDを明示して実行します。Deploy Button branchをpublishするCIは、同名のGitHub repository Variablesを必須入力としてgeneratorへ渡します。
