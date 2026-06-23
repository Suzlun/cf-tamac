## Why

`cf-tamac` の自己ホスト導入では、Agent Worker と Management Client を Cloudflare 上へ個別に配置し、初期設定用 RPC やインストール CLI に依存せず Client から Agent を安全に管理できる必要がある。現状の Client Service 認証は、本番運用で必要な署名鍵ライフサイクル、Agent 信頼設定、鍵交代、失効、監査、復旧手順までを一貫して扱う契約になっていない。

この変更では、Client から Agent へのサービス認証を Ed25519 JWT とし、Agent 側は公開鍵だけを含む信頼設定を、検証に失敗した場合は拒否する方式で扱う。Client 側は秘密署名鍵を Worker Secret へ手貼りせず、Management Client のサーバー側管理機能と Client D1 の暗号化済み署名鍵ストアで運用できるようにする。

## What Changes

- **BREAKING**: Agent 本番 Client Service 認証の信頼元を `AGENT_CONTROL_PLANE_TRUST` に統一し、`AGENT_CLIENT_JWT_PUBLIC_KEYS` を本番認証の正本として扱わない。
- Agent Worker は `AGENT_CONTROL_PLANE_TRUST` JSON から複数 issuer、複数 Ed25519 公開鍵、鍵状態、principal policy、許可 Agent、許可 scope、audience を読み、構文解析エラー、検証エラー、未知の issuer、未知の kid、失効済み鍵を拒否する。
- Agent RPC は Connect unary binary Protobuf-only profile を維持し、`Authorization: Bearer <jwt>`、EdDSA header、`iss + kid` lookup、署名、audience、有効時間、`jti` replay、request `agent_id` 照合、method scope matrix、allowedAgentIds、監査文脈を検証する。
- Management Client は Ed25519 署名鍵ペアをサーバー側で生成し、private JWK を `CLIENT_CREDENTIAL_ENCRYPTION_KEY` で暗号化したうえで Client D1 に保存する。
- Management Client は署名鍵の `active` / `disabled` / `deleted` ライフサイクル、既定鍵の選択、Agent ごとの issuer/kid/fingerprint 選択、Agent health RPC による疎通確認を提供する。
- Management Client は Agent Worker の Variables and Secrets に貼れる公開情報だけの `AGENT_CONTROL_PLANE_TRUST` JSON と追記/更新用 JSON を生成し、秘密鍵 parameter `d` を出力しない。
- 鍵交代、緊急失効、緊急復旧、信頼設定更新手順、監査/観測の運用契約を明文化し、テストまたは診断コマンド相当の検証で確認できるようにする。
- 初期設定用 token、初期設定用 RPC、AgentTrustRegistry Durable Object、HS256 共通 secret、ブラウザーへの署名 material 露出、Client 秘密署名鍵の Worker Secret 手貼り運用は採用しない。

## Spec Units

### New Spec Units

- なし。既存の `agent-security`、`client-registry`、`client-management`、`agent-health`、`workspace-governance` の責務範囲内で要件を変更する。

### Modified Spec Units

- `agent-security`: Modified。Ed25519 JWT、`AGENT_CONTROL_PLANE_TRUST`、method scope matrix、`jti` replay protection、Agent-local authorization、secret-free audit/metrics を Agent 本番認証の契約として定義する。横断関心はセキュリティと失敗時拒否の振る舞い。
- `client-registry`: Modified。Client D1 に暗号化済み署名鍵ストアと managed Agent の issuer/kid/fingerprint metadata を持ち、server-only module だけが秘密鍵復号と JWT 署名を行う契約へ拡張する。横断関心は secret isolation と永続化変更。
- `client-management`: Modified。Management Client UI/server actions が署名鍵ライフサイクル、Agent ごとの鍵選択、信頼設定 export、鍵交代/失効/復旧 guidance、health verification を提供する契約へ拡張する。横断関心は security UX とブラウザー境界。
- `agent-health`: Modified。Agent health RPC が信頼設定の version/fingerprint/loadedAt と、現在の issuer/kid/fingerprint の検証結果を key material なしで返す契約へ拡張する。横断関心は安全な診断。
- `workspace-governance`: Modified。Runbook、guardrail、scenario coverage、bundle/source checks が Ed25519 JWT 認証、信頼設定、Client signing material 非露出、鍵交代/失効/復旧手順を検証する契約へ拡張する。横断関心は運用とセキュリティ検証。

## Naming

- `agent-security` は `AGENT-SECURITY` を Scenario ID prefix とする。
- `client-registry` は `CLIENT-REGISTRY` を Scenario ID prefix とする。
- `client-management` は `CLIENT-MANAGEMENT` を Scenario ID prefix とする。
- `agent-health` は `AGENT-HEALTH` を Scenario ID prefix とする。
- `workspace-governance` は `WORKSPACE-GOVERNANCE` を Scenario ID prefix とする。
- Agent 認証、Client 台帳、Client UI、健全性診断、workspace 検証は責務が異なるため、関連要件でも別々の capability name と Scenario ID prefix を使う。

## Impact

- Agent Worker: required secret `AGENT_CONTROL_PLANE_TRUST`、信頼設定 schema/versioning、Ed25519 JWK import、JWT verifier、method scope authorization、Agent-local replay storage、audit context、diagnostic helper。
- Agent API contract: `packages/agent/src/typespec/main.tsp` と `packages/agent/src/typespec/src/services/agent-health.tsp`、生成 proto/RPC output。
- Management Client server: Client D1 schema/migrations、暗号化済み署名鍵ストア、`CLIENT_CREDENTIAL_ENCRYPTION_KEY`、server-only JWT signing、managed Agent registry metadata、generated Agent RPC Connect interceptor。
- Management Client UI: 署名鍵管理、Agent ごとの署名鍵選択、公開情報だけの信頼設定 export、鍵交代/失効/復旧 guidance、health verification 表示。
- Operations/docs/tooling: Agent 信頼設定 runbook、鍵交代、緊急失効、緊急復旧、secret/key redaction、scenario-linked tests、browser bundle/source guardrails、codegen drift checks。
- Security/performance: private key plaintext 非永続化、ブラウザー非露出、token TTL と replay window、失敗時拒否の認証経路、structured log redaction、public key full value の log 抑止。
