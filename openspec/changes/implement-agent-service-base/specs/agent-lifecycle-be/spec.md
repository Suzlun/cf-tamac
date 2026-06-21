## ADDED Requirements

### Requirement: Agent ID と Durable Object identity

Agent Service SHALL bind each Agent ID to a single AIAgent Durable Object identity.

**Customer Context**

Agent 管理者は、同じ Agent ID への操作が常に同じ自律主体へ届き、別 Agent の状態や履歴と混線しないことを必要としている。Agent が Thread、Event、Run、Memory、Schedule、Tool、Extension を長期的に所有するため、identity の揺れは復旧不能な文脈破壊につながる。

**Requirement**

- Agent Service MUST treat one `agent_id` as exactly one AIAgent Durable Object instance and one Agent aggregate root.
- Agent Service MUST route every public RPC request by the `agent_id` contained in the request message, not only by metadata.
- AIAgent Durable Object MUST persist Agent profile, lifecycle status, config version, credential generation, audit pointer, and reserved system Thread identity inside the Agent-owned store.
- Agent Service MUST NOT expose Agent-crossing lifecycle RPCs such as list-all or search-all Agents.

#### Scenario: InitializeAgent creates the named Agent aggregate (AGENT-LIFECYCLE-BE-S001)

- **GIVEN** a valid Client Service principal has lifecycle scope for `agent_id = agent-alpha`
- **WHEN** it calls `InitializeAgent` with required profile, config, and idempotency key
- **THEN** the request is routed to the AIAgent Durable Object named `agent-alpha`
- **AND** an Agent profile, active lifecycle status, initial config version, credential generation, reserved system Thread, and lifecycle audit Event are persisted for that Agent only

#### Scenario: GetAgent returns the Agent-local profile and config (AGENT-LIFECYCLE-BE-S002)

- **GIVEN** `agent-alpha` is initialized
- **WHEN** an authorized Client Service principal calls `GetAgent` for `agent-alpha`
- **THEN** the response contains the Agent profile, lifecycle status, config version, credential generation, and capability summary owned by `agent-alpha`
- **AND** no Thread, Memory, Schedule, ToolInvocation, or Extension state from another Agent is present

### Requirement: Agent lifecycle state transitions

AIAgent Durable Object SHALL enforce auditable lifecycle transitions for each Agent.

**Customer Context**

Agent 管理者は、作成、停止、破棄、credential rotation のような管理操作が監査可能で、実行中の Event/Run/Tool/Extension と矛盾しない lifecycle boundary を必要としている。

**Requirement**

- AIAgent Durable Object MUST enforce lifecycle state transitions for initialize, active operation, disabled operation, and destroyed operation.
- Destroyed Agents MUST reject mutating public RPCs except explicitly allowed audit/query operations.
- Lifecycle commands MUST be idempotent by `agent_id + principal_id + idempotency_key` and MUST reject the same key with a different request body digest.
- Lifecycle commands MUST append audit Events to the reserved system Thread.

#### Scenario: DestroyAgent disables mutating Agent operations (AGENT-LIFECYCLE-BE-S003)

- **GIVEN** `agent-alpha` is active and has Threads, Schedules, ToolInvocations, and Extension Installations
- **WHEN** an authorized principal calls `DestroyAgent` with a valid idempotency key
- **THEN** the Agent lifecycle status becomes destroyed
- **AND** future Event publish, Schedule creation, Tool approval, and Extension install commands for `agent-alpha` fail with a lifecycle precondition error
- **AND** existing audit/history records remain queryable according to authorization policy

#### Scenario: Duplicate lifecycle command replays the recorded response (AGENT-LIFECYCLE-BE-S004)

- **GIVEN** `InitializeAgent` or `DestroyAgent` already succeeded for `agent-alpha` with idempotency key `idem-1`
- **WHEN** the same principal repeats the same command with the same body digest and `idem-1`
- **THEN** Agent Service returns the recorded successful response without creating duplicate profile, audit, Thread, or lifecycle records
- **AND** a repeated command with `idem-1` and a different body digest is rejected as an idempotency conflict

### Requirement: Credential and configuration management

Agent Service SHALL manage credentials and configuration with versioned, Agent-local authorization.

**Customer Context**

Client Service や管理者は、Agent への接続資格情報と Agent 設定を安全に更新し、rotation 中も一貫した authorization と監査を維持したい。credential が失効している Agent への操作は、誤動作や不正アクセスを避けるために拒否される必要がある。

**Requirement**

- Agent Service MUST support credential rotation with explicit key identifier, active/overlap/revoked status, generation number, and audit Event.
- Agent Service MUST store only verifier material, public fingerprint, or secret references required for verification; private keys and raw shared secrets MUST NOT be stored in plaintext Agent records.
- Agent configuration updates MUST increment a config version and the version MUST be captured in AgentRun snapshots.
- Final authorization inside AIAgent Durable Object MUST verify lifecycle status, credential status, principal type, scopes/grants, and requested operation before mutating state.

#### Scenario: RotateAgentCredential creates a new active generation (AGENT-LIFECYCLE-BE-S005)

- **GIVEN** `agent-alpha` has credential generation `1`
- **WHEN** an authorized principal calls `RotateAgentCredential` with generation `2` metadata and overlap policy
- **THEN** generation `2` becomes active or overlapping according to policy
- **AND** generation `1` is retained only for the configured overlap window
- **AND** credential rotation is recorded in the system Thread audit Event without storing plaintext private key material

#### Scenario: UpdateConfig changes the version captured by later Runs (AGENT-LIFECYCLE-BE-S006)

- **GIVEN** `agent-alpha` has config version `3`
- **WHEN** an authorized principal updates model, budget, memory, tool, or scheduling configuration
- **THEN** the Agent config version increments to `4`
- **AND** later AgentRun snapshots reference config version `4`
- **AND** already running AgentRun snapshots retain the config version captured at their start

### Requirement: Agent state and configuration queries

Agent Service は Agent-local state と configuration を安全な snapshot として公開 MUST。

**Customer Context**

管理 UI と運用者は、Agent の現在状態、lifecycle、config version、budget、model、memory、tool、schedule 設定を確認したい。query が secret や別 Agent state を返すと、運用判断と権限境界が崩れる。

**Requirement**

- `AgentStateService.GetState` は対象 Agent の lifecycle status、current active Run summary、scheduler/wake summary、storage threshold state、capability summary、safe operational metadata を返す MUST。
- `AgentStateService.GetConfig` は対象 Agent の current config version、model/budget/memory/tool/schedule policy、updated actor/timestamp metadata を返す MUST。
- GetState と GetConfig は Agent-local final authorization を通り、private key、raw credential、Provider secret、Thread payload body、unredacted signature material を返す MUST NOT。
- GetState と GetConfig は running Run の snapshot config を変更 MUST NOT し、query result は mutation を発生させない MUST。

#### Scenario: GetState and GetConfig return Agent-local snapshots (AGENT-LIFECYCLE-BE-S007)

- **GIVEN** `agent-alpha` is initialized with config version `4` and another Agent has different state
- **WHEN** an authorized Client Service principal calls `GetState` and `GetConfig` for `agent-alpha`
- **THEN** responses include only `agent-alpha` state summary, current config version, safe policy metadata, and operational status
- **AND** no secret material, Thread payload body, or other Agent state is returned
