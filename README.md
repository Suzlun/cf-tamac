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
- Management Client Worker は `CLIENT_DB` と credential references を持ちますが、Agent domain snapshot を Client D1 に複製しません。

## Management Client

- Agent registry、Agent detail、Thread/Event/Run/Compaction、Schedule、Tool approval、Integration install/uninstall、Agent settings を管理する UI です。
- Agent credential material、Agent RPC client construction、Agent runtime imports は browser bundle に入りません。
- `/api/client/*`、`/api/agent*`、Agent REST proxy、arbitrary RPC forwarding route は公開しません。
- Server Actions と Server Components は UI 内部の execution boundary であり、Agent public API ではありません。

## Code Generation

```bash
pnpm gen:agent:proto
pnpm gen:agent:rpc
pnpm gen
pnpm check:codegen
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
pnpm dev:management-client
```

```bash
pnpm check:agent
pnpm check:management-client
pnpm build:foundation
```

```bash
pnpm lint
pnpm test:agent
pnpm test:management-client
pnpm test:governance
pnpm test:run
```

## OpenSpec

- Product contract は OpenSpec の `spec.md` に Scenario ID 付きで記述します。
- Automated tests は test title に `[SCENARIO-ID]` を含めます。
- `pnpm lint` は `openspec validate --all --strict` と `scripts/openspec/verify-scenario-coverage.mjs` を実行します。

## Supply Chain

- `pnpm-workspace.yaml` は `minimumReleaseAge: 4320` を維持します。
- Dependency build scripts は `allowBuilds` による package-by-package approval が必要です。
- `dangerouslyAllowAllBuilds` と `minimumReleaseAgeExclude` は使いません。
