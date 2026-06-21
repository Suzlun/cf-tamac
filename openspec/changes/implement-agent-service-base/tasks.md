## 1. Foundation 前提確認 / Workspace / Supply Chain

- [ ] 1.1 `establish-agent-service-foundation` の proposal/design/spec/tasks と適用済み差分を確認し、`packages/agent`、`packages/client`、TypeSpec-to-proto 生成、Connect facade、Client D1、guardrail が foundation の完了条件を満たすことを記録する。未適用または未同期なら、この change の実装を始めず foundation の apply/sync を先に完了する。
- [ ] 1.2 foundation 後の package graph を棚卸しし、`packages/typespec` Agent OpenAPI、`packages/frontend/api` Orval Agent SDK、`packages/backend/**` Hono zod-openapi Agent route、旧 Vite demo graph が active Agent surface に残っていないことを確認する。残存があれば foundation 逸脱として扱い、この change で再削除作業を重複させず、foundation 差分へ戻して解消する。
- [ ] 1.3 `proposal.md`、`design.md`、全 delta spec、`docs/memo/仕様設計・アーキテクチャ設定.md` を照合し、Stage 1〜8 の実装順序、Stage 9 Discord Provider の対象外境界、Provider-facing Extension/Tool/Delivery 相互運用の対象範囲を apply メモに残す。
- [ ] 1.4 TypeSpec Protobuf、Buf/Protobuf-ES、Connect、Cloudflare Agents SDK、Next.js/OpenNext、関連 test utilities の依存追加計画を作り、install 前に 72 時間 supply-chain policy と `allowBuilds` の必要性を確認する。
- [ ] 1.5 foundation が作成した `packages/agent` と `packages/client` の package scripts を拡張し、Stage 1〜8 の build/check/test/generation/dev scripts が `pnpm --filter` で解決できることを確認する。
- [ ] 1.6 root scripts を Agent proto/RPC 生成、Client build/dev/test、codegen drift、aggregate validation 用に拡張し、既存 lint、OpenSpec、supply-chain checks を弱めていないことを確認する。
- [ ] 1.7 `eslint.config.js`、`vitest.config.ts`、`playwright.config.ts`、CI 連携 package metadata を、foundation の境界を保ったまま Stage 1〜8 の新規 source/test/generated exclusions に合わせて更新する。
- [ ] 1.8 Agent Service と Client の README/runbook に、Stage 1〜8 の生成物、local development、secret handling、Provider interop profile、staging smoke 手順を追記する。

## 2. Stage 1 - Protobuf Contract and RPC Facade

- [ ] 2.1 foundation の `packages/agent/src/typespec/main.tsp`、`tspconfig.yaml`、common TypeSpec modules を詳細化し、errors、pagination、security metadata、idempotency、timestamp、nonce、byte payload reference を明示する。完了条件は import が明示され、Agent API 用 OpenAPI emitter が設定されていないこと。
- [ ] 2.2 Agent profile、config、credential、principal、grant、audit、health の TypeSpec models を定義/詳細化する。完了条件は lifecycle/security/health services が [AGENT-LIFECYCLE-BE-S001]、[AGENT-SECURITY-BE-S001]、[AGENT-HEALTH-BE-S001] 用の安定 message を共有できること。
- [ ] 2.3 Thread、Section、Event、Run、State、Compaction、History、ThreadMemory、AgentMemory の TypeSpec models を定義/詳細化する。完了条件は Event/Run/Memory services が [AGENT-EVENTING-BE-S002]、[AGENT-RUNTIME-BE-S004]、[AGENT-MEMORY-BE-S003] 用の Agent-scoped ID と snapshot ref を共有できること。
- [ ] 2.4 Schedule、ToolDefinition、ToolInvocation、Approval、ProviderOperation、Extension、Installation、Adapter、AdapterConnection、DeliveryContext、AdapterDelivery の TypeSpec models を定義/詳細化する。完了条件は Tool/Extension/Delivery messages が installation、connection、operation identities を持ち、[AGENT-TOOL-BE-S005]、[AGENT-EXTENSION-BE-S004]、[AGENT-EXTENSION-BE-S006] に対応すること。
- [ ] 2.5 `agent-lifecycle.tsp`、`agent-event.tsp`、`agent-thread.tsp`、`agent-run.tsp`、`agent-state.tsp`、`agent-schedule.tsp`、`agent-tool.tsp`、`agent-extension.tsp`、`agent-adapter.tsp`、`agent-health.tsp` を Agent-facing service として詳細化する。完了条件は各 service が unary methods、request 内 `agent_id`、scenario-linked contract tests を持つこと。
- [ ] 2.6 `packages/agent/src/typespec/src/services/agent-extension.tsp` に Adapter Connection 管理を `AgentExtensionService.CreateAdapterConnection`、`DeleteAdapterConnection`、`ListAdapterConnections` として定義する。foundation 既存の `agent-adapter.tsp` は `ExtensionIngressService.PublishEvent/PublishToolResult/PublishDeliveryResult` だけを定義し、Adapter Connection 管理や個別取得用の追加 RPC を追加しない。完了条件は Adapter Connection coverage が [AGENT-EXTENSION-BE-S004] に対応すること。
- [ ] 2.7 `packages/agent/src/typespec/src/services/extension-tool.tsp` に Provider-facing `ExtensionToolService.InvokeTool`、`GetOperation`、`CancelOperation` を定義する。完了条件は Agent-to-Provider generated client usage が [AGENT-TOOL-BE-S005]、[AGENT-TOOL-BE-S007]、[AGENT-TOOL-BE-S008] を覆うこと。
- [ ] 2.8 `packages/agent/src/typespec/src/services/extension-delivery.tsp` に Provider-facing `ExtensionDeliveryService.Deliver` を定義する。完了条件は Agent-to-Provider generated client usage が [AGENT-EXTENSION-BE-S006] を覆うこと。
- [ ] 2.9 `@typespec/protobuf`、package `cftamac.agent.v1`、明示 field number、reserved-field policy、unary RPC shape、binary Connect production profile notes を設定/確認する。
- [ ] 2.10 `buf.yaml` と `buf.gen.yaml` を Stage 1〜8 の proto に合わせて更新し、`tsp compile`、`buf lint`、`buf breaking`、Protobuf-ES generation を package scripts へ接続する。
- [ ] 2.11 `packages/agent/proto/cftamac/agent/v1`、`packages/agent/src/generated/rpc`、`packages/client/src/generated/agent-rpc` を生成 scripts だけで更新する。完了条件は `proto/**` と `generated/**` に手編集がないこと。
- [ ] 2.12 Cloudflare Workers Connect adapter、router registration、generated service handlers、`AgentHealthService.Check`、`agent_id` から AIAgent stub へ向かう Worker-internal DO routing を実装する。完了条件は [AGENT-SECURITY-BE-S009] と [AGENT-HEALTH-BE-S001] が通ること。
- [ ] 2.13 binary profile enforcement、GET/JSON rejection、authentication context extraction、validation、audit context、rate limiting、Connect error mapping の RPC interceptors を実装する。
- [ ] 2.14 TypeSpec compile、proto generation、Buf lint/breaking、binary Connect acceptance、JSON/GET rejection、service/method uniqueness、Provider-facing service presence、health Check、generated drift の contract/conformance tests を追加する。

## 3. Cross-Cutting Security / Observability / Error Handling Foundation

- [ ] 3.1 Client Service JWT verifier を実装し、issuer、subject、JWT ID、audience、expiry、not-before、agent scope、scopes、acting user を検証/抽出する。
- [ ] 3.2 Extension detached signature verifier を実装し、service/method、Agent、Installation、Connection、timestamp、nonce、idempotency key、raw protobuf body digest を canonical input として検証する。
- [ ] 3.3 nonce/idempotency repository interfaces、request digest utilities、replay result types、Agent modules が共有する typed command context を定義する。
- [ ] 3.4 AIAgent final authorization policy interfaces と decision result types を定義し、lifecycle、credential、principal type、scopes/grants、capability ownership、requested operation を表現する。
- [ ] 3.5 validation、authentication、authorization、not found、conflict、precondition、concurrency、rate limit、provider failure、timeout、internal 用の Connect error taxonomy と mapper を実装する。
- [ ] 3.6 structured logs、metrics、audit records、rate-limit/security counters、correlation fields、secret/token/signature redaction を実装する。
- [ ] 3.7 Client JWT verifier、Extension signature canonicalization/verifier、Connect error mapping、audit/logging interfaces、observability redaction の happy/error path tests を追加する。
- [ ] 3.8 `ExtensionToolService` と `ExtensionDeliveryService` 用の Agent-to-Provider signature metadata builders を実装し、service/method、Agent、Installation、Connection/Tool/Invocation/DeliveryContext、timestamp、nonce、idempotency key、raw protobuf body digest を署名対象に含める。完了条件は Provider RPC client tests が [AGENT-TOOL-BE-S005]、[AGENT-TOOL-BE-S008]、[AGENT-EXTENSION-BE-S006] を参照すること。

## 4. Stage 2 - AIAgent Lifecycle / Thread / Event Foundation

- [ ] 4.1 `AIAgent` を Cloudflare Agents SDK class として拡張し、typed env bindings、Agent-local Queue entrypoints、Agent Connect facade からのみ到達する Worker-internal Durable Object RPC methods を実装する。完了条件は [AGENT-SECURITY-BE-S009] が public DO RPC route 不在を確認すること。
- [ ] 4.2 Agent profile、credentials、principals、grants、audit、request nonces、idempotency records、Threads、Sections、Events、pending Runs 用の DO SQLite schema/repositories を構築する。
- [ ] 4.3 Agent initialization、`GetAgent`、destroy、credential rotation、config update/query、system Thread creation、lifecycle audit Events、lifecycle state guards を実装する。
- [ ] 4.4 Agent credential verifier material、credential generation overlap/revocation、config versioning、安全な secret/reference storage を実装する。
- [ ] 4.5 `thread_key` validation/normalization、Thread get-or-create、Agent-local `thread_id`、Section open/freeze metadata、Agent/Thread sequence allocation を実装する。
- [ ] 4.6 inline/R2 payload handling、idempotency replay、duplicate digest conflict、correlation/causation links、query pagination を含む Event append transactions を実装する。
- [ ] 4.7 Event persistence 成功後に pending Run records と Agent-local Queue scheduler wakes を作成/合流する Mailbox semantics を実装する。
- [ ] 4.8 Stage 2 repositories を使って concrete nonce TTL storage、idempotency records、digest conflict detection、replay response storage、key rotation overlap、disabled key rejection を実装する。
- [ ] 4.9 Agent-local profile、credential、principal、grant、lifecycle state を使って lifecycle、credential、Thread/Event、query、Run-scheduling commands の concrete final authorization を実装する。
- [ ] 4.10 Agent isolation、system Thread audits、Event ordering、idempotency、payload offload、scoped queries、replay storage、lifecycle authorization を覆う lifecycle/eventing integration tests を追加する。
- [ ] 4.11 `AgentHealthService.Check` が使う AIAgent-side health check command/query を実装し、credential や domain snapshot を返さない safe status に制限する。完了条件は tests が [AGENT-HEALTH-BE-S001] と [AGENT-HEALTH-BE-S002] を含むこと。
- [ ] 4.12 `AgentThreadService.ListThreads`、`GetThread`、`ListSections` handlers を実装し、Agent scope、Thread/Section authorization、pagination cursor scope、Section ordinal/range ordering、not found/error mapping を確認する。完了条件は [AGENT-EVENTING-BE-S009] の tests が通ること。
- [ ] 4.13 `AgentStateService.GetState` と `GetConfig` handlers を実装し、lifecycle/current Run/scheduler/storage threshold/capability summary、current config version、policy metadata を secret-free snapshot として返す。完了条件は [AGENT-LIFECYCLE-BE-S007] の tests が通ること。

## 5. Stage 3 - Runtime / Harness / Run Scheduler

- [ ] 5.1 pending、running、waiting、completed、failed、cancelled、interrupted を持つ AgentRun state machine と Agent ごとの one active Run slot を実装する。
- [ ] 5.2 priority、last served time、pending time による scheduler selection、bounded batch processing、残件用 wake re-enqueue を実装する。
- [ ] 5.3 Event range、ThreadMemory version、latest ready Compaction、uncompacted upper sequence、config version、Tool set version、Extension version を固定する immutable Run snapshot creation を実装する。
- [ ] 5.4 identity/policy、ThreadMemory、Handoff、uncompacted Events、retrieved History、relevant Agent Memory、trigger Event の順序で Context Builder prompt assembly を実装する。
- [ ] 5.5 interrupt flags、cancellation、generation checks、lifecycle/version/capability checks、Run commit 時の stale result discard を実装する。
- [ ] 5.6 stop、state update、memory write、schedule create、Tool invoke、Delivery response、human approval request、Event emit を処理する harness decision interpreter を実装する。
- [ ] 5.7 model calls、Tool calls、tokens、loops、timeout、cooldown、daily budget、Extension budget、Tool budget の Run-level と aggregate budget enforcement を実装する。
- [ ] 5.8 scheduler coalescing/fairness、snapshot immutability、same/different Thread Event arrival、interrupt、decision commit、budget exhaustion の runtime tests を追加する。
- [ ] 5.9 `AgentRunService.GetRun` と `ListRuns` handlers を実装し、Run status、immutable snapshot reference、trigger Event range、causal links、safe error detail、Thread/status/time pagination filters を返す。完了条件は [AGENT-RUNTIME-BE-S009] の tests が通ること。
- [ ] 5.10 `AgentRunService.CancelRun` handler を実装し、pending/running/waiting Run の cancellation/interruption、idempotency replay、terminal/precondition handling、stale commit rejection を確認する。完了条件は [AGENT-RUNTIME-BE-S010] の tests が通ること。

## 6. Stage 4 - Compaction / History / Memory / R2

- [ ] 6.1 Thread compactions、History indexes、ThreadMemory versions/items、AgentMemory、archive metadata、R2 object references 用の DO SQLite schema/repositories を追加する。
- [ ] 6.2 Section freeze/open transaction と pending/running/ready/failed/cancelled output handling を持つ Compaction state machine を実装する。
- [ ] 6.3 situation、goals、intentions、decisions、open loops、constraints、expected next actions、History references を含む Handoff generation/storage を実装する。
- [ ] 6.4 chronology、actor intentions、decisions、options、rationale、assumptions、issues、Tool activity、artifacts、replay manifest を含む ThreadHistory generation/storage を実装する。
- [ ] 6.5 add、confirm、revise、supersede、invalidate、provenance、versioning、active version selection を持つ ThreadMemoryDelta application を実装する。
- [ ] 6.6 large History bodies、Event payloads、transcripts、Tool result blobs、artifacts、Event archive segments の R2 offload と digest/index verification を実装する。
- [ ] 6.7 memo の初期値に合わせて storage threshold behavior を実装する。inline payload は 64 KiB 以下、70% は warning、80% は compaction/archive priority、90% は large body R2 強制、95% は read/delete/compact/export 優先の critical mode とし、metrics と tests で確認する。
- [ ] 6.8 provenance と supersede/invalidate lineage を保つ Memory rebase trigger policy と rebase execution を実装する。
- [ ] 6.9 section boundary atomicity、Event acceptance during compaction、output creation、latest-ready fallback、R2 digest、rebase lineage の compaction/memory tests を追加する。
- [ ] 6.10 `AgentThreadService.GetLatestCompaction`、`GetThreadMemory`、`SearchThreadHistory` handlers を実装し、latest ready compaction、active Memory version、History search filters、R2 reference digest/ownership metadata、running/failed output exclusion を確認する。完了条件は [AGENT-MEMORY-BE-S008] の tests が通ること。

## 7. Stage 5 - Schedule

- [ ] 7.1 Agent、Thread、installation ownership、callback identity、overlap policy、next fire time、status、idempotency、audit metadata を持つ Schedule schema/repository を追加する。
- [ ] 7.2 security primitives、command idempotency、Thread resolution、lifecycle checks、final authorization hooks を使って Create/Get/List/Cancel の Schedule RPC handlers を実装する。
- [ ] 7.3 Cloudflare Agents SDK schedule APIs を one-shot と interval callbacks に接続し、callbacks を `schedule.triggered` Event append transactions へ変換する。
- [ ] 7.4 skip、coalesce、queue-next の overlap policies、duplicate tick protection、observable status updates を実装する。
- [ ] 7.5 Extension disabled/uninstalled states に対する Schedule cleanup を実装し、audit Events と later callback side effects 防止を確認する。
- [ ] 7.6 Thread requirement、trigger Event append、overlap behavior、idempotent cancellation、Extension cleanup の schedule tests を追加する。

## 8. Stage 6 - Tool / Invocation / Approval

- [ ] 8.1 ToolDefinition、ToolInvocation、approval、Provider operation、outgoing request、result Event の schema/repository modules を追加する。
- [ ] 8.2 built-in と active Extension definitions から versioned Tool set snapshots を作る Tool catalog assembly を実装する。
- [ ] 8.3 proposed から terminal states までの ToolInvocation lifecycle を、Thread/Run ownership、idempotency、input/output refs、attempts、audit links とともに実装する。
- [ ] 8.4 Client Service authorization primitives、明示 actor/rationale capture、status transition checks を使って approval/rejection RPCs を実装する。
- [ ] 8.5 Tool catalog、ToolInvocation、approval/rejection、Provider operation、Tool capability access の final authorization policies を Tool schema/state に基づき拡張する。
- [ ] 8.6 generated `ExtensionToolService.InvokeTool`、Connect + binary Protobuf、raw body digest、nonce、idempotency、Provider target metadata を使う signed Agent-to-Provider Tool RPC client を実装する。完了条件は [AGENT-TOOL-BE-S005] が raw fetch/JSON calls なしで通ること。
- [ ] 8.7 success/failure Events を同じ Thread に append し、結果処理用の Run work を coalesce する Tool result handling を実装する。
- [ ] 8.8 timeout/outcome_unknown handling、`ExtensionToolService.GetOperation` status reconciliation、duplicate result suppression、Provider operation identity persistence を実装する。完了条件は [AGENT-TOOL-BE-S007] が通ること。
- [ ] 8.9 Provider operation identity があり cancellation 対応のとき、generated `ExtensionToolService.CancelOperation` で Tool cancellation propagation を実装する。完了条件は [AGENT-TOOL-BE-S008] が通ること。
- [ ] 8.10 catalog filtering、disabled Extension Tools、approval gating、signed Provider RPC metadata、result Event append、GetOperation reconciliation、CancelOperation propagation、Tool-specific authorization の Tool tests を追加する。

## 9. Stage 7 - Extension / Adapter / Delivery

- [ ] 9.1 Extension Installation、manifest、Provider key、grant、Adapter definition、Adapter Connection、DeliveryContext、AdapterDelivery、cleanup の schema/repository modules を追加する。完了条件は各 table/repository が dedicated file または明確な module 名を持ち、[AGENT-EXTENSION-BE-S001]〜[AGENT-EXTENSION-BE-S007] に対応すること。
- [ ] 9.2 signature verification primitives、schema version checks、requested grant evaluation、manifest digest storage、setup instructions を使って manifest fetch/parse/verify flow を実装する。
- [ ] 9.3 installing、pending external setup、active、disabled、uninstalling、uninstalled、failed を持つ Installation lifecycle を実装する。
- [ ] 9.4 `packages/agent/src/adapters/**/*.ts` に Adapter definition normalization、Adapter Connection validation、ingress metadata normalization、DeliveryContext creation boundary を実装する。完了条件は [AGENT-EXTENSION-BE-S008] に Discord-specific parser が不要であること。
- [ ] 9.5 Installation ownership、connection status、grant validation、Agent-local scoping を使って `AgentExtensionService.CreateAdapterConnection`、`DeleteAdapterConnection`、`ListAdapterConnections` handlers を実装する。完了条件は [AGENT-EXTENSION-BE-S004] が通ること。
- [ ] 9.6 Installation status、Adapter Connection ownership、ingress grants、DeliveryContext access、Tool/Adapter capability、uninstall cleanup の final authorization policies を Extension schema/state に基づき拡張する。
- [ ] 9.7 detached signature、timestamp、nonce、idempotency、body digest、grant checks を使って ExtensionIngressService の Event publish、Tool result publish、Delivery result publish handlers を実装する。
- [ ] 9.8 ingress metadata から DeliveryContext を作り、generated `ExtensionDeliveryService.Deliver` を使う signed Agent-to-Provider Delivery RPC client と AdapterDelivery result tracking を実装する。完了条件は [AGENT-EXTENSION-BE-S006] が通ること。
- [ ] 9.9 Agent-side Extension/Tool/Delivery behavior が Discord-specific code に依存しない generic Provider interop boundary を実装し、Stage 9 Discord Provider packages を対象外に保つ。
- [ ] 9.10 ingress rejection、Connection disable、Tool disable、pending ToolInvocation cancellation/outcome_unknown、Schedule cancellation、Delivery revocation、trust key revocation、audit を含む UninstallExtension cleanup を実装する。
- [ ] 9.11 signed manifest install、pending setup、grants/adapters/tools/delivery persistence、Adapter Connection lifecycle、ingress、delivery、uninstall cleanup、generic Provider behavior、Extension-specific authorization の Extension tests を追加する。

## 10. Stage 8 - Client Registry / Server-Side Agent RPC

- [ ] 10.1 foundation の `packages/client` Next.js/OpenNext package を Stage 8 用に拡張し、Worker config、D1 binding、server-only modules、generated Agent RPC client import path、local dev scripts が揃っていることを確認する。
- [ ] 10.2 `client_managed_agents` と `client_agent_credential_refs` の Client D1 schema/migrations を詳細化する。完了条件は migration tests が Agent Service bindings なしで両 table を作成できること。
- [ ] 10.3 `packages/client/src/server/db/managed-agents.ts` repository に create/update/list/delete、pin/sort、rename、last-opened updates を実装する。完了条件は [CLIENT-REGISTRY-BE-S001] が通ること。
- [ ] 10.4 `packages/client/src/server/db/access-credentials.ts` repository に credential references、key ID、masked hint、status、timestamps、secret-reference lookup boundaries を実装する。完了条件は [CLIENT-REGISTRY-BE-S002] が通り plaintext secrets が存在しないこと。
- [ ] 10.5 credential reference の Browser-safe serialization と server-side execution 限定の secret resolution を実装する。
- [ ] 10.6 generated Protobuf descriptors、Connect transport、Client Service auth metadata、acting user context、RPC error normalization を使う server-side Agent RPC client factory を実装する。完了条件は [CLIENT-REGISTRY-BE-S003] が OpenAPI/Orval generated clients なしで通ること。
- [ ] 10.7 Agent registry、Agent overview/config/credential rotation、Thread/Event/Run/Compaction queries、Schedule operations、Tool approval、Extension install/uninstall 用の Server Actions を実装する。
- [ ] 10.8 Client D1 が Agent domain snapshots を保存せず、Agent Service package が Client runtime source や Client D1 bindings を import/参照しないことを確認する。完了条件は [CLIENT-REGISTRY-BE-S004] が通ること。
- [ ] 10.9 public `/api` Agent proxy routes が導入されていないことを確認し、Agent operations を Server Actions/Server Components の背後に保つ。完了条件は [CLIENT-REGISTRY-BE-S005] が通ること。
- [ ] 10.10 registry persistence、credential reference safety、generated Connect client invocation、no domain snapshot persistence、no proxy route exposure の Client registry/server tests を追加する。

## 11. Stage 8 - Client Management UI

- [ ] 11.1 display name、Agent ID、RPC origin、pinned status、sort order、last opened time、connection/credential status を表示する Agent list page を構築する。
- [ ] 11.2 accessible validation、server-side submit、success/error states、client-side secret persistence 不在を備える add/edit Agent form を構築する。
- [ ] 11.3 profile、lifecycle、config version、credential generation/status、capability summary、safe RPC error messages を表示する Agent overview page を構築する。
- [ ] 11.4 acting user context 付き Server Actions による config update と credential rotation、post-submit refresh を持つ settings page を構築する。
- [ ] 11.5 scoped pagination、filters、sequence display、snapshot details、Handoff/History/Memory provenance、causal links を持つ Thread/Event/Run/Compaction/Memory views を構築する。
- [ ] 11.6 Thread context、overlap policy、next fire time、status を扱う Schedule list/create/detail/cancel UI を構築する。
- [ ] 11.7 explicit confirmation、risk/input summary、status、attempts、result links を持つ Tool catalog、ToolInvocation list/detail、approval/rejection UI を構築する。
- [ ] 11.8 manifest identity、Provider identity、grants、Adapter Connections、Tools、Delivery capability、setup instructions、cleanup result を表示する Extension list/detail/install/uninstall UI を構築する。
- [ ] 11.9 registry navigation、overview/settings、Thread/Event/Run/Compaction views、Schedule operations、Tool approvals、Extension install/uninstall、accessibility、Browser credential non-exposure の Playwright/component tests を追加する。

## 12. Automated Scenario Test Tasks

- [ ] 12.1 `[AGENT-LIFECYCLE-BE-S001] InitializeAgent creates the named Agent aggregate` を title に含む automated tests を追加する。
- [ ] 12.2 `[AGENT-LIFECYCLE-BE-S002] GetAgent returns the Agent-local profile and config` を title に含む automated tests を追加する。
- [ ] 12.3 `[AGENT-LIFECYCLE-BE-S003] DestroyAgent disables mutating Agent operations` を title に含む automated tests を追加する。
- [ ] 12.4 `[AGENT-LIFECYCLE-BE-S004] Duplicate lifecycle command replays the recorded response` を title に含む automated tests を追加する。
- [ ] 12.5 `[AGENT-LIFECYCLE-BE-S005] RotateAgentCredential creates a new active generation` を title に含む automated tests を追加する。
- [ ] 12.6 `[AGENT-LIFECYCLE-BE-S006] UpdateConfig changes the version captured by later Runs` を title に含む automated tests を追加する。
- [ ] 12.7 `[AGENT-EVENTING-BE-S001] PublishEvent rejects missing or empty thread_key` を title に含む automated tests を追加する。
- [ ] 12.8 `[AGENT-EVENTING-BE-S002] Same Agent and same thread_key resolve to the same Thread` を title に含む automated tests を追加する。
- [ ] 12.9 `[AGENT-EVENTING-BE-S003] Same thread_key across different Agents remains isolated` を title に含む automated tests を追加する。
- [ ] 12.10 `[AGENT-EVENTING-BE-S004] Lifecycle audit Event is appended to the system Thread` を title に含む automated tests を追加する。
- [ ] 12.11 `[AGENT-EVENTING-BE-S005] Accepted Event is persisted before scheduler wake` を title に含む automated tests を追加する。
- [ ] 12.12 `[AGENT-EVENTING-BE-S006] Duplicate Event publish returns the original Event result` を title に含む automated tests を追加する。
- [ ] 12.13 `[AGENT-EVENTING-BE-S007] ListEvents returns ordered Events within the requested Thread` を title に含む automated tests を追加する。
- [ ] 12.14 `[AGENT-EVENTING-BE-S008] Large Event payload is offloaded with digest metadata` を title に含む automated tests を追加する。
- [ ] 12.15 `[AGENT-RUNTIME-BE-S001] Event acceptance coalesces scheduler wake` を title に含む automated tests を追加する。
- [ ] 12.16 `[AGENT-RUNTIME-BE-S002] Only one AgentRun is active per Agent` を title に含む automated tests を追加する。
- [ ] 12.17 `[AGENT-RUNTIME-BE-S003] Scheduler selects pending Thread fairly` を title に含む automated tests を追加する。
- [ ] 12.18 `[AGENT-RUNTIME-BE-S004] Same Thread Event arriving during a Run creates later work` を title に含む automated tests を追加する。
- [ ] 12.19 `[AGENT-RUNTIME-BE-S005] Different Thread Event waits without contaminating active context` を title に含む automated tests を追加する。
- [ ] 12.20 `[AGENT-RUNTIME-BE-S006] Interrupt prevents stale Run result commit` を title に含む automated tests を追加する。
- [ ] 12.21 `[AGENT-RUNTIME-BE-S007] Harness decision commits Agent-owned actions` を title に含む automated tests を追加する。
- [ ] 12.22 `[AGENT-RUNTIME-BE-S008] Budget exhaustion stops the Run safely` を title に含む automated tests を追加する。
- [ ] 12.23 `[AGENT-MEMORY-BE-S001] Compaction freezes one Section and opens the next` を title に含む automated tests を追加する。
- [ ] 12.24 `[AGENT-MEMORY-BE-S002] Event arriving during compaction enters the open Section` を title に含む automated tests を追加する。
- [ ] 12.25 `[AGENT-MEMORY-BE-S003] Compaction creates Handoff History and MemoryDelta` を title に含む automated tests を追加する。
- [ ] 12.26 `[AGENT-MEMORY-BE-S004] Context Builder resumes from latest ready compaction and raw Events` を title に含む automated tests を追加する。
- [ ] 12.27 `[AGENT-MEMORY-BE-S005] Memory update preserves provenance and version` を title に含む automated tests を追加する。
- [ ] 12.28 `[AGENT-MEMORY-BE-S006] Large History body is stored in R2 with index metadata` を title に含む automated tests を追加する。
- [ ] 12.29 `[AGENT-MEMORY-BE-S007] Memory rebase refreshes long-term Memory without losing lineage` を title に含む automated tests を追加する。
- [ ] 12.30 `[AGENT-SCHEDULE-BE-S001] CreateSchedule requires a Thread context` を title に含む automated tests を追加する。
- [ ] 12.31 `[AGENT-SCHEDULE-BE-S002] Schedule firing appends a schedule.triggered Event` を title に含む automated tests を追加する。
- [ ] 12.32 `[AGENT-SCHEDULE-BE-S003] Overlap policy prevents duplicate interval work` を title に含む automated tests を追加する。
- [ ] 12.33 `[AGENT-SCHEDULE-BE-S004] CancelSchedule prevents future firing` を title に含む automated tests を追加する。
- [ ] 12.34 `[AGENT-SCHEDULE-BE-S005] Extension uninstall cancels its active Schedules` を title に含む automated tests を追加する。
- [ ] 12.35 `[AGENT-TOOL-BE-S001] ListTools returns the Agent-local available Tool catalog` を title に含む automated tests を追加する。
- [ ] 12.36 `[AGENT-TOOL-BE-S002] Disabled Extension Tool cannot be invoked by a new Run` を title に含む automated tests を追加する。
- [ ] 12.37 `[AGENT-TOOL-BE-S003] Approval-required ToolInvocation waits before execution` を title に含む automated tests を追加する。
- [ ] 12.38 `[AGENT-TOOL-BE-S004] Authorized approval transitions ToolInvocation state` を title に含む automated tests を追加する。
- [ ] 12.39 `[AGENT-TOOL-BE-S005] Agent invokes Extension Tool with signed binary Protobuf RPC` を title に含む automated tests を追加する。
- [ ] 12.40 `[AGENT-TOOL-BE-S006] Tool result Event returns to the same Thread` を title に含む automated tests を追加する。
- [ ] 12.41 `[AGENT-TOOL-BE-S007] Unknown Tool outcome is reconciled by operation status` を title に含む automated tests を追加する。
- [ ] 12.42 `[AGENT-EXTENSION-BE-S001] InstallExtension verifies signed manifest before activation` を title に含む automated tests を追加する。
- [ ] 12.43 `[AGENT-EXTENSION-BE-S002] Successful install persists grants adapters tools delivery and trust keys` を title に含む automated tests を追加する。
- [ ] 12.44 `[AGENT-EXTENSION-BE-S003] Installation can wait for external setup` を title に含む automated tests を追加する。
- [ ] 12.45 `[AGENT-EXTENSION-BE-S004] Adapter Connection lifecycle is Agent-local` を title に含む automated tests を追加する。
- [ ] 12.46 `[AGENT-EXTENSION-BE-S005] Signed extension ingress appends Event and DeliveryContext` を title に含む automated tests を追加する。
- [ ] 12.47 `[AGENT-EXTENSION-BE-S006] Agent sends Delivery response through Provider RPC` を title に含む automated tests を追加する。
- [ ] 12.48 `[AGENT-EXTENSION-BE-S007] UninstallExtension disables capabilities and preserves history` を title に含む automated tests を追加する。
- [ ] 12.49 `[AGENT-EXTENSION-BE-S008] Generic Extension Provider works without Discord-specific code` を title に含む automated tests を追加する。
- [ ] 12.50 `[AGENT-SECURITY-BE-S001] Valid Client Service JWT authenticates Agent RPC` を title に含む automated tests を追加する。
- [ ] 12.51 `[AGENT-SECURITY-BE-S002] Invalid Client JWT is rejected before mutation` を title に含む automated tests を追加する。
- [ ] 12.52 `[AGENT-SECURITY-BE-S003] Valid Extension signature accepts ingress within grant` を title に含む automated tests を追加する。
- [ ] 12.53 `[AGENT-SECURITY-BE-S004] Body tampering and nonce replay are rejected` を title に含む automated tests を追加する。
- [ ] 12.54 `[AGENT-SECURITY-BE-S005] Method outside Extension grant is denied by AIAgent` を title に含む automated tests を追加する。
- [ ] 12.55 `[AGENT-SECURITY-BE-S006] Idempotency replay preserves exactly-once command result` を title に含む automated tests を追加する。
- [ ] 12.56 `[AGENT-SECURITY-BE-S007] Domain errors map to stable Connect codes` を title に含む automated tests を追加する。
- [ ] 12.57 `[AGENT-SECURITY-BE-S008] Observability context excludes secret material` を title に含む automated tests を追加する。
- [ ] 12.58 `[CLIENT-REGISTRY-BE-S001] Managed Agent registry persists display and ordering metadata` を title に含む automated tests を追加する。
- [ ] 12.59 `[CLIENT-REGISTRY-BE-S002] Credential reference stores no plaintext secret` を title に含む automated tests を追加する。
- [ ] 12.60 `[CLIENT-REGISTRY-BE-S003] Server Action calls Agent RPC with generated Connect client` を title に含む automated tests を追加する。
- [ ] 12.61 `[CLIENT-REGISTRY-BE-S004] Client reads Agent domain details from Agent RPC instead of D1 snapshots` を title に含む automated tests を追加する。
- [ ] 12.62 `[CLIENT-REGISTRY-BE-S005] Client has no public Agent proxy route` を title に含む automated tests を追加する。
- [ ] 12.63 `[CLIENT-MANAGEMENT-FE-S001] Agent list supports registry display and ordering` を title に含む automated tests を追加する。
- [ ] 12.64 `[CLIENT-MANAGEMENT-FE-S002] Add Agent form validates connection metadata accessibly` を title に含む automated tests を追加する。
- [ ] 12.65 `[CLIENT-MANAGEMENT-FE-S003] Agent overview renders server-side profile and config` を title に含む automated tests を追加する。
- [ ] 12.66 `[CLIENT-MANAGEMENT-FE-S004] Settings screen updates config and rotates credential through Agent RPC` を title に含む automated tests を追加する。
- [ ] 12.67 `[CLIENT-MANAGEMENT-FE-S005] Thread Event Run and Compaction tabs show Agent-owned history` を title に含む automated tests を追加する。
- [ ] 12.68 `[CLIENT-MANAGEMENT-FE-S006] Schedule tab creates and cancels schedules` を title に含む automated tests を追加する。
- [ ] 12.69 `[CLIENT-MANAGEMENT-FE-S007] Tool approval screen requires explicit action` を title に含む automated tests を追加する。
- [ ] 12.70 `[CLIENT-MANAGEMENT-FE-S008] Extension screen installs lists and uninstalls generic Extension` を title に含む automated tests を追加する。
- [ ] 12.71 `[CLIENT-MANAGEMENT-FE-S009] Browser does not receive Agent credentials or call Agent RPC directly` を title に含む automated tests を追加する。
- [ ] 12.72 `[AGENT-TOOL-BE-S008] Tool cancellation propagates to Provider operation` を title に含む automated tests を追加する。
- [ ] 12.73 `[AGENT-SECURITY-BE-S009] Durable Object RPC stays behind the Connect facade` を title に含む automated tests を追加する。
- [ ] 12.74 `[AGENT-HEALTH-BE-S001] Check returns safe serving status through Protobuf RPC` を title に含む automated tests を追加する。
- [ ] 12.75 `[AGENT-HEALTH-BE-S002] REST health endpoint is not an Agent public API` を title に含む automated tests を追加する。
- [ ] 12.76 `[AGENT-EVENTING-BE-S009] ListThreads GetThread and ListSections stay Agent scoped` を title に含む automated tests を追加する。
- [ ] 12.77 `[AGENT-MEMORY-BE-S008] Thread memory and history queries return scoped references` を title に含む automated tests を追加する。
- [ ] 12.78 `[AGENT-RUNTIME-BE-S009] GetRun and ListRuns expose immutable snapshots` を title に含む automated tests を追加する。
- [ ] 12.79 `[AGENT-RUNTIME-BE-S010] CancelRun interrupts pending or running work idempotently` を title に含む automated tests を追加する。
- [ ] 12.80 `[AGENT-LIFECYCLE-BE-S007] GetState and GetConfig return Agent-local snapshots` を title に含む automated tests を追加する。

## 13. Documentation / OpenSpec Sync / Release Verification

- [ ] 13.1 `AGENTS.md` を更新し、Agent TypeSpec/proto 正本、`pnpm gen:agent:*`、generated guardrails、Agent/Client dev/test commands、Agent OpenAPI/REST API 非採用を反映する。
- [ ] 13.2 `CODING_STANDARDS.md` を更新し、`packages/agent` / `packages/client` boundaries、Protobuf generation drift、generated exclusions、Scenario ID coverage、Agent OpenAPI/Orval/Hono route 前提の削除を反映する。
- [ ] 13.3 `CONTRIBUTING.md` を更新し、Agent/Client setup、dependency review、generation、D1 migration、validation、test/build commands を反映する。
- [ ] 13.4 `.opencode/skills/coding-guardian/SKILL.md` と `.opencode/skills/coding-guardian/references/repo-entrypoints.md` を更新し、今後の agents が Agent Protobuf、Client、Provider interop、削除済み legacy entrypoints を正しく読むようにする。
- [ ] 13.5 Agent Service local dev、generation、deployment、Client D1 migration、Extension Provider integration profile、安全な secret handling の package README/runbooks を更新する。
- [ ] 13.6 `scripts/governance/verify-agent-surface.mjs` を更新し、Stage 1〜8 の forbidden Agent surface、public DO RPC route、REST `/health`、old OpenAPI/Orval/Hono regression、Client public Agent proxy route を検出する。完了条件は [AGENT-SECURITY-BE-S009]、[AGENT-HEALTH-BE-S002]、[CLIENT-REGISTRY-BE-S005] の guardrail 観点を script diagnostics で説明できること。
- [ ] 13.7 `scripts/governance/verify-agent-surface.test.mjs` を更新し、`[AGENT-SECURITY-BE-S009]`、`[AGENT-HEALTH-BE-S002]`、`[CLIENT-REGISTRY-BE-S005]` を title に含む fixture tests で forbidden surface と許可される Connect/Server Action 境界を検証する。
- [ ] 13.8 `pnpm gen:agent:proto`、`pnpm gen:agent:rpc`、`pnpm check:codegen` を実行し、generated drift がなくなるまで source files を修正する。
- [ ] 13.9 `pnpm format:check` を実行し、必要な整形は通常の format scripts で反映する。
- [ ] 13.10 `pnpm lint` を実行し、OpenSpec validation と scenario coverage を含め、各 non-manual Scenario ID が automated test titles に現れることを確認する。
- [ ] 13.11 `pnpm check` を実行し、TypeScript/TypeSpec compile errors を解消する。
- [ ] 13.12 `pnpm test:run`、focused Agent/Client package tests、Client management UI の Playwright E2E を実行する。
- [ ] 13.13 `pnpm build` を実行し、Agent Worker と Client Worker の build outputs を確認する。
- [ ] 13.14 staging smoke tests を実行し、AgentHealthService.Check、InitializeAgent、PublishEvent、ListThreads/GetThread/ListSections、GetLatestCompaction/GetThreadMemory/SearchThreadHistory、GetRun/ListRuns/CancelRun、GetState/GetConfig、Run scheduling、Compaction、storage threshold signals、Schedule、Tool Invoke/GetOperation/CancelOperation、Extension ingress/delivery、Client UI flows を確認する。
- [ ] 13.15 foundation で除去/非活性化された旧 Agent OpenAPI/Orval/Hono surfaces が再導入されていないことを検証する。完了条件は Agent `@typespec/openapi3` emitter/output、Orval Agent SDK、Hono zod-openapi Agent route、OpenAPI contract test が workspace scripts から到達不能であること。
- [ ] 13.16 implementation approval workflow 後に OpenSpec deltas を main specs へ sync/archive し、`openspec validate --all --strict` と scenario coverage を再実行する。
- [ ] 13.17 Agent RPC profile、Client management setup、Extension Provider interoperability、operational metrics、rollback steps、Stage 9 Discord Provider 対象外を含む release notes を準備する。
