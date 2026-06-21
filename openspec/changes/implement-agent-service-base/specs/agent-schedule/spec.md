## ADDED Requirements

### Requirement: Agent-owned Thread-scoped Schedule の所有

AIAgent Durable Object は特定の Thread に fire する Schedule を所有 SHALL。

**利用者文脈**

Agent は外部 Event がなくても、将来時刻や反復予定によって自律的に行動する必要がある。Schedule は外部 Calendar ではなく Agent 内で Event を発生させる能力であり、必ず文脈となる Thread に紐づく必要がある。

**要件**

- Schedule は AIAgent Durable Object に所有される MUST し、一つの Agent に scoped される MUST。
- Schedule は Thread または解決可能な `thread_key` を参照 MUST し、`schedule.triggered` AgentEvent として同じ Thread に fire MUST。
- Schedule 管理 RPC は `agent_id`、認可、command 用 idempotency key、final Agent-local authorization を要求 MUST。
- Schedule 記録の作成、更新、fire、取消は監査可能である MUST。

#### Scenario: CreateSchedule が Thread context を要求する (AGENT-SCHEDULE-S001)

- **GIVEN** 認可済み Client Service principal が将来の Agent work を schedule したい
- **WHEN** Thread ID または有効な `thread_key` なしで `CreateSchedule` を呼ぶ
- **THEN** Agent Service はリクエストを `invalid_argument` として拒否する
- **AND** Agent-local runtime schedule または Schedule 記録は作成されない

#### Scenario: Schedule firing が `schedule.triggered` Event を append する (AGENT-SCHEDULE-S002)

- **GIVEN** 有効な one-shot Schedule が Thread A に bind されている
- **WHEN** schedule 済み時刻が到来する
- **THEN** AIAgent Durable Object は Thread A に `schedule.triggered` AgentEvent を append する
- **AND** Thread A の pending Run work が作成または coalesced される
- **AND** Schedule 記録は fire 時刻と結果を反映する

### Requirement: Schedule overlap と idempotency

Schedule execution は overlap policy と idempotency controls を適用 SHALL。

**利用者文脈**

Interval Schedule が長い処理と重なると、同じ目的の Run が重複して外部作用を起こす可能性がある。Schedule ごとに重複時の扱いを明示し、発火処理も冪等にする必要がある。

**要件**

- Repeating Schedule は skip、coalesce、queue-next の overlap policy を定義 MUST。
- Schedule fire は Agent、Schedule、fire 時刻または tick identity、生成済み Event idempotency key により冪等である MUST。
- AIAgent Durable Object は同じ Schedule tick に対して duplicate `schedule.triggered` Events を作成して MUST NOT。

#### Scenario: overlap policy が duplicate interval work を防ぐ (AGENT-SCHEDULE-S003)

- **GIVEN** 同じ Schedule の以前の work がまだ有効な間に repeating Schedule tick が発生している
- **WHEN** runtime callback が実行される
- **THEN** AIAgent Durable Object は Schedule の overlap policy を適用する
- **AND** 意図しない重複 Event を作成せず、skip、coalesce、queue-next 振る舞いが記録される

### Requirement: Schedule 取消と Integration cleanup

Schedule 取消は後続 fire を防ぎ、Integration-owned Schedule を clean up SHALL。

**利用者文脈**

管理者や Integration uninstall は、将来発火する予定を確実に止める必要がある。Integration が作成した Schedule は、その Integration が使えない状態で外部作用を起こしてはならない。

**要件**

- CancelSchedule は冪等である MUST し、cancelled Schedule の future `schedule.triggered` Event を防止 MUST。
- Schedule 記録は取消理由、実行者、時刻、監査 link を保持 MUST。
- Integration Installation が作成した Schedule は `installation_id` を保存 MUST し、その Installation がアンインストール済みまたは無効になったときに `cancelled` または `disabled` になる MUST。

#### Scenario: CancelSchedule が future firing を防ぐ (AGENT-SCHEDULE-S004)

- **GIVEN** Thread A に有効な Schedule が存在する
- **WHEN** 認可済み principal が `CancelSchedule` を呼ぶ
- **THEN** Agent-local runtime schedule は cancelled になる
- **AND** Schedule 記録は監査メタデータ付きで cancelled になる
- **AND** 同じ Schedule identity に対する後続 runtime callback は新しい Event を追加しない

#### Scenario: Integration uninstall が有効 Schedule を cancel する (AGENT-SCHEDULE-S005)

- **GIVEN** Integration Installation `inst-1` が Agent 内に有効 Schedule を作成している
- **WHEN** `inst-1` がアンインストール済みになる
- **THEN** `inst-1` に関連するすべての有効 Schedule は `cancelled` または `disabled` になる
- **AND** 取消監査 Event が system Thread に追加される
- **AND** 後続 Schedule fire はアンインストール済み Integration の Tool または Delivery capability を使用しない
