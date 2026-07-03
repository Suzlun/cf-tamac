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
4. `AGENT_RPC_DEFAULT_ORIGIN` を Agent Worker の deployed origin に設定します。
5. `CLIENT_ACTING_OPERATOR_ID` と `CLIENT_ACTING_SCOPES` は運用 policy に合わせて絞ります。
6. `CLIENT_CREDENTIAL_ENCRYPTION_KEY` が Worker Secret として設定済みであることを確認します。

## 7. Cloudflare Access

1. Human / Browser から Management Client への入口には Cloudflare Access を必ず置きます。
2. Management Client は Access 後段の管理 UI と server-side execution boundary として扱います。
3. Browser-visible code に Agent RPC credential、JWT signing material、Provider secret、private JWK、encrypted private JWK、生 JWT が含まれないことを確認します。
4. Client Worker に Agent API proxy route、`/api/client/*`、`/api/agent*`、arbitrary RPC forwarding route を追加しません。

## 8. Health verification

1. Management Client で managed Agent record を作成し、Agent Worker origin、Agent ID、signing issuer/kid/fingerprint を設定します。
2. Agent settings から `AgentHealthService.Check` を実行します。
3. 成功結果に serving/degraded metadata、issuer、kid、fingerprint、trust config fingerprint が表示されることを確認します。
4. REST `/health`、HTTP GET、Connect JSON request、public Durable Object fetch probe が成功 path にならないことを確認します。
5. 失敗時は `docs/operations/agent-control-plane-auth.md` の rotation、emergency revoke、break-glass recovery に従います。
