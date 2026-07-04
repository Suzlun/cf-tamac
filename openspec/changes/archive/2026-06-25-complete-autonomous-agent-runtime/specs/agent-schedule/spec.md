## ADDED Requirements

### Requirement: Run decision schedule creation

Run decision 由来の Schedule 作成は Agent-owned Schedule 境界を通過 MUST。

**Customer Context**

Agent は model decision により将来の作業を予定できる必要がある。Schedule が Thread 文脈、予算、認可、因果 link なしで作られると、意図しない自律実行や説明不能な Event が発生する。

**Requirement**

`create_schedule` decision は Agent-owned Schedule creation として commit SHALL。Commit は Thread context、schedule policy、authorization、budget、idempotency、lifecycle、Integration capability を検証 MUST。Schedule record は Run ID、decision ID、Thread ID または resolved `thread_key`、causation Event、model policy digest、schedule input digest、created principal を保持 MUST。

Schedule fire は既存 Schedule 仕様と同じく `schedule.triggered` AgentEvent を同じ Thread に append SHALL。Run-created Schedule は Event と Run snapshot の因果 link を保持 MUST。Cancelled、disabled、stale capability を持つ Schedule は future fire を実行して MUST NOT。

#### Scenario: create_schedule decision が因果 link 付き Schedule を作る (AGENT-SCHEDULE-S006)

- **GIVEN** Run が Thread A に対して valid `create_schedule` decision を返している
- **WHEN** commit layer が authorization、budget、idempotency を通過する
- **THEN** Agent-owned Schedule は Run ID、decision ID、Thread A、model policy digest、causation Event を持って作成される
- **AND** fire 時には Thread A に `schedule.triggered` Event が append され pending Run work が coalesce される
