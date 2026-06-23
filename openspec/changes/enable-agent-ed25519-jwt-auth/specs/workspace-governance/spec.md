## ADDED Requirements

### Requirement: Production credential operations governance

Workspace governance は production credential operations の documentation と guardrail verification を提供 SHALL。

**Customer Context**

開発者、reviewer、運用者は、Agent trust config、Client signing key、rotation、emergency revoke、break-glass recovery の手順を同じ境界理解で扱う必要がある。ドキュメントや guardrail が認証境界を検査しないと、Browser への signing material 露出、Agent trust config の誤設定、禁止された認証経路が見逃される。

**Requirement**

- Repository documentation は `AGENT_CONTROL_PLANE_TRUST` の schema、public-only key material、issuer/key status、allowed Agent、allowed scope、audience、fingerprint を説明 SHALL。
- Repository documentation は `CLIENT_CREDENTIAL_ENCRYPTION_KEY`、Client D1 encrypted signing key store、server-only JWT signing、Browser 非露出の境界を説明 SHALL。
- Repository documentation は Management Client から Ed25519 key pair を生成し、public trust config JSON を取得し、Agent Worker Variables and Secrets に設定する運用を説明 SHALL。
- Repository documentation は key rotation、emergency revoke、`ADMIN_OPERATOR` break-glass recovery、Cloudflare Dashboard/API/Wrangler による Agent trust config 更新を説明 SHALL。
- Workspace guardrails は Browser-visible modules、browser-delivered bundles、public Client routes が private JWK、encrypted private JWK、生 JWT、Client signing logic、Agent credential forwarding を含まないことを検査 SHALL。
- Workspace guardrails は Agent public API が Protobuf RPC-only であり、Client Service production authentication が Ed25519 JWT と `AGENT_CONTROL_PLANE_TRUST` の検証に閉じることを検査 SHALL。
- Workspace OpenSpec coverage checks は Agent security、Client registry、Client management、Agent health、Workspace governance の Scenario IDs が automated test title または manual tag と対応することを検査 SHALL。

#### Scenario: Documentation exposes production credential runbooks (WORKSPACE-GOVERNANCE-S010)

- **GIVEN** repository documentation と package README を検査できる
- **WHEN** Agent/Client 認証、trust config、key management、rotation、revoke、recovery sections を読む
- **THEN** `AGENT_CONTROL_PLANE_TRUST`、`CLIENT_CREDENTIAL_ENCRYPTION_KEY`、Client signing key generation、public trust config export、Agent Worker secret 設定、rotation、emergency revoke、break-glass recovery が説明されている
- **AND** private key plaintext を Browser、D1、logs、Worker vars に出さない境界が明記されている

#### Scenario: Guardrails reject browser-visible signing material and forbidden Agent auth surfaces (WORKSPACE-GOVERNANCE-S011)

- **GIVEN** fixture または source graph が Browser-visible module、browser-delivered bundle、public Client route、Agent public route を検査対象として含む
- **WHEN** workspace lint または governance tests が実行される
- **THEN** private JWK、encrypted private JWK、生 JWT signing logic、Agent credential forwarding、Client private signing key Worker Secret 手貼りを必須にする経路は failure として報告される
- **AND** Agent REST/JSON authentication route、bootstrap RPC、AgentTrustRegistry Durable Object を production Client Service trust source とする経路は failure として報告される

#### Scenario: Scenario coverage validates production authentication specs (WORKSPACE-GOVERNANCE-S012)

- **GIVEN** main specs または delta specs が Ed25519 JWT、Client signing key lifecycle、trust config export、health verification、operations governance の Scenario IDs を含む
- **WHEN** workspace OpenSpec lint が実行される
- **THEN** automated scenarios は bracketed Scenario ID notation を使う test title から参照される
- **AND** automation できない operator walkthrough は `Tags: manual` を持つ
