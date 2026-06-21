## ADDED Requirements

### Requirement: Agent-local Run scheduler

AIAgent Durable Object SHALL schedule AgentRun work through coalesced Agent-local Queue wakes.

**Customer Context**

Agent は Event を受け取ったあと、外部 queue consumer を必要とせず自分自身の SQLite-backed runtime 上で順次処理したい。Event 受理は高速に返しつつ、Run は Agent ごとの一貫した順序と公平性で進む必要がある。

**Requirement**

- AIAgent Durable Object MUST create or coalesce pending AgentRun work when an Event is accepted.
- Agent-local Queue MUST enqueue coalesced scheduler wake callbacks instead of one queue item per Event.
- AIAgent Durable Object MUST allow at most one active AgentRun per Agent at a time.
- Scheduler selection MUST use priority descending, `last_served_at` ascending, and `pending_since` ascending as the minimum fairness rule.

#### Scenario: Event acceptance coalesces scheduler wake (AGENT-RUNTIME-BE-S001)

- **GIVEN** multiple Events are accepted for one or more Threads while a scheduler wake is already pending
- **WHEN** AIAgent Durable Object records those Events
- **THEN** it creates or updates pending Run records for affected Threads
- **AND** it does not enqueue duplicate wake callbacks beyond the coalesced scheduler wake

#### Scenario: Only one AgentRun is active per Agent (AGENT-RUNTIME-BE-S002)

- **GIVEN** Thread A has a running AgentRun and Thread B has pending Events
- **WHEN** the scheduler wake executes
- **THEN** Thread B remains pending until Thread A reaches a terminal or waiting state that releases the active Run slot
- **AND** no second active Run executes concurrently in the same AIAgent Durable Object

#### Scenario: Scheduler selects pending Thread fairly (AGENT-RUNTIME-BE-S003)

- **GIVEN** several Threads have pending Runs with different priority, `last_served_at`, and `pending_since`
- **WHEN** no AgentRun is active
- **THEN** the scheduler selects the highest priority pending Run
- **AND** ties are resolved by older `last_served_at` and then older `pending_since`

### Requirement: Immutable Run input snapshot

AgentRun SHALL execute from an immutable input snapshot.

**Customer Context**

Agent の判断は、どの Event、Memory、Config、Tool set を見て行われたか説明可能でなければならない。実行中に新しい Event が到着しても、その Run の入力が途中で変わると監査や再実行が不可能になる。

**Requirement**

- AgentRun MUST freeze an input snapshot at start.
- The snapshot MUST include trigger Event range, ThreadMemory version, latest ready Compaction ID, uncompacted Event upper sequence, Agent config version, available Tool set version, and Extension Installation version.
- New Events arriving during a Run MUST be appended durably but MUST NOT mutate the running snapshot.
- Run result commit MUST verify cancellation, generation, lifecycle, config, and capability versions before applying state changes.

#### Scenario: Same Thread Event arriving during a Run creates later work (AGENT-RUNTIME-BE-S004)

- **GIVEN** a Run is executing for Thread A from snapshot `snap-1`
- **WHEN** a new Event is accepted for Thread A while the Run awaits model or Tool output
- **THEN** the new Event is appended to Thread A after the snapshot upper sequence
- **AND** the running Run continues using `snap-1`
- **AND** a later pending Run is created or updated to process the new Event

#### Scenario: Different Thread Event waits without contaminating active context (AGENT-RUNTIME-BE-S005)

- **GIVEN** a Run is executing for Thread A
- **WHEN** an Event is accepted for Thread B
- **THEN** the Thread B Event is appended immediately and creates pending work for Thread B
- **AND** Thread A's prompt/context does not include Thread B's Event
- **AND** Thread B is scheduled according to fairness after the active Run releases the slot

### Requirement: Interrupt and generation checks

AIAgent Durable Object SHALL enforce interrupts and generation checks before Run commit.

**Customer Context**

ユーザー取消、権限剥奪、Extension uninstall のような interrupt は、実行中の model/tool call を物理的に止められない場合でも、戻ってきた結果が誤って commit されないようにしなければならない。

**Requirement**

- AIAgent Durable Object MUST record interrupt flags for active Runs when cancellation, human override, permission revocation, or Extension uninstall Events require it.
- AgentRun commit MUST compare snapshot generation and interrupt status before mutating Agent state.
- Interrupted or cancelled Runs MUST end in an observable terminal status and MUST append or expose audit details explaining the interruption.

#### Scenario: Interrupt prevents stale Run result commit (AGENT-RUNTIME-BE-S006)

- **GIVEN** a Run is awaiting an external model or Tool result
- **WHEN** a `user.cancel`, `human.override`, permission revocation, or Extension uninstall interrupt is recorded for that Run
- **THEN** the Run is marked interrupted or cancelled according to policy
- **AND** any later stale result from the external call is discarded by generation check
- **AND** an audit Event records the interrupt reason

### Requirement: Harness decision execution and budget

Harness execution SHALL commit authorized decisions within configured budget boundaries.

**Customer Context**

Agent は単に応答文を返すだけでなく、状態更新、記憶、Schedule、Tool、Delivery、人間承認など複数の action を判断する。無限 loop や過剰な外部呼び出しを避けるため、Run 単位と日次/Extension/Tool 単位の budget が必要である。

**Requirement**

- Harness MUST support decision types for stop, update state, write memory, create schedule, invoke tool, respond through delivery context, request human approval, and emit Event.
- Harness MUST enforce configured limits for model calls, Tool calls, tokens, loops, timeout, cooldown, daily budget, Extension budget, and Tool budget.
- Decision commit MUST be transactional where Agent-owned state changes are involved and MUST produce observable Run output and audit details.
- Budget exhaustion MUST stop or fail the Run with a classified reason without partially committing unauthorized actions.

#### Scenario: Harness decision commits Agent-owned actions (AGENT-RUNTIME-BE-S007)

- **GIVEN** a Run snapshot is executing and the model returns decisions to update state, write memory, create a Schedule, invoke a Tool, and respond through a DeliveryContext
- **WHEN** the decisions pass validation, authorization, and budget checks
- **THEN** Agent-owned state changes are committed with causal links to the Run
- **AND** ToolInvocation, Schedule, Memory, and response/delivery records reference the same Run and Thread

#### Scenario: Budget exhaustion stops the Run safely (AGENT-RUNTIME-BE-S008)

- **GIVEN** a Run reaches a configured model call, Tool call, token, loop, timeout, or budget limit
- **WHEN** the harness attempts another decision step
- **THEN** the Run stops or fails with a budget-specific reason
- **AND** no further Tool, Schedule, Delivery, or state mutation is committed after the limit is reached
- **AND** metrics and audit details include the exceeded budget dimension

### Requirement: Run query and cancellation operations

Agent Service は Run の参照と取消を Agent scope、snapshot、idempotency に従って処理 MUST。

**Customer Context**

管理 UI と運用者は、実行中または過去の Run がどの snapshot で動いたかを確認し、必要に応じて安全に取消したい。Run query が別 Thread を混ぜたり、取消が stale result commit を許すと、Agent の説明可能性と安全性が失われる。

**Requirement**

- `AgentRunService.GetRun` は対象 Agent 内の Run status、Thread、snapshot reference、trigger Event range、decision summary、interrupt/cancel metadata、safe error detail を返す MUST。
- `AgentRunService.ListRuns` は Agent、Thread、status、time range、pagination filters を適用し、別 Agent の Run を返す MUST NOT。
- `AgentRunService.CancelRun` は idempotency key を使い、pending/running/waiting Run を cancelled または interrupted policy に遷移させ、terminal Run への重複取消は記録済み結果または stable precondition result に収束 MUST。
- CancelRun 後の Run commit は generation/interrupt check により stale result を破棄 MUST。

#### Scenario: GetRun and ListRuns expose immutable snapshots (AGENT-RUNTIME-BE-S009)

- **GIVEN** `agent-alpha` has Runs across multiple Threads and statuses
- **WHEN** an authorized principal calls `GetRun` and `ListRuns` with Thread and status filters
- **THEN** responses include only `agent-alpha` Runs with status, immutable snapshot reference, trigger range, causal links, and safe error metadata
- **AND** pagination cursors or Run IDs cannot expose Runs from another Agent

#### Scenario: CancelRun interrupts pending or running work idempotently (AGENT-RUNTIME-BE-S010)

- **GIVEN** a pending or running Run exists for Thread A
- **WHEN** an authorized principal calls `CancelRun` with idempotency key `cancel-1`
- **THEN** the Run records cancellation or interruption metadata and blocks later stale commit
- **AND** repeating `CancelRun` with the same body digest and key returns the same result without duplicate audit Events
