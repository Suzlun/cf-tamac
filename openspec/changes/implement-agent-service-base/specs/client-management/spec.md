## ADDED Requirements

### Requirement: 管理対象 Agent list と registration UI

Client UI は管理対象 Agent 一覧と登録 flow を提供 SHALL。

**利用者文脈**

Agent 管理者は、登録済み Agent を一覧し、表示名、pin、並び順、最終閲覧を確認し、新しい Agent 接続を追加できる UI を必要としている。CLI や直接 RPC を知らなくても管理を開始できる必要がある。

**要件**

- Client UI は表示名、Agent ID、RPC origin、pin 状態、並び順、最終閲覧時刻、connection/credential 状態を表示する管理対象 Agent 一覧画面を提供 MUST。
- Client UI は Agent ID、RPC origin、表示名、credential 参照入力を検証する Agent 登録の追加/編集フォームを提供 MUST。
- Client UI は台帳変更に Server Actions または Server Components を使用 MUST し、Agent credential を Client 側 JavaScript に露出して MUST NOT。

#### Scenario: Agent list が registry 表示と並び順を支援する (CLIENT-MANAGEMENT-S001)

- **GIVEN** Client D1 に pin と並び順メタデータを持つ複数の管理対象 Agent が含まれている
- **WHEN** 運用者が Agent 一覧画面を開く
- **THEN** pinned Agent と並び順が一覧に反映される
- **AND** Agent を選択すると、サーバー側 action を通じて最終閲覧メタデータが更新される

#### Scenario: Add Agent フォームが connection メタデータをアクセシブルに検証する (CLIENT-MANAGEMENT-S002)

- **GIVEN** 運用者が Add Agent 画面を開いている
- **WHEN** 必須 field が不足している、または RPC origin が不正である
- **THEN** フォームは対応する入力項目に関連付けられた accessible な検証エラーを表示する
- **AND** 検証がサーバー側で通過するまで台帳記録は作成されない

### Requirement: Agent overview と構成 UI

Client UI はサーバー側 Agent RPC を通じて Agent overview と settings を描画 SHALL。

**利用者文脈**

管理者は、Agent の profile、ライフサイクル、config、credential generation、capability 要約を一画面で確認し、設定や credential rotation を安全に操作したい。

**要件**

- Client UI は Agent RPC から Agent profile、ライフサイクル状態、config 版、credential generation/状態、capability 要約を描画する Agent overview 画面を提供 MUST。
- Client UI はサーバー側 Agent RPC call を通じて構成更新と credential rotation の settings action を提供 MUST。
- Client UI は secret または生 internal stack trace を露出せず、対処可能な message 付きで Agent RPC error を表示 MUST。

#### Scenario: Agent overview がサーバー側 profile と config を描画する (CLIENT-MANAGEMENT-S003)

- **GIVEN** 運用者が登録済み Agent 詳細ページを開いている
- **WHEN** Client server が `GetAgent` と関連 config RPC を照会する
- **THEN** overview は profile、ライフサイクル、config 版、credential generation、capability 要約を表示する
- **AND** Browser payload は credential secret material を含まない

#### Scenario: Settings 画面が Agent RPC 経由で config 更新と credential rotation を行う (CLIENT-MANAGEMENT-S004)

- **GIVEN** 運用者が Agent settings を管理する permission を持っている
- **WHEN** 運用者が settings 画面から config update または credential rotation を送信する
- **THEN** Client server は acting user context 付きで対応する Agent RPC を呼ぶ
- **AND** UI は成功後に更新済み config 版または credential generation を反映する

### Requirement: Thread Event Run と Compaction exploration UI

Client UI は Thread、Event、Run、Compaction、Memory の exploration view を公開 SHALL。

**利用者文脈**

Agent の自律判断を運用するには、Thread、Event、Run、Compaction、Handoff、History、Memory をたどって「何が起きたか」「なぜそう判断したか」を確認できる画面が必要である。

**要件**

- Client UI は Thread key、状態、Section、latest Event、latest Run、Memory/Compaction 要約を持つ Thread 一覧/詳細画面を提供 MUST。
- Client UI は sequence、type、source、状態、スナップショット、判断出力、因果 link を持つ Event と Run の view を提供 MUST。
- Client UI は latest Handoff、History 参照、Memory 版、provenance、rebase 状態を公開する Compaction と Memory の view を提供 MUST。
- これらの画面のすべてのデータは Agent RPC からサーバー側で取得 MUST し、Agent domain スナップショットを Client D1 に保存せずに描画 MUST。

#### Scenario: Thread Event Run と Compaction tabs が Agent-owned history を表示する (CLIENT-MANAGEMENT-S005)

- **GIVEN** Agent が Event、Run、Compaction、Memory を持つ Thread を有している
- **WHEN** 運用者が Thread、Event、Run、Compaction タブを移動する
- **THEN** 各タブは sequence、状態、因果 link、provenance を持つ順序付き Agent-owned 記録を表示する
- **AND** ページングと絞り込み条件は Agent/Thread scope を維持する

### Requirement: Schedule と Tool 管理 UI

Client UI はサーバー側 action を通じて Schedule と Tool 承認を管理 SHALL。

**利用者文脈**

管理者は Agent の将来動作と外部作用を監督する必要がある。Schedule の作成/取消、Tool catalog の確認、ToolInvocation の承認/拒否を UI から安全に行える必要がある。

**要件**

- Client UI は Agent-owned Schedule の一覧取得、作成、確認、取消を行う Schedule 管理画面を提供 MUST。
- Client UI は Tool definition、Installation 所有関係、invocation 状態、承認状態、試行、結果 Event を表示する Tool catalog と ToolInvocation 画面を提供 MUST。
- Client UI は Tool 承認/却下に明示的な user action を要求 MUST し、acting user context 付きで Agent RPC をサーバー側から呼ぶ MUST。

#### Scenario: Schedule tab が schedules を作成し cancel する (CLIENT-MANAGEMENT-S006)

- **GIVEN** 運用者が登録済み Agent の Schedule タブを開いている
- **WHEN** 運用者が Thread 文脈付きで Schedule を作成し、後で cancel する
- **THEN** Client server は `CreateSchedule` と `CancelSchedule` を呼ぶ
- **AND** UI は Agent RPC から取得した Schedule 状態、次回 fire 時刻、overlap policy、取消結果を表示する

#### Scenario: Tool 承認画面が明示 action を要求する (CLIENT-MANAGEMENT-S007)

- **GIVEN** Agent が `pending_approval` の ToolInvocation を持っている
- **WHEN** 運用者が Tool 承認画面を開く
- **THEN** approve と reject control は Tool、入力要約、risk/承認メタデータ、acting user context を表示する
- **AND** 承認または却下は明示的な user confirmation の後にのみ送信される

### Requirement: Integration 管理 UI の提供

Client UI は汎用 Integration installation と cleanup flow を管理 SHALL。

**利用者文脈**

管理者は、Integration manifest を指定して install し、Adapter Connection、Tool、Delivery、setup 状態を確認し、不要になった Integration を安全に uninstall したい。

**要件**

- Client UI は Installation 状態、manifest identity、Provider identity、grant、Adapter Connection、Tool、Delivery capability、setup 手順を表示する Integration 一覧/詳細画面を提供 MUST。
- Client UI はサーバー側 Agent RPC を通じて install/uninstall action を提供 MUST。
- Client UI は Integration/Installation/Adapter/Tool/Delivery の状態、grant、setup 手順、cleanup 結果を見えるようにする MUST。

#### Scenario: Integration 画面が汎用 Integration を install、list、uninstall する (CLIENT-MANAGEMENT-S008)

- **GIVEN** 運用者が署名済み汎用 Integration manifest を持っている
- **WHEN** 運用者が Integration 画面から Integration を install、inspect、uninstall する
- **THEN** Client server は Agent Integration RPC を呼ぶ
- **AND** UI は Installation 状態、grant、Adapter Connection、Tool、Delivery capability、setup 手順、cleanup 結果を表示する

### Requirement: Browser credential と direct RPC protection

Client UI は Agent credential と直接 RPC call を Browser 実行から除外 SHALL。

**利用者文脈**

Client UI は Browser で動くため、Agent credential や署名 material が一度でも Browser に渡ると漏えいリスクになる。すべての Agent RPC はサーバー側に閉じる必要がある。

**要件**

- Client UI は HTML、JavaScript bundle、local storage、session storage、Browser への network 応答に Agent RPC credential、秘密鍵、生 token、Provider secret を embed して MUST NOT。
- Client UI は Browser 側コードから Agent RPC origin を直接呼び出して MUST NOT。
- Error と loading 状態は secret メタデータまたは生 internal error stack を漏えいせずに表示 MUST。

#### Scenario: Browser が Agent credentials を受け取らず Agent RPC を直接呼ばない (CLIENT-MANAGEMENT-S009)

- **GIVEN** 運用者が Agent list、overview、Thread、Schedule、Tool、Integration、Settings 画面を移動している
- **WHEN** Browser network 応答、描画済み HTML、JavaScript bundle、storage が検査される
- **THEN** Agent credential、秘密鍵、生 JWT 署名 material、Provider secret、直接 Agent RPC リクエストは存在しない
- **AND** Agent RPC call は Client サーバー側実行からのみ発生する
