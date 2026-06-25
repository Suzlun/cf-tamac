## MODIFIED Requirements

### Requirement: Server-side management UI shell

Management Client shell は、Agent credential や direct Agent RPC invocation を Browser code へ露出せず、server-side Agent management shell を render MUST。

**Customer Context**

Agent 管理者は Browser から管理画面を開き、管理対象 Agent の登録状態と選択中 Agent の運用状態を迷わず確認したい。一方で Agent credential や Agent RPC への直接呼び出しコードが Browser に渡ると、認証情報の露出や権限境界の混同が起きる。

**Requirement**

`packages/client` は、Cloudflare-compatible Next.js adapter を通じて Cloudflare Workers に deploy される Next.js App Router management UI SHALL。

Browser-visible UI は、Client pages と server-side execution boundaries を通じて render SHALL。

Agent RPC invocation は、generated Protobuf RPC client code を使う Client server-side modules から発生 SHALL。

Browser-delivered bundles は、Agent credential material または direct Agent RPC invocation logic を含んで MUST NOT。

Server Actions と Server Components は internal UI execution boundaries のみ SHALL であり、public Agent domain APIs として扱って MUST NOT。

Client App Router は `/`、`/agents`、`/settings`、`/agents/[agentId]`、`/agents/[agentId]/threads`、`/agents/[agentId]/events`、`/agents/[agentId]/runs`、`/agents/[agentId]/schedules`、`/agents/[agentId]/integrations`、`/agents/[agentId]/settings` の management shell routes を含む SHALL。

`/` は `/agents` へ server-side redirect される SHALL。

Global navigation area は `Agents` と `Global Settings` を表示 SHALL。

Selected-Agent navigation area は、登録済み Agent が選択されている場合に `Overview`、`Threads`、`Events`、`Runs`、`Schedules`、`Integrations`、`Settings` を Agent-scoped navigation として表示 SHALL。

Agent 未選択時または未登録 Agent context では、Selected-Agent navigation area は操作対象 Agent の選択を促す guidance を表示 SHALL。

Agent registration は `Agents` 画面内 action として提供 SHALL。

ToolInvocation、Tool catalog、Tool approval、Compaction、History、Handoff、Memory metadata は Agent-scoped Overview、Threads、Events、Runs、Integrations、Settings の detail/metadata として表示 SHALL。

#### Scenario: Agent registry shell renders for a browser user (MANAGEMENT-CLIENT-SHELL-S001)

- **GIVEN** browser user が management Client を開く
- **WHEN** `/agents` route が render される
- **THEN** page は Agent registry shell、empty-state guidance、Agent registration action、Agent selection affordance、Global Settings への navigation を表示する
- **AND** selected-Agent navigation は Agent 未選択時に選択 guidance を表示する

#### Scenario: Browser bundles do not call Agent RPC directly (MANAGEMENT-CLIENT-SHELL-S002)

- **GIVEN** Client production build が利用できる
- **WHEN** browser-delivered chunks を検査する
- **THEN** Agent RPC origin invocation code と Agent credential material はそれらの chunks に存在しない
- **AND** Agent RPC client construction は server-side modules からのみ到達可能である

#### Scenario: Left sidebar separates global and selected-Agent navigation (MANAGEMENT-CLIENT-SHELL-S009)

- **GIVEN** browser user が management Client を開き、Agent を選択していない
- **WHEN** management shell が render される
- **THEN** left sidebar は Global area として `Agents` と `Global Settings` を表示する
- **AND** Selected-Agent area は Agent 選択への guidance を表示する

#### Scenario: Selected-Agent area activates for registered Agent context (MANAGEMENT-CLIENT-SHELL-S010)

- **GIVEN** browser user が Client D1 に登録済みの Agent を選択している
- **WHEN** selected-Agent route が render される
- **THEN** left sidebar は `Overview`、`Threads`、`Events`、`Runs`、`Schedules`、`Integrations`、`Settings` を Agent-scoped navigation として表示する
- **AND** Topbar は選択中 Agent の表示と `Agents` 画面への導線を提供する

## REMOVED Requirements

### Requirement: Demo-free management experience

**Reason**

この requirement は、過去の demo surface が存在しないことを product contract として検証する目的を含んでいた。Management Client UI redesign の契約は、旧 surface の不在ではなく、管理者が利用する現在の supported management shell、Agent registry、selected-Agent navigation、server-side security boundary を定義する。

**Migration**

Archive sync ではこの旧 surface 不在目的の requirement を main spec から削除する。実装中に古い画面や導線を整理する必要がある場合でも、automated tests と specs は supported management shell と enduring security boundary を検証対象にする。
