## ADDED Requirements

### Requirement: Agent-owned thread-scoped Schedule

AIAgent Durable Object SHALL own Schedules that fire into a specific Thread.

**Customer Context**

Agent は外部 Event がなくても、将来時刻や反復予定によって自律的に行動する必要がある。Schedule は外部 Calendar ではなく Agent 内で Event を発生させる能力であり、必ず文脈となる Thread に紐づく必要がある。

**Requirement**

- Schedule MUST be owned by AIAgent Durable Object and MUST be scoped to one Agent.
- Schedule MUST reference a Thread or resolvable `thread_key` and MUST fire into the same Thread as a `schedule.triggered` AgentEvent.
- Schedule management RPCs MUST require `agent_id`, authorization, idempotency key for commands, and final Agent-local authorization.
- Creating, updating, firing, and cancelling Schedule records MUST be auditable.

#### Scenario: CreateSchedule requires a Thread context (AGENT-SCHEDULE-BE-S001)

- **GIVEN** an authorized Client Service principal wants to schedule future Agent work
- **WHEN** it calls `CreateSchedule` without a Thread ID or valid `thread_key`
- **THEN** Agent Service rejects the request with invalid argument
- **AND** no Agent-local runtime schedule or Schedule record is created

#### Scenario: Schedule firing appends a `schedule.triggered` Event (AGENT-SCHEDULE-BE-S002)

- **GIVEN** an active one-shot Schedule is bound to Thread A
- **WHEN** its scheduled time arrives
- **THEN** AIAgent Durable Object appends a `schedule.triggered` AgentEvent to Thread A
- **AND** pending Run work is created or coalesced for Thread A
- **AND** the Schedule record reflects the firing timestamp and outcome

### Requirement: Schedule overlap and idempotency

Schedule execution SHALL apply overlap policy and idempotency controls.

**Customer Context**

Interval Schedule が長い処理と重なると、同じ目的の Run が重複して外部作用を起こす可能性がある。Schedule ごとに重複時の扱いを明示し、発火処理も冪等にする必要がある。

**Requirement**

- Repeating Schedules MUST define an overlap policy of skip, coalesce, or queue-next.
- Schedule firing MUST be idempotent by Agent, Schedule, fire time or tick identity, and generated Event idempotency key.
- AIAgent Durable Object MUST NOT create duplicate `schedule.triggered` Events for the same Schedule tick.

#### Scenario: Overlap policy prevents duplicate interval work (AGENT-SCHEDULE-BE-S003)

- **GIVEN** a repeating Schedule tick occurs while prior work for the same Schedule is still active
- **WHEN** the runtime callback executes
- **THEN** AIAgent Durable Object applies the Schedule's overlap policy
- **AND** skip, coalesce, or queue-next behavior is recorded without creating unintended duplicate Events

### Requirement: Schedule cancellation and Extension cleanup

Schedule cancellation SHALL prevent later firing and clean up Extension-owned schedules.

**Customer Context**

管理者や Extension uninstall は、将来発火する予定を確実に止める必要がある。Extension が作成した Schedule は、その Extension が使えない状態で外部作用を起こしてはならない。

**Requirement**

- CancelSchedule MUST be idempotent and MUST prevent future `schedule.triggered` Events for the cancelled Schedule.
- Schedule records MUST retain cancellation reason, actor, timestamp, and audit link.
- Schedules created by an Extension Installation MUST store `installation_id` and MUST be cancelled or disabled when that Installation is uninstalled or disabled.

#### Scenario: CancelSchedule prevents future firing (AGENT-SCHEDULE-BE-S004)

- **GIVEN** an active Schedule exists for Thread A
- **WHEN** an authorized principal calls `CancelSchedule`
- **THEN** the Agent-local runtime schedule is cancelled
- **AND** the Schedule record becomes cancelled with audit metadata
- **AND** later runtime callbacks for the same Schedule identity do not append new Events

#### Scenario: Extension uninstall cancels its active Schedules (AGENT-SCHEDULE-BE-S005)

- **GIVEN** Extension Installation `inst-1` created active Schedules in an Agent
- **WHEN** `inst-1` is uninstalled
- **THEN** all active Schedules associated with `inst-1` are cancelled or disabled
- **AND** cancellation audit Events are appended to the system Thread
- **AND** no later Schedule firing uses the uninstalled Extension's Tool or Delivery capability
