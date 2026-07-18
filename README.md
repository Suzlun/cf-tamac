# cf-tamac Agent Service deploy artifact

この branch root は Cloudflare Deploy Button 用の self-contained Agent Worker application です。monorepo source から自動生成され、手編集しません。

## Deploy

1. Cloudflare Deploy Button でこの branch を選択します。
2. `AGENT_RPC_AUDIENCE` が `AGENT_CONTROL_PLANE_TRUST.audiences` と一致することを確認します。
3. Worker Secret `AGENT_AUDIT_HASH_PEPPER` を長いランダム値で設定します。
4. Management Client の Trust Config Export で生成した public-only JSON を `AGENT_CONTROL_PLANE_TRUST` に設定します。
5. `AGENT_CONTROL_PLANE_TRUST` には Ed25519 private key parameter `d`、private JWK、encrypted private JWK、生 JWT を含めません。
6. Deploy 後、Management Client から `AgentHealthService.Check` を実行して issuer/kid/fingerprint と trust config fingerprint を確認します。

## Local commands

```bash
pnpm install
pnpm build
pnpm deploy
```

Agent public API は Connect unary binary Protobuf だけです。REST、OpenAPI、Orval、JSON DTO、public Durable Object fetch API は公開しません。
