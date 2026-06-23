# agent-integration Specification

## Purpose

TBD - created by archiving change implement-agent-service-base. Update Purpose after archive.

## Requirements

### Requirement: Integration manifest と Installation

AIAgent Durable Object は Installation を activate する前に Integration manifest を検証 SHALL。

**利用者文脈**

Agent 管理者は、外部 Provider が提供する Adapter、Tool、Delivery capability を Agent に追加したいが、Provider の身元、鍵、grant、schema、版を検証せずに導入すると不正な ingress や外部作用につながる。

**要件**

- Integration Installation は一つの AIAgent Durable Object に所有される MUST。
- Integration manifest は Integration ID、版、schema 版、Provider identity、Provider 公開署名鍵、対応 RPC base URL、Adapter definition、Tool definition、Delivery definition、要求 grant、更新 policy を含める MUST。
- Manifest は Provider により署名され、Installation が有効になる前に検証される MUST。
- Installation 状態は `installing`、`pending_external_setup`、`active`、`disabled`、`uninstalling`、`uninstalled`、`failed` を支援 MUST。

#### Scenario: InstallIntegration が有効化前に署名済み manifest を検証する (AGENT-INTEGRATION-S001)

- **GIVEN** 認可済み Client Service principal が manifest URL または manifest payload で Integration installation をリクエストしている
- **WHEN** AIAgent Durable Object が manifest を fetch または受信する
- **THEN** Provider signature、schema 版、Integration identity、key、要求 grant、対応 RPC profile を検証する
- **AND** 検証が失敗した場合、有効 grant を永続化せず installation を拒否する

#### Scenario: successful install が grant、Adapter、Tool、Delivery、trust key を永続化する (AGENT-INTEGRATION-S002)

- **GIVEN** manifest が有効で、要求 grant が policy により approved されている
- **WHEN** `InstallIntegration` が成功する
- **THEN** Agent は Installation 記録、Provider 公開鍵、grant、Adapter definition、Tool definition、Delivery definition、manifest digest、setup 状態を保存する
- **AND** 監査 Event が system Thread に追加される

#### Scenario: Installation が external setup を待機できる (AGENT-INTEGRATION-S003)

- **GIVEN** Integration が ingress 有効化前に Provider 側 connection setup を必要としている
- **WHEN** `InstallIntegration` が Agent 側永続化を完了するが外部 setup が incomplete である
- **THEN** Installation 状態は `pending_external_setup` である
- **AND** ingress、Tool、Delivery capability は、その状態で有効な grant に対してのみ enabled になる
- **AND** Client は secret material を露出せずに setup 手順を照会できる

### Requirement: Adapter Connection と Integration ingress

AIAgent Durable Object は Installation ごとに Adapter Connection と署名済み Integration ingress を管理 SHALL。

**利用者文脈**

Integration Provider は外部 platform protocol を AgentEvent に変換する ingress capability を持つ。Agent は Connection ごとの grant、signature、nonce、thread_key、DeliveryContext を検証し、Provider からの Event を正しい Thread に受け入れる必要がある。

**要件**

- AdapterConnection は有効な Integration Installation と一つの Agent に所属 MUST。
- Adapter Connection の作成、削除、一覧取得は `AgentIntegrationService.CreateAdapterConnection`、`DeleteAdapterConnection`、`ListAdapterConnections` として `packages/agent/src/typespec/src/services/agent-integration.tsp` から公開され、Agent-scoped であり、Client Service scope により認可される MUST。
- `packages/agent/src/typespec/src/services/agent-adapter.tsp` は Agent TypeSpec service tree に存在 MUST し、`IntegrationIngressService.PublishEvent`、`PublishToolResult`、`PublishDeliveryResult` を定義 MUST。
- `packages/agent/src/typespec/src/services/agent-adapter.tsp` は Adapter Connection 管理、Connection 個別取得、または Agent-facing Adapter 管理用の別 service を定義して MUST NOT。
- IntegrationIngressService は有効な detached signature、時刻、nonce、idempotency、body digest、grant、Connection 所有関係を持つ有効な Integration Installation principal からのリクエストのみ受理 MUST。
- Integration ingress Event は有効な `thread_key` を含むか導出 MUST し、ingress protocol が応答 delivery をサポートする場合は DeliveryContext を作成できる。

#### Scenario: Adapter Connection ライフサイクルは Agent-local である (AGENT-INTEGRATION-S004)

- **GIVEN** Installation `inst-1` が有効で Adapter definition を提供している
- **WHEN** 認可済み principal が `AgentIntegrationService.CreateAdapterConnection`、`ListAdapterConnections`、`DeleteAdapterConnection` を呼び、`inst-1` の Adapter Connection を作成、一覧取得、削除する
- **THEN** Connection 状態は対象 Agent 内だけで変更される
- **AND** list 応答は他の Agent または Installation の Connection を露出しない
- **AND** 削除後、その Connection からの future ingress は無効化される

#### Scenario: 署名済み Integration ingress が Event と DeliveryContext を追加する (AGENT-INTEGRATION-S005)

- **GIVEN** 有効な Installation `inst-1` が ingress grant を持つ Connection `conn-1` を有している
- **WHEN** Provider が有効な signature、nonce、body digest、idempotency key、`thread_key` で `IntegrationIngressService.PublishEvent` を呼ぶ
- **THEN** AIAgent Durable Object は resolved Thread に Event を受け入れる
- **AND** delivery メタデータが含まれる場合は DeliveryContext を作成する
- **AND** Thread の pending Run work を coalesce する

### Requirement: Delivery 相互運用性の保証

Delivery 相互運用性は Provider 応答を先行 ingress DeliveryContext に bind SHALL。

**利用者文脈**

Adapter ingress に対する応答は、元の platform 文脈へ返る必要がある。一方で、元 ingress と無関係な外向き送信は Tool で扱う必要がある。Delivery と Tool の境界が明確でないと、権限と監査が曖昧になる。

**要件**

- DeliveryContext は先行 ingress Event と Adapter Connection に紐づく応答 capability を表す MUST。
- Agent API TypeSpec は、unary `Deliver` method を持つ Provider-facing `IntegrationDeliveryService` を `packages/agent/src/typespec/src/services/integration-delivery.tsp` または同等の service module で定義 MUST。
- Agent-to-Provider Delivery RPC は署名済み Connect + binary Protobuf を使用 MUST し、signature base に Agent、Installation、Connection、DeliveryContext、時刻、nonce、idempotency key、生 body digest を含める MUST。
- AIAgent Durable Object は生 ad-hoc JSON や REST リクエストではなく、生成済み Protobuf client descriptor を通じて Delivery Provider を呼び出す MUST。
- AIAgent Durable Object は Delivery 応答と能動的な外向き action を区別 MUST し、後者は ToolInvocation としてモデル化 MUST。
- Delivery 結果 callback は Integration Installation principal として認証され、元の DeliveryContext に紐づく MUST。

#### Scenario: Agent が Provider RPC 経由で Delivery 応答を送信する (AGENT-INTEGRATION-S006)

- **GIVEN** Run が DeliveryContext `deliv-1` を持つ ingress Event への respond を決定している
- **WHEN** AIAgent Durable Object が delivery を実行する
- **THEN** 生成済み Provider client を通じて署名済み binary Protobuf RPC として `IntegrationDeliveryService.Deliver` を送信する
- **AND** AdapterDelivery 状態、リクエスト digest、因果 Run/Event link を記録する
- **AND** 後続の Delivery 結果 callback は同じ DeliveryContext を更新する

### Requirement: uninstall クリーンアップと Provider 汎用境界

Uninstall cleanup は追跡履歴を保持しながら Integration capability を無効化 SHALL。

**利用者文脈**

Integration を外すとき、ingress、Tool、Schedule、Delivery、trust key が残ると不要な外部入力や作用が発生する。Agent 側は Integration/Installation に保存された Adapter、Tool、Delivery definition と grant を解釈材料とし、外部 protocol の種類、payload 形式、Provider 実装差分を Agent domain へ伝播させずに相互運用できる必要がある。

**要件**

- UninstallIntegration は `uninstalling` を経由して遷移 MUST し、Installation を `uninstalled` と mark する前に ingress、Adapter Connection、Integration Tool、pending ToolInvocation、Integration-owned Schedule、DeliveryContext、trust key、grant を無効化 MUST。
- Uninstall は traceability のため Event、History、ToolInvocation 記録、Compaction、監査記録を保持 MUST。
- Agent Service は Integration、Adapter、Tool、Delivery 相互運用性を定義 MUST し、Agent 側の解釈と状態遷移は Installation に保存された definition、grant、Connection、DeliveryContext から決定される MUST。

#### Scenario: UninstallIntegration が capabilities を disable し history を保持する (AGENT-INTEGRATION-S007)

- **GIVEN** Installation `inst-1` が有効な Adapter Connection、Tool、Schedule、pending ToolInvocation、DeliveryContext を持っている
- **WHEN** 認可済み principal が `UninstallIntegration` を呼ぶ
- **THEN** ingress は拒否され、Connection は `disabled` になり、Tool は `unavailable` になり、関連 Schedule は `cancelled` になり、pending ToolInvocation は `cancelled` または `outcome_unknown` として mark され、DeliveryContext は `revoked` され、trust key は `revoked` される
- **AND** 既存の Event、History、ToolInvocation 記録、監査 Event は照会可能なままである

#### Scenario: 汎用 Integration Provider が外部 protocol 差分を Agent domain へ伝播させず動作する (AGENT-INTEGRATION-S008)

- **GIVEN** Provider が汎用 manifest、ingress、Tool、Delivery RPC 契約を実装している
- **WHEN** Provider が Agent に install され、有効な Adapter Connection を通じて Event を publish する
- **THEN** Agent Service は同じ signature、grant、Thread、Tool、Delivery rule を使用して汎用 Integration interaction を受理し処理する
- **AND** Agent Service の state、authorization、Run input は Installation の definition、grant、Connection、DeliveryContext から一貫して導出される
