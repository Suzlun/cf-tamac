# client-registry Specification

## Purpose

TBD - created by archiving change implement-agent-service-base. Update Purpose after archive.

## Requirements

### Requirement: Client-owned 管理対象 Agent 台帳の所有

Client server は Client D1 内の管理対象 Agent 台帳メタデータを所有 SHALL。

**利用者文脈**

管理 UI は複数の Agent を扱うが、Agent Service は Agent 横断一覧を提供しない。Client は自分が管理対象として登録した Agent ID、RPC origin、表示設定、Agent へ提示する署名 identity metadata だけを Client 専用 D1 に持ち、Agent domain 正本を複製しない必要がある。

**要件**

- Client server は管理対象 Agent の Client D1 台帳を所有 MUST。
- 台帳は `agent_id`、Agent RPC origin、表示名、pin フラグ、並び順、作成/更新時刻、最終閲覧時刻を保持する MUST。
- 台帳は Agent ごとの `signingIssuer`、`signingKid`、public fingerprint、last verified at を保持する MUST。
- Client D1 は Client-owned data として managed Agent records、外部 credential references、encrypted Client Service signing key store を保持できる MUST。
- Client server は Client-owned サーバー側コードだけを通じて台帳を読み書き MUST。
- Agent Service は Client D1 を読み書き MUST NOT。
- Client 台帳は authoritative Agent domain 状態として扱われて MUST NOT。
- Agent ごとの署名鍵選択は Cloudflare ENV/Secret ではなく、Client D1 の managed Agent metadata から解決 MUST。

#### Scenario: 管理対象 Agent 台帳が表示情報と署名 identity metadata を永続化する (CLIENT-REGISTRY-S001)

- **GIVEN** Client 運用者が Agent RPC origin、表示名、signing issuer/kid、public fingerprint を指定して `agent-alpha` を登録している
- **WHEN** 運用者が Agent entry を pin、並べ替え、rename、open、または署名鍵選択を更新する
- **THEN** Client D1 は表示名、pin フラグ、並び順、時刻、最終閲覧時刻、signing issuer/kid、public fingerprint、last verified at を永続化する
- **AND** 台帳だけの更新では Agent Service 状態は変更されない

### Requirement: credential 参照境界の維持

Client server は平文 secret を含めずに Provider/外部 credential 参照と Agent RPC 用の暗号化済み署名鍵 material を分離して保存 SHALL。

**利用者文脈**

Client は Agent RPC をサーバー側で呼ぶため署名鍵を管理し、Provider や model provider など別用途の credential 参照も扱う必要がある。これらを同じ Agent RPC 認証 source として扱うと、署名経路が曖昧になり、秘密鍵や生 secret が D1 やブラウザーに平文で漏えいする。運用者は private key JSON を Worker Secret に貼らず、Management Client のサーバー側管理機能で Agent RPC 署名鍵ライフサイクルを扱いたい。

**要件**

- Client D1 は Provider、model provider、Integration など Agent RPC 認証以外の外部 credential 参照として、credential 参照、key ID、マスク済みヒント、状態、時刻を保存 MUST。
- 外部 credential 参照は Agent RPC Client Service JWT signing source として扱われて MUST NOT。
- Client D1 は Agent RPC 認証用の Client signing key record として keyId、issuer、public JWK、public fingerprint、encrypted private JWK、status、created/updated/last-used timestamps を保存 MUST。
- Agent RPC の signing identity は Client signing key record と managed Agent の signingIssuer/signingKid/publicFingerprint からのみ解決 MUST。
- Client signing key record の status は Client 側の使用可否を表し、Agent trust config export の key status `active`、`retiring`、`revoked` とは明示的な mapping を通じて接続 MUST。
- Client status `active` の key は trust config export で `active` または `retiring` として選択可能である MUST。
- Client status `disabled` または `deleted` の key は JWT signing に使用されて MUST NOT し、trust config export では `revoked` としてだけ出力可能である MUST。
- Client status `deleted` の key は encrypted private JWK を復号不能または削除済みにし、公開 tombstone metadata が残る場合だけ trust config の `revoked` entry として利用できる MUST。
- Client server は Agent RPC bearer JWT を署名するために `credentialRef`、`AGENT_CREDENTIAL_*` Worker Secret、HS256 shared secret、または Provider credential 参照を解決して MUST NOT。
- Client signing key record の private JWK は `CLIENT_CREDENTIAL_ENCRYPTION_KEY` を使って暗号化 MUST。
- Client D1 は平文の秘密鍵、生 shared secret、private JWK plaintext を保存して MUST NOT。
- Client server はサーバー側実行内でのみ credential 参照と encrypted private JWK を解決 MUST。
- ブラウザー応答は Agent credential、生 JWT 署名鍵、private JWK plaintext、Provider 秘密鍵、生 shared secret を含んで MUST NOT。
- Client server は Client private signing key JSON を Worker Secret へ手動設定する運用を必須として MUST NOT。

#### Scenario: credential 参照と暗号化済み signing key store は平文 secret を保存しない (CLIENT-REGISTRY-S002)

- **GIVEN** 運用者が Provider 用 credential 参照を保存し、Agent RPC 用 Ed25519 署名鍵ペアを生成している
- **WHEN** Client server が credential メタデータと signing key record を永続化する
- **THEN** D1 の外部 credential 参照には credential 参照、key ID、マスク済みヒント、状態、時刻だけが含まれる
- **AND** D1 の signing key record には public JWK、public fingerprint、encrypted private JWK、状態、時刻だけが含まれる
- **AND** 平文の秘密鍵、生 shared secret、private JWK plaintext は D1 記録、ブラウザー payload、log に含まれない
- **AND** 外部 credential 参照は Agent RPC JWT signing source として使用されない
- **AND** Client D1 の許可データ集合は managed Agent records、外部 credential references、encrypted Client Service signing key store に限定され、Agent domain snapshots は含まれない

#### Scenario: Agent RPC 認証が signing key store だけを署名 source にする (CLIENT-REGISTRY-S011)

- **GIVEN** managed Agent が signingIssuer/signingKid/publicFingerprint を保持し、Client signing key store に対応する active Ed25519 key record が存在する
- **WHEN** Client server が Agent RPC bearer JWT を生成する
- **THEN** Client server は signing key store の encrypted private JWK を server-only module 内で復号して EdDSA JWT を署名する
- **AND** `credentialRef`、`AGENT_CREDENTIAL_*` Worker Secret、HS256 shared secret、Provider credential 参照は Agent RPC signing source として使われない

### Requirement: サーバー側 Agent RPC invocation の限定

Client server はサーバー側の生成済み client からのみ Agent RPC を呼び出す SHALL。

**利用者文脈**

ブラウザーから Agent エンドポイントを直接呼ぶと CORS、credential 配布、認可モデルが複雑になり、secret が露出する。Client は Server Components/Server Actions から生成済み Connect client を使い、Client D1 の signing metadata と暗号化済み private key をサーバー側で解決して Agent API を呼ぶ必要がある。

**要件**

- Client server は Agent Service 呼び出しに生成済み Protobuf RPC client descriptor とサーバー側 Connect transport を使用 MUST。
- Client server は managed Agent metadata から対象 Agent の signing issuer/kid/public fingerprint を選択 MUST。
- Client server は issuer/kid に対応する active signing key record を server-only module で解決 MUST。
- Client server は `CLIENT_CREDENTIAL_ENCRYPTION_KEY` で private JWK を server-only module 内だけで復号 MUST。
- Client server は `agent_id`、scope、acting user 文脈、`jti`、audience、time window を含む Ed25519 JWT を署名し、`Authorization: Bearer <jwt>` として付与 MUST。
- ブラウザーコードは Agent RPC origin を直接呼び出して MUST NOT し、生 Agent RPC リクエスト、生 JWT、signing material を構築して MUST NOT。
- Client server は Hono route または OpenAPI Agent 成果物から Agent RPC client を生成して MUST NOT。

#### Scenario: サーバー Action が signing key store と生成済み Connect client で Agent RPC を呼ぶ (CLIENT-REGISTRY-S003)

- **GIVEN** 利用者が Client UI で Agent 管理 action を実行している
- **WHEN** 対応する Server Action が実行される
- **THEN** Server Action は Client D1 台帳、managed Agent の signing issuer/kid/public fingerprint、encrypted private JWK をサーバー側で読み取る
- **AND** `credentialRef` または `AGENT_CREDENTIAL_*` Worker Secret を経由せず、生成済み Connect client、binary Protobuf 互換 transport、選択済み Ed25519 署名鍵による EdDSA JWT bearer metadata を使って Agent Service を呼び出す
- **AND** ブラウザーは安全化済み action 結果データだけを受け取る

### Requirement: Client-managed signing key lifecycle

Client server は Client Service signing key lifecycle をサーバー側 store として管理 SHALL。

**利用者文脈**

運用者は Agent 登録前でも Management Client から Client Service signing key を生成、停止、削除、選択し、Agent trust config と一致しているか確認したい。Private key をブラウザーや Worker Secret 手貼りに出す運用は漏えいしやすく、鍵交代や緊急失効の作業も追跡できない。

**要件**

- Client server は Ed25519 key pair をサーバー側で生成 SHALL。
- Client server は managed Agent が 0 件でも Client signing key record を生成、一覧、既定選択、状態更新できる SHALL。
- 生成された private JWK はブラウザー、HTML、local storage、session storage、client bundle、network response へ返して MUST NOT。
- Client server は signing key status として `active`、`disabled`、`deleted` を管理 SHALL。
- `active` signing key だけが JWT signing に使用可能である MUST。
- `disabled` signing key は signing に使用されて MUST NOT。
- `deleted` signing key は signing に使用されて MUST NOT し、private key material は復号不能または削除済みとして扱われる MUST。
- Client server は issuer + kid の組で signing key を一意に解決 MUST。
- Client server は public fingerprint を決定的に算出し、Agent registry metadata と照合可能にする MUST。
- Client server は key 使用時に lastUsedAtMs を更新 SHALL。

#### Scenario: サーバー側 key generation が private JWK をブラウザーに返さない (CLIENT-REGISTRY-S006)

- **GIVEN** managed Agent が 0 件または 1 件以上存在し、運用者が signing key generation action を実行する
- **WHEN** Client server が Ed25519 key pair を生成して key record を保存する
- **THEN** action result は issuer、kid、public JWK、public fingerprint、status、timestamps だけを返す
- **AND** private JWK plaintext と encrypted private JWK はブラウザー payload に含まれない

#### Scenario: disabled または deleted signing key は JWT signing に使われない (CLIENT-REGISTRY-S007)

- **GIVEN** managed Agent が status `disabled` または `deleted` の signing key を参照している
- **WHEN** Client server が Agent RPC bearer token を生成しようとする
- **THEN** Client server は signing を拒否し、対処可能な server-side error を返す
- **AND** Agent RPC は送信されない

#### Scenario: 署名鍵 fingerprint が Agent registry metadata と照合される (CLIENT-REGISTRY-S008)

- **GIVEN** managed Agent record が issuer/kid/public fingerprint を保持している
- **WHEN** Client server が対応する signing key record を読み取る
- **THEN** signing key の public fingerprint は managed Agent record と一致することが検証される
- **AND** 不一致の場合は Agent RPC 呼び出し前に拒否される

### Requirement: Agent domain スナップショット非永続化の保証

Client server は Agent domain スナップショットを Client-owned 状態として永続化しない SHALL。

**利用者文脈**

Client UI は Agent profile、Thread、Run、Schedule、Tool、Integration 情報を表示する必要がある。しかし、それらの domain スナップショットを Client D1 に複製すると古い projection と所有関係の曖昧さが生じる。Client は domain データが必要なときに Agent Service を問い合わせる必要がある。

**要件**

- Client D1 は Integration Installation、Adapter Connection、ToolInvocation、Schedule、AgentEvent、ThreadMemory、AgentState、AgentRun 状態の authoritative スナップショットを永続化して MUST NOT。
- Client server は authoritative にならず secret を含まない場合に限り、一時的な UI データを cache できる。
- Client server は画面/action の必要に応じて Agent domain 状態を Agent RPC から取得 MUST。

#### Scenario: Client が D1 スナップショットではなく Agent RPC から Agent domain 詳細を読む (CLIENT-REGISTRY-S004)

- **GIVEN** Agent 詳細ページが profile、Thread、Run、Schedule、Tool、Integration を必要としている
- **WHEN** Client server がページを描画する、または refresh を処理する
- **THEN** Client server は Agent-owned domain データを Agent RPC から問い合わせる
- **AND** Client D1 は管理対象 Agent 台帳と credential 参照に限定される

### Requirement: Client 公開 Agent proxy API を持たない

Client application は公開 Agent proxy API を公開しない SHALL。

**利用者文脈**

Client は管理 UI であり Agent API Provider ではない。Client が `/api` 経由で Agent API を代理公開すると、権限境界、監査、credential scope が曖昧になる。

**要件**

- Client は Agent Service operation を mirror する公開 REST、JSON、RPC proxy route を公開して MUST NOT。
- Next.js Server Actions と Server Components は UI 実行境界として動作できるが、公開 Agent domain API として文書化または扱われて MUST NOT。
- Agent RPC origin と credential はサーバー側に留める MUST。

#### Scenario: Client が公開 Agent proxy route を持たない (CLIENT-REGISTRY-S005)

- **GIVEN** Client Worker が管理 UI route とともに deploy されている
- **WHEN** Browser または外部 caller が `/api/client/agents`、`/api/client/integrations`、または別の Agent proxy route へアクセスを試みる
- **THEN** Client は公開 Agent proxy エンドポイントを公開しない
- **AND** Agent operation は認証済み UI Server Action または server-rendered flow 経由でのみ到達できる

### Requirement: Client model policy metadata boundary

Client registry は model policy body を Agent-owned 正本として扱い、Client D1 へ複製して MUST NOT。

**Customer Context**

Management Client は model policy を扱う UI を提供するが、Agent-owned model policy body や credential を Client D1 の正本として複製すると、Agent aggregate boundary と secret 管理が崩れる。

**Requirement**

Client D1 は Agent-owned model policy body を authoritative state として保存して MUST NOT。Client D1 が model policy に関する値を保持する場合、draft form metadata、safe policy ref、last seen digest、provider/model 表示 metadata、validation timestamp など UI 補助情報に限定 MUST。

Client server は model policy の正本を Agent RPC から取得 SHALL。Client server は policy upsert、validate、archive、config update を generated Agent RPC client と server-only credential resolution 経由で実行 MUST。Browser-visible code は Agent RPC origin への direct request、raw Agent RPC payload construction、credential material、Connect runtime を持って MUST NOT。

#### Scenario: Client D1 は model policy body を正本保存しない (CLIENT-REGISTRY-S009)

- **GIVEN** 運用者が Agent Settings で model policy を編集している
- **WHEN** Client server が UI 補助 metadata を保存する
- **THEN** Client D1 は draft metadata、safe ref、digest、provider/model 表示値だけを保持できる
- **AND** Agent-owned policy body、credentialRef が指す secret value、provider token は保存されない

#### Scenario: Client server は Agent RPC から model policy 正本を読む (CLIENT-REGISTRY-S010)

- **GIVEN** Agent detail page が default model policy metadata を表示する
- **WHEN** Client server がページを描画する
- **THEN** Client server は generated Agent RPC client で Agent-owned policy と config を取得する
- **AND** Browser は安全化された policy metadata だけを受け取り、direct Agent RPC call は行わない
