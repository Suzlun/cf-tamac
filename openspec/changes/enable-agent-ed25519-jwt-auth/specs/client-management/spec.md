## ADDED Requirements

### Requirement: Signing key management UI と server actions

Client UI と Server Actions は Client Service signing key lifecycle を private material 非公開で管理 SHALL。

**利用者文脈**

Agent 管理者は Client Service signing key を Management Client から生成、確認、停止、削除、選択したい。Private key をブラウザーに表示したり Worker Secret へ貼ったりする運用では、漏えいリスクと鍵交代作業の取り違えが発生する。

**要件**

- Client UI は signing key 一覧、issuer、kid、public fingerprint、public JWK summary、status、created/updated/last-used timestamps を表示 SHALL。
- Client UI は Ed25519 key pair generation を Server Action 経由で実行 SHALL。
- Client UI は generated private JWK plaintext、encrypted private JWK、生 JWT signing material をブラウザーに表示して MUST NOT。
- Client UI は signing key を `active`、`disabled`、`deleted` の lifecycle で管理する操作を提供 SHALL。
- Client UI は default signing key selection を提供 SHALL。
- Client UI は status 変更または deletion が Agent trust config 更新を必要とする場合、運用者に明示 MUST。
- Signing key 操作は server-side validation と確定済み永続化結果に基づいて UI 状態を更新 MUST。

#### Scenario: 署名鍵管理画面が key lifecycle を扱う (CLIENT-MANAGEMENT-S010)

- **GIVEN** 運用者が Management Client の signing key 管理画面を開いている
- **WHEN** 運用者が Ed25519 key pair を生成し、default selection を変更し、key を `disabled` または `deleted` にする
- **THEN** UI は issuer、kid、public fingerprint、status、timestamps を表示する
- **AND** Server Action は Client D1 の signing key record を更新する
- **AND** Agent trust config 更新が必要な操作では警告と次の確認 action が表示される

#### Scenario: ブラウザーが signing material を受け取らない (CLIENT-MANAGEMENT-S011)

- **GIVEN** 運用者が signing key generation、detail 表示、status 更新を行っている
- **WHEN** ブラウザー network response、HTML、JavaScript bundle、storage が検査される
- **THEN** private JWK plaintext、encrypted private JWK、生 JWT、Client credential secret は存在しない
- **AND** 表示される key material は public JWK summary、kid、fingerprint に限定される

### Requirement: Agent ごとの signing key selection と health verification

Client UI は managed Agent ごとの signing key selection と Agent health verification を提供 SHALL。

**利用者文脈**

運用者は複数 Agent origin を Management Client に登録し、Agent ごとに異なる issuer/kid を使いたい。Agent trust config と Client registry metadata がずれると認証失敗が起きるため、UI 上で現在の issuer/kid/fingerprint と疎通状態を確認できる必要がある。

**要件**

- Client UI は managed Agent record ごとに signing issuer/kid を選択できる SHALL。
- Client UI は選択した signing key の public fingerprint を Agent registry record に表示 SHALL。
- Client UI は Agent detail または settings 画面で active issuer、active kid、public fingerprint、last verified at を表示 SHALL。
- Client UI は Server Action 経由で Agent health RPC を呼び、現在の issuer/kid/fingerprint が Agent 側 trust config で有効か確認できる SHALL。
- Client UI は Agent key / Client key の不整合を、secret を含まない対処可能な error message として表示 MUST。
- Browser-visible code は Agent RPC credential、private key 復号、JWT signing、direct Agent RPC invocation logic を含んで MUST NOT。

#### Scenario: Agent 詳細が issuer/kid/fingerprint と疎通結果を表示する (CLIENT-MANAGEMENT-S012)

- **GIVEN** managed Agent `agent-alpha` が signing issuer/kid/public fingerprint を持っている
- **WHEN** 運用者が Agent detail で health verification を実行する
- **THEN** Client server は選択された signing key で Agent health RPC を呼ぶ
- **AND** UI は issuer、kid、fingerprint、last verified at、verification result を表示する
- **AND** 不整合時は key material を含まない修正 guidance を表示する

### Requirement: Agent trust config export UI

Client UI は Agent Worker に設定できる public-only trust config JSON を生成 SHALL。

**利用者文脈**

自己ホスト運用者は Agent Worker の Variables and Secrets に貼れる公開情報だけの trust config JSON を Management Client から取得したい。Private key parameter が混入したり、広すぎる scope を無自覚に選んだりすると、Agent への過剰権限や秘密漏えいにつながる。

**要件**

- Client UI は Client signing key store の public JWK だけを抽出して `AGENT_CONTROL_PLANE_TRUST` JSON を生成 SHALL。
- Export JSON は private key parameter `d`、private JWK plaintext、encrypted private JWK を含んで MUST NOT。
- Export JSON は version、audiences、issuer、kid、kty、crv、x、status、principalType、allowedAgentIds、allowedScopes を含む MUST。
- Client UI は allowedScopes と allowedAgentIds を運用者が明示的に選択できる SHALL。
- Client UI は broad scope または wildcard Agent selection を選ぶ場合、管理者向け警告を表示 MUST。
- Client UI は既存 Agent trust config に key を追加する merge 用 JSON と、revoked/removed key を反映した更新用 JSON を生成できる SHALL。
- Client UI は Agent trust config JSON schema validation 結果を表示 SHALL。
- Client UI は public fingerprint を表示し、Agent registry record と照合できる SHALL。

#### Scenario: 信頼設定 export が公開情報だけの JSON を生成する (CLIENT-MANAGEMENT-S013)

- **GIVEN** Client signing key store に active key と disabled key が存在する
- **WHEN** 運用者が issuer、allowed Agent、allowed scope、key status を選択して trust config を生成する
- **THEN** UI は Agent Worker Variables and Secrets に設定できる JSON を表示する
- **AND** JSON は issuer、kid、kty、crv、x、status、principalType、allowedAgentIds、allowedScopes、fingerprint 照合情報を含む
- **AND** private key parameter `d`、private JWK plaintext、encrypted private JWK は含まれない

#### Scenario: 広い scope selection は警告と schema validation を表示する (CLIENT-MANAGEMENT-S014)

- **GIVEN** 運用者が `allowedAgentIds = ["*"]` または高権限 scope を選択している
- **WHEN** trust config export preview が更新される
- **THEN** UI は broad permission warning と schema validation result を表示する
- **AND** validation error がある JSON はコピー可能な最終設定として扱われない

### Requirement: Rotation revoke recovery guidance

Client UI は signing key rotation、emergency revoke、break-glass recovery の運用 guidance を表示 SHALL。

**利用者文脈**

運用者は signing key rotation、private key 漏えい時の emergency revoke、Management Client 障害時の break-glass recovery を安全に実行したい。手順が UI と診断結果に結び付いていないと、Agent trust config と Client registry selection がずれて接続不能になる。

**要件**

- Client UI は signing key rotation の標準手順を表示 SHALL。
- Client UI は rotation 用 public trust config、managed Agent signing key selection、Agent health verification、retiring/revoked key 表示を関連付け SHALL。
- Client UI は emergency revoke の手順として、該当 key を trust config 上で `revoked` にする必要を表示 SHALL。
- Client UI は Management Client が利用できない場合でも Cloudflare Dashboard、Cloudflare API、または Wrangler で Agent trust config を更新できることを guidance として表示 SHALL。
- Client UI は `ADMIN_OPERATOR` issuer と高権限 scope の用途を break-glass recovery として区別して表示 SHALL。
- Client UI は recovery key を Client-managed signing key store とは別管理にする必要を表示 SHALL。

#### Scenario: 鍵交代 guidance が trust config と Agent verification を結び付ける (CLIENT-MANAGEMENT-S015)

- **GIVEN** 運用者が signing key rotation flow を開いている
- **WHEN** 運用者が rotation 対象 key を生成し、Agent trust config export を確認し、managed Agent の signing kid を切り替え、health verification を実行する
- **THEN** UI は各段階の completion 状態と現在の issuer/kid/fingerprint を表示する
- **AND** health verification が成功するまで retired/revoked 操作を安全確認なしで完了扱いにしない

#### Scenario: 緊急失効と break-glass recovery guidance が表示される (CLIENT-MANAGEMENT-S016)

- **GIVEN** 運用者が signing key detail または recovery guidance を開いている
- **WHEN** 運用者が compromised key、revoked status、ADMIN_OPERATOR issuer の説明を確認する
- **THEN** UI は Agent trust config で該当 key を `revoked` にする必要と、反映後に該当 JWT が拒否されることを表示する
- **AND** UI は recovery key が Client-managed signing key store とは別管理であり、Dashboard/API/Wrangler から trust config を更新できることを表示する
