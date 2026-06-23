## MODIFIED Requirements

### Requirement: principal 認証の実行

Agent Service は各 RPC caller を対応済み principal type として認証 SHALL。

**利用者文脈**

Agent API は Client Service、Integration Installation、Internal Service、Admin Operator など複数の主体から呼ばれる。Browser user を直接 Agent principal にせず、サーバー側 service identity と acting user 情報で監査できる必要がある。Client Service 認証は self-host 運用で bootstrap RPC や installer secret に依存せず、Agent Worker の trust config と Management Client の署名鍵管理で成立する必要がある。

**要件**

- Agent Service は Client Service リクエストに Ed25519 署名 JWT を使用して Client Service principal を認証 MUST。
- Agent Service は domain handling に到達する前に Connect unary binary Protobuf profile 以外の Client Service リクエストを拒否 MUST。
- Agent Service は `Authorization: Bearer <jwt>` が存在しない Client Service リクエストを拒否 MUST。
- Agent Service は JWT header の `alg` が `EdDSA` であり、`kid` が存在することを検証 MUST。
- Agent Service は JWT payload の `iss` と header の `kid` を使い、`AGENT_CONTROL_PLANE_TRUST` の issuer/key policy を解決 MUST。
- Agent Service は Ed25519 signature、audience、`exp`、`nbf`、最大 token TTL、`jti` replay、JWT `agent_id` と request body `agent_id` の一致、allowed Agent、allowed scope、RPC method scope を検証 MUST。
- Agent Service は `x-agent-test-*` headers を production Client Service credential として扱って MUST NOT。
- Agent Service は、より狭い internal trust profile が明示的に構成されていない限り、detached signature を使用して Integration Provider リクエストを Integration Installation principal として認証 MUST。
- Browser sessions は direct Agent principals として受理して MUST NOT。
- 認証メタデータは decode 済みリクエストに bind MUST し、生 body digest とともに final authorization のため AIAgent Durable Object へ forward MUST。

#### Scenario: 有効な Client Service JWT が Agent RPC を認証する (AGENT-SECURITY-S001)

- **GIVEN** Client Service が `agent-alpha` 用の active Ed25519 signing key を保持し、Agent Worker の `AGENT_CONTROL_PLANE_TRUST` が対応する issuer/kid の public key と policy を含んでいる
- **WHEN** Client Service が必須 claim、`jti`、`agent_id`、acting user、required scope を含む有効な短命 JWT で許可済み Agent RPC を呼ぶ
- **THEN** RPC facade は Client Service principal を認証する
- **AND** principal、issuer、subject、kid、acting user、scope、jwt id、生 body digest 文脈を AIAgent Durable Object に渡す

#### Scenario: 不正な Client JWT は変更前に拒否される (AGENT-SECURITY-S002)

- **GIVEN** リクエストが JWT 不在、`alg` 不一致、unknown issuer、unknown kid、期限切れ token、未有効 token、不正 audience、不正 `agent_id`、欠落 scope、allowed Agent 不一致、失効 key ID、署名不正、または replayed `jti` を持っている
- **WHEN** Client Service が Agent RPC を呼ぶ
- **THEN** Agent Service はエラー分類に従って unauthenticated または permission denied としてリクエストを拒否する
- **AND** Agent-owned 状態は変更されない

### Requirement: Connect error mapping と observability

Agent Service は secret を漏えいせずに domain error と observability 文脈を対応付け SHALL。

**利用者文脈**

Client と Provider は、失敗を retry すべきか、入力を直すべきか、認可を確認すべきかを Connect code で判断する。運用者は agent/thread/run/tool/installation 単位で問題を追跡できる必要があるが、秘密値は log に出してはならない。認証失敗と認可失敗は原因分類だけを安全に観測でき、token body や key material を含まない必要がある。

**要件**

- Domain error は `invalid_argument`、`unauthenticated`、`permission_denied`、`not_found`、`already_exists` または冪等成功、`failed_precondition`、`aborted`、`resource_exhausted`、`unavailable`、`deadline_exceeded`、`internal` を含む安定した Connect code に map MUST。
- Log、metrics、監査 Event は agent_id、thread_id または thread_key hash、event_id、run_id、compaction_id、tool_invocation_id、installation_id、adapter_connection_id、RPC service/method、principal、issuer、subject、kid、principalType、actingUserId、scopes、jwtId、リクエスト ID、idempotency key、correlation ID、causation ID などの安全な文脈を含める MUST。
- 認証失敗理由は missing token、malformed token、invalid signature、unknown issuer、unknown kid、inactive key、audience denied、time window denied、agent denied、scope denied、replay denied、profile denied などの分類として観測可能である MUST。
- Secret、生 token、秘密鍵、機密値を含む完全な signature base、生 Provider credential、private JWK、public key full value は log して MUST NOT、Browser client に返して MUST NOT。
- Key fingerprint と `kid` は troubleshooting 用の安全な識別子として log できる SHALL。
- Rate limit と security 拒否 metrics は method と principal type ごとに観測可能である MUST。

#### Scenario: Domain error が安定した Connect code に map される (AGENT-SECURITY-S007)

- **GIVEN** Agent domain operation が検証、認証、認可、not-found、conflict、precondition、concurrency、rate limit、provider timeout、internal error を生成している
- **WHEN** RPC facade が caller に error を返す
- **THEN** 各 error は構成済み Connect code と安全なエラー詳細に map される
- **AND** client は retry 可能 category と retry 不可 category を区別できる

#### Scenario: Observability 文脈が secret material を除外する (AGENT-SECURITY-S008)

- **GIVEN** Client Service または Integration Provider RPC が成功または失敗する
- **WHEN** log、metrics、監査記録が emitted される
- **THEN** troubleshooting 用の安全な correlation field が含まれる
- **AND** 生 token、秘密鍵、生 shared secret、完全な Provider credential、未 redaction の signature material、private JWK、public key full value は含まれない

## ADDED Requirements

### Requirement: Agent control-plane trust config の検証

Agent Service は `AGENT_CONTROL_PLANE_TRUST` を production Client Service trust source として検証 SHALL。

**Customer Context**

Self-host 運用者は Agent Worker の Variables and Secrets に public trust config を設定し、複数 issuer と複数 signing key を明示的に管理したい。設定が壊れている、key が失効している、または想定外の issuer/kid が使われている場合、Agent は安全側に倒れて状態変更を受け付けない必要がある。

**Requirement**

- Agent Service は `AGENT_CONTROL_PLANE_TRUST` を required Agent secret として扱う SHALL。
- Trust config は version、audiences、issuers、issuer ごとの keys を持つ JSON として validation される MUST。
- Trust config の key は `kid`、`kty = OKP`、`crv = Ed25519`、public parameter `x`、status、principalType、allowedAgentIds、allowedScopes を含む MUST。
- Trust config は private key parameter `d` を含んで MUST NOT。
- Agent Service は trust config の parse error、schema validation error、unknown issuer、unknown kid、unsupported key type、missing policy を fail closed で拒否 MUST。
- Key status は `active`、`retiring`、`revoked` を表現 SHALL。
- `active` key は policy 検証を満たす token を検証可能 SHALL。
- `retiring` key は token の `exp`、`nbf`、最大 token TTL、policy 検証を満たす場合だけ検証可能 SHALL。
- `revoked` key は signature が正しくても拒否 MUST。
- Agent Service は trust config の fingerprint、version、loadedAt を key material なしで診断可能 SHALL。
- Agent Service は Client Service public trust を Worker secret の trust config から解決 SHALL し、public Durable Object fetch route または Agent-cross registry を trust source として使用して MUST NOT。

#### Scenario: Trust config が issuer と Ed25519 public key policy を解決する (AGENT-SECURITY-S010)

- **GIVEN** `AGENT_CONTROL_PLANE_TRUST` が issuer `cf-tamac-management-client`、kid `client-key-1`、active Ed25519 public JWK、allowed Agent、allowed scopes を含む
- **WHEN** Client Service が同じ issuer/kid と policy 内の Agent/scope を持つ署名済み JWT で Agent RPC を呼ぶ
- **THEN** Agent Service は public key と principal policy を解決する
- **AND** 認証済み principal は Client Service principalType と許可 scope を持つ

#### Scenario: Trust config の不正状態は fail closed する (AGENT-SECURITY-S011)

- **GIVEN** trust config が JSON として不正、schema 不一致、private key parameter `d` を含む、unknown issuer/kid を要求される、または key status が `revoked` である
- **WHEN** Client Service が Agent RPC を呼ぶ
- **THEN** Agent Service は domain handling 前にリクエストを拒否する
- **AND** Agent-owned 状態は変更されない

#### Scenario: retiring key は bounded token window 内だけ検証される (AGENT-SECURITY-S012)

- **GIVEN** trust config が key `client-key-1` を `retiring` として保持している
- **WHEN** Client Service が最大 token TTL 内で、期限と policy を満たす JWT を提示する
- **THEN** Agent Service は token を検証できる
- **AND** 最大 token TTL を超える token、期限切れ token、または policy を満たさない token は拒否される

### Requirement: Client Service scope matrix と replay protection

Agent Service は Client Service JWT の scope、Agent scope、`jti` replay を RPC method ごとに検証 MUST。

**Customer Context**

Agent 管理操作は読み取り、書き込み、Tool 承認、Integration 管理、credential 管理で危険度が異なる。署名が正しいだけで全操作を許可すると、漏えいした key や広すぎる key policy が Agent 操作全体へ影響するため、method ごとの scope と replay protection が必要である。

**Requirement**

- Agent Service は RPC method ごとの required scope matrix を定義 SHALL。
- Health、config/thread/event/run read は `agent:read` を要求 MUST。
- Event publish、config update、schedule create/cancel は `agent:write` を要求 MUST。
- Tool approval/rejection は `agent:tool:approve` を要求 MUST。
- Integration install/uninstall は `agent:integration:admin` を要求 MUST。
- Credential rotation/destroy と administrative recovery operation は `agent:admin` を要求 MUST。
- Agent Service は JWT `scopes` が key policy の allowedScopes 内に収まることを検証 MUST。
- Agent Service は method required scope が JWT `scopes` に含まれることを検証 MUST。
- Agent Service は JWT `agent_id` と request body `agent_id` の一致を検証 MUST。
- Agent Service は allowedAgentIds が対象 Agent を許可していることを検証 MUST。
- Agent Service は `jti` を principal と Agent scope に結びつけ、token validity window と replay window 内の再利用を拒否 MUST。

#### Scenario: Method scope matrix が不足 scope を拒否する (AGENT-SECURITY-S013)

- **GIVEN** Client Service JWT が `agent:read` だけを含み、key policy も `agent:read` だけを許可している
- **WHEN** Client Service が Event publish、Tool approval、Integration install、または credential rotation RPC を呼ぶ
- **THEN** Agent Service は permission denied として拒否する
- **AND** Agent-owned 状態は変更されない

#### Scenario: `agent_id` と allowedAgentIds の不一致が拒否される (AGENT-SECURITY-S014)

- **GIVEN** Client Service JWT の `agent_id` が `agent-alpha` で、request body が `agent-beta` を対象にしている、または key policy が `agent-beta` を許可していない
- **WHEN** Client Service が Agent RPC を呼ぶ
- **THEN** Agent Service は request を拒否する
- **AND** denial reason は agent scope mismatch として安全に分類される

#### Scenario: Replayed `jti` は状態変更前に拒否される (AGENT-SECURITY-S015)

- **GIVEN** Client Service JWT の `jti` が `agent-alpha` の RPC で受理済みである
- **WHEN** 同じ principal と `jti` を持つ JWT が replay window 内で再利用される
- **THEN** Agent Service は replay denied として拒否する
- **AND** Agent-owned 状態は重複変更されない
