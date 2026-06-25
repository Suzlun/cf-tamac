## ADDED Requirements

### Requirement: Agent-owned model policy repository

AIAgent Durable Object は Agent-owned model policy repository を所有 SHALL。

**Customer Context**

Agent 管理者と運用者は、どの provider/model/generation parameters に基づいて Agent が判断したかを後から説明できる必要がある。model ID や credential を Event や config に直接入れると、secret 漏えい、監査不能、権限境界の曖昧化が起きる。

**Requirement**

Agent Service は、model policy を各 AIAgent Durable Object が所有する Agent-scoped repository として保持 SHALL。Model policy は Agent-local な `model_policy_ref`、version、status、provider、model、generation parameters、安全な budget/safety metadata、credential reference、digest、作成/更新 principal、作成/更新時刻を含む MUST。

Model policy status は少なくとも `active`、`disabled`、`archived` を区別 MUST。`active` 以外の policy は後続 Run の selection に使用されて MUST NOT。ただし、過去の Run snapshot と audit は safe metadata と digest により当時の policy identity を参照できる MUST。

Model policy repository は provider credential、secret value、生 token、生 prompt、生 completion、raw reasoning を保存して MUST NOT。`credentialRef` は secret material ではなく secret-safe reference としてのみ扱う MUST。

Policy digest は provider、model、generation parameters、安全な metadata、version、status に基づく deterministic digest として計算 SHALL。Unsupported provider、unsupported model、不正 parameter、参照不能 credential reference、または digest 不整合は状態変更前に fail closed MUST。

#### Scenario: Model policy upsert が safe metadata と digest を保存する (AGENT-MODEL-POLICY-S001)

- **GIVEN** 認可済み Client Service principal が `agent-alpha` に `workers-ai-default` policy を登録できる
- **WHEN** provider、model、generation parameters、credential reference、安全な budget metadata を指定して model policy を upsert する
- **THEN** AIAgent Durable Object は policy ref、version、status、provider、model、safe metadata、digest、更新 principal、更新時刻を Agent-owned repository に保存する
- **AND** provider credential、生 token、secret value は storage、response、audit、log に含まれない

#### Scenario: Unsupported provider または model は状態変更前に拒否される (AGENT-MODEL-POLICY-S002)

- **GIVEN** `agent-alpha` が `workers-ai` provider だけを許可している
- **WHEN** principal が unsupported provider または許可外 model を持つ policy を登録する
- **THEN** Agent Service は分類済み `failed_precondition` または `invalid_argument` として拒否する
- **AND** model policy repository、Agent config、audit の成功記録は変更されない

#### Scenario: Disabled または archived policy は Run selection に使われない (AGENT-MODEL-POLICY-S003)

- **GIVEN** `agent-alpha` の default model policy ref が `policy-a` を指している
- **WHEN** `policy-a` の status が `disabled` または `archived` である状態で Run が開始される
- **THEN** Run は model call を実行せず model policy precondition failure として分類される
- **AND** Run snapshot と audit は secret を含まない safe error metadata を記録する

### Requirement: Agent model policy RPC contract

Agent API は model policy management を Protobuf RPC-only service として公開 SHALL。

**Customer Context**

Client server と運用ツールは Agent-owned model policy を明示的に作成、検証、照会、無効化する必要がある。公開 REST、OpenAPI、Browser direct RPC を追加すると Agent API の正本契約が分裂し、credential 境界が崩れる。

**Requirement**

Agent public API は generated Protobuf RPC service として `AgentModelPolicyService` を公開 SHALL。Service は `UpsertModelPolicy`、`GetModelPolicy`、`ListModelPolicies`、`ArchiveModelPolicy`、`ValidateModelPolicy` を持つ SHALL。

すべての request は body field として `agent_id` を含む MUST。`UpsertModelPolicy` と `ArchiveModelPolicy` は command-style request として `idempotency_key` を含む MUST。Response は policy ref、version、status、provider、model、digest、安全な metadata、検証結果、更新 metadata を返せる MUST が、secret material を返して MUST NOT。

Policy list RPC は `agent_id` scope 内に限定 MUST し、Agent 横断 policy search/list を公開して MUST NOT。Policy validation は repository へ保存せずに provider/model/parameter/credential reference の妥当性と安全な警告だけを返せる MUST。

#### Scenario: AgentModelPolicyService が Agent-scoped policy 管理を公開する (AGENT-MODEL-POLICY-S004)

- **GIVEN** generated Protobuf descriptors と Agent RPC router が利用できる
- **WHEN** descriptor inventory と request schema を検査する
- **THEN** `AgentModelPolicyService` と `UpsertModelPolicy`、`GetModelPolicy`、`ListModelPolicies`、`ArchiveModelPolicy`、`ValidateModelPolicy` が存在する
- **AND** public request は `agent_id` を含み、mutating request は `idempotency_key` を含む
- **AND** response schema は provider credential、secret value、生 prompt、生 completion を含まない

### Requirement: Default and event-scoped model policy selection

Run model selection は Event override、Agent default、fail-closed の順序で解決 MUST。

**Customer Context**

Agent 管理者は Agent ごとの default model policy を設定し、必要な Event だけ別 policy を要求したい。一方で、Event から raw model ID や credential を指定できると、予算、認可、監査、安全境界を迂回できてしまう。

**Requirement**

`AgentConfig.modelPolicyRef` は Agent-owned model policy ref だけを指す SHALL。Agent config は raw provider credential、raw provider token、raw model credential を保持して MUST NOT。Run-time selection priority は次の順序で固定 SHALL。

1. Event-scoped `modelPolicyRef` が存在し、認可済みで有効な場合
2. `AgentConfig.modelPolicyRef` が有効な場合
3. 暗黙 fallback なしで fail closed

InitializeAgent は Agent 作成時に default model policy seed と `initialConfig.modelPolicyRef` を同じ Agent-owned policy repository へ保存できる MUST。System/bootstrap default は seed source としてだけ使える SHALL し、Run execution 時の隠れ fallback として使用されて MUST NOT。

Event-scoped override は raw provider/model ID ではなく Agent-owned model policy ref だけを指定 MUST。Client 由来 Event は principal scope/grant、Integration 由来 Event は Installation/Adapter/Connection に許可された policy ref set により認可される MUST。

#### Scenario: InitializeAgent が default model policy と config ref を同時に固定する (AGENT-MODEL-POLICY-S005)

- **GIVEN** Client Service principal が `agent-alpha` の initialize と model policy upsert scope を持つ
- **WHEN** initial model policy body と `initialConfig.modelPolicyRef = workers-ai-default` を含めて `InitializeAgent` を呼ぶ
- **THEN** AIAgent Durable Object は default policy を Agent-owned repository に保存する
- **AND** Agent config は policy body ではなく `workers-ai-default` ref、policy digest、安全な metadata、config version を保持する
- **AND** response と audit は secret material を含まない

#### Scenario: Event override は登録済みかつ認可済み policy ref だけを選択する (AGENT-MODEL-POLICY-S006)

- **GIVEN** `agent-alpha` が `workers-ai-default` と `workers-ai-fast` policy を持ち、principal が `workers-ai-fast` override scope を持っている
- **WHEN** Event publish request が `modelPolicyRef = workers-ai-fast` を指定する
- **THEN** Event は requested policy ref と safe metadata を保存し、Run start 時に resolved policy ref/digest を snapshot に固定する
- **WHEN** Event publish request が未登録、無効、または権限外 policy ref を指定する
- **THEN** Agent Service は Event acceptance を拒否し、Event、pending Run、Queue wake を作成しない
