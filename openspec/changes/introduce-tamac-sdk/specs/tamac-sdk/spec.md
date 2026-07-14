## ADDED Requirements

### Requirement: サーバーサイド Agent 操作 SDK

TAMAC server-side SDK は、server-side consumer が一貫した typed Agent RPC aggregate で TAMAC Agent を操作できる能力を提供する SHALL。

**Customer Context**

TAMAC Agent を組み込む開発者は、Agent lifecycle、model policy、Event、Thread、Run、State、Schedule、Tool、Integration、Health を同じ server-side TypeScript API から操作したい。開発者は Protobuf RPC の service ごとの差異を SDK の型と client 集約で扱い、Agent ID、RPC origin、scope、acting user 文脈を毎回一貫して渡せる必要がある。

**Requirement**

TAMAC server-side SDK は TypeScript consumer 向けに公開される SHALL。

SDK は TAMAC Agent の typed RPC request/response contract に従って Agent Service を呼び出す SHALL。

Client Service SDK aggregate は Client Service principal が認可された lifecycle、model policy、event、thread、run、state、schedule、tool、integration、health operations を提供する SHALL。

Client Service SDK aggregate の各 operation は同じ Client Service JWT context、Agent scope、acting user context、request correlation context を使用する SHALL。

Integration Provider は Provider-facing signature context と detached-signature principal を使用する専用 integration surface から ingress operations を呼び出す SHALL。

SDK consumer は Agent RPC origin、`agent_id`、要求 scope、acting user context、signing context、request correlation context を server-side execution context で与える SHALL。

SDK は server-side execution context ごとの authentication metadata を生成し、各 RPC call に operation、`agent_id`、request ID、idempotency key を関連付ける SHALL。

#### Scenario: Server-side consumer が SDK で Agent health を確認する (TAMAC-SDK-S001)

- **GIVEN** server-side consumer が Agent RPC origin、`agent_id`、scope、acting user context、signing context を持っている
- **WHEN** consumer が TAMAC server-side SDK の Agent health operation を呼び出す
- **THEN** SDK は typed Agent RPC request と Client Service 認証 metadata を生成する
- **AND** SDK は Agent health response を typed result として返す

#### Scenario: Client Service SDK と Provider integration surface が専用の認証文脈を使用する (TAMAC-SDK-S002)

- **GIVEN** Client Service consumer が SDK aggregate を作成し、Integration Provider が Provider-facing signature context を持っている
- **WHEN** Client Service consumer が lifecycle、model policy、event、thread、run、state、schedule、tool、integration、health operations を取得する
- **THEN** 各 operation は同じ Agent RPC origin、`agent_id`、scope、acting user context、request correlation context、Client Service JWT context を共有する
- **AND** Provider ingress operations は Provider-facing signature context と detached-signature principal を使用する専用 integration surface から呼び出される

### Requirement: Client Service 認証 metadata の生成

SDK は server-side consumer から供給された signing context と acting user context を使用し、Agent RPC 用 Client Service 認証 metadata を生成する SHALL。

**Customer Context**

SDK consumer は Agent Service に対して短命 Client Service credential を付与し、acting user と request correlation を監査可能にしたい。署名鍵の保管元は consumer ごとに異なるため、SDK は credential material の読み取り元を固定せず、server-side context から受け取った signing context で metadata を生成する必要がある。

**Requirement**

SDK は EdDSA Client Service JWT を生成する SHALL。JWT は issuer、subject、JWT ID、audience、有効期間、`agent_id`、scope、acting user identity、request correlation identifier を含む SHALL。

SDK は Agent operation identity、`agent_id`、scope、idempotency key、request ID を JWT または RPC metadata に関連付ける SHALL。

Signing context は consumer-owned secure server-side storage から供給される SHALL。SDK は供給された signing context を RPC metadata 生成の処理範囲で扱う SHALL。

SDK は credential view、acting user view、scope view を typed public inputs として提供する SHALL。

#### Scenario: SDK が acting user 付き Client Service JWT を付与する (TAMAC-SDK-S003)

- **GIVEN** server-side consumer が issuer、kid、audience、`agent_id`、scope、acting user identity、signing context を SDK に渡している
- **WHEN** consumer が mutating Agent RPC を SDK 経由で呼び出す
- **THEN** SDK は短命 Client Service JWT と request metadata を生成する
- **AND** metadata は対象 `agent_id`、要求 scope、acting user identity、request ID、idempotency key と対応する

#### Scenario: SDK consumer が自身の server-side storage から signing context を供給する (TAMAC-SDK-S004)

- **GIVEN** SDK consumer が自身の server-side credential store から signing context を解決している
- **WHEN** consumer が SDK client 集約を作成する
- **THEN** SDK は consumer から受け取った signing context で RPC authentication metadata を構築する
- **AND** SDK public API は credential view と acting user view を typed input として受け取る

### Requirement: サーバーサイド境界と安全な Browser 配信 data

SDK consumer は Agent RPC execution を server-side boundary に集約し、browser-delivered data を安全な表示用 payload に限定する SHALL。

**Customer Context**

Management Client や他の UI を持つ SDK consumer は、Browser には表示用データだけを届け、Agent RPC origin、credential、署名処理、Agent RPC transport を server-side execution boundary に集約したい。SDK usage の境界が明確であるほど、UI 実装者は Agent 操作の安全な呼び出し面を選びやすい。

**Requirement**

SDK entrypoint は server-side execution boundary で利用される SHALL。

SDK consumer が Browser に返す Agent 操作結果は、SDK result または normalized error から作られた safe display data、safe status、safe error category、correlation ID の閉じた schema で構成される SHALL。

SDK consumer の server-side execution boundary は、SDK aggregate construction、Agent RPC origin、credential view、signing context、Agent RPC transport を所有する SHALL。

Credential、private signing key、raw JWT、SDK raw error detail は server-side security と observability context が所有し、Browser 向け結果は safe fields へ投影される SHALL。

#### Scenario: Management Client が SDK result を安全な表示データとして返す (TAMAC-SDK-S005)

- **GIVEN** Management Client が SDK 経由で Agent RPC を呼び出している
- **WHEN** Management Client が Browser に Agent 操作結果を返す
- **THEN** Browser-delivered payload は safe display data、safe status、safe error category、correlation ID の閉じた schema で構成される
- **AND** credential、private signing key、raw JWT、SDK raw error detail は server-side security と observability context で処理される

### Requirement: Management Client の Agent RPC origin policy

Management Client は server-managed HTTPS origin allowlist によって Agent RPC destination を検証する SHALL。

**Customer Context**

Management Client の管理者は、Browser から Agent を登録して Management Client で操作するとき、Client Service JWT が運用者の承認した Agent Service origin にだけ送信されることを必要としている。登録済み metadata を利用する時点でも同じ policy が適用されることで、運用設定の更新を直ちに通信境界へ反映できる。

**Requirement**

Management Client は server-managed configuration から HTTPS Agent RPC origin allowlist を検証可能な形式で読み込む SHALL。

Browser registration input の Agent RPC origin は、正規化後の HTTPS origin が server-managed allowlist に一致した場合に managed Agent metadata として受理される SHALL。

Management Client は managed Agent metadata から SDK transport を構築する直前に Agent RPC origin を server-managed allowlist で再検証する SHALL。Origin policy violation は safe configuration error category と correlation ID を持つ Browser 向け Agent 操作結果として完了する SHALL。

#### Scenario: 管理者が許可済み HTTPS Agent RPC origin を登録する (TAMAC-SDK-S007)

- **GIVEN** server-managed configuration が正規化済み HTTPS Agent RPC origin を許可している
- **WHEN** 管理者が Browser registration input から同じ origin の managed Agent metadata を登録する
- **THEN** Management Client は origin policy validation を完了し、managed Agent metadata を受理する
- **AND** Browser は safe status と correlation ID を持つ登録結果を受け取る

#### Scenario: SDK transport 構築時の origin policy validation が安全な結果を返す (TAMAC-SDK-S008)

- **GIVEN** Management Client が managed Agent metadata を読み込み、現在の server-managed origin policy を適用できる
- **WHEN** 管理者が SDK transport を必要とする Agent 操作を要求する
- **THEN** Management Client は transport 構築前に HTTPS origin allowlist validation を実行する
- **AND** origin policy violation の場合、Management Client は safe configuration error category と correlation ID を持つ Browser 向け Agent 操作結果を返す

### Requirement: SDK error 正規化と observability context

SDK は Agent RPC failures を stable category と safe observability context を持つ normalized error として扱う SHALL。

**Customer Context**

SDK consumer は Agent RPC 失敗時に、入力修正、権限確認、retry、運用調査のどれを行うべきかを安定した error category で判断したい。運用者は service/method、Agent、request correlation を追跡しながら、機密情報を安全な詳細へ整理したい。

**Requirement**

SDK は Connect error code、service name、method name、`agent_id`、request ID、idempotency key、correlation ID、safe detail を含む normalized error を返す SHALL。

SDK は `invalid_argument`、`unauthenticated`、`permission_denied`、`not_found`、`already_exists`、`failed_precondition`、`aborted`、`resource_exhausted`、`unavailable`、`deadline_exceeded`、`internal` を stable SDK error category に対応付ける SHALL。

SDK normalized error と observability metadata は safe detail、safe category、request correlation、service/method context で構成される SHALL。

SDK consumer は normalized error を application log、UI status、test assertion に利用できる SHALL。

#### Scenario: Permission denied が SDK normalized error として返る (TAMAC-SDK-S006)

- **GIVEN** server-side consumer が scope 外の Agent RPC を SDK 経由で呼び出している
- **WHEN** Agent Service が `permission_denied` を返す
- **THEN** SDK は stable SDK error category、Connect code、service/method、`agent_id`、request ID、safe detail を含む normalized error を返す
- **AND** consumer は normalized error の category と correlation identifier を使って UI status と運用 log を作成できる
