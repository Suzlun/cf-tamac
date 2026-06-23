# agent-runtime Specification

## Purpose

TBD - created by archiving change implement-agent-service-base. Update Purpose after archive.

## Requirements

### Requirement: Agent-local Run scheduler による実行制御

AIAgent Durable Object は、coalesce 済み Agent-local Queue wake を通じて AgentRun work を schedule SHALL。

**利用者文脈**

Agent は Event を受け取ったあと、外部 queue consumer を必要とせず自分自身の SQLite-backed runtime 上で順次処理したい。Event 受理は高速に返しつつ、Run は Agent ごとの一貫した順序と公平性で進む必要がある。

**要件**

- AIAgent Durable Object は、Event が受理されたときに pending AgentRun work を作成または coalesce MUST。
- Agent-local Queue は、Event ごとに一つの queue item を入れるのではなく、coalesce 済み scheduler wake callback を enqueue MUST。
- AIAgent Durable Object は、同時に Agent ごと最大一つの有効 AgentRun だけを許可 MUST。
- Scheduler 選択は、最小限の公平性規則として priority descending、`last_served_at` ascending、`pending_since` ascending を使用 MUST。

#### Scenario: Event acceptance が scheduler wake を coalesce する (AGENT-RUNTIME-S001)

- **GIVEN** scheduler wake がすでに pending の間に、一つ以上の Thread に対して複数の Event が受理されている
- **WHEN** AIAgent Durable Object がそれらの Event を記録する
- **THEN** 影響を受ける Thread の pending Run 記録を作成または更新する
- **AND** coalesce 済み scheduler wake を超える重複 wake callback は enqueue しない

#### Scenario: Agent ごとに一つの AgentRun だけが有効になる (AGENT-RUNTIME-S002)

- **GIVEN** Thread A に running AgentRun があり、Thread B に pending Events がある
- **WHEN** scheduler wake が実行される
- **THEN** Thread B は、Thread A が有効 Run slot を解放する terminal または waiting 状態に到達するまで pending のままである
- **AND** 同じ AIAgent Durable Object 内で二つ目の有効 Run は同時実行されない

#### Scenario: Scheduler が pending Thread を公平に選択する (AGENT-RUNTIME-S003)

- **GIVEN** 複数の Thread が、それぞれ異なる priority、`last_served_at`、`pending_since` を持つ pending Run を持っている
- **WHEN** 有効な AgentRun がない
- **THEN** scheduler は最も priority が高い pending Run を選択する
- **AND** 同順位は古い `last_served_at`、次に古い `pending_since` で解決される

### Requirement: immutable Run 入力スナップショットの固定

AgentRun は immutable 入力スナップショットから実行 SHALL。

**利用者文脈**

Agent の判断は、どの Event、Memory、Config、Tool 集合を見て行われたか説明可能でなければならない。実行中に新しい Event が到着しても、その Run の入力が途中で変わると監査や再実行が不可能になる。

**要件**

- AgentRun は開始時に入力スナップショットを固定 MUST。
- スナップショットは trigger Event 範囲、ThreadMemory 版、latest ready Compaction ID、未 Compaction Event 上限 sequence、Agent config 版、利用可能 Tool 集合版、Integration Installation 版を含める MUST。
- Run 中に到着した新しい Event は永続的に追加 MUST だが、running スナップショットを変更して MUST NOT。
- Run 結果確定は、状態変更を適用する前に取消、generation、ライフサイクル、config、capability 版を検証 MUST。

#### Scenario: Run 中に到着した同じ Thread の Event が後続 work を作る (AGENT-RUNTIME-S004)

- **GIVEN** Run がスナップショット `snap-1` から Thread A に対して実行されている
- **WHEN** Run が model または Tool 出力を待機している間に、Thread A の新しい Event が受理される
- **THEN** 新しい Event はスナップショット上限 sequence の後に Thread A へ追加される
- **AND** running Run は `snap-1` の使用を続ける
- **AND** 新しい Event を処理するため、後続の pending Run が作成または更新される

#### Scenario: 別 Thread の Event は有効文脈を混ぜずに待機する (AGENT-RUNTIME-S005)

- **GIVEN** Run が Thread A に対して実行されている
- **WHEN** Thread B の Event が受理される
- **THEN** Thread B Event はすぐに追加され、Thread B の pending work を作成する
- **AND** Thread A の prompt/文脈には Thread B の Event は含まれない
- **AND** 有効 Run が slot を解放した後、Thread B は公平性に従って schedule される

### Requirement: interrupt と generation 確認

AIAgent Durable Object は Run 確定前に interrupt と generation 確認を強制 SHALL。

**利用者文脈**

ユーザー取消、権限剥奪、Integration uninstall のような interrupt は、実行中の model/Tool call を物理的に止められない場合でも、戻ってきた結果が誤って確定されないようにしなければならない。

**要件**

- AIAgent Durable Object は、取消、human override、permission revocation、または Integration uninstall Event が要求する場合、有効 Run に interrupt flag を記録 MUST。
- AgentRun 確定は、Agent 状態を変更する前にスナップショット generation と interrupt 状態を比較 MUST。
- `interrupted` または `cancelled` の Run は観測可能な terminal 状態で終了 MUST し、interrupt を説明する監査詳細を追加または公開 MUST。

#### Scenario: interrupt が stale Run result commit を防ぐ (AGENT-RUNTIME-S006)

- **GIVEN** Run が外部 model または Tool 結果を待機している
- **WHEN** その Run に `user.cancel`、`human.override`、permission revocation、または Integration uninstall interrupt が記録される
- **THEN** Run は policy に従って `interrupted` または `cancelled` として mark される
- **AND** 外部 call から後で戻った stale result は generation 確認により破棄される
- **AND** 監査 Event が interrupt 理由を記録する

### Requirement: Harness 判断実行と予算

Harness 実行は構成済み予算境界内で認可済み判断を確定 SHALL。

**利用者文脈**

Agent は単に応答文を返すだけでなく、状態更新、記憶、Schedule、Tool、Delivery、人間承認など複数の action を判断する。無限 loop や過剰な外部呼び出しを避けるため、Run 単位と日次/Integration/Tool 単位の予算が必要である。

**要件**

- Harness は `stop`、`update_state`、`write_memory`、`create_schedule`、`invoke_tool`、DeliveryContext を通じた `respond`、`request_human_approval`、`emit_event` の判断 type を支援 MUST。
- Harness は model call、Tool call、token、loop、timeout、cooldown、日次予算、Integration 予算、Tool 予算の構成済み上限を強制 MUST。
- 判断確定は Agent-owned 状態変更が関係する場合は transactional である MUST し、観測可能な Run 出力と監査詳細を生成 MUST。
- 予算枯渇は、未認可 action を部分的に確定せず、分類済み理由とともに Run を stop または fail MUST。

#### Scenario: Harness 判断が Agent-owned action を確定する (AGENT-RUNTIME-S007)

- **GIVEN** Run スナップショットが実行中で、model が `update_state`、`write_memory`、Schedule 作成、Tool 呼び出し、DeliveryContext を通じた `respond` の判断を返している
- **WHEN** 判断が検証、認可、予算確認を通過する
- **THEN** Agent-owned 状態変更は Run への因果 link とともに確定される
- **AND** ToolInvocation、Schedule、Memory、応答/Delivery 記録は同じ Run と Thread を参照する

#### Scenario: 予算枯渇が Run を安全に停止する (AGENT-RUNTIME-S008)

- **GIVEN** Run が構成済み model call、Tool call、token、loop、timeout、または予算上限に到達している
- **WHEN** harness が次の判断手順を試みる
- **THEN** Run は予算固有の理由とともに stop または fail する
- **AND** 上限到達後は、それ以上の Tool、Schedule、Delivery、状態変更は確定されない
- **AND** metrics と監査詳細には超過した予算次元が含まれる

### Requirement: Run 照会と取消 operation

Agent Service は Run の参照と取消を Agent scope、スナップショット、idempotency に従って処理 MUST。

**利用者文脈**

管理 UI と運用者は、実行中または過去の Run がどのスナップショットで動いたかを確認し、必要に応じて安全に取り消したい。Run 照会が別 Thread を混ぜたり、取消が stale result 確定を許すと、Agent の説明可能性と安全性が失われる。

**要件**

- `AgentRunService.GetRun` は対象 Agent 内の Run 状態、Thread、スナップショット参照、trigger Event 範囲、判断要約、interrupt/cancel メタデータ、安全なエラー詳細を返す MUST。
- `AgentRunService.ListRuns` は Agent、Thread、状態、時間範囲、ページング絞り込み条件を適用し、別 Agent の Run を返す MUST NOT。
- `AgentRunService.CancelRun` は idempotency key を使い、pending/running/waiting Run を cancelled または interrupted policy に遷移させ、terminal Run への重複取消は記録済み結果または安定した事前条件結果に収束 MUST。
- CancelRun 後の Run 確定は generation/interrupt 確認により stale result を破棄 MUST。

#### Scenario: GetRun と ListRuns が immutable スナップショットを公開する (AGENT-RUNTIME-S009)

- **GIVEN** `agent-alpha` に複数の Thread と状態にまたがる Run がある
- **WHEN** 認可済み principal が Thread と状態絞り込み条件を指定して `GetRun` と `ListRuns` を呼ぶ
- **THEN** 応答には、状態、immutable スナップショット参照、trigger 範囲、因果 link、安全なエラーメタデータを持つ `agent-alpha` の Run だけが含まれる
- **AND** ページング cursor または Run ID は別 Agent の Run を露出できない

#### Scenario: CancelRun が pending または running work を冪等に interrupt する (AGENT-RUNTIME-S010)

- **GIVEN** Thread A に pending または running Run が存在する
- **WHEN** 認可済み principal が idempotency key `cancel-1` で `CancelRun` を呼ぶ
- **THEN** Run は取消または interrupt メタデータを記録し、後続の stale commit を block する
- **AND** 同じ body digest と key で `CancelRun` を繰り返すと、重複する監査 Event なしで同じ結果を返す
