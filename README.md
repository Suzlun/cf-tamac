# cf-tamac

`cf-tamac` は、Cloudflare Workers 上で動作する自律駆動 AI Agent microservice と、その管理クライアントです。中心はチャット UI ではなく、外部 Event、時刻、Tool 結果、人間の入力、内部状態変化を受けて Agent が次の行動を決める server-side harness です。

## Product Shape

- `1 Agent ID = 1 AIAgent Durable Object instance = 1 AI Agent aggregate root` です。
- `packages/agent` は Agent Service Worker です。Cloudflare Agents SDK、SQLite-backed Durable Objects、Agent-owned blob storage、Connect binary Protobuf RPC facade、Agent-local Queue を持ちます。
- `packages/sdk` は `tamac-sdk` の server-side Agent RPC SDK です。`TamacAgentClient` は Client Service の Ed25519 JWT operation aggregate、`TamacProviderIngressClient` は Provider の Ed25519 detached-signature ingress aggregate であり、両者の principal/context を混在させません。
- `packages/client` は Management Client Worker です。Next.js on Cloudflare Workers と Client 専用 D1 により、管理対象 Agent ID、canonical Agent RPC origin、表示設定、credential reference を管理します。Client Service JWT の送信先は server-managed `AGENT_RPC_ALLOWED_ORIGINS` で承認済みの origin だけです。
- Integration Provider は Agent Service の外側に置きます。Discord、Slack、Email、Webhook などの外部 protocol を Adapter/Tool/Delivery capability として Agent Event/RPC に接続します。
- Browser は Agent RPC を直接呼びません。Management Client の Server Components / Server Actions / server-only SDK adapter が Agent RPC を呼びます。browser-visible module は SDK、Connect runtime、generated RPC descriptor、credential、JWT signing を import しません。

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
- Client server-only SDK adapter は Client D1、encrypted Client Service signing key store、acting user policy、managed Agent resolution を所有し、解決した server-side context で `tamac-sdk` を構築します。これらの Client-owned responsibility を SDK に移しません。
- `AGENT_RPC_ALLOWED_ORIGINS` は unique canonical HTTPS origin を持つ non-empty JSON array です。登録入力は canonicalize 後に exact match で承認し、Client D1 から読み直した origin も signing key、acting user、SDK transport の解決前に current policy で再検証します。
- SDK-backed Server Action は成功・失敗とも `displayData`、`safeStatus`、`safeErrorCategory`、secret-free `correlationId` の四属性だけを Browser に返します。raw Connect/SDK diagnostic、credential、JWT、signing key、origin policy detail は返しません。
- private JWK、encrypted private JWK、生 JWT、Agent RPC signing logic は browser response、bundle、storage、public Client route に入りません。
- `/api/client/*`、`/api/agent*`、Agent REST proxy、arbitrary RPC forwarding route は公開しません。
- Server Actions と Server Components は UI 内部の execution boundary であり、Agent public API ではありません。

## Credential Operations

- 本番運用 runbook は `docs/operations/agent-control-plane-auth.md` です。
- Management Client の `Global Settings > Signing Keys` は Agent が 0 件でも Ed25519 signing key を生成し、private JWK を `CLIENT_CREDENTIAL_ENCRYPTION_KEY` で暗号化して Client D1 に保存します。
- `Global Settings > Trust Config Export` は Agent Worker の Variables and Secrets に設定できる public-only `AGENT_CONTROL_PLANE_TRUST` JSON を出力します。出力には private key parameter `d`、private JWK、encrypted private JWK、生 JWT を含めません。
- Agent Worker の監査識別子 hash は `AGENT_AUDIT_HASH_PEPPER` を使う HMAC で生成し、既知 user ID / email の辞書照合を防ぎます。
- Rotation は新 key 追加、旧 key `retiring`、Agent health verification、旧 key `revoked` の順で進めます。Emergency revoke と break-glass recovery は Dashboard/API/Wrangler で Agent trust config を更新し、Health Check で確認します。
- Integration Provider は Client Service JWT を使わず、`PublishEvent`、`PublishToolResult`、`PublishDeliveryResult` だけを Ed25519 detached signature で呼びます。Agent は active Installation/trust key、unsigned Protobuf digest、signature、request identity、Agent-owned fixed `300_000` ms timestamp window を検証して `INTEGRATION_INSTALLATION` principal を構築し、その後に nonce/idempotency と Agent-local authorization を処理します。

## Production delivery

- fork 利用者は `agent-production` と `client-production` GitHub Environment を分離して設定します。各 service は独立した `workflow_dispatch` の `bootstrap` / `deploy` gate と、検証済み `main` の `workflow_run` gate を持ちます。
- Agent gate は `AI_AGENT` Durable Object、SQLite migration、`AGENT_BLOBS` R2、Provider ingress RateLimit、public-only `AGENT_CONTROL_PLANE_TRUST` を検証します。Client gate は `CLIENT_DB` D1、canonical `AGENT_RPC_ALLOWED_ORIGINS`、暗号化鍵、tracked migrations を検証します。
- preflight の出力は `service`、`operation`、`deliveryEligible`、`configurationKeys`、`category` の五属性だけです。秘密値、JWT、trust body、鍵素材を output・log・artifact に出しません。
- Client の初回 D1 作成は `packages/client/wrangler.toml` を `--config` で直接使い、public D1 identity の allowlisted patch artifact を fork の review boundary へ渡します。継続 delivery も同じ package-local configuration を使います。
- canonical upstream の保護 tag だけが `cf-tamac` と `tamac-sdk` を OIDC provenance 付きで公開します。fork の Cloudflare delivery と package publication は分離されます。
- 詳細は `docs/operations/production-delivery.md` と `docs/operations/package-consumers.md` を参照してください。

## Code Generation

```bash
pnpm gen:agent:proto
pnpm gen:agent:rpc
pnpm gen
pnpm check:codegen
```

`pnpm gen:agent:proto && pnpm gen:agent:rpc` は Agent TypeSpec から proto と Agent、Client、SDK の descriptor を生成します。4つの generated roots は mandatory generated-policy target であり、Command-owned outputs を手編集しません。`pnpm check:codegen` は Agent→Client/SDK descriptor parity と contract invariant を確認します。

- `packages/agent/proto/**`
- `packages/agent/src/generated/rpc/**`
- `packages/client/src/generated/agent-rpc/**`
- `packages/sdk/src/generated/agent-rpc/**`

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
pnpm check                         # Agent、Client、SDK を含む全 workspace package
pnpm --filter tamac-sdk check
pnpm build:public-packages
pnpm check:public-packages
pnpm check:production-contracts
pnpm check:production-environment
pnpm build                         # Agent、SDK、Management Client の build
```

```bash
pnpm lint
pnpm test:agent
pnpm test:client
pnpm test:governance
pnpm test:run
pnpm --filter tamac-sdk test
pnpm check:codegen
pnpm check:production-contracts && pnpm check:production-environment
```

## OpenSpec と変更運用

変更運用の一次資料は [`docs/change-operation.md`](docs/change-operation.md) です。すべての変更で、次の三軸を独立に選びます。

- `Operation Lane`: `DIRECT`、`BEHAVIOR`、`ARCHITECTURE`
- `UX Mode`: `NONE`、`CONTINUITY`、`SHAPE`
- `Review Depth`: `STANDARD`、`DEEP`

`DIRECT` は観測可能な振る舞いも物質的な内部構造も変えない作業です。`BEHAVIOR` は `behavior-change`、`ARCHITECTURE` は `architecture-change` の OpenSpec Change を使用します。UX の方向付けは任意であり、必要な変更だけが `SHAPE` を選びます。実際の UI 変更にはプロダクトデザイナーの関与と、デスクトップ・モバイル双方の実ブラウザ確認が必要です。画像生成による UI モックアップは任意の非契約証跡であり、仕様や実ブラウザ確認を置き換えません。

### 永続的な振る舞い契約

OpenSpec は、利用者または外部契約から観測できる振る舞いの永続的な契約であり、実装全体の基本計画ではありません。

- 主仕様は `openspec/specs/**/spec.md` に置きます。
- 活動中の差分仕様は `openspec/changes/*/specs/**/spec.md` に置きます。
- `behavior-change` は提案、差分仕様、作業パッケージを管理します。
- `architecture-change` はこれらに加え、物質的な設計判断を `design.md` で管理します。
- Requirement と Scenario には観測可能な終端状態だけを記載します。
- `tasks.md` は粗い作業パッケージ台帳とし、ファイル、補助処理、試験階層ごとの詳細計画を置きません。

実装時は、現在の作業パッケージ、リポジトリの実態、直前の検証結果を基に、ファイル・補助処理・試験の詳細を段階的に決めます。

### Scenario と試験

Scenario 見出しは `(AGENT-LIFECYCLE-S001)` のような安定した識別子で終え、自動試験の題名は `[AGENT-LIFECYCLE-S001]` のように参照します。自動化できない Scenario には `Tags: manual` を記載します。

既定の検査は、活動中差分の構造、識別子の重複、Change 間の競合と、主仕様の試験参照を確認します。計画時は一つ目、実装完了時は二つ目、相互作用の最終確認では三つ目を実行します。

```bash
node scripts/openspec/verify-scenario-coverage.mjs --change <change-id>
node scripts/openspec/verify-scenario-coverage.mjs --change <change-id> --require-test-references
node scripts/openspec/verify-scenario-coverage.mjs
```

### プロジェクトの初期化

このリポジトリは`@fission-ai/openspec` `1.8.0`、`openspec/config.yaml`、二つの変更スキーマを使用します。OpenCodeの公式コアコマンドとスキルは手編集せず、`pnpm gen:openspec`でOpenSpec公式の`init`から同時に再生成します。Changeディレクトリも手作成せず、運用区分に対応する`--schema`を付けた`openspec new change`で作成します。OpenSpec `1.8.0`は`openspec/config.yaml#schema`をChange作成時の既定値として参照しないため、`--schema`を省略しません。

```bash
pnpm gen:openspec
pnpm exec openspec new change <change-id> --schema behavior-change
pnpm exec openspec list
pnpm lint:openspec
```

### OpenCode コマンド

- `/opsx-propose <name-or-description>`: Change を作成し、必要な成果物を生成する。
- `/opsx-apply <name>`: 作業パッケージに沿って実装する。
- `/opsx-sync <name>`: 差分仕様を主仕様へ同期する。
- `/opsx-archive <name>`: 完了した Change を履歴へ移す。
- `/opsx-explore <topic>`: 実装せずに調査・検討する。
- `/opsx-update <name>`: 既存の計画成果物を整合させる。

## Supply Chain

- `pnpm-workspace.yaml` は `minimumReleaseAge: 4320` を維持します。
- Dependency build scripts は `allowBuilds` による package-by-package approval が必要です。
- `dangerouslyAllowAllBuilds` と `minimumReleaseAgeExclude` は使いません。
