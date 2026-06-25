## MODIFIED Requirements

### Requirement: 管理対象 Agent list と registration UI

Agent Management UI は管理対象 Agent 一覧、登録 flow、Agent selection flow を `Agents` 画面で提供 SHALL。

**Customer Context**

Agent 管理者は、登録済み Agent を一覧し、表示名、pin、並び順、最終閲覧、credential 状態を確認し、Agent 接続を追加して選択できる UI を必要としている。CLI や直接 RPC を知らなくても管理を開始でき、Agent 選択の入口が分散しないことが重要である。

**要件**

- Client UI は表示名、Agent ID、RPC origin、pin 状態、並び順、最終閲覧時刻、connection/credential 状態を表示する管理対象 Agent 一覧画面を提供 MUST。
- Client UI は table-only presentation ではなく、card / summary-first presentation で Agent 一覧を表示 MUST。
- Client UI は Agent ID、RPC origin、表示名、credential 参照入力、initial model policy を検証する Agent registration flow を `Agents` 画面内 action として提供 MUST。
- Client UI は Agent selection を `Agents` 画面内 action として提供 MUST。選択 action は Server Action で最終閲覧 metadata を更新し、selected-Agent area へ遷移 SHALL。
- Client UI は台帳変更に Server Actions または Server Components を使用 MUST し、Agent credential を Client 側 JavaScript に露出して MUST NOT。

#### Scenario: Agent list が registry 表示と並び順を支援する (AGENT-MANAGEMENT-UI-S001)

- **GIVEN** Client D1 に pin と並び順メタデータを持つ複数の管理対象 Agent が含まれている
- **WHEN** 運用者が Agent 一覧画面を開く
- **THEN** pinned Agent と並び順が card / summary-first の一覧に反映される
- **AND** Agent を選択すると、サーバー側 action を通じて最終閲覧メタデータが更新される

#### Scenario: Add Agent フォームが connection メタデータをアクセシブルに検証する (AGENT-MANAGEMENT-UI-S002)

- **GIVEN** 運用者が Agents 画面の Agent registration action を開いている
- **WHEN** 必須 field が不足している、または RPC origin が不正である
- **THEN** フォームは対応する入力項目に関連付けられた accessible な検証エラーを表示する
- **AND** 検証がサーバー側で通過するまで台帳記録は作成されない
- **AND** Agent credential 値、Provider credential、生 token は Browser payload に含まれない

#### Scenario: Agents screen owns Agent registration and selection (AGENT-MANAGEMENT-UI-S010)

- **GIVEN** 運用者が Management Client の Global area を利用している
- **WHEN** `/agents` 画面を開く
- **THEN** Agent list、Agent registration action、Agent selection action が同じ画面で表示される
- **AND** Agent card は status、credential hint、last-opened、pin state を色だけでなく label と icon で表示する

### Requirement: Thread Event Run と Compaction exploration UI

Client UI は Thread、Event、Run、Compaction、Memory の exploration view を Agent-scoped detail/metadata として公開 SHALL。

**Customer Context**

Agent の自律判断を運用するには、Thread、Event、Run、Compaction、Handoff、History、Memory をたどって「何が起きたか」「なぜそう判断したか」を確認できる画面が必要である。Compaction を Thread/Memory 文脈の中で扱うことで、運用者は同じ Agent-owned history を一貫した因果関係で確認できる。

**要件**

- Client UI は Thread key、状態、Section、latest Event、latest Run、Memory/Compaction 要約を持つ Thread 一覧/詳細画面を提供 MUST。
- Client UI は sequence、type、source、状態、スナップショット、判断出力、因果 link を持つ Event と Run の view を提供 MUST。
- Client UI は latest Handoff、History 参照、Memory 版、provenance、rebase 状態を公開する Compaction と Memory の view を、Overview または Threads detail の metadata として提供 MUST。
- これらの画面のすべてのデータは Agent RPC からサーバー側で取得 MUST し、Agent domain スナップショットを Client D1 に保存せずに描画 MUST。

#### Scenario: Thread Event Run と Compaction views が Agent-owned history を表示する (AGENT-MANAGEMENT-UI-S005)

- **GIVEN** Agent が Event、Run、Compaction、Memory を持つ Thread を有している
- **WHEN** 運用者が Threads、Events、Runs、Overview の Agent-scoped views を移動する
- **THEN** 各 view は sequence、状態、因果 link、provenance を持つ順序付き Agent-owned 記録を表示する
- **AND** Compaction と Memory は Overview または Threads detail の metadata として表示される
- **AND** ページングと絞り込み条件は Agent/Thread scope を維持する

## ADDED Requirements

### Requirement: Selected-Agent screen set and left-sidebar state

Client UI は selected-Agent area として、選択中 Agent に属する Overview、Threads、Events、Runs、Schedules、Integrations、Settings を left sidebar で提供 SHALL。

**Customer Context**

管理者は「現在どの Agent を見ているか」と「全体設定か Agent 設定か」をすぐに識別したい。Agent 未選択でも Agent-scoped 画面が操作できるように見えると、操作対象の誤解や認可境界の混同が起きる。

**Requirement**

Selected-Agent area は登録済み Agent が選択されている場合に active SHALL。

Selected-Agent area は `Overview`、`Threads`、`Events`、`Runs`、`Schedules`、`Integrations`、`Settings` を left sidebar の Agent-scoped navigation item として表示 SHALL。

Agent 未選択時は selected-Agent navigation area に `Agents` 画面への guidance を表示 MUST。

Topbar は selected Agent display と `Agents` 画面への導線を提供 SHALL。

#### Scenario: Selected-Agent screens activate only for selected Agent (AGENT-MANAGEMENT-UI-S011)

- **GIVEN** 運用者が registered Agent を選択している
- **WHEN** selected-Agent area の navigation を表示する
- **THEN** Overview、Threads、Events、Runs、Schedules、Integrations、Settings が left sidebar に表示される
- **AND** 各 screen は選択中 Agent の Agent ID に scope された data だけを表示する
- **AND** Agent 未選択時は `Agents` 画面への guidance が表示される

### Requirement: Tools and Compactions as Agent-scoped detail metadata

Client UI は Tool と Compaction を Agent-scoped screen の detail/metadata として提供 SHALL。

**Customer Context**

管理者は Tool invocation、Tool approval、Tool catalog、Compaction、History、Memory を確認する必要がある。Run、Thread、Integration、Overview の文脈に沿って表示することで、因果関係と所有境界を理解しやすくなる。

**Requirement**

Tool catalog は Integrations detail または Agent Settings に表示 SHALL。

Tool invocation と Tool approval は Runs detail、Events detail、Overview approval queue のいずれかの Agent-scoped context に表示 SHALL。

Compaction、Handoff、History、Memory metadata は Overview summary または Threads detail に表示 SHALL。

All Tool and Compaction data SHALL be fetched server-side through generated Agent RPC usage and SHALL NOT be persisted as Client D1 Agent-domain snapshots.

#### Scenario: Tools and Compactions are shown inside Agent-scoped context (AGENT-MANAGEMENT-UI-S012)

- **GIVEN** 選択中 Agent が ToolInvocation と Compaction を持っている
- **WHEN** 運用者が Overview、Threads detail、Events detail、Runs detail、Integrations detail、Settings を確認する
- **THEN** Tool catalog、Tool invocation、Tool approval は Integrations、Runs、Events、Overview、Settings の Agent-scoped context に表示される
- **AND** Compaction、Handoff、History、Memory metadata は Overview または Threads detail に表示される

### Requirement: Global Settings UI

Client UI は Client-wide settings を Global area の `Global Settings` screen で提供 SHALL。

**Customer Context**

管理者は Agent を選択していない状態でも、Client 全体の表示設定、runtime/config 状態、credential reference policy、security boundary guidance を確認したい。これらを Agent-scoped Settings に混ぜると、Client-wide concern と Agent-owned concern が混同される。

**Requirement**

Global Settings は Global area screen として `/settings` に表示 SHALL。

Global Settings は Client-wide の runtime/config status、display preference、credential reference policy summary、security boundary guidance を表示 SHALL。

Global Settings は Agent-specific configuration、Agent credential secret、Agent-owned Threads、Events、Runs、Schedules、ToolInvocations、Integrations、Compactions、raw observability logs を表示または保存 MUST NOT。

Global Settings は Client D1 に Agent-domain snapshot table を追加 MUST NOT。

#### Scenario: Global Settings handles only Client-wide settings (AGENT-MANAGEMENT-UI-S013)

- **GIVEN** 運用者が Global area を利用している
- **WHEN** `/settings` を開く
- **THEN** Client-wide runtime/config status、display preference、credential reference policy summary、security boundary guidance が表示される
- **AND** Agent-specific data は表示されず、Agent-scoped Settings への案内だけが表示される
- **AND** Client D1 は managed Agent records と credential references に限定され、Agent-domain snapshot table は存在しない

### Requirement: Card-first states and accessibility

Client UI は Management Client screens を card / summary-first で表示し、すべての主要状態、accessibility、secret-safe copy を提供 SHALL。

**Customer Context**

管理者は Agent の状態を素早く判断し、失敗や権限不足のときに次の行動を理解したい。table-only screen や理由のない disabled state は、運用時の判断を遅らせる。色だけの状態表示や raw error の露出は accessibility と security の両方を損なう。

**Requirement**

Management Client screens は card / summary-first を基本 presentation とし、高密度 table は detail expansion または比較に必要な範囲に限定 SHALL。

All screens SHALL define loading、empty、error、permission-denied、disabled、optimistic/pending、filter-empty states where applicable.

Selected-Agent screens SHALL define selected-agent-required state.

All error messages SHALL be secret-safe and MUST NOT expose raw stack traces、raw token、private key、Provider secret、signing material、raw Agent RPC payload、raw prompt、raw completion、raw reasoning.

Status indicators SHALL use label plus icon plus visual tone and MUST NOT rely on color alone.

Keyboard navigation、focus visible、skip-to-content、`aria-current`、dialog focus trap、`prefers-reduced-motion` support SHALL be provided where applicable.

#### Scenario: Screens expose actionable states without leaking secrets (AGENT-MANAGEMENT-UI-S014)

- **GIVEN** 運用者が Agents、Global Settings、Overview、Threads、Events、Runs、Schedules、Integrations、Settings を利用している
- **WHEN** loading、empty、error、permission-denied、disabled、pending、filter-empty、selected-agent-required states が発生する
- **THEN** 各 screen は次の行動が分かる copy、keyboard reachable controls、accessible status labels を表示する
- **AND** raw stack traces、credentials、tokens、Provider secrets、raw Agent RPC payload、raw prompt/completion/reasoning は Browser payload、HTML、JavaScript bundle、storage、user-facing copy に含まれない
