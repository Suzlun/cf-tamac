## ADDED Requirements

### Requirement: `thread_key` による Thread 解決

Agent Service は、Agent-scoped `thread_key` 値を通じて外部 Event 文脈を解決 SHALL。

**利用者文脈**

外部サービス、Client、Schedule、Tool、Extension は、Agent に Event を渡すときに「どの長期文脈へ入れるか」を明確に指定する必要がある。チャットルーム以外の文脈も扱うため、Thread は外部 platform 固有 ID ではなく opaque な `thread_key` で統合される必要がある。

**要件**

- AgentEvent publication は外部 Event 入力に対して空でない `thread_key` を要求 MUST。
- AIAgent Durable Object は、同じ `agent_id + thread_key` を同じ immutable internal `thread_id` に解決 MUST。
- 異なる Agent 内の同じ `thread_key` は異なる Thread に解決 MUST。
- `thread_key` 比較は Unicode NFC normalization、大文字小文字を区別する比較、暗黙 prefix なし、最大 512 UTF-8 bytes を使用 MUST。

#### Scenario: PublishEvent が欠落または空の `thread_key` を拒否する (AGENT-EVENTING-BE-S001)

- **GIVEN** 有効な principal が `agent-alpha` に Event を publish できる
- **WHEN** `thread_key` なし、または空の `thread_key` で `PublishEvent` を呼ぶ
- **THEN** Agent Service はリクエストを `invalid_argument` として拒否する
- **AND** Event、Thread、Section、pending Run、Queue wake は作成されない

#### Scenario: 同じ Agent と同じ `thread_key` は同じ Thread に解決する (AGENT-EVENTING-BE-S002)

- **GIVEN** `agent-alpha` に `project:agent-service` 用の Thread がない
- **WHEN** `thread_key = project:agent-service` で二つの Event が `agent-alpha` に publish される
- **THEN** 両方の Event は同じ internal `thread_id` を参照する
- **AND** それらの `thread_sequence` 値はその Thread 内で連続している

#### Scenario: 異なる Agent 間の同じ `thread_key` は分離されたままになる (AGENT-EVENTING-BE-S003)

- **GIVEN** `agent-alpha` と `agent-beta` がどちらも `thread_key = shared:ops` の Event を受け取っている
- **WHEN** 各 Agent の Thread view が照会される
- **THEN** 各 Agent は自分自身の `thread_id`、Section、Event sequence、Memory、Run History を返す
- **AND** 一方の Agent からの照会は、もう一方の Agent の Thread 状態を露出しない

### Requirement: Agent 管理 Event 用の System Thread

AIAgent Durable Object は Agent management operations を reserved system Thread に記録 SHALL。

**利用者文脈**

Lifecycle、credential rotation、Extension install/uninstall などの管理操作にも監査可能な Event History が必要だが、これらは通常の外部 Thread に属さない。監査 Event は Agent 内の予約済み system Thread に集約される必要がある。

**要件**

- AIAgent Durable Object は、Agent 管理監査 Event のため安定した internal `thread_key` を持つ予約済み system Thread を維持 MUST。
- Lifecycle、credential、Extension installation、permission revocation、destructive management operation は監査 Event を system Thread に追加 MUST。
- 公開 Event publish API は、caller が特権 system 監査 Event provenance を spoof することを許可して MUST NOT。

#### Scenario: ライフサイクル監査 Event が system Thread に追加される (AGENT-EVENTING-BE-S004)

- **GIVEN** `agent-alpha` が initialized である
- **WHEN** credential rotation または Extension uninstall が成功する
- **THEN** 監査 AgentEvent が予約済み system Thread に追加される
- **AND** Event には実行者、operation、時刻、correlation ID、結果としてのライフサイクルまたは capability 状態が含まれる

### Requirement: mailbox と Event Log としての AgentEvent

AIAgent Durable Object は、受理済み AgentEvent を authoritative mailbox および Event Log として永続化 SHALL。

**利用者文脈**

Agent は外部 Event を失わず、後続の自律判断で同じ履歴を再現できる必要がある。別 broker を正本にすると、Event 受理結果と Run 処理状態が分離し、監査と再開が難しくなる。

**要件**

- AIAgent Durable Object は受理済み AgentEvent を authoritative mailbox および Event Log として永続化 MUST。
- `PublishEventResponse` の成功は、Event が Agent-owned store に耐久的に受理済みになったことを意味 MUST。
- 受理済み Event は、`agent_sequence`、`thread_sequence`、`section_id`、`source`、`type`、`occurred_at`、idempotency key、payload 参照または inline payload、提供された場合の correlation ID と causation ID を含める MUST。
- Agent-local Queue は Event authority ではなく、すでに永続化された Event と pending Run のための wake-up mechanism としてだけ使用 MUST。

#### Scenario: 受理済み Event は scheduler wake 前に永続化される (AGENT-EVENTING-BE-S005)

- **GIVEN** 有効な Event が `agent-alpha` に publish されている
- **WHEN** `PublishEvent` が成功を返す
- **THEN** Event は現在の open Section 内に Agent と Thread の sequence number とともに保存される
- **AND** その Thread には pending Run が存在するか coalesced される
- **AND** Agent-local Queue には pending work 用の scheduler wake が最大一つ含まれる

#### Scenario: 重複 Event publish が元の Event 結果を返す (AGENT-EVENTING-BE-S006)

- **GIVEN** principal が idempotency key `evt-1` で Event の publish に成功している
- **WHEN** 同じ principal が同じ body digest と `evt-1` でリクエストを繰り返す
- **THEN** Agent Service は元の Event ID、Thread ID、sequence 情報を返す
- **AND** duplicate AgentEvent、Run、Queue wake は作成されない

### Requirement: Event 照会と payload handling

Agent Service は scoped Event 照会と検証済み payload 参照を公開 SHALL。

**利用者文脈**

管理 UI と検証ツールは、Thread 内の Event を順序通りに読み、必要に応じて大きな payload の参照と digest を確認する必要がある。Event 照会は Agent 境界を越えず、payload の完全性を検証できる必要がある。

**要件**

- AgentEvent 照会 RPC は `agent_id` と認可済み principal で scoped される MUST。
- Event list 応答は、他 Agent 状態を露出せずに Thread、Section、sequence 範囲、type、ページング絞り込み条件を支援 MUST。
- 構成済み inline 閾値より大きい payload は immutable R2 object として保存 MUST し、Event 記録では参照、サイズ、content type、digest で表現 MUST。
- Event 照会応答は `agent_sequence` と `thread_sequence` による順序を保持 MUST。

#### Scenario: ListEvents が requested Thread 内の ordered Events を返す (AGENT-EVENTING-BE-S007)

- **GIVEN** Thread が一つ以上の Section にまたがる複数の Event を含んでいる
- **WHEN** 認可済み principal がその `agent_id` と `thread_id` に対して `ListEvents` を呼ぶ
- **THEN** 応答はその Thread 内の Event だけを `thread_sequence` 順に返す
- **AND** ページング cursor は別 Agent または Thread への access を許さない

#### Scenario: 大きな Event payload が digest メタデータ付きで offload される (AGENT-EVENTING-BE-S008)

- **GIVEN** Event payload が inline payload threshold を超えている
- **WHEN** Event が受理される
- **THEN** payload body は immutable object として R2 に書き込まれる
- **AND** AgentEvent は content type、byte size、digest、object reference を保存する
- **AND** Event 取得は認可済み経路を通じて payload を返却または stream する前に digest を検証できる

### Requirement: Thread と Section 照会

Agent Service は Thread と Section の公開照会を Agent scope 内に限定 MUST。

**利用者文脈**

管理 UI と運用者は、Agent 内の Thread 一覧、個別 Thread、Section 境界を安全に確認したい。これらの照会が Agent 境界を越えると、別 Agent の長期文脈や Event 範囲を誤って表示する。

**要件**

- `AgentThreadService.ListThreads` は `agent_id`、authorization、ページング、状態/絞り込み条件を受け取り、対象 Agent に属する Thread 要約だけを返す MUST。
- `AgentThreadService.GetThread` は対象 Agent 内の Thread identity、`thread_key`、現在 Section、latest Event/Run 要約、状態メタデータを返し、別 Agent の Thread を返す MUST NOT。
- `AgentThreadService.ListSections` は対象 Thread の Section を ordinal または sequence 範囲順に返し、Section 状態、Event 範囲、latest compaction 参照を含める MUST。
- これらの照会は Agent-local final authorization を通り、not found、permission denied、pagination cursor scope error を安定した Connect code に変換 MUST。

#### Scenario: ListThreads GetThread と ListSections が Agent scoped に留まる (AGENT-EVENTING-BE-S009)

- **GIVEN** `agent-alpha` と `agent-beta` がそれぞれ複数 Thread と Section を持っている
- **WHEN** 認可済み principal が `agent-alpha` に対して `ListThreads`、`GetThread`、`ListSections` を呼ぶ
- **THEN** 応答は `agent-alpha` の Thread 要約、Thread 詳細、Section 範囲だけを返す
- **AND** ページング cursor、Thread ID、Section ID を差し替えても `agent-beta` の状態は返らない
