## ADDED Requirements

### Requirement: 本番 credential operations governance

Workspace governance は本番 credential operations の documentation と guardrail verification を提供 SHALL。

**利用者文脈**

開発者、reviewer、運用者は、Agent trust config、Client signing key、rotation、emergency revoke、break-glass recovery の手順を同じ境界理解で扱う必要がある。ドキュメントや guardrail が認証境界を検査しないと、ブラウザーへの signing material 露出、Agent trust config の誤設定、禁止された認証経路が見逃される。

**要件**

- Repository documentation は `AGENT_CONTROL_PLANE_TRUST` の schema、public-only key material、issuer/key status、allowed Agent、allowed scope、audience、fingerprint を説明 SHALL。
- Repository documentation は `CLIENT_CREDENTIAL_ENCRYPTION_KEY`、Client D1 encrypted signing key store、server-only JWT signing、Browser 非露出の境界を説明 SHALL。
- Repository documentation と coding guidance は Client D1 が保持できる Client-owned data を managed Agent records、外部 credential references、encrypted Client Service signing key store として説明 SHALL。
- Repository documentation と coding guidance は Agent domain snapshots、plaintext secrets、private JWK plaintext が Client D1 に保存されないことを説明 SHALL。
- Repository documentation は Management Client の Global Settings から Agent の有無に依存せず Ed25519 key pair を生成し、public trust config JSON を取得し、Agent Worker Variables and Secrets に設定する運用を説明 SHALL。
- Repository documentation は key rotation、emergency revoke、`ADMIN_OPERATOR` break-glass recovery、Cloudflare Dashboard/API/Wrangler による Agent trust config 更新を説明 SHALL。
- Workspace guardrails は Browser-visible modules、browser-delivered bundles、public Client routes が private JWK、encrypted private JWK、生 JWT、Client signing logic、Agent credential forwarding を含まないことを検査 SHALL。
- Workspace guardrails は Agent public API が Protobuf RPC-only であり、Client Service production authentication が Ed25519 JWT と `AGENT_CONTROL_PLANE_TRUST` の検証に閉じることを検査 SHALL。
- Workspace guardrails は Agent RPC Client Service auth path が HS256 signing、`resolveCredentialSecret`、`AGENT_CREDENTIAL_*` Worker Secret、Provider credential 参照、public Client Agent proxy route を使用しないことを検査 SHALL。
- Workspace guardrails と Client D1 schema tests は encrypted Client Service signing key store を許可しつつ、Agent domain snapshots と plaintext signing material を拒否 SHALL。
- Workspace smoke/UAT は Management Client の Global Settings signing key generation、public-only trust config export、Agent 作成、managed Agent signing key selection、Agent Worker trust setting、Agent Health Check、selected-Agent real data rendering、browser secrecy boundary を一続きの運用として検証 SHALL。
- Workspace OpenSpec coverage checks は Agent security、Client registry、Client management、Agent health、Workspace governance の Scenario IDs が automated test title または manual tag と対応することを検査 SHALL。

#### Scenario: ドキュメントが本番 credential runbook を公開する (WORKSPACE-GOVERNANCE-S010)

- **GIVEN** repository documentation と package README を検査できる
- **WHEN** Agent/Client 認証、trust config、key management、rotation、revoke、recovery sections を読む
- **THEN** `AGENT_CONTROL_PLANE_TRUST`、`CLIENT_CREDENTIAL_ENCRYPTION_KEY`、Client signing key generation、public trust config export、Agent Worker secret 設定、rotation、emergency revoke、break-glass recovery が説明されている
- **AND** private key plaintext をブラウザー、D1、logs、Worker vars に出さない境界が明記されている
- **AND** Client D1 の許可データ集合として managed Agent records、外部 credential references、encrypted Client Service signing key store が説明されている

#### Scenario: ガードレールが browser-visible signing material と禁止 Agent auth surface を拒否する (WORKSPACE-GOVERNANCE-S011)

- **GIVEN** fixture または source graph が Browser-visible module、browser-delivered bundle、public Client route、Agent public route を検査対象として含む
- **WHEN** workspace lint または governance tests が実行される
- **THEN** private JWK、encrypted private JWK、生 JWT signing logic、Agent credential forwarding、Client private signing key Worker Secret 手貼りを必須にする経路は failure として報告される
- **AND** HS256 Agent RPC signing、`resolveCredentialSecret` による Agent RPC signing source 解決、`AGENT_CREDENTIAL_*` Worker Secret を Agent RPC auth source とする経路は failure として報告される
- **AND** Agent REST/JSON authentication route、bootstrap RPC、AgentTrustRegistry Durable Object、public Client Agent proxy route を production Client Service trust source とする経路は failure として報告される

#### Scenario: シナリオ coverage が本番認証 spec を検証する (WORKSPACE-GOVERNANCE-S012)

- **GIVEN** main specs または delta specs が Ed25519 JWT、Client signing key lifecycle、trust config export、health verification、operations governance の Scenario IDs を含む
- **WHEN** workspace OpenSpec lint が実行される
- **THEN** automated scenarios は bracketed Scenario ID notation を使う test title から参照される
- **AND** 自動化できない operator walkthrough は `Tags: manual` を持つ

#### Scenario: 運用 smoke が Management Client から Agent RPC 実データ表示までを検証する (WORKSPACE-GOVERNANCE-S013)

- **GIVEN** Management Client、Client D1、Agent Worker、`CLIENT_CREDENTIAL_ENCRYPTION_KEY`、`AGENT_CONTROL_PLANE_TRUST` を設定できる staging または test environment がある
- **WHEN** smoke/UAT が Global Settings で Ed25519 signing key を生成し、public-only trust config を export し、Agent を作成し、managed Agent に issuer/kid/fingerprint を選択し、Agent Worker に trust config を設定し、Agent Health Check を実行し、selected-Agent pages を開く
- **THEN** Health Check は認証済み Check response として成功し、Overview、Threads、Events、Runs、Schedules、Integrations、Settings は server-only Agent RPC 由来の実データを表示する
- **AND** browser payload、browser storage、browser bundle、public Client route は private JWK、encrypted private JWK、生 JWT、signing logic、Agent credential forwarding を含まない
