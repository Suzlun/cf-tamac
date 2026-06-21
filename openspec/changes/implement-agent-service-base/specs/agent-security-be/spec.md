## ADDED Requirements

### Requirement: principal 認証の実行

Agent Service は各 RPC caller を対応済み principal type として認証 SHALL。

**利用者文脈**

Agent API は Client Service、Extension Installation、Internal Service、Admin Operator など複数の主体から呼ばれる。Browser user を直接 Agent principal にせず、サーバー側 service identity と acting user 情報で監査できる必要がある。

**要件**

- Agent Service は issuer、subject、JWT ID、audience、expiry、not-before、`agent_id`、scope、acting user identity を持つ短命 JWT または同等の application-level credential を使用して Client Service リクエストを認証 MUST。
- Agent Service は、より狭い internal trust profile が明示的に構成されていない限り、detached signature を使用して Extension Provider リクエストを Extension Installation principal として認証 MUST。
- Browser sessions は direct Agent principals として受理して MUST NOT。
- 認証メタデータは decode 済みリクエストに bind MUST し、生 body digest とともに final authorization のため AIAgent Durable Object へ forward MUST。

#### Scenario: 有効な Client Service JWT が Agent RPC を認証する (AGENT-SECURITY-BE-S001)

- **GIVEN** Client Service が `agent-alpha` の有効 credential を保持している
- **WHEN** 必須 claim と scope を含む有効な短命 JWT で許可済み Agent RPC を呼ぶ
- **THEN** RPC facade は Client Service principal を認証する
- **AND** principal、acting user、claim、生 body digest 文脈を AIAgent Durable Object に渡す

#### Scenario: 不正な Client JWT は変更前に拒否される (AGENT-SECURITY-BE-S002)

- **GIVEN** リクエストが期限切れ token、未有効 token、不正 audience、不正 `agent_id`、欠落 scope、または失効 key ID を持っている
- **WHEN** mutating Agent RPC を呼ぶ
- **THEN** Agent Service はエラー分類に従って unauthenticated または permission denied としてリクエストを拒否する
- **AND** Agent-owned 状態は変更されない

### Requirement: Extension detached signature と replay 防止

Extension リクエストは detached signature、nonce、idempotency 確認により保護 SHALL。

**利用者文脈**

Extension Provider からの ingress、Tool 結果、Delivery 結果は外部 network 経由で届くため、body 改ざん、nonce replay、idempotency replay、key rotation の不整合を防ぐ必要がある。

**要件**

- Extension signature base は RPC service、RPC method、`agent_id`、`installation_id`、該当する場合の `connection_id`、時刻、nonce、idempotency key、生 protobuf リクエスト body の SHA-256 digest を含める MUST。
- AIAgent Durable Object は時刻 window、nonce 一意性、key 状態、Installation 状態、要求 RPC grant、idempotency key、body digest を検証 MUST。
- Nonces は principal ごとに TTL 付きで保存 MUST し、replay 時には拒否 MUST。
- 同じ body digest を持つ同じ idempotency key は記録済み結果を replay MUST し、異なる body digest を持つ同じ key は拒否 MUST。

#### Scenario: 有効な Extension signature が grant 内の ingress を受理する (AGENT-SECURITY-BE-S003)

- **GIVEN** 有効な Installation `inst-1` が Provider 公開鍵 `key-1` と Connection `conn-1` の ingress grant を持っている
- **WHEN** Provider が有効な時刻、nonce、idempotency key、生 body digest、detached signature で ingress RPC を呼ぶ
- **THEN** AIAgent Durable Object は signature と grant を検証する
- **AND** command は RPC method に従って Event 受理または結果処理へ進む

#### Scenario: body 改ざんと nonce replay が拒否される (AGENT-SECURITY-BE-S004)

- **GIVEN** Provider リクエストが特定の生 protobuf body と nonce に対して署名済みである
- **WHEN** body bytes が変更される、または同じ nonce が再利用される
- **THEN** Agent Service は状態変更前にリクエストを拒否する
- **AND** 却下は secret key material や機密値を含む完全な signature base を log せずに監査可能である

### Requirement: Agent-local final authorization の実行

AIAgent Durable Object は Agent-local 状態を使用して final authorization を実行 SHALL。

**利用者文脈**

RPC facade の認証成功だけでは、Agent のライフサイクル、Installation 状態、grant、Connection 所有関係、Tool capability、nonce/idempotency の状態は確定しない。最終判断は Agent-owned 状態を知る AIAgent Durable Object で行う必要がある。

**要件**

- AIAgent Durable Object はすべての command と機密照会に対して final authorization を実行 MUST。
- Final authorization は対象 Agent ID、ライフサイクル状態、credential 状態、principal type、scope/grant、Installation 状態、Connection 所有関係、Tool/Adapter capability、nonce/idempotency、要求 operation を確認 MUST。
- Durable Object RPC method は Agent RPC facade から AIAgent Durable Object への Worker-internal call である MUST し、公開 fetch route、公開 REST エンドポイント、Browser-callable API として公開して MUST NOT。
- Extension Installation principal は Agent config、install/uninstall、credential rotation、Tool 承認 RPC を呼び出して MUST NOT。
- Authorization denial は、許可された監査/security metrics を除き Agent-owned 状態を変更しないままにする MUST。

#### Scenario: Extension grant 外の method は AIAgent により拒否される (AGENT-SECURITY-BE-S005)

- **GIVEN** Extension Installation principal が ingress grant だけを持っている
- **WHEN** Agent config、Extension install/uninstall、Schedule 管理、Thread 照会、または Tool 承認 RPC を呼ぶ
- **THEN** AIAgent Durable Object はリクエストを permission denied で拒否する
- **AND** その principal に対して config、installation、schedule、照会結果、承認状態は生成されない

#### Scenario: idempotency replay が exactly-once command 結果を保持する (AGENT-SECURITY-BE-S006)

- **GIVEN** mutating command が principal `p-1`、idempotency key `idem-1`、body digest `digest-a` で成功している
- **WHEN** `p-1` が `idem-1` と `digest-a` で command を繰り返す
- **THEN** 記録済み応答が重複変更なしで返される
- **AND** `idem-1` と `digest-b` による反復は conflict として拒否される

#### Scenario: Durable Object RPC は Connect facade の背後に留まる (AGENT-SECURITY-BE-S009)

- **GIVEN** AIAgent Durable Object がライフサイクル、Event、Run、Schedule、Tool、Extension、health operation 用の Worker-internal method を公開している
- **WHEN** 外部 caller、Browser、または Provider が Agent Connect RPC facade なしでそれらの Durable Object method を呼び出そうとする
- **THEN** Durable Object RPC method を直接公開する公開 route は存在しない
- **AND** すべての外部 Agent operation は AIAgent 状態に到達する前に Connect binary Protobuf 認証、検証、replay 防止、final authorization を通過する

### Requirement: Connect error mapping と observability

Agent Service は secret を漏えいせずに domain error と observability 文脈を対応付け SHALL。

**利用者文脈**

Client と Provider は、失敗を retry すべきか、入力を直すべきか、認可を確認すべきかを Connect code で判断する。運用者は agent/thread/run/tool/installation 単位で問題を追跡できる必要があるが、秘密値は log に出してはならない。

**要件**

- Domain error は `invalid_argument`、`unauthenticated`、`permission_denied`、`not_found`、`already_exists` または冪等成功、`failed_precondition`、`aborted`、`resource_exhausted`、`unavailable`、`deadline_exceeded`、`internal` を含む安定した Connect code に map MUST。
- Log、metrics、監査 Event は agent_id、thread_id または thread_key hash、event_id、run_id、compaction_id、tool_invocation_id、installation_id、adapter_connection_id、RPC service/method、principal、リクエスト ID、idempotency key、correlation ID、causation ID などの安全な文脈を含める MUST。
- Secret、生 token、秘密鍵、機密値を含む完全な signature base、生 Provider credential は log して MUST NOT、Browser client に返して MUST NOT。
- Rate limit と security 拒否 metrics は method と principal type ごとに観測可能である MUST。

#### Scenario: Domain error が安定した Connect code に map される (AGENT-SECURITY-BE-S007)

- **GIVEN** Agent domain operation が検証、認証、認可、not-found、conflict、precondition、concurrency、rate limit、provider timeout、internal error を生成している
- **WHEN** RPC facade が caller に error を返す
- **THEN** 各 error は構成済み Connect code と安全なエラー詳細に map される
- **AND** client は retry 可能 category と retry 不可 category を区別できる

#### Scenario: Observability 文脈が secret material を除外する (AGENT-SECURITY-BE-S008)

- **GIVEN** Client Service または Extension Provider RPC が成功または失敗する
- **WHEN** log、metrics、監査記録が emitted される
- **THEN** troubleshooting 用の安全な correlation field が含まれる
- **AND** 生 token、秘密鍵、生 shared secret、完全な Provider credential、未 redaction の signature material は含まれない
