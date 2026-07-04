## ADDED Requirements

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

#### Scenario: Agent 0件でも Global Settings signing operations が利用できる (AGENT-MANAGEMENT-UI-S020)

- **GIVEN** Management Client に managed Agent が 1 件も登録されていない
- **WHEN** 運用者が `Global Settings > Signing Keys` と `Global Settings > Trust Config Export` を開く
- **THEN** UI は signing key generation、key list empty state、public-only trust config export を利用可能な状態で表示する
- **AND** Agent 個別 settings は Agent 登録後の既存 global key selection と Health Check の導線として扱われる
- **AND** private JWK、encrypted private JWK、生 JWT、signing logic はブラウザーに渡らない

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

#### Scenario: 信頼設定後に selected-Agent pages が実 Agent データを描画する (AGENT-MANAGEMENT-UI-S019)

- **GIVEN** managed Agent `agent-alpha` に有効な active Ed25519 署名鍵が選択され、Agent Worker の `AGENT_CONTROL_PLANE_TRUST` が対応する issuer/kid 公開鍵と policy を含み、health verification が成功している
- **WHEN** 運用者が Overview、Threads、Events、Runs、Schedules、Integrations、Settings の selected-Agent routes を開く
- **THEN** 各ページは server-only Agent RPC から取得した実際の Agent domain データを表示する
- **AND** Agent RPC 接続失敗用の safe fallback ではなく、last verified at と trust diagnostic に基づく接続成立状態を表示する
- **AND** 表示データ、Server Action 戻り値、browser storage、browser bundle に private JWK、encrypted private JWK、生 JWT、signing logic、Agent credential forwarding は含まれない

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

## MODIFIED Requirements

### Requirement: Agent overview と構成 UI

Client UI はサーバー側 Agent RPC を通じて Agent overview と settings を描画 SHALL。

**利用者文脈**

管理者は、Agent の profile、ライフサイクル、config、Agent access credential generation、capability 要約、選択済み global signing key の検証状態を一画面で確認し、Agent 固有の設定を安全に操作したい。Client Service signing key の生成、trust config export、rotation guidance は Client-wide な Global Settings で扱い、Agent settings では既存 global key の選択と Health Check に絞る必要がある。

**要件**

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
