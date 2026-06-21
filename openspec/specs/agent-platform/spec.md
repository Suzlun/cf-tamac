## Purpose

Agent platform は、Cloudflare Workers 上の Agent Service が generated Protobuf RPC だけを公開し、Agent ID ごとの `AIAgent` Durable Object aggregate と Agent-owned storage に runtime/state を閉じることを定義する。

## Requirements

### Requirement: Protobuf RPC-only Agent API

Agent API は、公開 Agent domain contract として generated Protobuf RPC のみを使用 MUST。

**Customer Context**

Agent Service の利用者は、REST、OpenAPI、JSON DTO、Orval client が混在する公開 API に依存すると、Agent runtime の正本契約と実装経路を誤認しやすい。運用者は Protobuf service/message を唯一の公開契約として扱い、Cloudflare Workers から利用しやすい fetch ベース transport で一貫した検証と生成を行いたい。

**Requirement**

Agent API contract は `packages/agent/src/typespec` を正本 SHALL とし、`cftamac.agent.v1` package の proto3 file を `packages/agent/proto/cftamac/agent/v1.proto` へ emit SHALL。

TypeSpec source tree は、errors、pagination、security metadata の common stubs、Agent、access credential、thread、section、event、run、compaction、history、memory、state、schedule、tool、integration、adapter の model stubs、および Agent lifecycle、event、thread、run、state、schedule、tool、integration、agent-adapter、health の service files を含む SHALL。

Foundation descriptors は、次の RPC Service Inventory を満たす SHALL。

| Service                     | RPC methods                                                                                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AgentLifecycleService`     | `InitializeAgent`, `GetAgent`, `DestroyAgent`, `RotateAgentCredential`                                                                                               |
| `AgentEventService`         | `PublishEvent`, `GetEvent`, `ListEvents`                                                                                                                             |
| `AgentThreadService`        | `ListThreads`, `GetThread`, `ListSections`, `GetLatestCompaction`, `GetThreadMemory`, `SearchThreadHistory`                                                          |
| `AgentRunService`           | `GetRun`, `ListRuns`, `CancelRun`                                                                                                                                    |
| `AgentStateService`         | `GetState`, `GetConfig`, `UpdateConfig`                                                                                                                              |
| `AgentScheduleService`      | `CreateSchedule`, `GetSchedule`, `ListSchedules`, `CancelSchedule`                                                                                                   |
| `AgentToolService`          | `ListTools`, `GetInvocation`, `ListInvocations`, `ApproveInvocation`, `RejectInvocation`                                                                             |
| `AgentIntegrationService`   | `InstallIntegration`, `UninstallIntegration`, `GetInstallation`, `ListInstallations`, `CreateAdapterConnection`, `DeleteAdapterConnection`, `ListAdapterConnections` |
| `IntegrationIngressService` | `PublishEvent`, `PublishToolResult`, `PublishDeliveryResult`                                                                                                         |
| `AgentHealthService`        | `Check`                                                                                                                                                              |

`IntegrationIngressService` は `packages/agent/src/typespec/src/services/agent-adapter.tsp` で定義 SHALL し、`PublishEvent`、`PublishToolResult`、`PublishDeliveryResult` を持つ SHALL。

`AgentIntegrationService` は Adapter Connection management の `CreateAdapterConnection`、`DeleteAdapterConnection`、`ListAdapterConnections` を所有 SHALL。

すべての Protobuf message field は、TypeSpec source 上の `@field(n)` または生成物で等価に検証できる明示 field number を持つ SHALL。削除済み field の number と name は再利用せず、TypeSpec source または generated proto で reserve SHALL。Codegen guard は、field number の再利用、明示 field number の欠落、同一 package 内の service 名重複、同一 service 内の method 名重複を検出して失敗 SHALL。

初期必須の public Agent Worker transport profile は Connect protocol unary RPC と binary Protobuf encoding SHALL とする。Unary binary request は、unary call の `Content-Type: application/proto` を含む Connect binary Protobuf profile を使用 SHALL。

Native gRPC compatibility は、初期必須 Agent Worker transport profile の外側にある optional compatibility profile SHALL として扱う。native gRPC compatibility を提供する場合は、同じ generated proto contract を再利用 SHALL し、別の REST、OpenAPI、JSON domain contract を導入 SHALL NOT。

Agent Service は REST resource routes、public OpenAPI Agent artifacts、Orval-generated Agent clients、ad-hoc JSON DTO APIs、public Durable Object fetch APIs、browser-direct Agent APIs を公開 MUST NOT。

Production Agent RPC は、Connect JSON encoding、HTTP GET unary invocation、unsupported content types を domain handling 前に拒否 MUST。

#### Scenario: TypeSpec emits proto3 as the Agent contract (AGENT-PLATFORM-S001)

- **GIVEN** Agent TypeSpec project が contract generation 用に compile される状態である
- **WHEN** generation command が完了する
- **THEN** `packages/agent/proto/cftamac/agent/v1.proto` に common types、すべての Agent foundation models、lifecycle/event/thread/run/state/schedule/tool/integration/agent-adapter/health service files 由来の proto3 service/message definitions が存在する
- **AND** RPC Service Inventory の全 service/method が generated descriptors に存在する
- **AND** public Agent OpenAPI artifact は Agent API contract として emit されない

#### Scenario: Protobuf field numbers and service methods are stable (AGENT-PLATFORM-S014)

- **GIVEN** Agent TypeSpec source と generated proto descriptors が利用できる
- **WHEN** field stability guard が messages、reserved fields、services、methods を列挙する
- **THEN** すべての Protobuf field は TypeSpec `@field(n)` または generated equivalent で明示 field number を持つ
- **AND** 削除済み field number と field name は reserve として宣言され、再利用されない
- **AND** field number の再利用、明示 field number の欠落、service 名重複、または同一 service 内の method 名重複を含む fixtures は失敗する

#### Scenario: Binary Connect requests are accepted and JSON requests are rejected (AGENT-PLATFORM-S002)

- **GIVEN** Agent Worker が production configuration で動作している
- **WHEN** unary Connect request が HTTP `POST`、`Content-Type: application/proto`、binary Protobuf request body を使う
- **THEN** request は generated RPC handler に到達する
- **WHEN** unary Connect request が `application/json`、`application/connect+json`、HTTP `GET`、または unsupported encoding profile を使う
- **THEN** Worker は domain handling 前に Connect code `unimplemented` を返す
- **WHEN** unary Connect request の binary content type が欠落または不正であるか、Protobuf bytes が壊れている
- **THEN** Worker は domain handling 前に Connect code `invalid_argument` を返す

#### Scenario: REST and Orval Agent surfaces are unreachable (AGENT-PLATFORM-S003)

- **GIVEN** Agent Worker build artifact が利用できる
- **WHEN** public route table と package exports を検査する
- **THEN** REST resource paths、OpenAPI Agent output paths、Orval Agent client exports は Agent API surface から存在しない

### Requirement: Agent-scoped RPC schema invariants

公開 Agent RPC schema は、すべての public request を Agent scope に固定し、command request と Event publish request の再実行安全性と Thread 所属を検証可能にする MUST。

**Customer Context**

Agent Service の利用者と運用者は、request body だけで対象 Agent、command の冪等性、Event の Thread 所属を監査・署名・再実行できる必要がある。Agent 横断の一覧・検索 RPC や metadata-only Agent scope が混入すると、Client の管理台帳、Agent aggregate、Integration 署名境界が崩れる。

**Requirement**

すべての public Agent RPC request message は、request body field として `agent_id` を含む SHALL。`agent_id` は transport metadata のみで表現 MUST NOT。

すべての command-style public Agent RPC request message は、request body field として `idempotency_key` を含む SHALL。Command-style requests には、Agent lifecycle changes、event publishing、schedule creation/cancellation、configuration updates、integration installation changes、adapter connection changes、tool approval/rejection、Integration ingress callbacks、その他 Agent-owned state を変更する操作を含める。

Public Event publish request messages は、`AgentEventService.PublishEvent` と `IntegrationIngressService.PublishEvent` を含め、空文字ではなく Unicode NFC 正規化後に最大 512 UTF-8 bytes の `thread_key` を要求 SHALL。外部 Thread context を持たない Agent lifecycle audit events は、Agent-local reserved system Thread へ内部的に割り当て SHALL し、Thread ownership のない public Event publish request を作成 SHALL NOT。

`thread_key` は Agent-local opaque string SHALL。Thread lookup と storage では、受信した `thread_key` を Unicode NFC に正規化した値を比較キーとして使用 SHALL。正規化後の `thread_key` は空文字であって MUST NOT、UTF-8 encoding で 512 bytes を超えて MUST NOT。比較は NFC 正規化後も case-sensitive SHALL。同一 `agent_id` と同一 normalized `thread_key` は同一 Thread に解決 SHALL。異なる `agent_id` は同一 normalized `thread_key` でも別 Thread に解決 SHALL。Integration、Adapter、Connection、principal などの識別子を `thread_key` へ暗黙 prefix 付与 MUST NOT。異なる Integration または Adapter が意図的に同じ normalized `thread_key` を指定した場合、その Event は同じ Agent 内の同じ Thread に統合 SHALL。

Generated proto と Protobuf-ES service descriptors は、RPC Service Inventory の service/method presence、`agent_id`、command `idempotency_key`、Event publish `thread_key` の未指定/空文字/512 UTF-8 bytes 超過 rejection、forbidden Agent-cross RPC methods を automated checks で検査 SHALL。

Agent Service は public Agent-cross list/search RPCs を定義 MUST NOT。`ListAllAgents`、`SearchAgents`、`ListAllToolInvocations`、`ListAllIntegrationInstallations` などの methods は存在 MUST NOT。Agent service groups 内に存在する list/search RPCs は、`agent_id` で scope されたまま SHALL。

#### Scenario: Public RPC descriptors are agent-scoped and exclude cross-Agent list/search (AGENT-PLATFORM-S010)

- **GIVEN** `cftamac.agent.v1` の generated proto と Protobuf-ES service descriptors が利用できる
- **WHEN** descriptor invariant check が public request messages、service methods、RPC Service Inventory を列挙する
- **THEN** すべての public request message は `agent_id` field を含む
- **AND** RPC Service Inventory の required service/method はすべて存在する
- **AND** `ListAllAgents`、`SearchAgents`、`ListAllToolInvocations`、`ListAllIntegrationInstallations` などの Agent-cross list/search names を公開する service method は存在しない

#### Scenario: Command and Event publish descriptors require replay and Thread keys (AGENT-PLATFORM-S011)

- **GIVEN** `cftamac.agent.v1` の generated proto と Protobuf-ES service descriptors が利用できる
- **WHEN** descriptor invariant check が command request messages と Event publish request messages を分類する
- **THEN** すべての command request message は `idempotency_key` field を含む
- **AND** `AgentEventService.PublishEvent` と `IntegrationIngressService.PublishEvent` は validation で空文字ではなく Unicode NFC 正規化後に最大 512 UTF-8 bytes になる `thread_key` field を含む
- **AND** command `idempotency_key` または Event publish `thread_key` が未指定、空文字、または 512 UTF-8 bytes を超える validation fixtures は失敗する

#### Scenario: Thread key identity is normalized and Agent-scoped (AGENT-PLATFORM-S013)

- **GIVEN** `AgentEventService.PublishEvent` または `IntegrationIngressService.PublishEvent` が同じ `agent_id` と Unicode NFC 正規化後に同じ 512 UTF-8 bytes 以下の `thread_key` を二回受け取る
- **WHEN** AIAgent Durable Object が Thread を解決する
- **THEN** 二つの Event は同じ internal `thread_id` を持つ同一 Thread に所属する
- **AND** `thread_key` 比較は NFC 正規化後も case-sensitive であり、大小文字だけが異なる値は別 Thread として扱われる
- **AND** Integration、Adapter、Connection、principal 由来の暗黙 prefix は付与されず、異なる ingress source が同じ normalized `thread_key` を指定した場合は同じ Thread に統合される
- **AND** 異なる `agent_id` が同じ normalized `thread_key` を指定しても Thread は共有されず、別 `AIAgent` 内の別 Thread として解決される

### Requirement: Agent Worker aggregate runtime boundary

Agent Worker は Agent aggregate runtime、storage、bindings を Client runtime ownership から分離 MUST。

**Customer Context**

Agent Service の運用者は、Agent ID ごとに独立した状態と実行境界を持つ自律 Agent を管理したい。Client 用の管理台帳や共有 database に Agent の正本データが混ざると、権限、監査、再実行、storage limit の責任分界が曖昧になる。

**Requirement**

`packages/agent` は、Cloudflare Agents SDK `AIAgent` Durable Object class を host する independently deployable Cloudflare Worker SHALL。

各 `agent_id` は、Agent Worker 内でちょうど一つの `AIAgent` Durable Object instance name に解決 SHALL。

Agent Worker configuration は、`AIAgent` class 用の `AI_AGENT` Durable Object binding を定義 SHALL。

`AIAgent` Durable Object は、Agent-domain SQLite storage foundations、Agent-local queue wake foundations、replay/idempotency foundations、audit foundations を所有 SHALL。

`AIAgent` DO SQLite foundation は、queue wake processing より先に `agent_threads`、`agent_thread_sections`、`agent_events`、`agent_runs`、`agent_run_inputs`、scheduler wake/coalescing state の最小 storage contracts を定義 SHALL。これらの foundation records は、accepted Events と pending Runs を永続化するために必要な identity、status、sequence、input snapshot reference、wake coalescing metadata だけを保持 SHALL し、model invocation、context building、compaction、Tool execution など full Stage 2 harness behavior は実装 SHALL NOT。

Agent-local Queue は、各 `AIAgent` instance と一緒に保存される Cloudflare Agents SDK Agent-local Queue SHALL であり、scheduler wake-up/coalescing mechanism としてのみ使用 SHALL。

Agent-local Queue は、AgentEvent、Mailbox、pending AgentRun state の source of truth になって MUST NOT。Accepted Events と pending Run state は、queue wake が成功したと見なされる前に `AIAgent` DO SQLite へ永続化 SHALL。

Agent-local Queue wake foundation は、wake が pending または running の間に Event acceptance が繰り返されても、同じ `AIAgent` に対して unbounded wake items を enqueue しないよう scheduler wakes を coalesce SHALL。

Agent runtime source layout は、domain、harness、threads、events、runs、compactions、schedules、tools、integrations、adapters、storage、observability responsibilities を分けた foundation modules を提供 SHALL。

Agent Worker は、`CLIENT_DB` または Agent-cross D1 bindings を含む D1 binding を定義 MUST NOT。また、`packages/client` runtime source に依存 MUST NOT。

Agent Worker は、初期 Agent mailbox foundation の一部として Cloudflare Queues product producer または consumer bindings を定義 MUST NOT。

#### Scenario: Agent ID resolves to a single AIAgent instance (AGENT-PLATFORM-S004)

- **GIVEN** 二つの RPC requests が同じ `agent_id` を含む
- **WHEN** Worker が各 request の Durable Object stub を解決する
- **THEN** 両方の request は同じ `AIAgent` Durable Object name を対象にする
- **AND** 異なる `agent_id` は異なる Durable Object name を対象にする

#### Scenario: Agent Worker bindings exclude Client D1 and Cloudflare Queues (AGENT-PLATFORM-S005)

- **GIVEN** Agent Worker configuration を検査できる
- **WHEN** bindings を列挙する
- **THEN** configuration は `AIAgent` class 用の `AI_AGENT` Durable Object binding と Agent-owned blob storage bindings を含む
- **AND** `CLIENT_DB` または Agent-cross D1 bindings を含む D1 binding を含まない
- **AND** Cloudflare Queues producer bindings または Cloudflare Queues consumer bindings を含まない

#### Scenario: Agent-local Queue coalesces scheduler wakes without owning events (AGENT-PLATFORM-S012)

- **GIVEN** 複数の Event acceptance commands が、scheduler wake pending または running の同じ `AIAgent` を対象にする
- **WHEN** Agent-local Queue wake foundation が scheduler wake intent を記録する
- **THEN** foundation はその `AIAgent` coalescing window に対して at most one pending/running scheduler wake を記録する
- **AND** すべての accepted Event は、wake callback が pending Runs を処理する前に `agent_threads` と `agent_thread_sections` の所有関係を持って `agent_events` へ永続化される
- **AND** pending Run state と input snapshot metadata は scheduler wake processing 前に `agent_runs` と `agent_run_inputs` へ永続化される
- **AND** scheduler wake/coalescing state は Agent-local Queue item とは別に永続化される
- **AND** Cloudflare Queues product producer または consumer API は呼び出されない
- **AND** queue wake が利用不能または失敗しても、authoritative Event source にならず accepted Events を削除しない

### Requirement: Demonstration-domain-free Agent platform

Agent platform は `hello` と `users` demonstration domains、および demonstration package graph を active Agent contract と runtime graph の外に保つ MUST。

**Customer Context**

開発者は foundation 上に Agent 概念を積み上げる際、`hello` や `users` の実演用 domain を誤って本番の責務や contract の手本として再利用したくない。利用者から見ても、Agent Service の公開 surface には Agent 以外の domain が見えない必要がある。

**Requirement**

Agent platform runtime、contract sources、package exports、tests は `hello` と `users` domain modules、routes、schemas、TypeSpec models、TypeSpec routes、Drizzle tables、generated client wrappers を含まない SHALL。

Active workspace は Agent contract source と runtime を `packages/agent/**` に集約 SHALL し、demonstration contract/runtime packages を Agent implementation source、workspace package patterns、documented development commands、lint boundary elements として残して MUST NOT。

Agent Worker public responses は `hello` または `users` resource behavior を公開 MUST NOT。

Agent platform checks は、`hello` または `users` domain files が Agent package entrypoints から到達可能な場合に失敗 SHALL。

#### Scenario: Demo resource paths are not served by the Agent Worker (AGENT-PLATFORM-S006)

- **GIVEN** Agent Worker が動作している
- **WHEN** caller が `/api/v1/hello`、`/api/v1/users`、`/api/v1/users/{id}` を request する
- **THEN** Worker はそれらの paths に対して domain handler を実行しない
- **AND** response は unsupported-route または Connect-compatible error response になる

#### Scenario: Demo package graph is not reachable from Agent entrypoints (AGENT-PLATFORM-S007)

- **GIVEN** `packages/agent` の package graph を検査できる
- **WHEN** source files、TypeSpec files、test fixtures、package exports を scan する
- **THEN** reachable Agent entrypoint は `hello` または `users` domain files を import/export しない
- **AND** Agent entrypoint は demonstration contract/runtime packages を import/export しない

### Requirement: Minimal Connect Worker foundation

Agent platform は、implemented foundation handlers の外側で fail closed する compileable Connect Worker foundation を提供 MUST。

**Customer Context**

後続の Agent capabilities を実装するチームは、最初から production transport、generated descriptors、Worker adapter、Durable Object RPC 境界、error mapping が揃った土台の上で作業したい。基礎段階で任意の JSON endpoint や public Durable Object fetch を足すと、以後の実装が境界外の経路へ分岐してしまう。

**Requirement**

Agent platform は generated Protobuf descriptors、Connect Worker adapter、RPC router、binary content enforcement、request validation hook、authentication hook、authorization hook、replay-protection hook、audit hook、rate-limit hook、Durable Object RPC dispatcher を compileable foundation modules として提供 SHALL。

Generated Connect router は、generated descriptors から `AgentLifecycleService`、`AgentEventService`、`AgentThreadService`、`AgentRunService`、`AgentStateService`、`AgentScheduleService`、`AgentToolService`、`AgentIntegrationService`、`IntegrationIngressService`、`AgentHealthService` を登録 SHALL。

Agent platform は `AgentHealthService.Check` を foundation health RPC として Connect binary Protobuf で公開 SHALL。

Agent-scoped RPC authentication と authorization hooks は、verified principal、scope、grant、または explicit test seam がない場合に default で fail closed SHALL。Authentication failures は Connect code `unauthenticated` に、authorization failures は `permission_denied` に map SHALL。

Foundation RPC modules は、generated method に domain handler がない場合 Connect error codes で fail closed MUST。Unimplemented generated methods は ad-hoc JSON handling や public Durable Object fetch fallback なしで Connect code `unimplemented` を返す SHALL。

Foundation modules は Durable Object RPC methods を Worker-to-Durable-Object calls の内部に保つ MUST し、Durable Object methods を public fetch routes として公開 MUST NOT。

#### Scenario: Health RPC reaches the Connect Worker facade (AGENT-PLATFORM-S008)

- **GIVEN** generated `AgentHealthService.Check` descriptor が Worker router に登録されている
- **WHEN** required Agent scope と authentication metadata を持つ binary Connect health request を送信する
- **THEN** Worker は Connect facade 経由で Protobuf health response を返す
- **AND** response path は REST health route を使用しない

#### Scenario: Foundation handlers fail closed for unmapped methods (AGENT-PLATFORM-S009)

- **GIVEN** generated lifecycle/event/thread/run/state/schedule/tool/integration/`IntegrationIngressService` service methods が domain handlers なしで登録されている
- **WHEN** caller がそれらの methods の一つを binary Connect で呼び出す
- **THEN** Worker は ad-hoc JSON handling または public Durable Object fetch handling を呼び出さず Connect code `unimplemented` を返す
