## MODIFIED Requirements

### Requirement: Client-owned 管理対象 Agent 台帳の所有

Client server は Client D1 内の管理対象 Agent 台帳メタデータを所有 SHALL。

**利用者文脈**

管理 UI は複数の Agent を扱うが、Agent Service は Agent 横断一覧を提供しない。Client は自分が管理対象として登録した Agent ID、RPC origin、表示設定、Agent へ提示する signing identity metadata だけを Client 専用 D1 に持ち、Agent domain 正本を複製しない必要がある。

**要件**

- Client server は管理対象 Agent の Client D1 台帳を所有 MUST。
- 台帳は `agent_id`、Agent RPC origin、表示名、pin フラグ、並び順、作成/更新時刻、最終閲覧時刻を保持する MUST。
- 台帳は Agent ごとの `signingIssuer`、`signingKid`、public fingerprint、last verified at を保持する MUST。
- Client server は Client-owned サーバー側コードだけを通じて台帳を読み書き MUST。
- Agent Service は Client D1 を読み書き MUST NOT。
- Client 台帳は authoritative Agent domain 状態として扱われて MUST NOT。
- Agent ごとの signing key selection は Cloudflare ENV/Secret ではなく、Client D1 の managed Agent metadata から解決 MUST。

#### Scenario: 管理対象 Agent 台帳が表示と署名 identity metadata を永続化する (CLIENT-REGISTRY-S001)

- **GIVEN** Client 運用者が Agent RPC origin、表示名、signing issuer/kid、public fingerprint を指定して `agent-alpha` を登録している
- **WHEN** 運用者が Agent entry を pin、並べ替え、rename、open、または signing key selection を更新する
- **THEN** Client D1 は表示名、pin フラグ、並び順、時刻、最終閲覧時刻、signing issuer/kid、public fingerprint、last verified at を永続化する
- **AND** 台帳だけの更新では Agent Service 状態は変更されない

### Requirement: credential 参照境界の維持

Client server は平文 secret を含めずに credential 参照と暗号化済み signing key material を保存 SHALL。

**利用者文脈**

Client は Agent RPC をサーバー側で呼ぶため credential 参照と signing key を管理する必要があるが、秘密鍵や生 secret を D1 や Browser に平文で渡すと漏えいにつながる。運用者は private key JSON を Worker Secret に貼らず、Management Client の server-side 管理機能で key lifecycle を扱いたい。

**要件**

- Client D1 は Agent credential 参照、key ID、マスク済みヒント、状態、時刻を保存 MUST。
- Client D1 は Client signing key record として keyId、issuer、public JWK、public fingerprint、encrypted private JWK、status、created/updated/last-used timestamps を保存 MUST。
- Client signing key record の private JWK は `CLIENT_CREDENTIAL_ENCRYPTION_KEY` を使って暗号化 MUST。
- Client D1 は平文の秘密鍵、生 shared secret、private JWK plaintext を保存して MUST NOT。
- Client server はサーバー側実行内でのみ credential 参照と encrypted private JWK を解決 MUST。
- Browser 応答は Agent credential、生 JWT 署名鍵、private JWK plaintext、Provider 秘密鍵、生 shared secret を含んで MUST NOT。
- Client server は Client private signing key JSON を Worker Secret へ手動設定する運用を必須として MUST NOT。

#### Scenario: credential 参照と encrypted signing key store は平文 secret を保存しない (CLIENT-REGISTRY-S002)

- **GIVEN** 運用者が `agent-alpha` の Client 側 credential 参照を保存し、Ed25519 signing key pair を生成している
- **WHEN** Client server が credential メタデータと signing key record を永続化する
- **THEN** D1 には credential 参照、key ID、マスク済みヒント、状態、時刻、public JWK、public fingerprint、encrypted private JWK だけが含まれる
- **AND** 平文の秘密鍵、生 shared secret、private JWK plaintext は D1 記録、Browser payload、log に含まれない

### Requirement: サーバー側 Agent RPC invocation の限定

Client server はサーバー側の生成済み client からのみ Agent RPC を呼び出す SHALL。

**利用者文脈**

Browser から Agent エンドポイントを直接呼ぶと CORS、credential 配布、認可モデルが複雑になり、secret が露出する。Client は Server Components/Server Actions から生成済み Connect client を使い、Client D1 の signing metadata と暗号化済み private key をサーバー側で解決して Agent API を呼ぶ必要がある。

**要件**

- Client server は Agent Service 呼び出しに生成済み Protobuf RPC client descriptor とサーバー側 Connect transport を使用 MUST。
- Client server は managed Agent metadata から対象 Agent の signing issuer/kid/public fingerprint を選択 MUST。
- Client server は issuer/kid に対応する active signing key record を server-only module で解決 MUST。
- Client server は `CLIENT_CREDENTIAL_ENCRYPTION_KEY` で private JWK を server-only module 内だけで復号 MUST。
- Client server は `agent_id`、scope、acting user 文脈、`jti`、audience、time window を含む Ed25519 JWT を署名し、`Authorization: Bearer <jwt>` として付与 MUST。
- Browser コードは Agent RPC origin を直接呼び出して MUST NOT し、生 Agent RPC リクエスト、生 JWT、signing material を構築して MUST NOT。
- Client server は Hono route または OpenAPI Agent 成果物から Agent RPC client を生成して MUST NOT。

#### Scenario: Server Action が signing key store と生成済み Connect client で Agent RPC を呼ぶ (CLIENT-REGISTRY-S003)

- **GIVEN** user が Client UI で Agent 管理 action を実行している
- **WHEN** 対応する Server Action が実行される
- **THEN** Server Action は Client D1 台帳、signing issuer/kid、encrypted private JWK をサーバー側で読み取る
- **AND** 生成済み Connect client、binary Protobuf 互換 transport、Ed25519 JWT bearer metadata を使って Agent Service を呼び出す
- **AND** Browser は安全化済み action 結果データだけを受け取る

## ADDED Requirements

### Requirement: Client-managed signing key lifecycle

Client server は Client Service signing key lifecycle を server-side store として管理 SHALL。

**Customer Context**

運用者は Management Client から Client Service signing key を生成、停止、削除、選択し、Agent trust config と一致しているか確認したい。Private key を Browser や Worker Secret 手貼りに出す運用は漏えいしやすく、key rotation や emergency revoke の作業も追跡できない。

**Requirement**

- Client server は Ed25519 key pair を server-side で生成 SHALL。
- Generated private JWK は Browser、HTML、local storage、session storage、client bundle、network response へ返して MUST NOT。
- Client server は signing key status として `active`、`disabled`、`deleted` を管理 SHALL。
- `active` signing key だけが JWT signing に使用可能である MUST。
- `disabled` signing key は signing に使用されて MUST NOT。
- `deleted` signing key は signing に使用されて MUST NOT し、private key material は復号不能または削除済みとして扱われる MUST。
- Client server は issuer + kid の組で signing key を一意に解決 MUST。
- Client server は public fingerprint を deterministic に算出し、Agent registry metadata と照合可能にする MUST。
- Client server は key 使用時に lastUsedAtMs を更新 SHALL。

#### Scenario: Server-side key generation が private JWK を Browser に返さない (CLIENT-REGISTRY-S006)

- **GIVEN** 運用者が signing key generation action を実行する
- **WHEN** Client server が Ed25519 key pair を生成して key record を保存する
- **THEN** action result は issuer、kid、public JWK、public fingerprint、status、timestamps だけを返す
- **AND** private JWK plaintext と encrypted private JWK は Browser payload に含まれない

#### Scenario: Disabled または deleted signing key は JWT signing に使われない (CLIENT-REGISTRY-S007)

- **GIVEN** managed Agent が status `disabled` または `deleted` の signing key を参照している
- **WHEN** Client server が Agent RPC bearer token を生成しようとする
- **THEN** Client server は signing を拒否し、対処可能な server-side error を返す
- **AND** Agent RPC は送信されない

#### Scenario: Signing key fingerprint が Agent registry metadata と照合される (CLIENT-REGISTRY-S008)

- **GIVEN** managed Agent record が issuer/kid/public fingerprint を保持している
- **WHEN** Client server が対応する signing key record を読み取る
- **THEN** signing key の public fingerprint は managed Agent record と一致することが検証される
- **AND** 不一致の場合は Agent RPC 呼び出し前に拒否される
