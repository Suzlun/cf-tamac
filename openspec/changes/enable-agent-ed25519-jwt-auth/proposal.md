## Why

`cf-tamac` の self-host 導入では、Agent Worker と Management Client を Cloudflare 上へ個別に配置し、bootstrap RPC や install CLI に依存せず Client から Agent を安全に管理できる必要がある。現状の Client Service 認証は、本番運用で必要な signing key lifecycle、Agent trust config、rotation、revocation、監査、復旧手順までを一貫して扱う契約になっていない。

この変更では、Client から Agent への service authentication を Ed25519 JWT とし、Agent 側は public key だけを含む trust config を fail-closed に検証する。Client 側は private signing key を Worker Secret へ手貼りせず、Management Client の server-side 管理機能と Client D1 の暗号化済み signing key store で運用できるようにする。

## What Changes

- **BREAKING**: Agent production Client Service 認証の信頼元を `AGENT_CONTROL_PLANE_TRUST` に統一し、`AGENT_CLIENT_JWT_PUBLIC_KEYS` を本番認証 source として扱わない。
- Agent Worker は `AGENT_CONTROL_PLANE_TRUST` JSON から複数 issuer、複数 Ed25519 public key、key status、principal policy、allowed Agent、allowed scope、audience を読み、parse/validation error、unknown issuer、unknown kid、revoked key を fail closed で拒否する。
- Agent RPC は Connect unary binary Protobuf-only profile を維持し、`Authorization: Bearer <jwt>`、EdDSA header、`iss + kid` lookup、signature、audience、time window、`jti` replay、request `agent_id` 照合、method scope matrix、allowedAgentIds、audit context を検証する。
- Management Client は Ed25519 signing key pair を server-side で生成し、private JWK を `CLIENT_CREDENTIAL_ENCRYPTION_KEY` で暗号化したうえで Client D1 に保存する。
- Management Client は signing key の active/disabled/deleted lifecycle、default selection、Agent ごとの issuer/kid/fingerprint 選択、Agent health RPC による疎通確認を提供する。
- Management Client は Agent Worker の Variables and Secrets に貼れる public-only `AGENT_CONTROL_PLANE_TRUST` JSON と merge/update 用 JSON を生成し、private key parameter `d` を出力しない。
- Key rotation、emergency revoke、break-glass recovery、trust config 更新手順、監査/observability の運用契約を明文化し、テストまたは doctor 相当の検証で確認できるようにする。
- bootstrap token、bootstrap RPC、AgentTrustRegistry Durable Object、HS256 shared secret、Browser への signing material 露出、Client private signing key の Worker Secret 手貼り運用は採用しない。

## Spec Units

### New Spec Units

- なし。既存の Agent security、Client registry、Client management、Agent health、Workspace governance の責務範囲内で要件を変更する。

### Modified Spec Units

- `agent-security`: Modified。Ed25519 JWT、`AGENT_CONTROL_PLANE_TRUST`、method scope matrix、`jti` replay protection、Agent-local authorization、secret-free audit/metrics を Agent production authentication の契約として定義する。横断関心は security と fail-closed behavior。
- `client-registry`: Modified。Client D1 に encrypted signing key store と managed Agent の issuer/kid/fingerprint metadata を持ち、server-only module だけが private key 復号と JWT signing を行う契約へ拡張する。横断関心は secret isolation と persistence migration。
- `client-management`: Modified。Management Client UI/server actions が signing key lifecycle、Agent ごとの key selection、trust config export、rotation/revoke/recovery guidance、health verification を提供する契約へ拡張する。横断関心は security UX と browser boundary。
- `agent-health`: Modified。Agent health RPC が trust config の version/fingerprint/loadedAt と、現在の issuer/kid/fingerprint の検証結果を key material なしで返す契約へ拡張する。横断関心は diagnostic safety。
- `workspace-governance`: Modified。Runbook、guardrail、scenario coverage、bundle/source checks が Ed25519 JWT 認証、trust config、Client signing material 非露出、rotation/revoke/recovery 手順を検証する契約へ拡張する。横断関心は operations と security verification。

## Naming

- `agent-security` は `AGENT-SECURITY` を Scenario ID prefix とする。
- `client-registry` は `CLIENT-REGISTRY` を Scenario ID prefix とする。
- `client-management` は `CLIENT-MANAGEMENT` を Scenario ID prefix とする。
- `agent-health` は `AGENT-HEALTH` を Scenario ID prefix とする。
- `workspace-governance` は `WORKSPACE-GOVERNANCE` を Scenario ID prefix とする。
- Agent 認証、Client registry、Client UI、health diagnostic、workspace verification は責務が異なるため、関連要件でも別々の capability name と Scenario ID prefix を使う。

## Impact

- Agent Worker: required secret `AGENT_CONTROL_PLANE_TRUST`、trust config schema/versioning、Ed25519 JWK import、JWT verifier、method scope authorization、Agent-local replay storage、audit context、diagnostic helper。
- Agent API contract: `packages/agent/src/typespec/main.tsp` と `packages/agent/src/typespec/src/services/agent-health.tsp`、生成 proto/RPC output。
- Management Client server: Client D1 schema/migrations、encrypted signing key store、`CLIENT_CREDENTIAL_ENCRYPTION_KEY`、server-only JWT signing、managed Agent registry metadata、generated Agent RPC Connect interceptor。
- Management Client UI: signing key 管理、Agent ごとの signing key selection、public trust config export、rotation/revoke/recovery guidance、health verification 表示。
- Operations/docs/tooling: Agent trust config runbook、key rotation、emergency revoke、break-glass recovery、secret/key redaction、scenario-linked tests、browser bundle/source guardrails、codegen drift checks。
- Security/performance: private key plaintext 非永続化、Browser 非露出、token TTL と replay window、fail-closed auth path、structured log redaction、public key full value の log 抑止。
