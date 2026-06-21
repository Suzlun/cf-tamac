# cf-tamac

Cloudflare Workers 上に Agent Service Worker と Management Client Worker を分離して構築する foundation repository です。

## 構成

- `packages/agent`: Agent Service Worker。Cloudflare Agents SDK の `AIAgent` Durable Object、Agent-owned blob storage、Connect binary Protobuf RPC facade、Agent-local scheduler wake/coalescing seam を持ちます。
- `packages/agent/src/typespec`: Agent public API の TypeSpec source of truth です。Agent API は REST/OpenAPI/Orval ではなく Protobuf RPC-only で定義します。
- `packages/agent/proto/cftamac/agent/v1.proto`: command-owned generated proto です。手編集しません。
- `packages/agent/src/generated/rpc/**`: Agent Worker 側の command-owned generated RPC descriptors です。手編集しません。
- `packages/client`: Next.js on Cloudflare Workers の Management Client Worker。`CLIENT_DB` と credential references を所有します。
- `packages/client/src/generated/agent-rpc/**`: Client server-side Agent RPC 呼び出し用の command-owned generated RPC descriptors です。手編集しません。
- `scripts/codegen`: Agent proto/RPC drift、RPC Service Inventory、descriptor invariant、Protobuf field stability の guardrail です。
- `scripts/governance`: Agent API surface と Agent/Client package boundary の guardrail です。
- `scripts/openspec`: OpenSpec Scenario ID coverage guardrail です。
- `scripts/security`: pnpm release-age と build-script approval policy の guardrail です。

Legacy backend/frontend/OpenAPI demo packages は replacement verification が完了するまで残っていますが、Agent public API の基準にはしません。

## Commands

```bash
corepack enable
pnpm install
```

```bash
pnpm dev:agent              # Agent Worker
pnpm dev:management-client  # Management Client Worker
```

```bash
pnpm gen:agent:proto
pnpm gen:agent:rpc
pnpm gen                    # generated outputs, including Agent proto/RPC
pnpm check:codegen
```

```bash
pnpm check:agent
pnpm check:management-client
pnpm build:foundation
```

```bash
pnpm lint
pnpm lint:governance
pnpm lint:supply-chain
pnpm test:agent
pnpm test:management-client
pnpm test:governance
pnpm test:run
```

## Agent API Contract

- Source of truth は `packages/agent/src/typespec/main.tsp` です。
- Generated proto package/path は `cftamac.agent.v1` / `cftamac/agent/v1` です。
- Public Agent transport は Connect unary binary Protobuf です。
- Worker facade は `POST` + `Content-Type: application/proto` のみを受け付けます。
- JSON encoding、HTTP `GET`、unsupported content types、unmapped generated methods は fail closed します。
- すべての public Agent RPC request は body field として `agent_id` を持ちます。
- Command request は `idempotency_key` を持ちます。
- Event publish request は `thread_key` を持ち、NFC 正規化後に空でなく 512 UTF-8 bytes 以下である必要があります。
- Agent-cross list/search RPC は定義しません。

## Runtime Boundaries

- Agent Worker は `AI_AGENT` Durable Object と Agent-owned blob storage を所有します。
- Agent Worker は `CLIENT_DB`、Agent-cross D1、Cloudflare Queues producer/consumer binding、public Durable Object fetch API を持ちません。
- Accepted Events、pending Runs、Thread identity、replay/idempotency、audit、rate-limit state は `AIAgent` Durable Object SQLite foundation に保持します。
- Agent-local Queue は scheduler wake/coalescing boundary であり、Event source of truth ではありません。
- Management Client Worker は `CLIENT_DB` と credential references のみを所有します。
- Management Client は Agent RPC を server-only modules から呼び出します。Browser bundles に Agent credentials、direct Agent RPC invocation logic、Agent runtime imports、Agent API proxy routes を含めません。

## OpenSpec

- Current behavior の source of truth は `openspec/specs/**/spec.md` です。
- Active change の delta specs は sync/archive 前の計画 artifact です。
- Automated tests は Scenario ID を test title に bracketed notation で含めます。
- Guardrails は `pnpm lint` から `openspec validate --all --strict` と `scripts/openspec/verify-scenario-coverage.mjs` で実行されます。

## Supply Chain

- `pnpm-workspace.yaml` は `minimumReleaseAge: 4320` を維持します。
- Dependency build scripts は `allowBuilds` による package-by-package approval が必要です。
- `dangerouslyAllowAllBuilds` と `minimumReleaseAgeExclude` は使いません。
