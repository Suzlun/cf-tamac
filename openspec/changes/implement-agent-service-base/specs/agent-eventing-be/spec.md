## ADDED Requirements

### Requirement: Thread resolution by `thread_key`

Agent Service SHALL resolve external Event context through Agent-scoped `thread_key` values.

**Customer Context**

外部サービス、Client、Schedule、Tool、Extension は、Agent に Event を渡すときに「どの長期文脈へ入れるか」を明確に指定する必要がある。チャットルーム以外の文脈も扱うため、Thread は外部 platform 固有 ID ではなく opaque な `thread_key` で統合される必要がある。

**Requirement**

- AgentEvent publication MUST require a non-empty `thread_key` for external Event input.
- AIAgent Durable Object MUST resolve the same `agent_id + thread_key` to the same immutable internal `thread_id`.
- The same `thread_key` in different Agents MUST resolve to different Threads.
- `thread_key` comparison MUST use Unicode NFC normalization, case-sensitive comparison, no implicit prefixing, and a maximum of 512 UTF-8 bytes.

#### Scenario: PublishEvent rejects missing or empty `thread_key` (AGENT-EVENTING-BE-S001)

- **GIVEN** a valid principal can publish Events to `agent-alpha`
- **WHEN** it calls `PublishEvent` without `thread_key` or with an empty `thread_key`
- **THEN** Agent Service rejects the request with invalid argument
- **AND** no Event, Thread, Section, pending Run, or Queue wake is created

#### Scenario: Same Agent and same `thread_key` resolve to the same Thread (AGENT-EVENTING-BE-S002)

- **GIVEN** `agent-alpha` has no Thread for `project:agent-service`
- **WHEN** two Events are published to `agent-alpha` with `thread_key = project:agent-service`
- **THEN** both Events reference the same internal `thread_id`
- **AND** their `thread_sequence` values are contiguous within that Thread

#### Scenario: Same `thread_key` across different Agents remains isolated (AGENT-EVENTING-BE-S003)

- **GIVEN** `agent-alpha` and `agent-beta` both receive Events with `thread_key = shared:ops`
- **WHEN** Thread views are queried for each Agent
- **THEN** each Agent returns its own `thread_id`, Section, Event sequence, Memory, and Run history
- **AND** no query from one Agent exposes the other Agent's Thread state

### Requirement: System Thread for Agent management Events

AIAgent Durable Object SHALL record Agent management operations in a reserved system Thread.

**Customer Context**

Lifecycle、credential rotation、Extension install/uninstall などの管理操作にも監査可能な Event history が必要だが、これらは通常の外部 Thread に属さない。監査 Event は Agent 内の予約済み system Thread に集約される必要がある。

**Requirement**

- AIAgent Durable Object MUST maintain a reserved system Thread with a stable internal `thread_key` for Agent management audit Events.
- Lifecycle, credential, Extension installation, permission revocation, and destructive management operations MUST append audit Events to the system Thread.
- Public Event publish APIs MUST NOT allow callers to spoof privileged system audit Event provenance.

#### Scenario: Lifecycle audit Event is appended to the system Thread (AGENT-EVENTING-BE-S004)

- **GIVEN** `agent-alpha` is initialized
- **WHEN** credential rotation or Extension uninstall succeeds
- **THEN** an audit AgentEvent is appended to the reserved system Thread
- **AND** the Event includes actor, operation, timestamp, correlation ID, and resulting lifecycle or capability status

### Requirement: AgentEvent as mailbox and event log

AIAgent Durable Object SHALL persist accepted AgentEvents as the authoritative mailbox and Event Log.

**Customer Context**

Agent は外部 Event を失わず、後続の自律判断で同じ履歴を再現できる必要がある。別 broker を正本にすると、Event 受理結果と Run 処理状態が分離し、監査と再開が難しくなる。

**Requirement**

- AIAgent Durable Object MUST persist accepted AgentEvents as the authoritative mailbox and Event Log.
- `PublishEventResponse` success MUST mean the Event is durably accepted into the Agent-owned store.
- Accepted Events MUST include `agent_sequence`, `thread_sequence`, `section_id`, `source`, `type`, `occurred_at`, idempotency key, payload reference or inline payload, correlation ID, and causation ID when provided.
- Agent-local Queue MUST be used only as a wake-up mechanism for already-persisted Events and pending Runs, not as Event authority.

#### Scenario: Accepted Event is persisted before scheduler wake (AGENT-EVENTING-BE-S005)

- **GIVEN** a valid Event is published to `agent-alpha`
- **WHEN** `PublishEvent` returns success
- **THEN** the Event is stored with Agent and Thread sequence numbers inside the current open Section
- **AND** a pending Run exists or is coalesced for that Thread
- **AND** the Agent-local Queue contains at most one scheduler wake for pending work

#### Scenario: Duplicate Event publish returns the original Event result (AGENT-EVENTING-BE-S006)

- **GIVEN** a principal successfully published an Event with idempotency key `evt-1`
- **WHEN** the same principal repeats the request with the same body digest and `evt-1`
- **THEN** Agent Service returns the original Event ID, Thread ID, and sequence information
- **AND** no duplicate AgentEvent, Run, or Queue wake is created

### Requirement: Event query and payload handling

Agent Service SHALL expose scoped Event queries and verified payload references.

**Customer Context**

管理 UI と検証ツールは、Thread 内の Event を順序通りに読み、必要に応じて大きな payload の参照と digest を確認する必要がある。Event query は Agent 境界を越えず、payload の完全性を検証できる必要がある。

**Requirement**

- AgentEvent query RPCs MUST be scoped by `agent_id` and authorized principal.
- Event list responses MUST support Thread, Section, sequence range, type, and pagination filters without exposing other Agent state.
- Payloads larger than the configured inline threshold MUST be stored as immutable R2 objects and represented in Event records by reference, size, content type, and digest.
- Event query responses MUST preserve ordering by `agent_sequence` and `thread_sequence`.

#### Scenario: ListEvents returns ordered Events within the requested Thread (AGENT-EVENTING-BE-S007)

- **GIVEN** a Thread contains multiple Events across one or more Sections
- **WHEN** an authorized principal calls `ListEvents` for that `agent_id` and `thread_id`
- **THEN** the response returns only Events in that Thread ordered by `thread_sequence`
- **AND** pagination cursors do not allow access to another Agent or Thread

#### Scenario: Large Event payload is offloaded with digest metadata (AGENT-EVENTING-BE-S008)

- **GIVEN** an Event payload exceeds the inline payload threshold
- **WHEN** the Event is accepted
- **THEN** the payload body is written to R2 as an immutable object
- **AND** the AgentEvent stores content type, byte size, digest, and object reference
- **AND** Event retrieval can verify the digest before returning or streaming the payload through an authorized path

### Requirement: Thread and Section queries

Agent Service は Thread と Section の公開 query を Agent scope 内に限定 MUST。

**Customer Context**

管理 UI と運用者は、Agent 内の Thread 一覧、個別 Thread、Section 境界を安全に確認したい。これらの query が Agent 境界を越えると、別 Agent の長期文脈や Event 範囲を誤って表示する。

**Requirement**

- `AgentThreadService.ListThreads` は `agent_id`、authorization、pagination、status/filter 条件を受け取り、対象 Agent に属する Thread summaries だけを返す MUST。
- `AgentThreadService.GetThread` は対象 Agent 内の Thread identity、`thread_key`、current Section、latest Event/Run summary、status metadata を返し、別 Agent の Thread を返す MUST NOT。
- `AgentThreadService.ListSections` は対象 Thread の Section を ordinal または sequence range 順に返し、Section status、event range、latest compaction reference を含める MUST。
- これらの query は Agent-local final authorization を通り、not found、permission denied、pagination cursor scope error を安定した Connect code に変換 MUST。

#### Scenario: ListThreads GetThread and ListSections stay Agent scoped (AGENT-EVENTING-BE-S009)

- **GIVEN** `agent-alpha` と `agent-beta` がそれぞれ複数 Thread と Section を持っている
- **WHEN** authorized principal が `agent-alpha` に対して `ListThreads`、`GetThread`、`ListSections` を呼ぶ
- **THEN** responses は `agent-alpha` の Thread summaries、Thread detail、Section ranges だけを返す
- **AND** pagination cursor、Thread ID、Section ID を差し替えても `agent-beta` の state は返らない
