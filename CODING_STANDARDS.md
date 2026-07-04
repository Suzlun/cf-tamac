# コーディング規則

本書は、この repository で実際に fail する規約だけを一目で確認するための lint-as-rules です。正本は `package.json`、`.github/workflows/ci.yml`、ESLint/Prettier config、codegen/governance/OpenSpec/security scripts、tests、git hooks です。本文と実装が食い違う場合は config、scripts、tests、hooks が勝ちます。

このファイルを更新するときは `opencode run --command rules.update-coding-standard` を使います。

## 0. 全体方針

**Rule: Active guidance は Agent/Client architecture を向く。**
Summary: OpenCode guidance は `packages/agent/**` と `packages/client/**` を Cloudflare Workers 上の Agent Service / Management Client scope とし、removed backend/frontend unit agents を参照しません。
Enforcement point: `pnpm lint:governance` via `scripts/governance/verify-package-boundaries.mjs`; fixture coverage in `scripts/governance/verify-package-boundaries.test.mjs`.
NG例: `.opencode/agents/openspec/applier.md` で `unit/backend/` や `unit/frontend/` を委譲先として残す。
OK例: `.opencode/agents/unit/agent/engineer.md`、`.opencode/agents/unit/client/engineer.md`、`.opencode/agents/unit/build/builder.md` を現行 scope として使う。

**Rule: Generated output policy を guidance から消さない。**
Summary: generated proto/RPC paths は command-owned で手編集禁止であることを workflow guidance に残します。
Enforcement point: `pnpm lint:governance` via `scripts/governance/verify-package-boundaries.mjs`; checked files include `.opencode/skills/coding-guardian/SKILL.md` and `.opencode/skills/coding-guardian/references/repo-entrypoints.md`.
NG例: `.opencode` guidance から `packages/agent/proto/**` や `packages/client/src/generated/agent-rpc/**` の手編集禁止を削除する。
OK例: `packages/agent/proto/**`、`packages/agent/src/generated/rpc/**`、`packages/client/src/generated/agent-rpc/**` を command-owned / no hand-edit と明記する。

## 1. Agent API 契約と生成

**Rule: Agent API source of truth は `packages/agent/src/typespec/main.tsp` だけにする。**
Summary: Agent public API は TypeSpec から proto3/RPC descriptors へ生成し、OpenAPI/Orval を API 正本にしません。
Enforcement point: `pnpm gen:agent:proto` via `package.json`, `packages/agent/package.json`, `packages/agent/src/typespec/main.tsp`, and `packages/agent/src/typespec/tspconfig.yaml`.
NG例: Agent API を `openapi.json`、Orval config、ad-hoc JSON DTO から設計する。
OK例: `packages/agent/src/typespec/main.tsp` で common/model/service `.tsp` を import し、`@typespec/protobuf` で `cftamac.agent.v1` を emit する。

**Rule: Generated proto/RPC outputs は command-owned とし、手編集しない。**
Summary: `packages/agent/proto/**`、`packages/agent/src/generated/rpc/**`、`packages/client/src/generated/agent-rpc/**` は generation command の出力として扱います。
Enforcement point: `pnpm check:codegen` via `package.json`, `packages/agent/buf.gen.yaml`, and `scripts/codegen/check-agent-codegen-drift.mjs`.
NG例: `packages/agent/proto/cftamac/agent/v1.proto` や generated `v1_pb.ts` を直接編集する。
OK例: `pnpm gen:agent:proto && pnpm gen:agent:rpc` または `pnpm gen` で再生成し、drift がない状態にする。

**Rule: Generated output drift を残さない。**
Summary: generation 後に tracked proto/RPC output の差分が残ると codegen check は失敗します。
Enforcement point: `pnpm check:codegen` via `package.json` command `git diff --exit-code -- packages/agent/proto packages/agent/src/generated/rpc packages/client/src/generated/agent-rpc` and `scripts/codegen/check-agent-codegen-drift.mjs`.
NG例: TypeSpec を変えたのに generated proto/RPC files を更新しない。
OK例: `pnpm check:codegen` が clean に通るまで source と generated outputs を揃える。

**Rule: Agent OpenAPI output を生成しない。**
Summary: Agent API output に OpenAPI artifact を追加すると codegen/governance checks が失敗します。
Enforcement point: `pnpm check:codegen` via `scripts/codegen/check-agent-codegen-drift.mjs`; `pnpm lint:governance` via `scripts/governance/verify-agent-surface.mjs`.
NG例: `packages/agent/openapi`、`packages/agent/src/typespec/openapi`、`packages/agent/src/generated/openapi` を追加する。
OK例: Agent contract は `packages/agent/src/typespec/main.tsp` から `packages/agent/proto/**` と generated RPC descriptors だけへ出力する。

**Rule: RPC Service Inventory を維持する。**
Summary: 必須 service/method が proto descriptors から消えると codegen/test が失敗します。
Enforcement point: `pnpm check:codegen` via `scripts/codegen/check-agent-codegen-drift.mjs`; `pnpm test:agent` via `packages/agent/src/tests/contract-generation.test.ts`.
NG例: `IntegrationIngressService` を削除する、`AgentIntegrationService.CreateAdapterConnection` を別 service に移す。
OK例: `AgentLifecycleService`、`AgentEventService`、`AgentThreadService`、`AgentRunService`、`AgentStateService`、`AgentScheduleService`、`AgentToolService`、`AgentIntegrationService`、`IntegrationIngressService`、`AgentHealthService` と required methods を残す。

**Rule: Public Agent RPC request は Agent-scoped body fields を持つ。**
Summary: public request は `agent_id` を body に持ち、command は `idempotency_key`、Event publish は `thread_key` を持ちます。
Enforcement point: `pnpm check:codegen` via `scripts/codegen/check-agent-codegen-drift.mjs`; `pnpm test:agent` via `packages/agent/src/tests/rpc-schema-invariants.test.ts` and `packages/agent/src/tests/command-event-invariants.test.ts`.
NG例: public request から `agent_id` を外す、mutation request から `idempotency_key` を外す、publish request から `thread_key` を外す。
OK例: request body の `agent_id` で scope し、command/Event publish invariants を generated descriptors で検査できる状態にする。

**Rule: Agent-cross list/search RPC を定義しない。**
Summary: Agent を横断する list/search method 名は public RPC inventory で禁止されています。
Enforcement point: `pnpm check:codegen` via `scripts/codegen/check-agent-codegen-drift.mjs`; `pnpm test:agent` via `packages/agent/src/tests/rpc-schema-invariants.test.ts`.
NG例: `ListAllAgents`、`SearchAgents`、`ListAllToolInvocations`、`ListAllIntegrationInstallations` を追加する。
OK例: list/search は service 内で `agent_id` に scope された request として定義する。

**Rule: Protobuf field stability を壊さない。**
Summary: TypeSpec fields は明示 `@field(n)` を持ち、field number/name の再利用や service/method 重複は禁止です。
Enforcement point: `pnpm check:codegen` via `scripts/codegen/check-agent-codegen-drift.mjs`; `pnpm test:agent` via `packages/agent/src/tests/protobuf-field-stability.test.ts`.
NG例: `@field(n)` を省く、削除済み field number を別 field に再利用する、同一 service 内で method 名を重複させる。
OK例: すべての model field に `@field(n)` を置き、削除済み field は number/name を reserve する。

**Rule: Thread key identity と validation metadata を維持する。**
Summary: `thread_key` は NFC 正規化後に非空、512 UTF-8 bytes 以下、case-sensitive、Agent-scoped です。
Enforcement point: `pnpm check:codegen` via `scripts/codegen/check-agent-codegen-drift.mjs`; `pnpm test:agent` via `packages/agent/src/tests/thread-key-identity.test.ts` and `packages/agent/src/tests/command-event-invariants.test.ts`.
NG例: 空文字や 512 UTF-8 bytes 超過を許す、Integration/Adapter/principal を暗黙 prefix にする、大文字小文字を同一視する。
OK例: same `agent_id` + same normalized `thread_key` は same Thread、different `agent_id` は別 Thread とする。

**Rule: Agent public surface は Protobuf RPC-only に閉じる。**
Summary: Agent package に REST route、OpenAPI/Orval surface、ad-hoc JSON Agent API を追加しません。
Enforcement point: `pnpm lint:governance` via `scripts/governance/verify-agent-surface.mjs`; `pnpm lint:eslint` via `eslint.config.js`; `pnpm test:agent` via `packages/agent/src/tests/forbidden-agent-surface.test.ts`.
NG例: `packages/agent/src` で `new Hono()`、`.get('/')`、`Response.json(...)`、`openapi.json`、`orval` を追加する。
OK例: `packages/agent/src/rpc/**` の Connect facade と generated descriptors を public path として使う。

**Rule: Agent 本番 Client Service 認証は Ed25519 JWT と `AGENT_CONTROL_PLANE_TRUST` に閉じる。**
Summary: 本番 Client Service trust source は public-only trust config と EdDSA JWT であり、HS256、`AGENT_CREDENTIAL_*`、bootstrap RPC、AgentTrustRegistry、REST/JSON auth route を使いません。
Enforcement point: `pnpm lint:governance` via `scripts/governance/verify-agent-surface.mjs` and `scripts/governance/verify-package-boundaries.mjs`; scenario coverage via `WORKSPACE-GOVERNANCE-S011`.
NG例: Client Agent RPC signing で `HS256` や `resolveCredentialSecret` を使う、Agent に `/auth` JSON route や bootstrap trust RPC を追加する、Client private signing key を Worker Secret へ手貼りする前提を書く。
OK例: Client D1 の encrypted Client Service signing key store を `CLIENT_CREDENTIAL_ENCRYPTION_KEY` で復号し、server-only module が EdDSA JWT を署名し、Agent が `AGENT_CONTROL_PLANE_TRUST` の issuer/kid/fingerprint/scope policy で検証する。

**Rule: Connect transport は binary Protobuf profile と fail-closed routing を守る。**
Summary: Agent Worker は `POST` + `Content-Type: application/proto` の unary request を受け、JSON/GET/unmapped method/public Durable Object fetch fallback を成功させません。
Enforcement point: `pnpm test:agent` via `packages/agent/src/tests/connect-binary.test.ts`, `packages/agent/src/tests/fail-closed-routing.test.ts`, and `packages/agent/src/tests/health-rpc.test.ts`.
NG例: JSON encoding、HTTP `GET`、unsupported content type、handler 未実装の generated method、public Durable Object fetch fallback を成功 path にする。
OK例: binary Protobuf request だけを facade に通し、malformed request は `invalid_argument`、unmapped method は `unimplemented` にする。

## 2. Agent/Client package boundaries

**Rule: Agent runtime source と Client runtime source は相互 import しない。**
Summary: Agent/Client は別 Worker として独立し、runtime source を相互参照しません。
Enforcement point: `pnpm lint:eslint` via `eslint.config.js`; `pnpm lint:governance` via `scripts/governance/verify-package-boundaries.mjs`.
NG例: `packages/agent/src/**` から `@cf-tamac/client` を import する、または `packages/client/src/**` から `@cf-tamac/agent` runtime source を import する。
OK例: Client server-only module は `packages/client/src/generated/agent-rpc/**` と Connect runtime を使い、Agent source は Client source を知らない。

**Rule: Agent/Client source は ESLint boundary classifier の既知 layer に置く。**
Summary: Agent runtime、Agent generated RPC、Client runtime、Client generated Agent RPC、Client App のいずれかに分類されない source/import は失敗します。
Enforcement point: `pnpm lint:eslint` via `eslint.config.js` rules `boundaries/no-unknown-files`, `boundaries/no-unknown`, and `boundaries/no-ignored`.
NG例: `packages/agent/src` や `packages/client/app` に boundary element type へ分類されない file/import を追加する。
OK例: `packages/agent/src/rpc/**`、`packages/client/src/server/**`、`packages/client/app/**` など既知 boundary の中へ置く。

**Rule: Worker bindings は Agent と Client で分離する。**
Summary: Agent Worker は `AI_AGENT` と `AGENT_BLOBS`、Client Worker は `CLIENT_DB` と credential refs を所有します。
Enforcement point: `pnpm lint:governance` via `scripts/governance/verify-package-boundaries.mjs`; `pnpm test:agent` via `packages/agent/src/tests/agent-worker-bindings.test.ts`; `pnpm test:client` via `packages/client/src/tests/client-bindings.test.ts`; configs `packages/agent/wrangler.toml` and `packages/client/wrangler.toml`.
NG例: Agent Worker に `CLIENT_DB`、D1、Cloudflare Queues binding を追加する、または Client Worker に `AI_AGENT`、`AGENT_BLOBS`、R2 binding を追加する。
OK例: `packages/agent/wrangler.toml` は `AI_AGENT` Durable Object と `AGENT_BLOBS` R2 を持ち、`packages/client/wrangler.toml` は `CLIENT_DB` を持つ。

## 3. Management Client server/browser boundary

**Rule: Browser-visible Client modules は server-only Agent RPC、credentials、generated RPC construction、Connect runtime を import しない。**
Summary: Browser bundle に Agent RPC credential seam、private JWK、encrypted private JWK、生 JWT、direct Agent RPC invocation logic を入れません。
Enforcement point: `pnpm lint:eslint` via `eslint.config.js`; `pnpm lint:governance` via `scripts/governance/verify-package-boundaries.mjs`; `pnpm test:client` via `packages/client/src/tests/browser-agent-rpc-secrecy.test.ts`.
NG例: `packages/client/app/page.tsx` から `@connectrpc/connect`、`@cf-tamac/client-agent-rpc/**`、`packages/client/src/server/**` を import する。
OK例: Agent RPC client construction は `packages/client/src/server/agent-rpc/**` に閉じ、App Router は Server Components/Server Actions 経由で使う。

**Rule: Browser-visible Client modules は direct network call をしない。**
Summary: Browser-visible Client code で `fetch` や ad-hoc HTTP client を使って Agent/API を直接呼びません。
Enforcement point: `pnpm lint:eslint` via `eslint.config.js`; `pnpm lint:governance` via `scripts/governance/verify-package-boundaries.mjs`.
NG例: `packages/client/app/**` や browser-visible `packages/client/src/**` で `fetch(...)`、`globalThis.fetch(...)`、`axios`、`cross-fetch` を使う。
OK例: Agent 通信は server-only Agent RPC module または Server Actions/Server Components の internal UI boundary に閉じる。

**Rule: Browser-visible Client source に credential/D1/RPC seam 文字列を置かない。**
Summary: Browser-visible source に Agent credential headers、Client D1 seam、server Agent RPC factory 名、private JWK、encrypted private JWK、生 JWT、signing material を漏らしません。
Enforcement point: `pnpm lint:governance` via `scripts/governance/verify-package-boundaries.mjs`; `pnpm test:client` via `packages/client/src/tests/browser-agent-rpc-secrecy.test.ts`.
NG例: `createServerAgentRpcClients`、`CLIENT_DB`、`credentialRef`、`credential_ref`、`Authorization`、`Bearer`、`privateJwk`、`encryptedPrivateJwk` を app/browser-visible source に置く。
OK例: Credential refs と Agent RPC metadata は `packages/client/src/server/**` に閉じる。

**Rule: Client Agent RPC server modules は `server-only` boundary を持つ。**
Summary: `packages/client/src/server/agent-rpc/**` は server-only module として明示します。
Enforcement point: `pnpm lint:governance` via `scripts/governance/verify-package-boundaries.mjs`; `pnpm test:client` via `packages/client/src/tests/client-import-graph.test.ts`.
NG例: `packages/client/src/server/agent-rpc/create-client.ts` から `import 'server-only';` を消す。
OK例: Client Agent RPC factory modules は先頭で `import 'server-only';` を宣言する。

**Rule: Client server-side Agent RPC は generated Agent RPC code と Connect runtime だけを使う。**
Summary: Client server-side RPC module は Agent runtime source を import せず、Client 側 generated descriptors を使います。
Enforcement point: `pnpm lint:governance` via `scripts/governance/verify-package-boundaries.mjs`; `pnpm test:client` via `packages/client/src/tests/client-import-graph.test.ts`.
NG例: `packages/client/src/server/agent-rpc/**` から `packages/agent/src/**` や `@cf-tamac/agent` runtime source を import する。
OK例: `@cf-tamac/client-agent-rpc/cftamac/agent/v1_pb` と `@connectrpc/connect` を server-only module から使い、binary format を維持する。

**Rule: Client Worker は Agent API proxy routes を公開しない。**
Summary: Client App Router に `/api/client/*`、`/api/agent*`、Agent REST proxy、arbitrary RPC forwarding handler を置きません。
Enforcement point: `pnpm lint:eslint` via `eslint.config.js`; `pnpm test:client` via `packages/client/src/tests/client-api-proxy-absence.test.ts`.
NG例: `packages/client/app/api/agent/route.ts` や `packages/client/src/foo/proxy.ts` で Agent RPC を forward する。
OK例: `packages/client/app/agents/**/page.tsx` の route shells と Server Actions を internal UI boundary として使う。

**Rule: Client App Router route manifest は Agent management shell に限定する。**
Summary: Client UI route graph は Agent registry/detail sections だけを公開し、demo/API route を足しません。
Enforcement point: `pnpm test:client` via `packages/client/src/tests/client-api-proxy-absence.test.ts` and `packages/client/src/tests/management-navigation.test.tsx`.
NG例: `packages/client/app/api/**` route handler、旧 demo route、Agent proxy route を追加する。
OK例: `/`、`/agents`、`/agents/new`、`/agents/[agentId]`、`threads`、`events`、`schedules`、`tools`、`integrations`、`settings` の shell routes に留める。

**Rule: Client UI は Agent registry shell を表示し、旧 demo content を表示しない。**
Summary: Management Client の UI は Agent 管理 shell であり、`hello` / `users` demo experience を表示しません。
Enforcement point: `pnpm test:client` via `packages/client/src/tests/agent-registry-shell.test.tsx` and `packages/client/src/tests/management-navigation.test.tsx`.
NG例: `management-content.tsx` や route shells に旧 `hello` / `users` navigation/content を戻す。
OK例: `Agent registry`、`Register the first managed Agent.`、`New Agent record`、`Preview detail shell`、`agent_id:` を含む shell を表示する。

**Rule: Client D1 は management ledger と encrypted signing key store だけを保持し、Agent-domain snapshots を保存しない。**
Summary: Client-owned D1 は managed Agent records、外部 credential refs、encrypted Client Service signing key store だけを持ちます。
Enforcement point: `pnpm test:client` via `packages/client/src/tests/client-d1-schema.test.ts`, `packages/client/src/tests/client-repository-boundary.test.ts`, and `packages/client/src/server/db/schema.ts`.
NG例: Client D1 に Agent events、thread memory、state snapshots、schedules、tool invocations、integration installations、adapter connections、compaction bodies、plaintext secret、private JWK plaintext を保存する table/API を追加する。
OK例: `client_managed_agents`、`client_agent_credential_refs`、`client_signing_keys` を Client-owned data として扱い、`client_signing_keys.encrypted_private_jwk` は `CLIENT_CREDENTIAL_ENCRYPTION_KEY` で暗号化された値だけを保持する。

## 4. Agent layer direction

**Rule: Agent dependency direction は一方向にする。**
Summary: Agent lower layers は Worker/RPC facade/generated descriptors へ逆依存しません。
Enforcement point: `pnpm lint:eslint` via `eslint.config.js`; `pnpm lint:governance` via `scripts/governance/verify-package-boundaries.mjs`.
NG例: `packages/agent/src/events/foo.ts` から `../rpc/router`、`../worker`、`@cf-tamac/agent-rpc/**` を import する。
OK例: Worker entrypoint -> RPC adapter/router/interceptors -> service modules -> Agent domain/runtime modules -> Agent-owned storage/observability/types の向きに保つ。

**Rule: Agent storage layer は domain/runtime/DO routing/RPC layer を import しない。**
Summary: storage module は lower-level schema/persistence seam に閉じます。
Enforcement point: `pnpm lint:eslint` via `eslint.config.js`; `pnpm lint:governance` via `scripts/governance/verify-package-boundaries.mjs`.
NG例: `packages/agent/src/storage/schema.ts` から `../events`、`../AIAgent`、`../agent-routing`、`../rpc/**` を import する。
OK例: storage module は schema/table constants と lower-level persistence helpers に閉じる。

**Rule: Agent lower layers は framework/runtime imports と Worker network globals を使わない。**
Summary: Agent domain/runtime/observability lower layers は transport/framework/platform runtime から独立します。storage persistence layer だけは Agent-owned Durable Object SQLite への Drizzle ORM access を持てます。
Enforcement point: `pnpm lint:eslint` via `eslint.config.js`; `pnpm lint:governance` via `scripts/governance/verify-package-boundaries.mjs`.
NG例: `packages/agent/src/domain/**`、`events/**`、`runs/**`、`rpc/**` などの storage persistence layer 以外から `hono`、`@connectrpc/connect`、`next`、`react`、`drizzle-orm`、`@cloudflare/**`、`fetch`、`Request`、`Response`、`console` を使う。
OK例: domain/runtime lower layers は pure seam に閉じ、transport/platform access は Worker/RPC/DO wiring layer へ置く。Agent storage persistence layer は `drizzle-orm/durable-sqlite`（または現行 Drizzle の Durable Object SQLite adapter）に閉じる。

**Rule: Agent RPC service modules は router、adapter、interceptors を import しない。**
Summary: RPC service modules は generated descriptors と domain/runtime seam を接続し、outer wiring へ逆依存しません。
Enforcement point: `pnpm lint:eslint` via `eslint.config.js`; `pnpm lint:governance` via `scripts/governance/verify-package-boundaries.mjs`.
NG例: `packages/agent/src/rpc/services/health.ts` から `../connect-worker-adapter`、`../router`、`../interceptors/authentication` を import する。
OK例: router/adapter/interceptor wiring は `packages/agent/src/rpc/router.ts` や adapter layer 側に置く。

**Rule: Agent RPC service modules は小さく保つ。**
Summary: RPC service modules は cognitive complexity 10、cyclomatic complexity 10、nesting depth 3 を超えません。
Enforcement point: `pnpm lint:eslint` via `eslint.config.js` rules for `packages/agent/src/rpc/services/**/*.{ts,tsx}`.
NG例: `packages/agent/src/rpc/services/events.ts` に深い条件分岐や複雑な orchestration を直接詰め込む。
OK例: 複雑な domain logic は Agent domain/runtime helper へ分け、service module は RPC seam に留める。

**Rule: `agent_id` は 1 つの `AIAgent` Durable Object instance に解決する。**
Summary: same `agent_id` は same DO id/stub、different `agent_id` は different DO id/stub へ解決します。
Enforcement point: `pnpm test:agent` via `packages/agent/src/tests/agent-id-routing.test.ts` and implementation `packages/agent/src/agent-routing.ts`.
NG例: 空 `agent_id` を Durable Object name にする、same `agent_id` で異なる DO id/stub を返す。
OK例: empty `agent_id` は拒否し、same `agent_id` は same DO id/stub に解決する。

**Rule: Agent-local Queue は scheduler wake/coalescing boundary であり、Event/Run の source of truth ではない。**
Summary: accepted Events、pending Runs、scheduler wake state は `AIAgent` Durable Object SQLite storage に保存します。
Enforcement point: `pnpm test:agent` via `packages/agent/src/tests/agent-local-queue-wake.test.ts`, `packages/agent/src/AIAgent.ts`, `packages/agent/src/storage/table-initializer.ts`, and `packages/agent/src/storage/schema.ts`.
NG例: Cloudflare Queues producer/consumer API を Event source of truth として使う、wake ごとに unbounded item を作る。
OK例: Event append -> pending Run creation -> scheduler wake/coalescing state の順に DO SQLite storage へ保存する。

## 5. Legacy demo deletion notes

**Rule: Legacy demo resource paths は Agent Worker で served にしない。**
Summary: Agent Worker は old `hello` / `users` resource behavior を公開しません。
Enforcement point: `pnpm test:agent` via `packages/agent/src/tests/forbidden-demo-routes.test.ts`.
NG例: Agent Worker に旧 `hello` / `users` demo handler を戻す。
OK例: unsupported route または Connect-compatible error とし、Agent RPC surface だけを公開する。

**Rule: Legacy demo package graph は Agent entrypoints から到達不能にする。**
Summary: Agent package graph は old demo contract/runtime packages や demo domain files を import/export しません。
Enforcement point: `pnpm test:agent` via `packages/agent/src/tests/agent-source-graph.test.ts`.
NG例: `packages/agent/src/index.ts` から old demo package/domain を export する。
OK例: `packages/agent/**` の entrypoints は Agent Service modules と generated RPC policy だけを扱う。

**Rule: Legacy demo API routes を supported product API として文書化しない。**
Summary: README/AGENTS/CONTRIBUTING/CODING_STANDARDS は old demo API を product API として案内しません。
Enforcement point: `pnpm test:run` via `scripts/governance/verify-agent-surface.test.mjs`; checked docs include `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, and `CODING_STANDARDS.md`.
NG例: docs に old `hello` / `users` HTTP demo route を supported API として書く。
OK例: legacy demo は deletion/history/negative test の文脈だけで扱い、Agent API は Protobuf RPC-only と書く。

## 6. CI 必須ステップ

**Rule: CI は `.github/workflows/ci.yml` の順序で verification を実行する。**
Summary: PR/push verification は install、format、lint、type checks、tests、codegen drift、codegen smoke の順で走ります。
Enforcement point: GitHub Actions via `.github/workflows/ci.yml`.
NG例: `pnpm lint`、`pnpm test:agent && pnpm test:client`、`pnpm check:codegen` を通さずに PR ready と判断する。
OK例: CI order は `pnpm install --frozen-lockfile`、`pnpm format:check`、`pnpm lint`、`pnpm check`、`pnpm check:agent && pnpm check:client`、`pnpm test:run`、`pnpm test:agent && pnpm test:client`、`pnpm check:codegen`、`pnpm gen:agent:proto && pnpm gen:agent:rpc`。

**Rule: Formatting は Prettier の対象ファイルで一致させる。**
Summary: TS/TSX/JS/JSX/JSON/Markdown は Prettier config に一致している必要があります。
Enforcement point: `pnpm format:check` via `package.json`, `.prettierrc.json`, and `.prettierignore`.
NG例: Markdown や TS/TSX/JSON を Prettier と違う形で残す。
OK例: `pnpm format` で `**/*.{ts,tsx,js,jsx,json,md}` を整形し、generated outputs は `.prettierignore` に従う。

**Rule: TypeScript strict safety rules を守る。**
Summary: unsafe types/calls、truthy non-boolean conditions、floating promises、unnecessary assertions などは ESLint error です。
Enforcement point: `pnpm lint:eslint` via `eslint.config.js`.
NG例: `any`、unsafe assignment/call/member/return/argument、truthy string/number condition、floating promise、unused vars を残す。
OK例: `unknown` を narrowing し、Promise は `await`/`void` で扱い、boolean condition を明示し、未使用値は削除または `_` prefix にする。

**Rule: Import/export hygiene を守る。**
Summary: duplicate imports、extension付き imports、import order 崩れ、value import の type 使用は ESLint error です。
Enforcement point: `pnpm lint:eslint` via `eslint.config.js`.
NG例: duplicate imports、`.ts` / `.tsx` / `.js` / `.jsx` / `.mjs` / `.cjs` extension import、type を value import で書く。
OK例: extensionless import、`import type`、builtin -> external -> internal -> parent/sibling/index -> object -> type の順序を使う。

**Rule: ESLint disable comment は未使用や片方向 disable を残さない。**
Summary: unused disable と disable/enable pair violation は ESLint error です。
Enforcement point: `pnpm lint:eslint` via `eslint.config.js` rules `eslint-comments/no-unused-disable` and `eslint-comments/disable-enable-pair`.
NG例: 効いていない `eslint-disable` や対応する enable のない広範囲 disable を残す。
OK例: disable が必要な場合は最小範囲で使い、不要になったら削除する。

**Rule: Security and code-quality hard errors を残さない。**
Summary: eval/debugger/alert/var/forEach/non-node builtin import などは hard error です。
Enforcement point: `pnpm lint:eslint` via `eslint.config.js`.
NG例: `eval`、implied eval、`new Function`、script URL、`debugger`、`alert`、`var`、array `.forEach`、non-node-protocol builtin import を残す。
OK例: explicit functions、`node:` protocol、`for...of`、`const`、UI-level error display を使う。

**Rule: Exported production TS/TSX declarations には TSDoc を付ける。**
Summary: generated output と tests を除く `packages/**/src/**/*.{ts,tsx}` の exported declarations は TSDoc 必須です。
Enforcement point: `pnpm lint:eslint` via `eslint.config.js` custom rule `export-tsdoc/require-export-tsdoc`.
NG例: `packages/agent/src/foo.ts` に `export function buildFoo() {}` だけを書く。
OK例: `/** Build Foo. */ export function buildFoo() {}` のように exported declaration の直前へ TSDoc を置く。

**Rule: `index.ts` は re-export only にする。**
Summary: package/source `index.ts` に実装や default export を置きません。
Enforcement point: `pnpm lint:eslint` via `eslint.config.js` for `packages/**/index.ts` and `packages/**/src/**/index.ts`.
NG例: `packages/client/src/server/db/index.ts` に `export const now = Date.now();` や `export default` を置く。
OK例: `export { createManagedAgent } from './managed-agents';` のように re-export だけを書く。

**Rule: package TS/TSX は 1 file 500 lines、1 function 100 lines 以内にする。**
Summary: package source の肥大化は max-lines rules で失敗します。
Enforcement point: `pnpm lint:eslint` via `.eslintrc-maxlines.json` and `eslint.config.js`.
NG例: hand-written package source を 800 lines にする、1 function に 150 lines を詰める。
OK例: responsibilities を小さく分け、generated outputs と tests 以外は limit 内に保つ。

**Rule: pnpm supply-chain policy は 72-hour release-age と package-by-package build-script approval を維持する。**
Summary: dependency release-age gate と install-script approval policy を弱めると lint が失敗します。
Enforcement point: `pnpm lint:supply-chain` via `scripts/security/verify-pnpm-supply-chain.mjs` and `pnpm-workspace.yaml`.
NG例: `minimumReleaseAge` を 4320 未満にする、`minimumReleaseAgeExclude` を追加する、`dangerouslyAllowAllBuilds: true` を入れる、`allowBuilds` に wildcard を入れる。
OK例: `minimumReleaseAge: 4320` と explicit `allowBuilds` entries を維持する。

## 7. Git hooks

**Rule: `pre-commit` は staged lint/format 後に codegen drift check を実行する。**
Summary: commit 前に `pnpm lint-staged` を実行し、続けて `pnpm check:codegen` を実行します。
Enforcement point: Git hook via `.husky/pre-commit`; commands `pnpm lint-staged` then `pnpm check:codegen`.
NG例: staged files だけ整えて generated proto/RPC drift を残したまま commit する。
OK例: `.husky/pre-commit` の順序どおり `pnpm lint-staged` 後に `pnpm check:codegen` が pass する状態で commit する。

**Rule: staged TS/TSX/JS/JSX は ESLint fix 後に Prettier write を実行する。**
Summary: staged `*.ts`、`*.tsx`、`*.js`、`*.jsx` は `eslint --fix` と `prettier --write` の順で処理されます。
Enforcement point: `pnpm lint-staged` via `.lintstagedrc.json` pattern `*.{ts,tsx,js,jsx}`.
NG例: staged `*.ts` に lint error や unformatted code を残す。
OK例: `eslint --fix` と `prettier --write` が通る形に修正して stage する。

**Rule: staged JSON/Markdown は Prettier write を実行する。**
Summary: staged `*.json` と `*.md` は `prettier --write` で処理されます。
Enforcement point: `pnpm lint-staged` via `.lintstagedrc.json` pattern `*.{json,md}`.
NG例: staged `*.md` や `*.json` を Prettier と違う形で commit する。
OK例: Markdown/JSON は `prettier --write` 後の内容を stage する。

**Rule: `commit-msg` は Conventional Commits type を検査する。**
Summary: commit message は allowed Conventional Commit type のみ受け付けます。
Enforcement point: Git hook via `.husky/commit-msg` command `pnpm commitlint --edit $1`; rules in `commitlint.config.js`.
NG例: `update stuff` や許可 type 外の commit message にする。
OK例: `feat: add agent registry shell`、`fix: close proxy route gap`、`docs: update coding standards` のように `feat/fix/docs/style/refactor/perf/test/build/ci/chore/revert` を使う。

## 8. OpenSpec

**Rule: OpenSpec は strict validation を lint の一部として通す。**
Summary: `pnpm lint:openspec` は OpenSpec strict validation と Scenario coverage check を実行します。
Enforcement point: `pnpm lint:openspec` via `package.json` command `pnpm exec openspec validate --all --strict && node scripts/openspec/verify-scenario-coverage.mjs`.
NG例: strict validation に失敗する change/spec artifact を残す。
OK例: `pnpm lint:openspec` が pass する proposal/spec/design/tasks にする。

**Rule: Scenario heading は stable Scenario ID で終わる。**
Summary: `#### Scenario:` heading は `(...-S001)` 形式の stable ID で終わる必要があります。
Enforcement point: `pnpm lint:openspec` via `scripts/openspec/verify-scenario-coverage.mjs`.
NG例: `#### Scenario: Create agent` のように ID なしで書く、または lowercase/不正形式の ID を使う。
OK例: `#### Scenario: Create agent (AGENT-PLATFORM-S001)` のように `^[\dA-Z]+(?:-[\dA-Z]+)*-S\d{3,}$` に一致させる。

**Rule: Manual でない Scenario は automated test title から bracketed ID で参照する。**
Summary: non-manual Scenario ID は test title の `[SCENARIO-ID]` から参照される必要があります。
Enforcement point: `pnpm lint:openspec` via `scripts/openspec/verify-scenario-coverage.mjs`; scanned tests include `packages/**`, `tests/**`, and `scripts/**` test/spec files.
NG例: Scenario ID を test title から外す、または spec にない orphan Scenario ID を test title に入れる。
OK例: `it('[AGENT-PLATFORM-S001] Create agent', ...)` のように bracketed ID を含める。

**Rule: Automated coverage 対象外にする Scenario は `Tags: manual` を明示する。**
Summary: 自動化しない Scenario は heading 直下の tags で manual を宣言します。
Enforcement point: `pnpm lint:openspec` via `scripts/openspec/verify-scenario-coverage.mjs`.
NG例: 自動化しない Scenario を manual tag なしで main spec に置く。
OK例: Scenario heading の下に `Tags: manual` を置く。

**Rule: Scenario ID は duplicate/orphan/missing coverage を残さない。**
Summary: duplicate Scenario ID、main/change specs にない orphan test reference、missing automated coverage は失敗します。
Enforcement point: `pnpm lint:openspec` via `scripts/openspec/verify-scenario-coverage.mjs`.
NG例: 同じ Scenario ID を複数置く、spec にない ID を tests で参照する、manual でない Scenario の test reference を忘れる。
OK例: OpenSpec `spec.md` の Scenario ID と `packages/**`、`tests/**`、`scripts/**` の test titles を一致させる。

## 9. 設定参照

| 領域                                | 参照ファイル                                                                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Root command graph                  | `package.json`                                                                                                                                 |
| CI order                            | `.github/workflows/ci.yml`                                                                                                                     |
| Git hooks                           | `.husky/pre-commit`、`.husky/commit-msg`、`.lintstagedrc.json`、`commitlint.config.js`                                                         |
| Formatting                          | `.prettierrc.json`、`.prettierignore`                                                                                                          |
| ESLint and package size rules       | `eslint.config.js`、`.eslintrc-maxlines.json`                                                                                                  |
| Agent TypeSpec-to-proto             | `packages/agent/src/typespec/main.tsp`、`packages/agent/src/typespec/tspconfig.yaml`、`packages/agent/buf.yaml`、`packages/agent/buf.gen.yaml` |
| Generated outputs                   | `packages/agent/proto/**`、`packages/agent/src/generated/rpc/**`、`packages/client/src/generated/agent-rpc/**`                                 |
| Agent package tests                 | `packages/agent/src/tests/*.test.ts`                                                                                                           |
| Management Client package tests     | `packages/client/src/tests/*.test.ts*`                                                                                                         |
| Codegen drift and schema invariants | `scripts/codegen/check-agent-codegen-drift.mjs`                                                                                                |
| Agent surface governance            | `scripts/governance/verify-agent-surface.mjs`                                                                                                  |
| Package boundary governance         | `scripts/governance/verify-package-boundaries.mjs`                                                                                             |
| OpenSpec scenario coverage          | `scripts/openspec/verify-scenario-coverage.mjs`                                                                                                |
| Supply-chain policy                 | `scripts/security/verify-pnpm-supply-chain.mjs`、`pnpm-workspace.yaml`                                                                         |
