## MODIFIED Requirements

### Requirement: Server-side management UI shell

Management Client は、Agent credential や direct Agent RPC invocation を Browser code へ露出せず、server-side Agent management shell を render MUST。

**Customer Context**

Agent 管理者は Browser から管理画面を開き、管理対象 Agent の登録状態と選択中 Agent の運用状態を迷わず確認したい。一方で Agent credential や Agent RPC への直接呼び出しコードが Browser に渡ると、認証情報の露出や権限境界の混同が起きる。

**Requirement**

`packages/client` は、Cloudflare-compatible Next.js adapter を通じて Cloudflare Workers に deploy される Next.js App Router management UI SHALL。

Browser-visible UI は、Client pages と server-side execution boundaries を通じて render SHALL。

Agent RPC invocation は、generated Protobuf RPC client code を使う Client server-side modules から発生 SHALL。

Browser-delivered bundles は、Agent credential material または direct Agent RPC invocation logic を含んで MUST NOT。

Server Actions と Server Components は internal UI execution boundaries のみ SHALL であり、public Agent domain APIs として扱って MUST NOT。

Client App Router は `/`、`/agents`、`/settings`、`/agents/[agentId]`、`/agents/[agentId]/threads`、`/agents/[agentId]/events`、`/agents/[agentId]/runs`、`/agents/[agentId]/schedules`、`/agents/[agentId]/integrations`、`/agents/[agentId]/settings` の shell routes を含む SHALL。

`/` は `/agents` へ server-side redirect される SHALL。

Global navigation area は `Agents` と `Global Settings` だけを表示 SHALL。

Selected-Agent navigation area は、登録済み Agent が選択されている場合に限り `Overview`、`Threads`、`Events`、`Runs`、`Schedules`、`Integrations`、`Settings` を表示 SHALL。

Agent 未選択時または未登録 Agent context では、Selected-Agent navigation area は hidden または disabled になり、`Agents` 画面への guidance を表示 SHALL。

`New Agent` は `Agents` 画面内 action として提供 SHALL し、independent sidebar item、independent screen、independent route として公開 MUST NOT。

`Tools` と `Compactions` は independent top-level navigation item または independent top-level route として公開 MUST NOT。ToolInvocation、Tool catalog、Tool approval、Compaction、History、Handoff、Memory metadata は Agent-scoped Overview、Threads、Events、Runs、Integrations、Settings の detail/metadata として表示 SHALL。

#### Scenario: Agent registry shell renders for a browser user (MANAGEMENT-CLIENT-S001)

- **GIVEN** browser user が management Client を開く
- **WHEN** `/agents` route が render される
- **THEN** page は Agent registry shell、empty-state guidance、Agent registration action、Agent selection affordance、Global Settings への navigation を表示する
- **AND** selected-Agent navigation は Agent 未選択時に hidden または disabled で表示される
- **AND** `hello` または `users` demonstration content を表示しない

#### Scenario: Browser bundles do not call Agent RPC directly (MANAGEMENT-CLIENT-S002)

- **GIVEN** Client production build が利用できる
- **WHEN** browser-delivered chunks を検査する
- **THEN** Agent RPC origin invocation code と Agent credential material はそれらの chunks に存在しない
- **AND** Agent RPC client construction は server-side modules からのみ到達可能である

#### Scenario: Left sidebar separates global and selected-Agent navigation (MANAGEMENT-CLIENT-S009)

- **GIVEN** browser user が management Client を開き、Agent を選択していない
- **WHEN** management shell が render される
- **THEN** left sidebar は Global area として `Agents` と `Global Settings` だけを表示する
- **AND** Selected-Agent area は hidden または disabled であり、Agent 選択への guidance を表示する
- **AND** horizontal tabs は primary navigation として表示されない

#### Scenario: Selected-Agent area activates for registered Agent context (MANAGEMENT-CLIENT-S010)

- **GIVEN** browser user が Client D1 に登録済みの Agent を選択している
- **WHEN** selected-Agent route が render される
- **THEN** left sidebar は `Overview`、`Threads`、`Events`、`Runs`、`Schedules`、`Integrations`、`Settings` を Agent-scoped navigation として表示する
- **AND** `New Agent`、`Tools`、`Compactions` は top-level navigation item として表示されない
- **AND** Topbar は選択中 Agent の表示と `Agents` 画面への導線だけを持ち、cross-Agent quick switcher を提供しない

#### Scenario: Route manifest exposes only Management Client screens (MANAGEMENT-CLIENT-S011)

- **GIVEN** Client App Router route manifest を検査できる
- **WHEN** public page routes と route handlers を列挙する
- **THEN** page routes は `/`、`/agents`、`/settings`、および `/agents/[agentId]` 配下の `overview`、`threads`、`events`、`runs`、`schedules`、`integrations`、`settings` に対応する routes に限定される
- **AND** `/agents/new`、`/agents/[agentId]/tools`、`/agents/[agentId]/compactions` は public page route として存在しない
- **AND** `/api/client/*`、`/api/agent*`、Agent REST proxy paths、arbitrary Agent RPC forwarding handlers は存在しない

### Requirement: Demo-free management experience

Management Client は `hello` または `users` demonstration experiences を含めずに Agent management routes を表示 MUST。

**Customer Context**

Agent 管理者は Agent registry、Agent RPC origin、credential reference、選択中 Agent の運用状態を開始点にしたい。実演用の `hello` や `users` 画面が残ると、management Client の責務が business demo と混同され、Agent 管理 UI の情報設計が崩れる。

**Requirement**

Client UI routes は Agent registry、Agent registration action、Global Settings、Agent detail Overview、Threads、Events、Runs、Schedules、Integrations、Settings foundations 用の Agent management shell routes を表示 SHALL。

Client UI は `hello` または `users` demonstration pages、navigation items、mock handlers、tests を production management experiences として表示 MUST NOT。

Active workspace は management Client UI と server-side execution を `packages/client/**` に集約 SHALL し、demonstration UI package graph を documented route surface、workspace package patterns、lint boundary elements として残して MUST NOT。

Initial empty states は users に `agent_id`、Agent RPC origin、credential reference の登録を案内 SHALL し、Agent detail section shells は Agent-domain snapshots を Client D1 に永続化せずに render SHALL。

#### Scenario: Management routes contain no demo navigation (MANAGEMENT-CLIENT-S007)

- **GIVEN** Client route configuration と primary navigation を検査できる
- **WHEN** available management routes を列挙する
- **THEN** Agent registry、Global Settings、Agent detail Overview、Threads、Events、Runs、Schedules、Integrations、Settings shell routes が存在する
- **AND** `New Agent`、`Tools`、`Compactions` は top-level navigation item または independent management route として存在しない
- **AND** `hello` と `users` demonstration routes は存在しない
- **AND** Client route graph は demonstration UI package graph へ依存しない
