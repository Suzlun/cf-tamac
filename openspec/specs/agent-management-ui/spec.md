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

### Requirement: Signing key management UI と server actions

Client UI と Server Actions は Global Settings scope で Client Service signing key lifecycle を private material 非公開で管理 SHALL。

**利用者文脈**

Agent 管理者は Agent の有無に依存せず、Client Service signing key を Management Client の Global Settings から生成、確認、停止、削除、選択したい。Private key をブラウザーに表示したり Worker Secret へ貼ったりする運用では、漏えいリスクと鍵交代作業の取り違えが発生する。

**要件**

- Client UI は signing key management を `Global Settings > Signing Keys` scope として配置 SHALL。
- Client UI は managed Agent が 0 件でも signing key generation、一覧、default selection、status 操作を利用可能にする MUST。
- Client UI は signing key 一覧、issuer、kid、public fingerprint、public JWK summary、status、created/updated/last-used timestamps を表示 SHALL。
- Client UI は Ed25519 key pair generation を Server Action 経由で実行 SHALL。
- Client UI は generated private JWK plaintext、encrypted private JWK、生 JWT signing material をブラウザーに表示して MUST NOT。
- Client UI は signing key を `active`、`disabled`、`deleted` の lifecycle で管理する操作を提供 SHALL。
- Client UI は default signing key selection を提供 SHALL。
- Client UI は status 変更または deletion が Agent trust config 更新を必要とする場合、運用者に明示 MUST。
- Signing key 操作は server-side validation と確定済み永続化結果に基づいて UI 状態を更新 MUST。

#### Scenario: 署名鍵管理画面が key lifecycle を扱う (AGENT-MANAGEMENT-UI-S010)

- **GIVEN** 運用者が Management Client の `Global Settings > Signing Keys` を開いている
- **WHEN** 運用者が Ed25519 key pair を生成し、default selection を変更し、key を `disabled` または `deleted` にする
- **THEN** UI は issuer、kid、public fingerprint、status、timestamps を表示する
- **AND** Server Action は Client D1 の signing key record を更新する
- **AND** Agent trust config 更新が必要な操作では警告と次の確認 action が表示される

#### Scenario: ブラウザーが signing material を受け取らない (AGENT-MANAGEMENT-UI-S011)

- **GIVEN** 運用者が signing key generation、detail 表示、status 更新を行っている
- **WHEN** ブラウザー network response、HTML、JavaScript bundle、storage が検査される
- **THEN** private JWK plaintext、encrypted private JWK、生 JWT、Client credential secret は存在しない
- **AND** 表示される key material は public JWK summary、kid、fingerprint に限定される

### Requirement: Agent ごとの signing key selection と health verification

Client UI は managed Agent ごとに既存 global signing key の selection と Agent health verification を提供 SHALL。

**利用者文脈**

運用者は複数 Agent origin を Management Client に登録し、Global Settings で管理済みの signing key から Agent ごとに異なる issuer/kid を選択したい。Agent trust config と Client registry metadata がずれると認証失敗が起きるため、UI 上で現在の issuer/kid/fingerprint と疎通状態を確認できる必要がある。

**要件**

- Client UI は managed Agent record ごとに Global Settings の既存 signing key から signing issuer/kid を選択できる SHALL。
- Client UI は Agent 個別 settings で issuer、kid、public fingerprint を自由入力として受け付けて MUST NOT。
- Client UI は選択した signing key の public fingerprint を Agent registry record に表示 SHALL。
- Client UI は Agent detail または settings 画面で active issuer、active kid、public fingerprint、last verified at を表示 SHALL。
- Client UI は Global signing key が 0 件の場合、Agent 個別 settings で Health Check action を無効化し、`Global Settings > Signing Keys` への導線を表示 SHALL。
- Client UI は Server Action 経由で Agent health RPC を呼び、現在の issuer/kid/fingerprint が Agent 側 trust config で有効か確認できる SHALL。
- Client UI は Health verification が `serving` または `degraded` の認証済み Check response と trust diagnostic の成功を返した場合だけ、Agent RPC 接続成立として扱う SHALL。
- Client UI は unknown issuer、unknown kid、revoked key、fingerprint mismatch などの認証失敗を通常の health response として扱わず、安全な Connect error message として表示 MUST。
- Client UI は接続成立後、Overview、Threads、Events、Runs、Schedules、Integrations、Settings の selected-Agent routes で server-only Agent RPC 由来の実データを表示できる SHALL。
- Client UI は Agent key / Client key の不整合を、secret を含まない対処可能な error message として表示 MUST。
- Browser-visible code は Agent RPC credential、private key 復号、JWT signing、direct Agent RPC invocation logic を含んで MUST NOT。

#### Scenario: Agent 詳細が issuer/kid/fingerprint と疎通結果を表示する (AGENT-MANAGEMENT-UI-S012)

- **GIVEN** managed Agent `agent-alpha` に Global Settings の active signing key が選択され、signing issuer/kid/public fingerprint を持っている
- **WHEN** 運用者が Agent settings で health verification を実行する
- **THEN** Client server は選択された signing key で Agent health RPC を呼ぶ
- **AND** UI は認証済み Check response の `serving` または `degraded` 状態、issuer、kid、fingerprint、trust config fingerprint、last verified at、verification result を表示する
- **AND** issuer、kid、public fingerprint は既存 global key selection の結果として表示され、自由入力欄として扱われない
- **AND** 不整合時は通常の Check response ではなく、key material を含まない Connect error guidance を表示する

### Requirement: Global Settings trust config export UI

Client UI は Global Settings scope で Agent Worker に設定できる public-only trust config JSON を生成 SHALL。

**利用者文脈**

自己ホスト運用者は Agent 登録前でも Agent Worker の Variables and Secrets に貼れる公開情報だけの trust config JSON を Management Client の Global Settings から取得したい。Private key parameter が混入したり、広すぎる scope を無自覚に選んだりすると、Agent への過剰権限や秘密漏えいにつながる。

**要件**

- Client UI は trust config export を `Global Settings > Trust Config Export` scope として配置 SHALL。
- Client UI は managed Agent が 0 件でも Client signing key store の public JWK だけを抽出して `AGENT_CONTROL_PLANE_TRUST` JSON を生成 SHALL。
- Export JSON は private key parameter `d`、private JWK plaintext、encrypted private JWK を含んで MUST NOT。
- Export JSON は version、audiences、issuer、kid、kty、crv、x、status、principalType、allowedAgentIds、allowedScopes を含む MUST。
- Client UI は allowedScopes と allowedAgentIds を運用者が明示的に選択できる SHALL。
- Client UI は Client signing key status と Agent trust config key status の mapping を表示 SHALL。
- Client UI は Client status `active` の key を trust config export で `active` または `retiring` として選択できる SHALL。
- Client UI は Client status `disabled` または `deleted` の key を trust config export で `revoked` としてだけ選択できる SHALL。
- Client UI は broad scope または wildcard Agent selection を選ぶ場合、管理者向け警告を表示 MUST。
- Client UI は既存 Agent trust config に key を追加する merge 用 JSON と、revoked/removed key を反映した更新用 JSON を生成できる SHALL。
- Client UI は Agent trust config JSON schema validation 結果を表示 SHALL。
- Client UI は public fingerprint を表示し、Agent registry record と照合できる SHALL。

#### Scenario: 信頼設定 export が公開情報だけの JSON を生成する (AGENT-MANAGEMENT-UI-S013)

- **GIVEN** Client signing key store に active key と disabled key が存在する
- **WHEN** 運用者が issuer、allowed Agent、allowed scope、key status を選択して trust config を生成する
- **THEN** UI は Global Settings 内で Agent Worker Variables and Secrets に設定できる JSON を表示する
- **AND** JSON は issuer、kid、kty、crv、x、status、principalType、allowedAgentIds、allowedScopes、fingerprint 照合情報を含む
- **AND** private key parameter `d`、private JWK plaintext、encrypted private JWK は含まれない
- **AND** Client status と trust config status の mapping が表示され、`disabled` または `deleted` key は `revoked` entry としてだけ出力される

#### Scenario: 広い scope selection は警告と schema validation を表示する (AGENT-MANAGEMENT-UI-S014)

- **GIVEN** 運用者が `allowedAgentIds = ["*"]` または高権限 scope を選択している
- **WHEN** trust config export preview が更新される
- **THEN** UI は broad permission warning と schema validation result を表示する
- **AND** validation error がある JSON はコピー可能な最終設定として扱われない

### Requirement: Rotation revoke recovery guidance

Client UI は Global Settings scope で signing key rotation、emergency revoke、break-glass recovery の運用 guidance を表示 SHALL。

**利用者文脈**

運用者は signing key rotation、private key 漏えい時の emergency revoke、Management Client 障害時の break-glass recovery を安全に実行したい。手順が UI と診断結果に結び付いていないと、Agent trust config と Client registry selection がずれて接続不能になる。

**要件**

- Client UI は Global Settings で signing key rotation の標準手順を表示 SHALL。
- Client UI は global key generation、public trust config export、managed Agent signing key selection、Agent health verification、retiring/revoked key 表示を関連付け SHALL。
- Client UI は emergency revoke の手順として、該当 key を trust config 上で `revoked` にする必要を表示 SHALL。
- Client UI は Management Client が利用できない場合でも Cloudflare Dashboard、Cloudflare API、または Wrangler で Agent trust config を更新できることを guidance として表示 SHALL。
- Client UI は `ADMIN_OPERATOR` issuer と高権限 scope の用途を break-glass recovery として区別して表示 SHALL。
- Client UI は recovery key を Client-managed signing key store とは別管理にする必要を表示 SHALL。

#### Scenario: 鍵交代 guidance が trust config と Agent verification を結び付ける (AGENT-MANAGEMENT-UI-S015)

- **GIVEN** 運用者が Global Settings の signing key rotation flow を開いている
- **WHEN** 運用者が rotation 対象 key を生成し、public trust config export を確認し、managed Agent の settings で signing kid を切り替え、health verification を実行する
- **THEN** UI は各段階の completion 状態と現在の issuer/kid/fingerprint を表示する
- **AND** health verification が成功するまで retired/revoked 操作を安全確認なしで完了扱いにしない

#### Scenario: 緊急失効と break-glass recovery guidance が表示される (AGENT-MANAGEMENT-UI-S016)

- **GIVEN** 運用者が signing key detail または recovery guidance を開いている
- **WHEN** 運用者が compromised key、revoked status、ADMIN_OPERATOR issuer の説明を確認する
- **THEN** UI は Agent trust config で該当 key を `revoked` にする必要と、反映後に該当 JWT が拒否されることを表示する
- **AND** UI は recovery key が Client-managed signing key store とは別管理であり、Dashboard/API/Wrangler から trust config を更新できることを表示する

### Requirement: Agent overview と構成 UI

Client UI はサーバー側 Agent RPC を通じて Agent overview と settings を描画 SHALL。

**Customer Context**

管理者は、Agent の profile、ライフサイクル、config、Agent access credential generation、capability 要約、選択済み global signing key の検証状態を一画面で確認し、Agent 固有の設定を安全に操作したい。Client Service signing key の生成、trust config export、rotation guidance は Client-wide な Global Settings で扱い、Agent settings では既存 global key の選択と Health Check に絞る必要がある。

**Requirement**

- Client UI は Agent RPC から Agent profile、ライフサイクル状態、config 版、Agent access credential generation/状態、capability 要約、選択済み global signing key の verification summary を描画する Agent overview 画面を提供 MUST。
- Client UI はサーバー側 Agent RPC call を通じて構成更新と Agent access credential rotation の settings action を提供 MUST。
- Client UI は Agent settings で既存 global signing key の選択と Health Check を提供 SHALL。
- Client UI は Agent settings で Client Service signing key generation、public-only trust config export、global key rotation/revoke/recovery guidance を所有して MUST NOT。
- Client UI は secret または生 internal stack trace を露出せず、対処可能な message 付きで Agent RPC error を表示 MUST。

#### Scenario: Agent overview がサーバー側 profile と config を描画する (AGENT-MANAGEMENT-UI-S003)

- **GIVEN** 運用者が登録済み Agent 詳細ページを開いている
- **WHEN** Client server が `GetAgent`、関連 config RPC、Health verification summary を照会する
- **THEN** overview は profile、ライフサイクル、config 版、Agent access credential generation、capability 要約、選択済み global signing key の verification summary を表示する
- **AND** Browser payload は credential secret material、private JWK、encrypted private JWK、生 JWT を含まない

#### Scenario: Settings 画面が Agent RPC 経由で config 更新と credential rotation を行う (AGENT-MANAGEMENT-UI-S004)

- **GIVEN** 運用者が Agent settings を管理する permission を持っている
- **WHEN** 運用者が settings 画面から config update、Agent access credential rotation、または既存 global signing key selection と Health Check を送信する
- **THEN** Client server は acting user context 付きで対応する Agent RPC または server-only Health verification action を呼ぶ
- **AND** UI は成功後に更新済み config 版、Agent access credential generation、または selected global signing key の verification result を反映する
- **AND** Client Service signing key generation と public-only trust config export は Global Settings の operation として扱われる

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
