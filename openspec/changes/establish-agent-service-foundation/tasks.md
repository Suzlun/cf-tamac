## 1. 実装委譲前 prerequisite とワークスペース基準

- [ ] 1.1 `docs/memo/仕様設計・アーキテクチャ設定.md`、`proposal.md`、`design.md`、すべての delta spec を確認し、package 名、generated output path、RPC Service Inventory、route shell、Scenario ID、削除順序を実装メモへ整理する。
- [ ] 1.2 package/code implementation delegation を開始する前に、`.opencode/skills/coding-guardian/SKILL.md` と `.opencode/skills/coding-guardian/references/repo-entrypoints.md` に `packages/agent/**`、`packages/client/**`、Agent TypeSpec/proto/codegen、Client Worker、generated RPC policy、OpenSpec scenario coverage、governance scripts を追加し、古い template-only entrypoint が唯一の基準にならないようにする。（WORKSPACE-GOVERNANCE-BE-S008）
- [ ] 1.3 package/code implementation delegation を開始する前に、`.opencode/agents/openspec/applier.md`、`.opencode/agents/unit/backend/engineer.md`、`.opencode/agents/unit/backend/reviewer.md`、`.opencode/agents/unit/frontend/engineer.md`、`.opencode/agents/unit/frontend/reviewer.md`、`.opencode/agents/unit/frontend/designer.md`、`.opencode/agents/unit/build/builder.md`、`.opencode/agents/unit/build/reviewer.md` の permission/delegation/role guidance を更新し、`packages/agent/**` と `packages/client/**` を restructure 後の実装・review scope として認識させる。generated RPC outputs は command-owned のまま手編集を許可しない。（WORKSPACE-GOVERNANCE-BE-S008）
- [ ] 1.4 `scripts/governance/verify-package-boundaries.test.mjs` に `[WORKSPACE-GOVERNANCE-BE-S008] OpenCode workflow recognizes Agent and Client foundations` を先行追加し、`.opencode` guidance が更新されるまで package/code implementation delegation を blocked にできる fixture を用意する。
- [ ] 1.5 既存 demo graph を維持したまま、root workspace files（`package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`、`tsconfig.json`、`vitest.config.ts`、`.github/workflows/ci.yml`）へ `packages/agent` と `packages/client` の command targets を追加する。
- [ ] 1.6 Agent/Client/codegen に必要な dependencies は package release age と build-script approval を確認してから追加し、root/package-level `package.json` と `pnpm-lock.yaml` を command-owned 差分として更新する。完了条件は `minimumReleaseAge: 4320`、package-by-package `allowBuilds`、`dangerouslyAllowAllBuilds` 禁止を維持し、`pnpm lint:supply-chain` が通ることである。
- [ ] 1.7 `eslint.config.js` に Agent runtime、Client server/UI、generated RPC output、forbidden Agent REST/OpenAPI/Orval surface、Agent/Client import isolation の boundary と ignore を追加する。
- [ ] 1.8 実装メモに Scenario ID readiness plan を作成し、sections 7〜9 の automated test tasks がすべての ADDED Scenario ID を bracketed title で覆うことを確認してから final validation に進む順序を固定する。

## 2. Replacement package と codegen scaffolding

- [ ] 2.1 `packages/agent` と `packages/client` を作成し、`package.json`、`tsconfig.json`、package-level build/check/test scripts、package-level Worker configuration files を追加する。既存 demo packages は replacement verification が通るまで残し、新 package dependency graph へ接続しない。
- [ ] 2.2 `packages/agent/buf.yaml`、`packages/agent/buf.gen.yaml`、Agent TypeSpec `tspconfig.yaml`、root/package scripts `gen:agent:proto`、`gen:agent:rpc`、`gen`、`check:codegen` を先に追加し、既存 generated API workflow の削除は後続の検証が通った後に行う。
- [ ] 2.3 TypeSpec protobuf emitter output を `packages/agent/proto`、Protobuf-ES output を `packages/agent/src/generated/rpc` と `packages/client/src/generated/agent-rpc` に設定し、generated files は command output として扱う。
- [ ] 2.4 `scripts/codegen/check-agent-codegen-drift.mjs` を追加し、`pnpm check:codegen` から Agent proto/RPC drift、public Agent OpenAPI absence、RPC Service Inventory、descriptor invariant checks、Protobuf field stability guard を実行できるようにする。

## 3. Agent TypeSpec common、model、service stubs

- [ ] 3.1 `packages/agent/src/typespec/main.tsp`、`tspconfig.yaml`、common TypeSpec files `src/common/errors.tsp`、`src/common/pagination.tsp`、`src/common/security.tsp` を追加する。
- [ ] 3.2 `packages/agent/src/typespec/src/models/` に `agent.tsp`、`access-credential.tsp`、`thread.tsp`、`section.tsp`、`event.tsp`、`run.tsp`、`compaction.tsp`、`history.tsp`、`memory.tsp`、`state.tsp`、`schedule.tsp`、`tool.tsp`、`extension.tsp`、`adapter.tsp` を追加する。
- [ ] 3.3 `packages/agent/src/typespec/src/services/` に `agent-lifecycle.tsp`、`agent-event.tsp`、`agent-thread.tsp`、`agent-run.tsp`、`agent-state.tsp`、`agent-schedule.tsp`、`agent-tool.tsp`、`agent-extension.tsp`、`agent-adapter.tsp`、`agent-health.tsp` を追加する。`agent-adapter.tsp` は service 名を `ExtensionIngressService` とし、`PublishEvent`、`PublishToolResult`、`PublishDeliveryResult` を定義する。
- [ ] 3.4 RPC Service Inventory を TypeSpec stubs と descriptor allowlist に反映する。対象は `AgentLifecycleService`（`InitializeAgent`、`GetAgent`、`DestroyAgent`、`RotateAgentCredential`）、`AgentEventService`（`PublishEvent`、`GetEvent`、`ListEvents`）、`AgentThreadService`（`ListThreads`、`GetThread`、`ListSections`、`GetLatestCompaction`、`GetThreadMemory`、`SearchThreadHistory`）、`AgentRunService`（`GetRun`、`ListRuns`、`CancelRun`）、`AgentStateService`（`GetState`、`GetConfig`、`UpdateConfig`）、`AgentScheduleService`（`CreateSchedule`、`GetSchedule`、`ListSchedules`、`CancelSchedule`）、`AgentToolService`（`ListTools`、`GetInvocation`、`ListInvocations`、`ApproveInvocation`、`RejectInvocation`）、`AgentExtensionService`（`InstallExtension`、`UninstallExtension`、`GetInstallation`、`ListInstallations`、`CreateAdapterConnection`、`DeleteAdapterConnection`、`ListAdapterConnections`）、`ExtensionIngressService`（`PublishEvent`、`PublishToolResult`、`PublishDeliveryResult`）、`AgentHealthService`（`Check`）である。service 名は package 内で一意、method 名は同一 service 内で一意にする。（AGENT-PLATFORM-BE-S001、S010、S014）
- [ ] 3.5 すべての Protobuf message field に TypeSpec `@field(n)` を明示し、削除済み field number/name は `@reserve` または generated proto `reserved` として保持する。field number reuse、明示 field number 欠落、service 名重複、同一 service 内 method 名重複を fixture で失敗させる guard input を用意する。（AGENT-PLATFORM-BE-S014、WORKSPACE-GOVERNANCE-BE-S009）
- [ ] 3.6 すべての public Agent RPC request message に body field として `agent_id` を追加し、`agent_id` を metadata-only にしない。`ListAllAgents`、`SearchAgents`、`ListAllToolInvocations`、`ListAllExtensionInstallations` など Agent-cross list/search RPC を定義しないことを descriptor scanner で確認できる命名にする。（AGENT-PLATFORM-BE-S010）
- [ ] 3.7 Agent lifecycle changes、Event publish、Schedule mutation、Config update、Extension install/uninstall、Adapter connection mutation、Tool approval/rejection、Extension ingress callbacks など command request message に `idempotency_key` を追加する。（AGENT-PLATFORM-BE-S011）
- [ ] 3.8 `AgentEventService.PublishEvent` と `ExtensionIngressService.PublishEvent` request に `thread_key` を追加し、未指定、空文字、Unicode NFC 正規化後に 512 UTF-8 bytes を超える値を拒否する validation metadata/helper を TypeSpec model または generated validation seam で表現する。（AGENT-PLATFORM-BE-S011）
- [ ] 3.9 `thread_key` identity helper を設計し、Unicode NFC 正規化後の `thread_key` を 512 UTF-8 bytes 以下の比較キーとして case-sensitive に比較すること、same `agent_id` + same normalized `thread_key` は同じ Thread、different `agent_id` は別 Thread、Extension/Adapter/Connection/principal の暗黙 prefix は付与しないことを model/validation/storage seam に反映する。（AGENT-PLATFORM-BE-S013）
- [ ] 3.10 generation commands を実行して common/model/service stubs の proto と generated RPC outputs を作成し、source/config の差分だけを手動レビューする。`proto/**` と `generated/**` は手編集しない。

## 4. Agent Worker、`AIAgent`、runtime directories、RPC facade

- [ ] 4.1 `packages/agent/src/` 配下に `domain`、`harness`、`threads`、`events`、`runs`、`compactions`、`schedules`、`tools`、`extensions`、`adapters`、`storage`、`observability` の foundation exports を追加する。
- [ ] 4.2 `packages/agent/src/env.ts`、`src/index.ts`、`wrangler.toml` を追加し、`AI_AGENT` Durable Object binding for `AIAgent`、Agent blob storage binding、required secrets を定義する。D1 binding、`CLIENT_DB`、Agent-cross D1、Cloudflare Queues producer/consumer bindings は入れない。（AGENT-PLATFORM-BE-S005）
- [ ] 4.3 `packages/agent/src/AIAgent.ts` に Cloudflare Agents SDK Durable Object foundation を実装し、agent-id scoped identity helpers、foundation health state、Thread key identity helpers、未指定/空文字/512 UTF-8 bytes 超過 `thread_key` rejection seam、thread/section/event/run/input table initialization seams、audit/replay/idempotency/rate-limit table initialization seams、internal method entrypoints を追加する。（AGENT-PLATFORM-BE-S004、S005、S011、S012、S013）
- [ ] 4.4 `packages/agent/src/rpc/**` に Connect Worker adapter、RPC router、service modules を追加し、lifecycle/event/thread/run/state/schedule/tool/extension/`ExtensionIngressService`/health generated services を登録する。`AgentHealthService.Check` は handler へ接続し、未実装 generated methods は fail-closed Connect error へ接続する。（AGENT-PLATFORM-BE-S008、S009）
- [ ] 4.5 `packages/agent/src/rpc/services/agent-adapter.ts` を追加し、TypeSpec の `agent-adapter.tsp` で定義された `ExtensionIngressService.PublishEvent`、`PublishToolResult`、`PublishDeliveryResult` を generated service registration に含め、domain handler 未実装時は fail-closed にする。（AGENT-PLATFORM-BE-S001、S009、S011）
- [ ] 4.6 `packages/agent/src/rpc/interceptors/binary-content.ts` を追加し、unary binary Connect request は `POST` + `Content-Type: application/proto` のみ受け付け、JSON encodings と HTTP `GET` は Connect code `unimplemented`、missing/invalid content type と malformed Protobuf は `invalid_argument` へ mapping する。（AGENT-PLATFORM-BE-S002）
- [ ] 4.7 `packages/agent/src/rpc/interceptors/authentication.ts`、`authorization.ts`、`replay-protection.ts`、`validation.ts`、`audit.ts`、`rate-limit.ts` を追加し、default-deny authn/authz、replay/idempotency hook seams、audit context、`resource_exhausted` rate-limit mapping を配線する。（AGENT-PLATFORM-BE-S002、S008、S009）
- [ ] 4.8 `packages/agent/src/storage/schema.ts` に Agent profile、credentials/principals、request nonces、idempotency records、audit events、rate-limit buckets に加え、`agent_threads`、`agent_thread_sections`、`agent_events`、`agent_runs`、`agent_run_inputs`、scheduler wake/coalescing state の foundation constants を追加する。`agent_threads` は `thread_key` 原文と Unicode NFC 正規化済みかつ 512 UTF-8 bytes 以下の `normalized_thread_key` を保持し、`(agent_id, normalized_thread_key)` unique constraint を持つ。（AGENT-PLATFORM-BE-S005、S012、S013）
- [ ] 4.9 Agent-local Queue wake helper を `AIAgent` または `packages/agent/src/events` / `runs` の seam に追加し、NFC 正規化済みかつ 512 UTF-8 bytes 以下の `thread_key` による Thread/Section 解決、Event append、pending Run state、Run input snapshot metadata を DO SQLite に保存した後で at-most-one pending/running scheduler wake を記録する。Cloudflare Queues product API は呼ばない。（AGENT-PLATFORM-BE-S012、S013）

## 5. Management Client Worker foundation

- [ ] 5.1 `packages/client` Next.js App Router setup として `next.config.ts`、`open-next.config.ts`、package scripts、`wrangler.toml` を追加し、`CLIENT_DB` と credential secret references のみを定義する。（MANAGEMENT-CLIENT-FE-S005）
- [ ] 5.2 `packages/client/app` に `/`、`/agents`、`/agents/new`、`/agents/[agentId]`、`/agents/[agentId]/threads`、`/agents/[agentId]/events`、`/agents/[agentId]/schedules`、`/agents/[agentId]/tools`、`/agents/[agentId]/extensions`、`/agents/[agentId]/settings` を追加し、`hello` / `users` content を表示しない shell states にする。（MANAGEMENT-CLIENT-FE-S001、S007）
- [ ] 5.3 `packages/client/src/server/db/**` に `client_managed_agents` と `client_agent_credential_refs` だけを持つ Client D1 schema と migration を追加する。（MANAGEMENT-CLIENT-FE-S003）
- [ ] 5.4 managed Agent records と credential references の repository modules を追加し、Agent-domain snapshots を書き込む repository API を export しない。（MANAGEMENT-CLIENT-FE-S004）
- [ ] 5.5 `packages/client/src/server/actions/managed-agents.ts` に Agent registry shell interactions 用 Server Actions を追加し、Client D1 repositories だけへ接続する。（MANAGEMENT-CLIENT-FE-S001、S003、S004）
- [ ] 5.6 `packages/client/src/server/agent-rpc/**` に generated RPC code と Connect fetch transport を使う server-only Agent RPC client factory を追加し、browser bundles から生成 client construction と credential metadata を到達不能にする。（MANAGEMENT-CLIENT-FE-S002、S006）
- [ ] 5.7 Client route manifest と App Router route handler inventory を確認し、Agent API proxy route、`/api/client/*` Agent management API、`/api/agent*` route、Agent REST proxy、arbitrary Agent RPC forwarding handler を追加しない。Server Actions / Server Components は UI 内部境界として扱う。（MANAGEMENT-CLIENT-FE-S008）

## 6. Governance scripts、docs、guardrails

- [ ] 6.1 `scripts/governance/verify-agent-surface.mjs` と `verify-package-boundaries.mjs` を追加し、dedicated root scripts から `pnpm lint` に接続する。（WORKSPACE-GOVERNANCE-BE-S003、S004、S008）
- [ ] 6.2 `scripts/codegen/check-agent-codegen-drift.mjs` に RPC Service Inventory、descriptor invariant checks、Protobuf field stability guard を追加し、required service/method presence、public request `agent_id`、command `idempotency_key`、Event publish `thread_key` の presence と未指定/空文字/512 UTF-8 bytes 超過 validation、Agent-cross list/search absence、explicit `@field(n)`/generated field number、reserved removed fields、field number reuse、service/method uniqueness を検査する。（AGENT-PLATFORM-BE-S001、S010、S011、S014、WORKSPACE-GOVERNANCE-BE-S001、S002、S009）
- [ ] 6.3 `scripts/openspec/verify-scenario-coverage.mjs` は Scenario ID extraction と bracketed test title coverage が foundation specs に合う範囲でのみ更新する。（WORKSPACE-GOVERNANCE-BE-S005）
- [ ] 6.4 `scripts/security/verify-pnpm-supply-chain.mjs` は current pnpm configuration shape に必要な範囲でのみ更新し、release-age と build-script policy checks を弱めない。（WORKSPACE-GOVERNANCE-BE-S007）
- [ ] 6.5 `AGENTS.md`、`README.md`、`CONTRIBUTING.md`、`CODING_STANDARDS.md` に Agent/Client package structure、TypeSpec-to-proto workflow、generated-file policy、verification commands、Connect binary profile、fail-closed routing、Agent-local Queue wake boundary、Client no-proxy boundary、no demo API documentation を記載する。（WORKSPACE-GOVERNANCE-BE-S006）

## 7. Automated tests for `agent-platform-be`

- [ ] 7.1 `packages/agent/src/tests/contract-generation.test.ts` に `[AGENT-PLATFORM-BE-S001] TypeSpec emits proto3 without Agent OpenAPI` を追加し、common/model/service proto outputs、RPC Service Inventory method presence、`agent-adapter.tsp` で定義された `ExtensionIngressService`、Agent OpenAPI absence を検査する。
- [ ] 7.2 `packages/agent/src/tests/connect-binary.test.ts` に `[AGENT-PLATFORM-BE-S002] Binary Connect accepted and JSON rejected` を追加し、`application/proto` success、JSON/GET `unimplemented`、malformed content/protobuf `invalid_argument` を検査する。
- [ ] 7.3 `packages/agent/src/tests/forbidden-agent-surface.test.ts` に `[AGENT-PLATFORM-BE-S003] REST and Orval Agent surfaces are unreachable` を追加し、route/export absence と unsupported REST paths を検査する。
- [ ] 7.4 `packages/agent/src/tests/agent-id-routing.test.ts` に `[AGENT-PLATFORM-BE-S004] Agent ID resolves to one AIAgent instance` を追加し、same/different `agent_id` name resolution を検査する。
- [ ] 7.5 `packages/agent/src/tests/agent-worker-bindings.test.ts` に `[AGENT-PLATFORM-BE-S005] Agent Worker bindings exclude Client D1 and Cloudflare Queues` を追加し、`AI_AGENT` binding、Agent blob binding、D1 binding absence、`CLIENT_DB` absence、Agent-cross D1 absence、Cloudflare Queues binding absence を検査する。
- [ ] 7.6 `packages/agent/src/tests/forbidden-demo-routes.test.ts` に `[AGENT-PLATFORM-BE-S006] Demo resource paths are not served by the Agent Worker` を追加し、`/api/v1/hello`、`/api/v1/users`、`/api/v1/users/{id}` を検査する。
- [ ] 7.7 `packages/agent/src/tests/agent-source-graph.test.ts` に `[AGENT-PLATFORM-BE-S007] Demo domain files are not reachable from Agent entrypoints` を追加し、Agent imports、exports、TypeSpec files、package graph を検査する。
- [ ] 7.8 `packages/agent/src/tests/health-rpc.test.ts` に `[AGENT-PLATFORM-BE-S008] Health RPC reaches the Connect Worker facade` を追加し、authenticated binary Connect `AgentHealthService.Check` through facade を検査する。
- [ ] 7.9 `packages/agent/src/tests/fail-closed-routing.test.ts` に `[AGENT-PLATFORM-BE-S009] Foundation handlers fail closed for unmapped methods` を追加し、generated lifecycle/event/thread/run/state/schedule/tool/extension/`ExtensionIngressService` methods without handlers を検査する。
- [ ] 7.10 `packages/agent/src/tests/rpc-schema-invariants.test.ts` に `[AGENT-PLATFORM-BE-S010] Public RPC descriptors require agent_id and no cross-Agent list/search` を追加し、RPC Service Inventory method presence、generated descriptors の `agent_id`、forbidden cross-Agent list/search absence を検査する。
- [ ] 7.11 `packages/agent/src/tests/command-event-invariants.test.ts` に `[AGENT-PLATFORM-BE-S011] Command and Event publish descriptors require replay and Thread keys` を追加し、command `idempotency_key`、`AgentEventService.PublishEvent` と `ExtensionIngressService.PublishEvent` の `thread_key`、未指定、空文字、512 UTF-8 bytes を超える `thread_key` validation fixtures を検査する。
- [ ] 7.12 `packages/agent/src/tests/agent-local-queue-wake.test.ts` に `[AGENT-PLATFORM-BE-S012] Agent-local Queue coalesces scheduler wakes without owning events` を追加し、coalesced wake、`agent_threads`、`agent_thread_sections`、`agent_events`、`agent_runs`、`agent_run_inputs`、scheduler wake/coalescing state、Cloudflare Queues API absence を検査する。
- [ ] 7.13 `packages/agent/src/tests/thread-key-identity.test.ts` に `[AGENT-PLATFORM-BE-S013] Thread key identity is normalized and Agent-scoped` を追加し、512 UTF-8 bytes 以下の受理された `thread_key` について same `agent_id` + Unicode NFC normalized `thread_key` は同じ `thread_id`、case difference は別 Thread、異なる Extension/Adapter/Connection/principal の暗黙 prefix は付与されないこと、different `agent_id` は別 Thread になることを検査する。
- [ ] 7.14 `packages/agent/src/tests/protobuf-field-stability.test.ts` に `[AGENT-PLATFORM-BE-S014] Protobuf field numbers and service methods are stable` を追加し、TypeSpec `@field(n)` 明示、generated proto field number、deleted field reserve、field number reuse detection、service 名 uniqueness、同一 service 内 method 名 uniqueness を検査する。

## 8. Automated tests for `management-client-fe`

- [ ] 8.1 `packages/client/src/tests/agent-registry-shell.test.tsx` と `tests/e2e/management-agent-registry.spec.ts` に `[MANAGEMENT-CLIENT-FE-S001] Agent registry shell renders without demo content` を追加し、`/agents` empty state と detail section navigation を検査する。
- [ ] 8.2 `packages/client/src/tests/browser-agent-rpc-secrecy.test.ts` と `tests/e2e/management-agent-rpc-secrecy.spec.ts` に `[MANAGEMENT-CLIENT-FE-S002] Browser bundle excludes Agent RPC credentials` を追加し、browser-delivered chunks、server-only RPC client construction、direct Agent RPC invocation absence を検査する。
- [ ] 8.3 `packages/client/src/tests/client-d1-schema.test.ts` に `[MANAGEMENT-CLIENT-FE-S003] Client D1 exposes only management tables` を追加し、migration/table names と columns を検査する。
- [ ] 8.4 `packages/client/src/tests/client-repository-boundary.test.ts` に `[MANAGEMENT-CLIENT-FE-S004] Client repository rejects Agent-domain snapshot persistence` を追加し、repository exports と snapshot-shaped input を検査する。
- [ ] 8.5 `packages/client/src/tests/client-bindings.test.ts` に `[MANAGEMENT-CLIENT-FE-S005] Client Worker binding set is isolated from Agent runtime` を追加し、`packages/client/wrangler.toml` を検査する。
- [ ] 8.6 `packages/client/src/tests/client-import-graph.test.ts` に `[MANAGEMENT-CLIENT-FE-S006] Client imports generated Agent RPC code without Agent runtime source` を追加し、Client server-side imports を検査する。
- [ ] 8.7 `packages/client/src/tests/management-navigation.test.tsx` と `tests/e2e/management-navigation.spec.ts` に `[MANAGEMENT-CLIENT-FE-S007] Management navigation excludes demo routes` を追加し、registry、new、detail、threads、events、schedules、tools、extensions、settings route shells と primary navigation を検査する。
- [ ] 8.8 `packages/client/src/tests/client-api-proxy-absence.test.ts` に `[MANAGEMENT-CLIENT-FE-S008] Client exposes no Agent API proxy route` を追加し、Client route manifest、App Router route handler inventory、browser-visible paths から `/api/client/*`、`/api/agent*`、Agent REST proxy、arbitrary RPC forwarding handler が absent であることを検査する。

## 9. Automated tests for `workspace-governance-be`

- [ ] 9.1 `scripts/codegen/check-agent-codegen-drift.test.mjs` に `[WORKSPACE-GOVERNANCE-BE-S001] Root generation commands produce deterministic Agent outputs` を追加し、two clean generation runs、RPC Service Inventory stability、Agent OpenAPI absence を検査する。
- [ ] 9.2 `scripts/codegen/check-agent-codegen-drift.test.mjs` に `[WORKSPACE-GOVERNANCE-BE-S002] Codegen check fails on Agent generated drift` を追加し、altered generated fixture output を検査する。
- [ ] 9.3 `scripts/codegen/check-agent-codegen-drift.test.mjs` に `[WORKSPACE-GOVERNANCE-BE-S009] Protobuf field stability guard rejects unstable descriptors` を追加し、`@field(n)` 欠落、deleted field reserve 漏れ、field number reuse、service 名重複、同一 service 内 method 名重複を含む fixture が失敗し、stable fixture が通ることを検査する。
- [ ] 9.4 `scripts/governance/verify-agent-surface.test.mjs` に `[WORKSPACE-GOVERNANCE-BE-S003] Lint rejects forbidden Agent API surface fixtures` を追加し、REST route、OpenAPI output、Orval client、JSON DTO fixtures を検査する。
- [ ] 9.5 `scripts/governance/verify-package-boundaries.test.mjs` に `[WORKSPACE-GOVERNANCE-BE-S004] Lint rejects Agent and Client runtime coupling` を追加し、Agent-to-Client と Client-to-Agent runtime imports を検査する。
- [ ] 9.6 `scripts/openspec/verify-scenario-coverage.test.mjs` に `[WORKSPACE-GOVERNANCE-BE-S005] Scenario ID coverage validates foundation specs` を追加し、valid、missing、duplicate、orphan Scenario IDs を検査する。
- [ ] 9.7 `scripts/governance/verify-agent-surface.test.mjs` に `[WORKSPACE-GOVERNANCE-BE-S006] Documentation exposes Agent and Client foundation commands` を追加し、README/AGENTS/CONTRIBUTING/CODING_STANDARDS command text と no demo API docs を検査する。
- [ ] 9.8 `scripts/security/verify-pnpm-supply-chain.test.mjs` に `[WORKSPACE-GOVERNANCE-BE-S007] Supply-chain lint enforces release-age and build-script policy` を追加し、valid と weakened pnpm-workspace fixtures を検査する。
- [ ] 9.9 1.4 で先行追加した `[WORKSPACE-GOVERNANCE-BE-S008] OpenCode workflow recognizes Agent and Client foundations` test を governance suite と `pnpm lint` に接続し、`.opencode` guidance が古い backend/frontend-only baseline に戻ると失敗することを確認する。

## 10. Replacement verification before demo active graph removal

- [ ] 10.1 `pnpm gen` を実行し、続けて `pnpm check:codegen` を実行する。replacement Agent TypeSpec/proto/RPC outputs、RPC Service Inventory checks、descriptor invariant checks、Protobuf field stability guard、public Agent OpenAPI absence が安定していることを確認する。
- [ ] 10.2 sections 7、8、9 の Scenario ID 付き tests を含め、Agent package と Client package の checks/tests を実行する。
- [ ] 10.3 forbidden Agent surface、package boundaries、supply-chain policy、Client no-proxy route、Agent-local Queue wake boundary、`.opencode` workflow alignment の governance checks を実行し、失敗を解消してから demo packages の削除に進む。

## 11. Replacement 検証後の demonstration-domain removal

- [ ] 11.1 tasks 10.1〜10.3 が通った後に、`hello` / `users` TypeSpec files、backend routes、domain/usecase/persistence files、Drizzle demo tables、frontend pages/hooks/mocks、Orval config、generated OpenAPI contract tests、demo E2E flows を active graph から削除する。
- [ ] 11.2 replacement package/codegen/client/governance checks が通ることを確認した後に、`packages/typespec/**`、`packages/backend/**`、`packages/frontend/**` を active workspace graph から外す。generated outputs は command-owned のまま扱う。
- [ ] 11.3 `packages/agent/wrangler.toml` と `packages/client/wrangler.toml` が Worker dev/deploy scripts を担う状態を確認した後に、root `wrangler.toml` を active commands から外す。
- [ ] 11.4 import/export graph checks と route-surface checks を再実行し、active path が `hello`、`users`、Agent OpenAPI、Orval Agent client、public Durable Object fetch、Browser direct Agent RPC、Client Agent API proxy route に到達しないことを確認する。

## 12. Final verification and OpenSpec sync readiness

- [ ] 12.1 `pnpm gen` を実行し、続けて `pnpm check:codegen` を実行する。generated outputs は commands が作成したものだけを含め、必要な source/config files と一緒に確認する。
- [ ] 12.2 sections 7〜9 の Scenario ID 付き automated tests と governance test tasks が完了していることを確認した後に、Delta specs を repository の OpenSpec sync/archive workflow で main specs へ反映または archive 準備し、`openspec validate --type change establish-agent-service-foundation --strict --no-interactive` と `openspec validate --all --strict --no-interactive` を実行する。
- [ ] 12.3 12.2 の main spec 反映または archive 準備が完了した後に、`pnpm format:check`、`pnpm lint`、`pnpm check`、`pnpm test:run`、`pnpm build` を final validation として実行し、lint や generated-file checks を bypass せず失敗を修正する。
- [ ] 12.4 `git diff` を確認し、unrelated changes、generated-file hand edits、remaining `hello` / `users` active references、Agent OpenAPI artifacts、Orval Agent client artifacts、Agent/Client binding violations、missing route shells、missing Scenario ID tests、stale `.opencode` backend/frontend-only guidance、Thread key 未指定/空文字/512 UTF-8 bytes 超過 rejection と identity invariant の抜け、Protobuf field stability guard の抜け、`agent-adapter.tsp` で定義される `ExtensionIngressService` と RPC Service Inventory の不整合がないことを確認する。
- [ ] 12.5 実装中に foundation mismatch が見つかった場合は、`design.md`、delta specs、`tasks.md` を更新し、OpenSpec validation を再実行する。
