## MODIFIED Requirements

### Requirement: Server-side management UI shell

Management Client は、Agent credential や direct Agent RPC invocation を Browser code へ露出せず、server-side Agent management shell を render MUST。

**Customer Context**

Agent 管理者は Browser から管理画面を開き、Agent 一覧、Client 全体設定、選択中 Agent の状態を迷わず操作したい。一方で Agent credential や Agent RPC への直接呼び出しコードが Browser に渡ると、認証情報の露出や権限境界の混同が起きる。

**Requirement**

`packages/client` は、Cloudflare-compatible Next.js adapter を通じて Cloudflare Workers に deploy される Next.js App Router management UI SHALL。

Browser-visible UI は、Client pages と server-side execution boundaries を通じて render SHALL。

Agent RPC invocation は、generated Protobuf RPC client code を使う Client server-side modules から発生 SHALL。

Browser-delivered bundles は、Agent credential material または direct Agent RPC invocation logic を含んで MUST NOT。

Server Actions と Server Components は internal UI execution boundaries のみ SHALL であり、public Agent domain APIs として扱って MUST NOT。

Client App Router は `/agents`、`/global-settings`、`/agents/new` registration flow、`/agents/[agentId]`、`/agents/[agentId]/threads`、`/agents/[agentId]/events`、`/agents/[agentId]/runs`、`/agents/[agentId]/schedules`、`/agents/[agentId]/integrations`、`/agents/[agentId]/settings` の shell routes を含む SHALL。

`/agents/new` registration flow は `Agents` screen action から到達する SHALL。

#### Scenario: Agent registry shell renders supported global entry (MANAGEMENT-CLIENT-SHELL-S001)

- **GIVEN** browser user が management Client を開く
- **WHEN** `/agents` route が render される
- **THEN** page は Agent registry shell、empty-state guidance、Agent registration action、and Agent detail section affordances を表示する
- **AND** global navigation は `Agents` and `Global Settings` を表示する

#### Scenario: Browser bundles do not call Agent RPC directly (MANAGEMENT-CLIENT-SHELL-S002)

- **GIVEN** Client production build が利用できる
- **WHEN** browser-delivered chunks を検査する
- **THEN** Agent RPC origin invocation code と Agent credential material はそれらの chunks に存在しない
- **AND** Agent RPC client construction は server-side modules からのみ到達可能である

### Requirement: Demo-free management experience

Management Client は Agent management routes を supported product surface として表示 MUST。

**Customer Context**

Agent 管理者は Agent registry、Agent RPC origin、credential reference、selected-Agent workspace を開始点にしたい。管理画面が Agent 運用に必要な route graph と navigation を一貫して示すことで、Client 全体設定と Agent 固有操作を区別できる。

**Requirement**

Client UI routes は Agent registry、registration action、Global Settings、detail overview、threads、events、runs、schedules、integrations、settings foundations 用の Agent management shell routes を表示 SHALL。

Active workspace は management Client UI と server-side execution を `packages/client/**` に集約 SHALL。

Initial empty states は users に `agent_id`、Agent RPC origin、credential reference の登録を案内 SHALL し、Agent detail section shells は Agent-domain snapshots を Client D1 に永続化せずに render SHALL。

Client route graph は supported management shell routes と internal Server Action boundaries を通じて UI を提供 SHALL。

#### Scenario: Management routes expose supported Agent sections (MANAGEMENT-CLIENT-SHELL-S007)

- **GIVEN** Client route configuration と primary navigation を検査できる
- **WHEN** available management routes を列挙する
- **THEN** Agent registry、registration action、Global Settings、detail overview、threads、events、runs、schedules、integrations、settings shell routes が存在する
- **AND** Client route graph は management Client UI と server-side execution boundaries に集約される

## ADDED Requirements

### Requirement: Scoped left-side navigation shell

Management Client shell は、global navigation と selected-Agent navigation を左サイドメニューで分離 SHALL。

**Customer Context**

管理者は複数 Agent を扱うため、現在の操作が Client 全体なのか、選択中 Agent だけなのかを常に判別できる必要がある。水平タブや混在した menu では、Agent を選んでいない状態と Agent を選んだ状態の違いが分かりにくい。

**Requirement**

Management Client は primary navigation を left side menu として表示 SHALL。

Global navigation は `Agents` and `Global Settings` のみを含む SHALL。

Selected-Agent navigation は Agent が選択されている場合に `Overview`、`Threads`、`Events`、`Runs`、`Schedules`、`Integrations`、`Settings` を表示 SHALL。

Agent が選択されていない場合、selected-Agent navigation は hidden または disabled semantics を持つ SHALL。

Left side menu は desktop で persistent navigation として表示 SHALL。Narrow viewport では accessible disclosure または Sheet navigation として表示 SHALL。

#### Scenario: Global navigation renders before an Agent is selected (MANAGEMENT-CLIENT-SHELL-S009)

- **GIVEN** 管理者が Agent 未選択状態で Management Client を開いている
- **WHEN** left side menu が render される
- **THEN** global navigation は `Agents` and `Global Settings` を表示する
- **AND** selected-Agent navigation は hidden または disabled semantics を持つ

#### Scenario: Selected-Agent navigation renders after Agent selection (MANAGEMENT-CLIENT-SHELL-S010)

- **GIVEN** 管理者が managed Agent を選択している
- **WHEN** left side menu が render される
- **THEN** selected-Agent navigation は `Overview`、`Threads`、`Events`、`Runs`、`Schedules`、`Integrations`、`Settings` を Agent identity とともに表示する
- **AND** global navigation は引き続き `Agents` and `Global Settings` へ到達できる

#### Scenario: New Agent is an Agents screen action (MANAGEMENT-CLIENT-SHELL-S011)

- **GIVEN** 管理者が `Agents` screen を開いている
- **WHEN** Agent registration を開始する
- **THEN** `Agents` screen 内の primary action が registration flow を開く
- **AND** registration flow は Agent ID、RPC origin、credential reference、and model policy inputs を accessible form として表示する

### Requirement: Contextual selected-Agent operational details

Management Client shell は selected-Agent navigation を enduring section labels に限定し、Tool と Compaction information を relevant Agent scoped screens の contextual detail として表示 SHALL。

**Customer Context**

管理者は ToolInvocation や Compaction を単独の目的地としてではなく、Run、Event、Thread、Overview、Settings の判断材料として確認したい。Agent scope の中で関連文脈に沿って detail を表示することで、何が起きたかとどの判断に紐づくかを追跡しやすくなる。

**Requirement**

Selected-Agent navigation labels は `Overview`、`Threads`、`Events`、`Runs`、`Schedules`、`Integrations`、`Settings` に限定 SHALL。

Tool catalog、ToolInvocation、approval state、and Tool result context は `Runs`、`Events`、or `Settings` の contextual detail として表示 SHALL。

ThreadCompaction、Handoff、History reference、Memory version、and provenance context は `Threads`、`Events`、or `Overview` の contextual detail として表示 SHALL。

Contextual detail は selected Agent scope を維持 SHALL。

#### Scenario: Tool and Compaction details are contextual to selected-Agent screens (MANAGEMENT-CLIENT-SHELL-S012)

- **GIVEN** selected Agent が ToolInvocation、Tool catalog、ThreadCompaction、Handoff、History reference、or Memory version を持つ
- **WHEN** 管理者が Runs、Events、Settings、Threads、or Overview を開く
- **THEN** relevant Tool information は Runs、Events、or Settings の contextual detail として表示される
- **AND** relevant Compaction information は Threads、Events、or Overview の contextual detail として表示される
- **AND** each detail keeps the selected Agent scope visible

### Requirement: Global Settings remains Client-wide

Global Settings は Client 全体設定だけを扱い、selected-Agent context を含めて MUST NOT。

**Customer Context**

管理者は Client-wide preference と Agent-specific configuration を別々に理解したい。Global Settings に Agent 固有情報が混ざると、どの Agent に影響する操作か判断できなくなる。

**Requirement**

`Global Settings` screen は Client-wide preferences、display settings、operator preferences、credential vault references、and Management Client operational settings を扱う SHALL。

`Global Settings` screen は selected Agent identity、Agent config update、Agent credential rotation、Agent schedules、Agent integrations、Agent Tool catalog、or Agent model policy update controls を含んで MUST NOT。

Selected-Agent `Settings` screen は Agent scoped configuration、model policy、credential rotation、Tool catalog、and Agent-specific operational settings を扱う SHALL。

#### Scenario: Global Settings shows only Client-wide controls (MANAGEMENT-CLIENT-SHELL-S013)

- **GIVEN** 管理者が `Global Settings` screen を開いている
- **WHEN** settings controls と page context を検査する
- **THEN** screen は Client-wide preferences と Management Client operational settings だけを表示する
- **AND** selected-Agent identity and Agent scoped actions は表示されない
