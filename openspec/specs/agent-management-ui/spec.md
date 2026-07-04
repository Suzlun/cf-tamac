# agent-management-ui Specification

## Purpose

Management Client は、Client-owned D1 ledger と server-side Agent RPC を通じて Agent registry、registration、selected-Agent operations、model policy、Tool/Integration/Schedule 操作を secret-free に表示・実行する UI 契約を定義する。

## Requirements

### Requirement: 管理対象 Agent list と registration UI

Client UI は管理対象 Agent 一覧、registration action、and selection flow を `Agents` screen で提供 SHALL。

**Customer Context**

Agent 管理者は、登録済み Agent を一覧し、表示名、pin、並び順、最終閲覧、credential 状態を確認し、新しい Agent 接続を追加できる UI を必要としている。`Agents` screen が開始点になることで、管理者は Agent 選択前に Client 全体と Agent 固有操作を混同せずに管理を始められる。

**Requirement**

- Client UI は表示名、Agent ID、RPC origin、pin 状態、並び順、最終閲覧時刻、connection/credential 状態を card/list composition で表示する管理対象 Agent 一覧画面を提供 MUST。
- Client UI は Agent ID、RPC origin、表示名、credential 参照入力、initial model policy 入力を検証する Agent registration form を `Agents` screen 内 action から提供 MUST。
- `New Agent` action は `Agents` screen の primary action として表示 SHALL。
- Client UI は台帳変更に Server Actions または Server Components を使用 MUST し、Agent credential を Client 側 JavaScript に露出して MUST NOT。
- Agent selection は selected-Agent workspace へ遷移し、last-opened metadata を server-side action で更新 MUST。

#### Scenario: Agent list が card/list registry 表示と並び順を支援する (AGENT-MANAGEMENT-UI-S001)

- **GIVEN** Client D1 に pin と並び順メタデータを持つ複数の管理対象 Agent が含まれている
- **WHEN** 運用者が `Agents` screen を開く
- **THEN** pinned Agent と並び順が card/list 表示に反映される
- **AND** Agent を選択すると、サーバー側 action を通じて最終閲覧メタデータが更新される

#### Scenario: Add Agent フォームが connection メタデータをアクセシブルに検証する (AGENT-MANAGEMENT-UI-S002)

- **GIVEN** 運用者が `Agents` screen の `New Agent` action から registration flow を開いている
- **WHEN** 必須 field が不足している、または RPC origin が不正である
- **THEN** フォームは対応する入力項目に関連付けられた accessible な検証エラーを表示する
- **AND** 検証がサーバー側で通過するまで台帳記録は作成されない

### Requirement: Agent overview と構成 UI

Client UI はサーバー側 Agent RPC を通じて Agent overview と settings を selected-Agent workspace に描画 SHALL。

**Customer Context**

管理者は、Agent の profile、ライフサイクル、config、credential generation、capability 要約、最新 Memory/Compaction summary を一画面で確認し、設定や credential rotation を安全に操作したい。

**Requirement**

- Client UI は Agent RPC から Agent profile、ライフサイクル状態、config 版、credential generation/状態、capability 要約、latest Memory/Compaction summary を描画する Agent overview 画面を提供 MUST。
- Client UI はサーバー側 Agent RPC call を通じて構成更新と credential rotation の settings action を提供 MUST。
- Client UI は secret または生 internal stack trace を露出せず、対処可能な message 付きで Agent RPC error を表示 MUST。
- Overview は card/list/detail composition を使用 SHALL。

#### Scenario: Agent overview がサーバー側 profile と config を描画する (AGENT-MANAGEMENT-UI-S003)

- **GIVEN** 運用者が登録済み Agent 詳細ページを開いている
- **WHEN** Client server が `GetAgent` と関連 config RPC を照会する
- **THEN** overview は profile、ライフサイクル、config 版、credential generation、capability 要約、latest Memory/Compaction summary を表示する
- **AND** Browser payload は credential secret material を含まない

#### Scenario: Settings 画面が Agent RPC 経由で config 更新と credential rotation を行う (AGENT-MANAGEMENT-UI-S004)

- **GIVEN** 運用者が Agent settings を管理する permission を持っている
- **WHEN** 運用者が selected-Agent `Settings` screen から config update または credential rotation を送信する
- **THEN** Client server は acting user context 付きで対応する Agent RPC を呼ぶ
- **AND** UI は成功後に更新済み config 版または credential generation を反映する

### Requirement: Thread Event Run と Compaction exploration UI

Client UI は Thread、Event、Run、Compaction、Memory の exploration view を selected-Agent screens で公開 SHALL。

**Customer Context**

Agent の自律判断を運用するには、Thread、Event、Run、Compaction、Handoff、History、Memory をたどって「何が起きたか」「どの文脈で判断されたか」を確認できる画面が必要である。

**Requirement**

- Client UI は Thread key、状態、Section、latest Event、latest Run、Memory/Compaction 要約を持つ Thread 一覧/詳細画面を提供 MUST。
- Client UI は sequence、type、source、状態、スナップショット、判断出力、因果 link を持つ Event と Run の view を提供 MUST。
- Client UI は latest Handoff、History 参照、Memory 版、provenance、rebase 状態を公開する Compaction と Memory の view を Thread、Event、Overview 文脈の detail として提供 MUST。
- これらの画面のすべてのデータは Agent RPC からサーバー側で取得 MUST し、Agent domain スナップショットを Client D1 に保存せずに描画 MUST。
- Exploration views は card/list/detail composition と selected-Agent scope 表示を維持 SHALL。

#### Scenario: Thread Event Run と Compaction sections が Agent-owned history を表示する (AGENT-MANAGEMENT-UI-S005)

- **GIVEN** Agent が Event、Run、Compaction、Memory を持つ Thread を有している
- **WHEN** 運用者が Threads、Events、Runs、Overview の selected-Agent sections を移動する
- **THEN** 各 section は sequence、状態、因果 link、provenance を持つ順序付き Agent-owned 記録を表示する
- **AND** ページングと絞り込み条件は Agent/Thread scope を維持する

### Requirement: Schedule と Tool 管理 UI

Client UI はサーバー側 action を通じて Schedule と Tool 承認を selected-Agent screens で管理 SHALL。

**Customer Context**

管理者は Agent の将来動作と外部作用を監督する必要がある。Schedule の作成/取消、Tool catalog の確認、ToolInvocation の承認/拒否を、選択中 Agent の Run、Event、Settings 文脈から安全に行える必要がある。

**Requirement**

- Client UI は Agent-owned Schedule の一覧取得、作成、確認、取消を行う Schedule 管理画面を提供 MUST。
- Client UI は Tool definition、Installation 所有関係、invocation 状態、承認状態、試行、結果 Event を表示する Tool catalog と ToolInvocation context を提供 MUST。
- Client UI は Tool 承認/却下に明示的な user action を要求 MUST し、acting user context 付きで Agent RPC をサーバー側から呼ぶ MUST。
- Tool catalog and ToolInvocation context は Runs、Events、Settings の selected-Agent detail として表示 SHALL。

#### Scenario: Schedule section が schedules を作成し cancel する (AGENT-MANAGEMENT-UI-S006)

- **GIVEN** 運用者が登録済み Agent の Schedule section を開いている
- **WHEN** 運用者が Thread 文脈付きで Schedule を作成し、後で cancel する
- **THEN** Client server は `CreateSchedule` と `CancelSchedule` を呼ぶ
- **AND** UI は Agent RPC から取得した Schedule 状態、次回 fire 時刻、overlap policy、取消結果を表示する

#### Scenario: Tool 承認 context が明示 action を要求する (AGENT-MANAGEMENT-UI-S007)

- **GIVEN** Agent が `pending_approval` の ToolInvocation を持っている
- **WHEN** 運用者が Runs、Events、or Settings で Tool approval context を開く
- **THEN** approve と reject control は Tool、入力要約、risk/承認メタデータ、acting user context を表示する
- **AND** 承認または却下は明示的な user confirmation の後にのみ送信される

### Requirement: Integration 管理 UI の提供

Client UI は汎用 Integration installation と cleanup flow を selected-Agent screen で管理 SHALL。

**Customer Context**

管理者は、Integration manifest を指定して install し、Adapter Connection、Tool、Delivery、setup 状態を確認し、不要になった Integration を安全に uninstall したい。Integration 状態は Agent 固有の運用文脈で確認できる必要がある。

**Requirement**

- Client UI は Installation 状態、manifest identity、Provider identity、grant、Adapter Connection、Tool、Delivery capability、setup 手順を表示する Integration 一覧/詳細画面を提供 MUST。
- Client UI はサーバー側 Agent RPC を通じて install/uninstall action を提供 MUST。
- Client UI は Integration/Installation/Adapter/Tool/Delivery の状態、grant、setup 手順、cleanup 結果を見えるようにする MUST。
- Integration screen は card/list/detail composition を使用 SHALL。

#### Scenario: Integration 画面が汎用 Integration を install、list、uninstall する (AGENT-MANAGEMENT-UI-S008)

- **GIVEN** 運用者が署名済み汎用 Integration manifest を持っている
- **WHEN** 運用者が Integration 画面から Integration を install、inspect、uninstall する
- **THEN** Client server は Agent Integration RPC を呼ぶ
- **AND** UI は Installation 状態、grant、Adapter Connection、Tool、Delivery capability、setup 手順、cleanup 結果を card/list/detail composition で表示する

### Requirement: Browser credential と direct RPC protection

Client UI は Agent credential と直接 RPC call を Browser 実行から除外 SHALL。

**利用者文脈**

Client UI は Browser で動くため、Agent credential や署名 material が一度でも Browser に渡ると漏えいリスクになる。すべての Agent RPC はサーバー側に閉じる必要がある。

**要件**

- Client UI は HTML、JavaScript bundle、local storage、session storage、Browser への network 応答に Agent RPC credential、秘密鍵、生 token、Provider secret を embed して MUST NOT。
- Client UI は Browser 側コードから Agent RPC origin を直接呼び出して MUST NOT。
- Error と loading 状態は secret メタデータまたは生 internal error stack を漏えいせずに表示 MUST。

#### Scenario: Browser が Agent credentials を受け取らず Agent RPC を直接呼ばない (AGENT-MANAGEMENT-UI-S009)

- **GIVEN** 運用者が Agent list、overview、Thread、Schedule、Tool、Integration、Settings 画面を移動している
- **WHEN** Browser network 応答、描画済み HTML、JavaScript bundle、storage が検査される
- **THEN** Agent credential、秘密鍵、生 JWT 署名 material、Provider secret、直接 Agent RPC リクエストは存在しない
- **AND** Agent RPC call は Client サーバー側実行からのみ発生する

### Requirement: Model policy management UI

Management Client は model policy management UI を server-side Agent RPC 境界で提供 SHALL。

**Customer Context**

Agent 管理者は、Agent registration flow と selected-Agent Settings で default model policy を設定、検証、更新し、Run がどの policy を使うかを安全に確認したい。Browser に Agent credential や Provider credential が露出すると、管理 UI が攻撃面になる。

**Requirement**

Management Client は Agents screen action から起動される Agent registration flow と selected-Agent Settings に default model policy 入力、検証、保存、表示 UI を提供 SHALL。UI は policy ref、provider、model、digest、安全な generation parameters、status、validation warning だけを表示 MUST。Provider credential、Agent credential、生 token、raw prompt、raw completion、raw reasoning は Browser payload、HTML、JavaScript bundle、storage に含めて MUST NOT。

Client server は Server Action または Server Component 経由で generated Agent RPC client を使用し、`UpsertModelPolicy`、`ValidateModelPolicy`、`UpdateConfig`、必要な `InitializeAgent` を順序付きで呼ぶ SHALL。Agent registration flow では initial model policy と initial `modelPolicyRef` を同じ server-side flow で Agent に送信 MUST。Settings 更新では policy upsert が成功した policy ref だけを `UpdateConfig` に渡す MUST。

UI は missing binding、invalid policy、unsupported provider/model、permission denied、validation warning を secret-safe な user-facing message として表示 MUST。Browser-visible modules は Agent RPC client、Connect runtime、server-only Agent RPC factory、credential resolution logic を import して MUST NOT。

Model policy UI は Agents entry と selected-Agent Settings の card/list/detail composition に統合 SHALL。

#### Scenario: Agent registration flow が initial model policy を server-side で送信する (AGENT-MANAGEMENT-UI-S017)

- **GIVEN** 運用者が `Agents` screen action から registration flow を開き、policy ref、provider、model、generation parameters を入力している
- **WHEN** form を送信する
- **THEN** Client server は policy を検証し、Agent RPC を server-side で呼んで initial model policy と `initialConfig.modelPolicyRef` を送信する
- **AND** Browser は Agent credential、Provider credential、direct Agent RPC request を受け取らない

#### Scenario: Settings 画面が default model policy を安全に更新する (AGENT-MANAGEMENT-UI-S018)

- **GIVEN** 運用者が selected-Agent Settings で default model policy を変更している
- **WHEN** policy upsert と config update が成功する
- **THEN** UI は policy ref、digest、provider、model、config version を更新表示する
- **AND** invalid policy または権限不足の場合は secret-free error message を表示し、Browser bundle に Agent RPC credential は含まれない

### Requirement: Selected-Agent card/list/detail information architecture

Selected-Agent screens は card/list/detail composition を使って Agent-owned state を読みやすく表示 SHALL。

**Customer Context**

Agent 管理者は Thread、Event、Run、Schedule、Integration、Settings を同時に扱うため、情報を table だけに押し込めると重要な因果関係、承認状態、設定文脈を追跡しにくい。Card/list/detail composition により、一覧で候補を選び、detail で原因と次の action を確認できる。

**Requirement**

Overview、Threads、Events、Runs、Schedules、Integrations、Settings screens は selected Agent identity と scope indicator を表示 SHALL。

Each selected-Agent screen は primary summary、filter/search controls、list region、detail region を持つ SHALL。

Table component は列比較が principal task である場合に限定して使用 SHALL。Default display は card/list/detail composition とする MUST。

Detail region は secret-free Agent RPC view model を表示 SHALL。

#### Scenario: Selected-Agent screens use card list detail composition (AGENT-MANAGEMENT-UI-S019)

- **GIVEN** selected Agent が Overview、Threads、Events、Runs、Schedules、Integrations、Settings data を持つ
- **WHEN** 管理者が each selected-Agent screen を開く
- **THEN** screen は selected Agent identity、summary、filter/search controls、list region、and detail region を表示する
- **AND** table display は列比較が必要な content に限定される

### Requirement: Contextual Tool and Compaction presentation

Tool and Compaction information は Agent scoped operational context 内で表示 SHALL。

**Customer Context**

ToolInvocation は Run の判断と承認に結び付き、Compaction は Thread と Memory の理解に結び付く。管理者はそれぞれを関連する Agent scoped context で確認することで、操作の理由と影響を追跡できる。

**Requirement**

ToolInvocation detail は Runs detail、Events detail、or Settings Tool catalog section で表示 SHALL。

Tool approval actions は Runs or Settings context から明示 confirmation を通じて実行 SHALL。

Compaction detail は Threads detail、Events detail、or Overview latest Memory/Compaction summary で表示 SHALL。

Tool and Compaction detail は selected Agent scope、Thread/Run/Event relationship、and provenance を表示 SHALL。

#### Scenario: Tool and Compaction details remain in Agent scoped context (AGENT-MANAGEMENT-UI-S020)

- **GIVEN** selected Agent が ToolInvocation と ThreadCompaction を持つ
- **WHEN** 管理者が Runs、Events、Settings、Threads、or Overview を開く
- **THEN** ToolInvocation detail は Runs、Events、or Settings の context として表示される
- **AND** ThreadCompaction detail は Threads、Events、or Overview の context として表示される
- **AND** each detail shows selected Agent scope and relevant relationship metadata

### Requirement: Responsive selected-Agent detail behavior

Selected-Agent screens は viewport width と input method に応じて list/detail interaction を accessible に切り替え SHALL。

**Customer Context**

管理者は狭い画面や keyboard 操作でも Agent 管理を行う。detail が画面外に押し出されたり focus が迷子になると、Schedule cancel、Tool approval、Integration uninstall などの重要操作を誤る危険がある。

**Requirement**

Desktop layout は left sidebar、list region、detail region を同時に表示 SHALL。

Narrow viewport layout は left sidebar を accessible Sheet navigation として表示 SHALL。

Narrow viewport detail は Sheet、Dialog、or Drawer equivalent local Shadcn component で表示 SHALL。

Detail surface は focus trap、Escape close、focus return、and selected Agent scope label を提供 SHALL。

#### Scenario: Responsive detail preserves selected Agent scope (AGENT-MANAGEMENT-UI-S021)

- **GIVEN** 管理者が narrow viewport または keyboard navigation で selected-Agent screen を操作している
- **WHEN** list item detail、Schedule action、Tool approval、or Integration detail を開く
- **THEN** detail surface は accessible open/close behavior と focus management を提供する
- **AND** selected Agent identity and section context remain visible or announced
