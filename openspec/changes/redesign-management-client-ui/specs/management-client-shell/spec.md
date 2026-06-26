## MODIFIED Requirements

### Requirement: サーバー側 Management UI shell

Management Client shell は、Agent credential や直接 Agent RPC 呼び出しをブラウザ code へ露出せず、サーバー側 Agent management shell を描画 MUST。

**顧客文脈**

Agent 管理者はブラウザから管理画面を開き、管理対象 Agent の登録状態と選択中 Agent の運用状態を迷わず確認したい。一方で Agent credential や Agent RPC への直接呼び出し code がブラウザに渡ると、認証情報の露出や権限境界の混同が起きる。

**要件**

`packages/client` は、Cloudflare-compatible Next.js adapter を通じて Cloudflare Workers に deploy される Next.js App Router management UI である SHALL。

ブラウザ可視 UI は、Client pages とサーバー側 execution boundaries を通じて描画 SHALL。

Agent RPC 呼び出しは、generated Protobuf RPC client code を使う Client サーバー側 modules から発生 SHALL。

ブラウザへ配信される bundles は、Agent credential material または直接 Agent RPC 呼び出し logic を含んで MUST NOT。

Server Actions と Server Components は内部 UI execution boundaries のみ SHALL であり、public Agent domain APIs として扱って MUST NOT。

Client App Router は `/`、`/agents`、`/settings`、`/agents/[agentId]`、`/agents/[agentId]/threads`、`/agents/[agentId]/events`、`/agents/[agentId]/runs`、`/agents/[agentId]/schedules`、`/agents/[agentId]/integrations`、`/agents/[agentId]/settings` の management shell routes を含む SHALL。

`/` は `/agents` へサーバー側 redirect される SHALL。

Management shell の Topbar、Sidebar、mobile drawer、Breadcrumb、Agent chip、action menu、loading/error states は shadcn/ui local components を合成して実装 SHALL。

Management shell implementation はコピー済み公式 shadcn/ui source を参照し、公式 sidebar / sheet / breadcrumb / avatar / dropdown / tooltip component と関連する公式 block patterns を local source から使用 SHALL。

Management shell は control-room 独自 CSS、custom gradient、custom glow、bespoke typography、legacy visual class に依存して MUST NOT。

全体 navigation area は `Agents` と `Global Settings` を表示 SHALL。

選択中 Agent navigation area は、登録済み Agent が選択されている場合に `Overview`、`Threads`、`Events`、`Runs`、`Schedules`、`Integrations`、`Settings` を Agent 文脈 navigation として表示 SHALL。

Agent 未選択時または未登録 Agent context では、選択中 Agent navigation area は操作対象 Agent の選択を促す guidance を表示 SHALL。

Agent registration は `Agents` 画面内 action として提供 SHALL。

ToolInvocation、Tool catalog、Tool approval、Compaction、History、Handoff、Memory metadata は Agent 文脈の Overview、Threads、Events、Runs、Integrations、Settings の detail/metadata として表示 SHALL。

#### Scenario: ブラウザ利用者に Agent registry shell を描画する (MANAGEMENT-CLIENT-SHELL-S001)

- **GIVEN** ブラウザ利用者が Management Client を開く
- **WHEN** `/agents` route が描画される
- **THEN** page は Agent registry shell、empty-state guidance、Agent registration action、Agent selection affordance、Global Settings への navigation を表示する
- **AND** selected-Agent navigation は Agent 未選択時に選択 guidance を表示する

#### Scenario: ブラウザ bundle が Agent RPC を直接呼び出さない (MANAGEMENT-CLIENT-SHELL-S002)

- **GIVEN** Client production build が利用できる
- **WHEN** ブラウザへ配信される chunks を検査する
- **THEN** Agent RPC origin invocation code と Agent credential material はそれらの chunks に存在しない
- **AND** Agent RPC client construction はサーバー側 modules からのみ到達可能である

#### Scenario: 左サイドバーが全体 navigation と選択中 Agent navigation を分離する (MANAGEMENT-CLIENT-SHELL-S009)

- **GIVEN** ブラウザ利用者が Management Client を開き、Agent を選択していない
- **WHEN** management shell が描画される
- **THEN** left sidebar は全体領域として `Agents` と `Global Settings` を表示する
- **AND** 選択中 Agent 領域は Agent 選択への guidance を表示する

#### Scenario: 登録済み Agent context で選択中 Agent 領域が有効になる (MANAGEMENT-CLIENT-SHELL-S010)

- **GIVEN** ブラウザ利用者が Client D1 に登録済みの Agent を選択している
- **WHEN** selected-Agent route が描画される
- **THEN** left sidebar は `Overview`、`Threads`、`Events`、`Runs`、`Schedules`、`Integrations`、`Settings` を Agent 文脈 navigation として表示する
- **AND** Topbar は選択中 Agent の表示と `Agents` 画面への導線を提供する

#### Scenario: Shell が shadcn/ui components と標準 theme を使う (MANAGEMENT-CLIENT-SHELL-S011)

- **GIVEN** Management Client shell source と global CSS を検査できる
- **WHEN** Topbar、Sidebar、mobile navigation、Breadcrumb、selected Agent chip、shell states を確認する
- **THEN** shell は shadcn/ui local components を合成している
- **AND** shell が参照する shadcn registry items はコピー済み local source と copy manifest に記録されている
- **AND** global CSS は shadcn/ui default CSS variables / base layer に限定され、control-room custom visual classes、custom palette tokens、gradient/glow background を含まない

## REMOVED Requirements

### Requirement: Demo-free management experience

**理由**

この requirement は、過去の demo surface が存在しないことを product contract として検証する目的を含んでいた。Management Client UI redesign の契約は、旧 surface の不在ではなく、管理者が利用する現在の supported management shell、Agent registry、selected-Agent navigation、サーバー側 security boundary を定義する。

**移行**

Archive sync ではこの旧 surface 不在目的の requirement を main spec から削除する。実装中に古い画面や導線を整理する必要がある場合でも、automated tests と specs は supported management shell と enduring security boundary を検証対象にする。
