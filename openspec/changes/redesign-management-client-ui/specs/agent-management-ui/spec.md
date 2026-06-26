## MODIFIED Requirements

### Requirement: 管理対象 Agent 一覧と登録 UI

Agent Management UI は管理対象 Agent 一覧、登録 flow、Agent selection flow を `Agents` 画面で提供 SHALL。

**顧客文脈**

Agent 管理者は、登録済み Agent を一覧し、表示名、pin、並び順、最終閲覧、credential 状態を確認し、Agent 接続を追加して選択できる UI を必要としている。CLI や直接 RPC を知らなくても管理を開始でき、Agent 選択の入口が分散しないことが重要である。

**要件**

- Client UI は表示名、Agent ID、RPC origin、pin 状態、並び順、最終閲覧時刻、connection/credential 状態を表示する管理対象 Agent 一覧画面を提供 MUST。
- Client UI は table-only presentation ではなく、shadcn/ui `Card` / `Badge` / `Button` / `DropdownMenu` / `Avatar` を合成したカード・要約優先 presentation で Agent 一覧を表示 MUST。
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

**顧客文脈**

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

### Requirement: 選択中 Agent 画面群と左サイドバー状態

Client UI は選択中 Agent 領域として、選択中 Agent に属する Overview、Threads、Events、Runs、Schedules、Integrations、Settings を left sidebar で提供 SHALL。

**顧客文脈**

管理者は「現在どの Agent を見ているか」と「全体設定か Agent 設定か」をすぐに識別したい。Agent 未選択でも Agent-scoped 画面が操作できるように見えると、操作対象の誤解や認可境界の混同が起きる。

**要件**

選択中 Agent 領域は登録済み Agent が選択されている場合に active SHALL。

選択中 Agent 領域は `Overview`、`Threads`、`Events`、`Runs`、`Schedules`、`Integrations`、`Settings` を left sidebar の Agent 文脈 navigation item として表示 SHALL。

Agent 未選択時は selected-Agent navigation area に `Agents` 画面への guidance を表示 MUST。

Topbar は selected Agent display と `Agents` 画面への導線を提供 SHALL。

#### Scenario: 選択済み Agent の場合だけ選択中 Agent 画面が有効になる (AGENT-MANAGEMENT-UI-S011)

- **GIVEN** 運用者が registered Agent を選択している
- **WHEN** selected-Agent area の navigation を表示する
- **THEN** Overview、Threads、Events、Runs、Schedules、Integrations、Settings が left sidebar に表示される
- **AND** 各 screen は選択中 Agent の Agent ID に scope された data だけを表示する
- **AND** Agent 未選択時は `Agents` 画面への guidance が表示される

### Requirement: Tool と Compaction を Agent 文脈の詳細メタデータとして扱う

Client UI は Tool と Compaction を Agent 文脈 screen の detail/metadata として提供 SHALL。

**顧客文脈**

管理者は Tool invocation、Tool approval、Tool catalog、Compaction、History、Memory を確認する必要がある。Run、Thread、Integration、Overview の文脈に沿って表示することで、因果関係と所有境界を理解しやすくなる。

**要件**

Tool catalog は Integrations detail または Agent Settings に表示 SHALL。

Tool invocation と Tool approval は Runs detail、Events detail、Overview approval queue のいずれかの Agent 文脈に表示 SHALL。

Compaction、Handoff、History、Memory metadata は Overview summary または Threads detail に表示 SHALL。

すべての Tool と Compaction data は generated Agent RPC usage を通じてサーバー側で取得 SHALL し、Client D1 の Agent-domain snapshots として永続化して SHALL NOT。

#### Scenario: Tool と Compaction を Agent 文脈内に表示する (AGENT-MANAGEMENT-UI-S012)

- **GIVEN** 選択中 Agent が ToolInvocation と Compaction を持っている
- **WHEN** 運用者が Overview、Threads detail、Events detail、Runs detail、Integrations detail、Settings を確認する
- **THEN** Tool catalog、Tool invocation、Tool approval は Integrations、Runs、Events、Overview、Settings の Agent 文脈に表示される
- **AND** Compaction、Handoff、History、Memory metadata は Overview または Threads detail に表示される

### Requirement: Global Settings UI

Client UI は Client-wide settings を全体領域の `Global Settings` screen で提供 SHALL。

**顧客文脈**

管理者は Agent を選択していない状態でも、Client 全体の表示設定、runtime/config 状態、credential reference policy、security boundary guidance を確認したい。これらを Agent-scoped Settings に混ぜると、Client-wide concern と Agent-owned concern が混同される。

**要件**

Global Settings は全体領域 screen として `/settings` に表示 SHALL。

Global Settings は Client-wide の runtime/config status、display preference、credential reference policy summary、security boundary guidance を表示 SHALL。

Global Settings は Agent-specific configuration、Agent credential secret、Agent-owned Threads、Events、Runs、Schedules、ToolInvocations、Integrations、Compactions、raw observability logs を表示または保存 MUST NOT。

Global Settings は Client D1 に Agent-domain snapshot table を追加 MUST NOT。

#### Scenario: Global Settings が Client-wide settings だけを扱う (AGENT-MANAGEMENT-UI-S013)

- **GIVEN** 運用者が全体領域を利用している
- **WHEN** `/settings` を開く
- **THEN** Client-wide runtime/config status、display preference、credential reference policy summary、security boundary guidance が表示される
- **AND** Agent-specific data は表示されず、Agent-scoped Settings への案内だけが表示される
- **AND** Client D1 は managed Agent records と credential references に限定され、Agent-domain snapshot table は存在しない

### Requirement: カード優先の状態とアクセシビリティ

Client UI は Management Client screens をカード・要約優先で表示し、すべての主要状態、accessibility、secret-safe copy を提供 SHALL。

**顧客文脈**

管理者は Agent の状態を素早く判断し、失敗や権限不足のときに次の行動を理解したい。table-only screen や理由のない disabled state は、運用時の判断を遅らせる。色だけの状態表示や raw error の露出は accessibility と security の両方を損なう。

**要件**

Management Client screens はカード・要約優先を基本 presentation とし、高密度 table は detail expansion または比較に必要な範囲に限定 SHALL。

すべての Management Client screens は `packages/client/src/components/ui/**` 配下の local shadcn/ui components、またはそれらを合成する domain components で実装 SHALL。

実装は screen-specific implementation を始める前に、公式 shadcn/ui core registry items、docs-only component recipes、公式 Blocks、公式 Charts を local source へコピー SHALL。生成される copy manifest は source counts、copied paths、dependencies、registry dependencies、および空でない `copy-blocked` blocker を含む SHALL。

Management Client screens は shadcn/ui 標準のシンプルな neutral design を使用 SHALL し、bespoke control-room CSS、custom palette tokens、custom gradients、glow shadows、custom typography systems に依存して MUST NOT。

すべての screens は該当する場合に loading、empty、error、permission-denied、disabled、optimistic/pending、filter-empty states を定義 SHALL。

Selected-Agent screens は selected-agent-required state を定義 SHALL。

すべての error messages は secret-safe である SHALL。raw stack traces、raw token、private key、Provider secret、signing material、raw Agent RPC payload、raw prompt、raw completion、raw reasoning を露出して MUST NOT。

Status indicators は label、icon、visual tone を併用 SHALL し、色だけに依存して MUST NOT。

Keyboard navigation、focus visible、skip-to-content、`aria-current`、dialog focus trap、`prefers-reduced-motion` support SHALL be provided where applicable.

#### Scenario: Screens が秘密を漏らさず行動可能な状態を示す (AGENT-MANAGEMENT-UI-S014)

- **GIVEN** 運用者が Agents、Global Settings、Overview、Threads、Events、Runs、Schedules、Integrations、Settings を利用している
- **WHEN** loading、empty、error、permission-denied、disabled、pending、filter-empty、selected-agent-required states が発生する
- **THEN** 各 screen は次の行動が分かる copy、keyboard reachable controls、accessible status labels を表示する
- **AND** raw stack traces、credentials、tokens、Provider secrets、raw Agent RPC payload、raw prompt/completion/reasoning は Browser payload、HTML、JavaScript bundle、storage、user-facing copy に含まれない

#### Scenario: Screens が custom CSS ではなくコピー済み shadcn/ui source を使う (AGENT-MANAGEMENT-UI-S019)

- **GIVEN** Management Client screen source、`packages/client/src/components/ui/**`、`app/globals.css`、`tailwind.config.ts` を検査できる
- **WHEN** Agents、Global Settings、Overview、Threads、Events、Runs、Schedules、Integrations、Settings の UI implementation を確認する
- **THEN** 公式 shadcn/ui core、docs-only recipes、Blocks、Charts は local source としてコピーされている
- **AND** screen-specific UI はコピー済み shadcn/ui source またはそれらの合成 component を使う
- **AND** generated copy manifest は source ごとの count、copied paths、copy-blocked blockers を含む
- **AND** control-room custom visual classes、custom palette tokens、custom gradients、glow shadows、bespoke typography は browser-visible UI source から削除されている
