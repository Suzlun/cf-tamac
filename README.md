# cf-tamac Management Client deploy artifact

この branch root は Cloudflare Deploy Button 用の self-contained Management Client Worker application です。monorepo source から自動生成され、手編集しません。

## Deploy

1. Agent Service を先に deploy し、Agent Worker origin を控えます。
2. Cloudflare Deploy Button でこの branch を選択します。
3. `AGENT_RPC_DEFAULT_ORIGIN` を deployed Agent Worker origin に設定します。
4. D1 binding `CLIENT_DB` を作成または選択し、`src/server/db/migrations` の migrations を適用します。
5. Worker Secret `CLIENT_CREDENTIAL_ENCRYPTION_KEY` を base64 encoded 32-byte AES key で設定します。
6. `CLIENT_CONTROL_PLANE_PRIVATE_KEYS` は使いません。Ed25519 private JWK は Management Client UI が生成し、`CLIENT_CREDENTIAL_ENCRYPTION_KEY` で暗号化して Client D1 に保存します。
7. Cloudflare Access を Management Client の前段に置き、Browser-visible code に Agent credential、JWT signing material、Provider secret が出ないことを確認します。

## Local commands

```bash
pnpm install
pnpm build
pnpm deploy:with-migrations
```

Client は Agent RPC を server-only module からのみ呼びます。`/api/client/*`、`/api/agent*`、Agent API proxy route、browser direct Agent RPC は公開しません。
