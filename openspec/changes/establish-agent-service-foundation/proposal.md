## Why

現在のリポジトリは Cloudflare Workers + Hono + Drizzle + React の汎用テンプレート構成を前提としており、`hello` / `users` を中心にしたサンプル API、OpenAPI 生成、Orval 生成クライアント、Vite SPA が混在している。このままでは、チャットに依存しない自律駆動 AI Agent Service という設計基準に対して、公開 API、永続化所有者、Worker binding、Client の責務が一致せず、以後の Agent 機能実装で REST/OpenAPI やサンプル機能が再利用されるリスクが高い。

この change は、`docs/memo/仕様設計・アーキテクチャ設定.md` を実装の設計基準として、最初にリポジトリ構造、API 契約、生成物、lint/codegen guardrail、Agent Worker と Client Worker の分離を確定する。これにより、後続の Agent/Thread/Event/Run/Compaction/Schedule/Tool/Extension/Client 実装が、Protobuf RPC-only、Connect + binary Protobuf、1 Agent ID = 1 AIAgent Durable Object instance、Client D1 分離という境界から逸脱しない状態で進められる。

## What Changes

- **BREAKING**: 公開 Agent API の正本契約は REST/OpenAPI/JSON DTO ではなく、TypeSpec から生成される proto3 service/message に統一される。初期必須 transport は Connect + binary Protobuf unary RPC とし、native gRPC 互換 gateway はこの foundation の実装範囲外だが、同一 proto 契約を使う任意互換 profile として禁止しない。
- **BREAKING**: `hello` / `users` サンプル API、サンプル UI、サンプル TypeSpec route/model、OpenAPI artifact、Orval 生成 client は公開機能から外れ、最終状態では旧 demo packages は active workspace から削除される。
- Agent Service は `packages/agent` の独立デプロイ可能な Cloudflare Worker + Cloudflare Agents SDK + SQLite-backed Durable Object runtime として扱われる。
- 管理 Client は `packages/client` の Next.js on Cloudflare Workers 管理 UI として扱われ、Client 専用 D1、管理対象 Agent 台帳、Agent RPC origin、credential reference、表示設定だけを所有する。
- Agent API 契約の正本は `packages/agent/src/typespec` となり、OpenAPI ではなく proto3 と Protobuf-ES generated code を生成する。foundation は health-only ではなく、memo にある common/model/service TypeSpec stubs（pagination/security、Agent/Thread/Event/Run/State/Schedule/Tool/Extension/Adapter など）と lifecycle/event/thread/run/state/schedule/tool/extension/agent-adapter/health service files を含む。`packages/agent/src/typespec/src/services/agent-adapter.tsp` は `ExtensionIngressService` を定義し、`PublishEvent`、`PublishToolResult`、`PublishDeliveryResult` を持つ。`AgentExtensionService` は Adapter Connection 管理の `CreateAdapterConnection`、`DeleteAdapterConnection`、`ListAdapterConnections` を所有する。
- すべての public Agent RPC request は request body に `agent_id` を持ち、command request は `idempotency_key` を持ち、Event publish request は `thread_key` を必須検証する。`thread_key` は未指定と空文字を拒否し、Unicode NFC 正規化後に最大 512 UTF-8 bytes として case-sensitive で比較し、same `agent_id` + same normalized `thread_key` を同一 Thread、different `agent_id` を別 Thread とし、暗黙 prefix は付与しない。Agent 横断の list/search RPC は提供せず、generated proto/service descriptors、Protobuf field number/reserve/reuse、service/method uniqueness を codegen drift check で検査する。
- Connect Worker facade は生成された全 Agent service を登録し、domain handler 未実装 method は Connect error で fail-closed する。binary content-type、JSON/GET rejection、authentication/authorization/replay/rate-limit hook seam、audit、validation、DO routing を foundation として固定する。
- Agent-local Queue は Cloudflare Agents SDK の Agent-local wake/coalescing mechanism としてのみ使い、Cloudflare Queues product や Event source of truth として扱わない。
- Client は Agent API proxy routes、`/api/client/*` Agent management APIs、Agent REST proxy routes を公開せず、Server Actions / Server Components を UI 内部の execution boundary として使う。
- Agent Worker と Client Worker の binding、dependency direction、generated code の配置、lint/codegen drift check、OpenSpec scenario coverage guardrail が設計基準に合わせて更新される。
- 旧 demo server に課していた依存方向の規律は `packages/agent` の Agent Worker / RPC facade / service modules / domain runtime / storage / generated RPC 境界へ移植される。旧 demo UI に課していた UI/API 分離の規律は、`packages/client` の Next.js App Router、Server Components、Server Actions、server-only modules、browser-visible bundles の境界へ移植される。
- `.opencode` の coding-guardian、entrypoint reference、applier delegation、engineer/reviewer permission guidance は、実装委譲を開始する前の prerequisite として更新し、`packages/agent/**` と `packages/client/**` の restructure を実装 phase で正しく認識できるようにする。

## Spec Units

### New Spec Units

- `agent-platform`: New。Agent Service の Protobuf RPC-only 契約、Connect facade、AIAgent Durable Object runtime、Agent-owned storage/binding/dependency 境界、サンプル機能を含まない公開 surface を定義する。
- `management-client`: New。Next.js 管理 UI の責務、Browser から Agent RPC を直接呼ばない server-side invocation、Client D1 所有範囲、Agent domain snapshot を保存しない表示境界を定義する。
- `workspace-governance`: New。repo-level scripts、TypeSpec/proto generation、Buf/Protobuf-ES drift checks、OpenSpec/spec-test coverage、supply-chain policy、禁止 API surface の lint guardrail を定義する。

### Modified Spec Units

- なし。`openspec/specs` に既存 Spec Unit が存在しないため、この change は新規 Spec Unit の追加のみを行う。

## Naming

- `agent-platform` の Scenario ID prefix は `AGENT-PLATFORM` を使用する。
- `management-client` の Scenario ID prefix は `MANAGEMENT-CLIENT` を使用する。
- `workspace-governance` の Scenario ID prefix は `WORKSPACE-GOVERNANCE` を使用する。
- Scenario ID prefix に presentation/implementation-layer suffix は含めない。旧 demo package の分類は、foundation 後の仕様単位名、Scenario ID、documented package boundary には残さない。

## Impact

- Packages: `packages/agent`、`packages/client`、root scripts、workspace package patterns。旧 demo packages は replacement verification 後に削除される graph としてのみ扱う。
- APIs/contracts: Agent REST/OpenAPI surface、TypeSpec source layout、full proto3 model/service stub output、Protobuf-ES generated client/server descriptors、request-level `agent_id` / `idempotency_key` / 空文字ではなく 512 UTF-8 bytes 以下の `thread_key` invariants、Thread key identity invariant、Protobuf field stability guard、Agent-cross list/search absence、Connect method surface、optional native gRPC compatibility policy。
- Runtime/Cloudflare: Agent Worker wrangler config、Client Worker/OpenNext config、Durable Object binding、R2 binding、Client D1 binding、Agent-local Queue wake coalescing、Cloudflare Queues 非採用の明示。
- Persistence: Agent-owned DO SQLite schema の基礎、Client-owned D1 schema の基礎、Agent から Client D1 へアクセスしない境界。
- Security: Client Service JWT、Extension Installation signature、binary Protobuf content-type enforcement、JSON/GET rejection、Connect error mapping、nonce/idempotency/replay/audit/rate-limit guardrail の配置先。
- Testing/lint: TypeSpec compile/format、proto generation drift、Buf lint/breaking、REST/OpenAPI absence checks、OpenSpec strict validation、Scenario ID coverage、supply-chain policy。
- Documentation: `AGENTS.md`、README/architecture docs、commands、testing docs、migration notes、禁止事項の明文化。
- Workflow governance: `.opencode/skills/coding-guardian/**` と関連する agent/applier/engineer/reviewer permission/delegation files の計画更新。
