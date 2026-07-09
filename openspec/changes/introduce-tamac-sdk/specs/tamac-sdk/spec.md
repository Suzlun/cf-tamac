## ADDED Requirements

### Requirement: Server-side Agent 操作 SDK

`@cf-tamac/sdk` は server-side consumer が TAMAC Agent を typed Protobuf RPC client aggregate で操作できる SDK として提供される SHALL。

**Customer Context**

TAMAC Agent を組み込む開発者は、Agent lifecycle、Thread、Event、Run、Schedule、Tool、Integration、Health を同じ server-side TypeScript API から操作したい。開発者は Protobuf RPC の service ごとの差異を SDK の型と client 集約で扱い、Agent ID、RPC origin、scope、acting user 文脈を毎回一貫して渡せる必要がある。

**Requirement**

`@cf-tamac/sdk` は server-side TypeScript package として公開される SHALL。

SDK は TAMAC Agent の generated Protobuf RPC service descriptors を利用し、Connect unary binary Protobuf transport で Agent Service を呼び出す SHALL。

SDK は Agent lifecycle、event、thread、run、state、schedule、tool、integration、integration ingress、health、model policy の service client を一つの server-side client 集約として提供する SHALL。

SDK consumer は Agent RPC origin、`agent_id`、要求 scope、acting user context、signing context、request correlation context を server-side execution context で与える SHALL。

SDK は server-side execution context ごとの transport と authentication metadata を生成し、各 RPC call に service/method、`agent_id`、request ID、idempotency key を関連付ける SHALL。

#### Scenario: Server-side consumer が SDK で Agent health を確認する (TAMAC-SDK-S001)

- **GIVEN** server-side consumer が Agent RPC origin、`agent_id`、scope、acting user context、signing context を持っている
- **WHEN** consumer が `@cf-tamac/sdk` の Agent health client で `Check` を呼び出す
- **THEN** SDK は Connect unary binary Protobuf request と Client Service 認証 metadata を生成する
- **AND** SDK は Agent health response を typed result として返す

#### Scenario: SDK client 集約が Agent service 群を同じ呼び出し文脈で提供する (TAMAC-SDK-S002)

- **GIVEN** server-side consumer が SDK client 集約を作成している
- **WHEN** consumer が Event publish、Thread query、Schedule command、Tool approval、Integration operation の各 client を取得する
- **THEN** 各 client は同じ Agent RPC origin、`agent_id`、scope、acting user context、request correlation context を共有する
- **AND** 各 RPC call は generated Protobuf RPC service descriptor に対応する typed request と typed response を扱う

### Requirement: Client Service 認証 metadata の生成

SDK は server-side consumer から供給された signing context と acting user context を使用し、Agent RPC 用 Client Service 認証 metadata を生成する SHALL。

**Customer Context**

SDK consumer は Agent Service に対して短命 Client Service credential を付与し、acting user と request correlation を監査可能にしたい。署名鍵の保管元は consumer ごとに異なるため、SDK は credential material の読み取り元を固定せず、server-side context から受け取った signing context で metadata を生成する必要がある。

**Requirement**

SDK は EdDSA Client Service JWT を生成する SHALL。JWT は issuer、subject、JWT ID、audience、有効期間、`agent_id`、scope、acting user identity、request correlation identifier を含む SHALL。

SDK は generated RPC method、`agent_id`、scope、idempotency key、request ID を JWT または RPC metadata に関連付ける SHALL。

Signing context は consumer-owned secure server-side storage から供給される SHALL。SDK は供給された signing context を RPC metadata 生成の処理範囲で扱う SHALL。

SDK は `ResolvedAgentRpcCredential` 相当の credential view、`ActingUserContext` 相当の acting user view、scope view を public SDK types として提供する SHALL。

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

### Requirement: Server-side boundary と安全な browser-delivered data

SDK consumer は Agent RPC execution を server-side boundary に集約し、browser-delivered data を安全な表示用 payload に限定する SHALL。

**Customer Context**

Management Client や他の UI を持つ SDK consumer は、Browser には表示用データだけを届け、Agent RPC origin、credential、署名処理、Connect runtime construction を server-side execution boundary に集約したい。SDK package の利用境界が明確であるほど、UI 実装者は Agent 操作の安全な呼び出し面を選びやすい。

**Requirement**

SDK public package は server-side runtime package として識別される SHALL。

SDK consumer の browser-delivered payload は、SDK result から作られた安全な display data、status、safe error category、correlation identifier に限定される SHALL。

SDK consumer の server-side execution boundary は、SDK client construction、Agent RPC origin、credential view、signing context、Connect transport construction、generated RPC descriptor usage を所有する SHALL。

SDK は bundler と static validation が server-side package boundary を識別できる package metadata と public entrypoints を提供する SHALL。

#### Scenario: Management Client が SDK result を安全な表示データとして返す (TAMAC-SDK-S005)

- **GIVEN** Management Client の server-side action が SDK 経由で Agent RPC を呼び出している
- **WHEN** action が Browser に結果を返す
- **THEN** Browser-delivered payload は表示用 data、safe status、safe error category、correlation identifier で構成される
- **AND** SDK client construction と authentication metadata generation は server-side execution boundary に属する

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
