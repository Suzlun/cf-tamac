# cf-tamac

`cf-tamac` は、Cloudflare Workers 上で動作する自律駆動 AI Agent microservice と、その管理クライアントです。中心はチャット UI ではなく、外部 Event、時刻、Tool 結果、人間の入力、内部状態変化を受けて Agent が次の行動を決める server-side harness です。

## Product Shape

- `1 Agent ID = 1 AIAgent Durable Object instance = 1 AI Agent aggregate root` です。
- `packages/agent` は Agent Service Worker です。Cloudflare Agents SDK、SQLite-backed Durable Objects、Agent-owned blob storage、Connect binary Protobuf RPC facade、Agent-local Queue を持ちます。
- `packages/client` は Management Client Worker です。Next.js on Cloudflare Workers と Client 専用 D1 により、管理対象 Agent ID、Agent RPC origin、表示設定、credential reference を管理します。
- Integration Provider は Agent Service の外側に置きます。Discord、Slack、Email、Webhook などの外部 protocol を Adapter/Tool/Delivery capability として Agent Event/RPC に接続します。
- Browser は Agent RPC を直接呼びません。Management Client の Server Components / Server Actions / server-only modules が Agent RPC を呼びます。

## Agent Service

- Agent public API は Protobuf RPC-only です。
- API contract の正本は `packages/agent/src/typespec/main.tsp` です。
- Generated proto package/path は `cftamac.agent.v1` / `cftamac/agent/v1` です。
- 初期必須 transport は Connect unary binary Protobuf です。
- Worker facade は `POST` + `Content-Type: application/proto` だけを public success path とします。
- REST resource API、OpenAPI Agent API、Orval Agent client、ad-hoc JSON DTO API、public Durable Object fetch API、browser direct Agent API は公開しません。
- 本番 Client Service 認証は Ed25519 JWT と `AGENT_CONTROL_PLANE_TRUST` に閉じます。Agent は公開鍵だけを含む trust config を required secret として読み、HS256、`AGENT_CREDENTIAL_*`、bootstrap RPC、AgentTrustRegistry、REST/JSON auth route を本番 trust source にしません。

## Agent Domain

`AIAgent` Durable Object は AI Agent そのものとして次を所有します。

- Thread / Section / AgentEvent
- AgentRun / Run snapshot / scheduler wake state
- ThreadCompaction / ThreadHistory / ThreadMemory / AgentMemory
- AgentState / Schedule / Tool / ToolInvocation
- Integration / Installation / Adapter Connection / DeliveryContext / AdapterDelivery
- Principal、credential verifier、grant、approval、budget、idempotency、replay nonce、audit、rate-limit state

外部 AgentEvent は `thread_key` を必須とします。同一 `agent_id` と同一 NFC-normalized `thread_key` は同一 Thread に解決され、異なる `agent_id` では同じ `thread_key` でも別 Thread です。

## Storage Boundary

- Agent state の正本は `AIAgent` Durable Object SQLite に置きます。
- Agent-local Queue は scheduler wake/coalescing mechanism であり、Event や Run の正本ではありません。
- 大きな Event payload、History body、Tool result blob、artifact、archive segment は Agent-owned blob storage に offload します。
- Agent Worker は `CLIENT_DB`、Agent-cross D1、Cloudflare Queues producer/consumer binding を持ちません。
- Management Client Worker は `CLIENT_DB`、外部 credential references、`CLIENT_CREDENTIAL_ENCRYPTION_KEY` で保護された encrypted Client Service signing key store を持ちますが、Agent domain snapshot、plaintext secrets、private JWK plaintext を Client D1 に複製しません。

## Management Client

- Agent registry、Agent detail、Thread/Event/Run/Compaction、Schedule、Tool approval、Integration install/uninstall、Agent settings を管理する UI です。
- Agent credential material、Agent RPC client construction、Agent runtime imports は browser bundle に入りません。
- private JWK、encrypted private JWK、生 JWT、Agent RPC signing logic は browser response、bundle、storage、public Client route に入りません。
- `/api/client/*`、`/api/agent*`、Agent REST proxy、arbitrary RPC forwarding route は公開しません。
- Server Actions と Server Components は UI 内部の execution boundary であり、Agent public API ではありません。

## Credential Operations

- 本番運用 runbook は `docs/operations/agent-control-plane-auth.md` です。
- Management Client の `Global Settings > Signing Keys` は Agent が 0 件でも Ed25519 signing key を生成し、private JWK を `CLIENT_CREDENTIAL_ENCRYPTION_KEY` で暗号化して Client D1 に保存します。
- `Global Settings > Trust Config Export` は Agent Worker の Variables and Secrets に設定できる public-only `AGENT_CONTROL_PLANE_TRUST` JSON を出力します。出力には private key parameter `d`、private JWK、encrypted private JWK、生 JWT を含めません。
- Agent Worker の監査識別子 hash は `AGENT_AUDIT_HASH_PEPPER` を使う HMAC で生成し、既知 user ID / email の辞書照合を防ぎます。
- Rotation は新 key 追加、旧 key `retiring`、Agent health verification、旧 key `revoked` の順で進めます。Emergency revoke と break-glass recovery は Dashboard/API/Wrangler で Agent trust config を更新し、Health Check で確認します。

## Self-host Deploy

[Deploy Agent to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/Suzlun/cf-tamac/tree/deploy-agent)

[Deploy Client to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/Suzlun/cf-tamac/tree/deploy-client)

- Primary install path は Cloudflare Dashboard の Deploy flow です。利用者に repository clone、local `pnpm install`、local `wrangler` 操作を要求しません。
- Agent Deploy Button を先に押し、`AI_AGENT` Durable Object、SQLite migration、`AGENT_BLOBS` R2、Workers AI `AI` binding、`AGENT_RPC_AUDIENCE` を持つ Agent Worker を deploy します。
- Client Deploy Button を後に押し、`CLIENT_DB` D1、`AGENT_RPC_DEFAULT_ORIGIN`、`CLIENT_CREDENTIAL_ENCRYPTION_KEY` を設定します。
- Client private signing key は Worker Secret へ貼らず、Management Client が生成して Client D1 の encrypted signing key store に保存します。Agent Worker へ渡すのは public-only `AGENT_CONTROL_PLANE_TRUST` だけです。
- `deploy-agent` と `deploy-client` は generated artifact branch です。source branch から CI が再生成し、branch root が self-contained Worker application になるよう維持します。
- 手順の詳細は `docs/operations/self-host-deploy.md` を参照してください。

## Code Generation

```bash
pnpm gen:agent:proto
pnpm gen:agent:rpc
pnpm gen
pnpm check:codegen
pnpm gen:deploy-artifacts
pnpm check:deploy-artifacts
```

Command-owned generated outputs は手編集しません。

- `packages/agent/proto/**`
- `packages/agent/src/generated/rpc/**`
- `packages/client/src/generated/agent-rpc/**`

## Development Commands

```bash
corepack enable
pnpm install
```

```bash
pnpm dev:agent
pnpm dev:client
```

```bash
pnpm check:agent
pnpm check:client
pnpm build
```

```bash
pnpm lint
pnpm test:agent
pnpm test:client
pnpm test:governance
pnpm test:run
```

## OpenSpec

- Product contract は OpenSpec の `spec.md` に Scenario ID 付きで記述します。
- UIを含むChangeでは、`openspec/designer`がSpecsより前にwireframe JSON、生成preview、screenshot evidenceを確定します。
- 実装とreviewはJSONだけを表示面の正として扱い、生成HTMLとscreenshotを編集・再取得しません。
- Automated tests は test title に `[SCENARIO-ID]` を含めます。
- `pnpm lint` は `pnpm exec openspec validate --all --strict` と `scripts/openspec/verify-scenario-coverage.mjs` を実行します。

## Supply Chain

- `pnpm-workspace.yaml` は `minimumReleaseAge: 4320` を維持します。
- Dependency build scripts は `allowBuilds` による package-by-package approval が必要です。
- `dangerouslyAllowAllBuilds` と `minimumReleaseAgeExclude` は使いません。
