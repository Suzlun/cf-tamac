# enable-agent-ed25519-jwt-auth 実装基準メモ

## 1. 確認範囲

- この変更は、Agent Worker と Management Client を個別デプロイしつつ、Client から Agent を安全に管理するための Client Service 認証更新である。根拠: `proposal.md:1-5`。
- 本番 Client Service 認証は Ed25519 JWT と `AGENT_CONTROL_PLANE_TRUST` に統一し、`AGENT_CLIENT_JWT_PUBLIC_KEYS`、HS256 shared secret、`AGENT_CREDENTIAL_*` Worker Secret、`credentialRef` を Agent RPC signing source として使わない。根拠: `proposal.md:9-17`、`design.md:5-13`。
- Agent API は TypeSpec -> proto -> generated RPC のコマンド生成境界を守り、生成済み output は手編集しない。根拠: `design.md:13`、`design.md:181-182`、`design.md:249`。
- Issue #3 はローカル Markdown 検索では `tasks.md` の参照以外を確認できず、`gh` CLI も利用不可だったため、正確な Issue 本文は未取得である。このメモでは `proposal.md`、`design.md`、delta specs の合意済み artifact を基準に scope を固定する。根拠: `tasks.md:3`、`proposal.md:19-31`、`design.md:1-14`、`design.md:668-670`。

## 2. Spec Unit と Scenario ID

対象 Spec Unit は新規追加なし、既存 `agent-security`、`client-registry`、`agent-management-ui`、`agent-health`、`workspace-governance` の変更である。根拠: `proposal.md:19-31`。

| Spec Unit              | Scenario IDs                                                                                               | 根拠                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `agent-security`       | `AGENT-SECURITY-S001`, `S002`, `S007`, `S008`, `S010`, `S011`, `S012`, `S013`, `S014`, `S015`              | `specs/agent-security/spec.md:25`, `specs/agent-security/spec.md:32`, `specs/agent-security/spec.md:56`, `specs/agent-security/spec.md:63`, `specs/agent-security/spec.md:94`, `specs/agent-security/spec.md:101`, `specs/agent-security/spec.md:108`, `specs/agent-security/spec.md:137`, `specs/agent-security/spec.md:144`, `specs/agent-security/spec.md:151`                                                                                            |
| `agent-health`         | `AGENT-HEALTH-S001`, `S002`, `S003`, `S005`                                                                | `specs/agent-health/spec.md:22`, `specs/agent-health/spec.md:29`, `specs/agent-health/spec.md:36`, `specs/agent-health/spec.md:44`                                                                                                                                                                                                                                                                                                                           |
| `client-registry`      | `CLIENT-REGISTRY-S001`, `S002`, `S003`, `S006`, `S007`, `S008`, `S011`                                     | `specs/client-registry/spec.md:22`, `specs/client-registry/spec.md:54`, `specs/client-registry/spec.md:64`, `specs/client-registry/spec.md:89`, `specs/client-registry/spec.md:120`, `specs/client-registry/spec.md:127`, `specs/client-registry/spec.md:134`                                                                                                                                                                                                |
| `agent-management-ui`  | `AGENT-MANAGEMENT-UI-S003`, `S004`, `S010`, `S011`, `S012`, `S013`, `S014`, `S015`, `S016`, `S019`, `S020` | `specs/agent-management-ui/spec.md:23`, `specs/agent-management-ui/spec.md:31`, `specs/agent-management-ui/spec.md:38`, `specs/agent-management-ui/spec.md:68`, `specs/agent-management-ui/spec.md:77`, `specs/agent-management-ui/spec.md:108`, `specs/agent-management-ui/spec.md:117`, `specs/agent-management-ui/spec.md:141`, `specs/agent-management-ui/spec.md:148`, `specs/agent-management-ui/spec.md:173`, `specs/agent-management-ui/spec.md:180` |
| `workspace-governance` | `WORKSPACE-GOVERNANCE-S010`, `S011`, `S012`, `S013`                                                        | `specs/workspace-governance/spec.md:26`, `specs/workspace-governance/spec.md:34`, `specs/workspace-governance/spec.md:42`, `specs/workspace-governance/spec.md:49`                                                                                                                                                                                                                                                                                           |

## 3. Implementation file list baseline

`design.md` の New / Changed Files を正本とし、generated output はコマンド所有として扱う。根拠: `design.md:172-249`。

### Agent

- 更新: `packages/agent/README.md`、`packages/agent/wrangler.toml`、`packages/agent/src/env.ts`。根拠: `design.md:176-178`。
- 更新: TypeSpec `packages/agent/src/typespec/src/common/security.tsp` と `packages/agent/src/typespec/src/services/agent-health.tsp`。根拠: `design.md:179-180`。
- 生成: `packages/agent/proto/cftamac/agent/v1.proto`、`packages/agent/src/generated/rpc/cftamac/agent/v1_pb.ts`。手編集禁止。根拠: `design.md:181-182`。
- 追加/更新: `packages/agent/src/domain/security/trust-config.ts`、`jwt.ts`、`replay.ts`、`types.ts`。根拠: `design.md:183-186`。
- 更新: `packages/agent/src/rpc/command-context.ts`、`packages/agent/src/rpc/interceptors/authentication.ts`、`authorization.ts`、`audit.ts`、`replay-protection.ts`、`types.ts`、`packages/agent/src/rpc/services/health.ts`。根拠: `design.md:187-193`。
- 更新: `packages/agent/src/observability/records.ts`、`packages/agent/src/observability/redaction.ts`。根拠: `design.md:194-195`。
- 追加/更新テスト: `control-plane-trust-config.test.ts`、`client-service-ed25519-auth.test.ts`、`health-rpc.test.ts`、`rpc-interceptors.test.ts`、`security-foundation.test.ts`。根拠: `design.md:196-200`。

### Client

- 更新: `packages/client/README.md`、`packages/client/wrangler.toml`。根拠: `design.md:201-202`。
- 追加/更新 UI route: `packages/client/app/global-settings/page.tsx`、`signing-keys/page.tsx`、`trust-config-export/page.tsx`、`packages/client/app/agents/**`。根拠: `design.md:203-211`。
- 更新/追加 server env/db/credentials/agent-rpc/actions: `packages/client/src/server/env.ts`、`db/schema.ts`、`db/managed-agents.ts`、`db/signing-keys.ts`、`db/migrations/0002_control_plane_signing_keys.sql`、`credentials/encryption.ts`、`credentials/secret-resolution.ts`、`credentials/signing-keys.ts`、`agent-rpc/authentication.ts`、`agent-rpc/agent-loader.ts`、`agent-rpc/create-client.ts`、`actions/signing-keys.ts`、`actions/trust-config.ts`、`actions/agent-health.ts`。根拠: `design.md:212-225`。
- 追加/更新 components/tests: `signing-key-management.tsx`、`trust-config-export.tsx`、`agent-signing-key-select.tsx`、`key-rotation-guide.tsx`、`components/schemas/signing-key.ts`、Client tests 一式。根拠: `design.md:226-236`。
- 生成: `packages/client/src/generated/agent-rpc/cftamac/agent/v1_pb.ts`。手編集禁止。根拠: `design.md:249`。

### Docs / Governance / E2E / Wireframes

- 追加/更新: `docs/operations/agent-control-plane-auth.md`、`AGENTS.md`、`CODING_STANDARDS.md`、`CONTRIBUTING.md`、governance scripts、OpenSpec coverage script、E2E specs。根拠: `design.md:237-248`。
- Wireframes は `wireframes/*.wireframe.json` を正本、`.wireframe.html` を preview とする。根拠: `design.md:250-254`、`design.md:321-349`。

## 4. Env secret handling baseline

- 現在の Agent required secret は `AGENT_CLIENT_JWT_PUBLIC_KEYS`、`AGENT_INTEGRATION_SIGNATURE_KEYS`、`AGENT_MODEL_PROVIDER_SECRET_REFS` であり、欠落検査も `AGENT_CLIENT_JWT_PUBLIC_KEYS` を見る。根拠: `packages/agent/src/env.ts:13-17`、`packages/agent/src/env.ts:64-74`。
- Agent 側の変更点は、本番 Client Service 認証の required secret を `AGENT_CONTROL_PLANE_TRUST` に切り替え、`AGENT_CLIENT_JWT_PUBLIC_KEYS` を production source から削除すること。根拠: `proposal.md:9-11`、`design.md:27-28`、`design.md:176-178`。
- 現在の Client server env は `CLIENT_CREDENTIAL_SECRET_REF` を required var として検査し、wrangler vars で `CLIENT_CREDENTIAL_SECRET_REF = "CLIENT_CREDENTIAL_ENCRYPTION_KEY"` を間接参照している。根拠: `packages/client/src/server/env.ts:10-16`、`packages/client/src/server/env.ts:32-53`、`packages/client/wrangler.toml:12-19`。
- Client 側の変更点は、`CLIENT_CREDENTIAL_ENCRYPTION_KEY` を Client Worker の required secret binding として直接扱い、`CLIENT_CREDENTIAL_SECRET_REF` のような間接参照 var を残さないこと。根拠: `design.md:27`、`design.md:212`、`design.md:632-637`。

## 5. HS256 / test seam 棚卸しと分離方針

- 現在の Agent domain security primitive は `HS256`、`RS256`、`ES256` を許可し、`HS256` では raw HMAC key material を import する。根拠: `packages/agent/src/domain/security/crypto.ts:5-13`、`packages/agent/src/domain/security/crypto.ts:23-25`、`packages/agent/src/domain/security/crypto.ts:70-92`。
- 現在の Agent JWT verifier は header の `alg` を `isAgentSignatureAlgorithm` で許可し、key resolver で得た同一 algorithm の key で署名検証する。根拠: `packages/agent/src/domain/security/jwt.ts:98-129`。
- 現在の Agent RPC authentication seam は `x-agent-test-principal-id` と複数の `x-agent-test-*` header だけで principal を組み立て、通常 path は unauthenticated として拒否する。根拠: `packages/agent/src/rpc/interceptors/authentication.ts:37-66`。
- 現在の Agent authorization/replay seam も `x-agent-test-grant`、`x-agent-test-replay` によるテスト分岐を持つ。根拠: `packages/agent/src/rpc/interceptors/authorization.ts:6-23`、`packages/agent/src/rpc/interceptors/replay-protection.ts:13-24`。
- 現在の Client Agent RPC auth は `credentialRef` と `secretMaterial` を server-only credential として扱い、JWT header `alg: HS256` と HMAC-SHA256 で compact JWT を署名する。根拠: `packages/client/src/server/agent-rpc/authentication.ts:16-37`、`packages/client/src/server/agent-rpc/authentication.ts:82-151`。
- 現在の Client loader は `resolveCredentialSecret` で `AGENT_CREDENTIAL_*` Worker Secret から `secretMaterial` を解決し、Agent RPC clients へ渡す。根拠: `packages/client/src/server/agent-rpc/agent-loader.ts:1-13`、`packages/client/src/server/agent-rpc/agent-loader.ts:65-82`、`packages/client/src/server/credentials/secret-resolution.ts:17-23`、`packages/client/src/server/credentials/secret-resolution.ts:62-83`。
- 分離方針: production Agent RPC request は `Authorization: Bearer <EdDSA JWT>`、`AGENT_CONTROL_PLANE_TRUST`、issuer/kid/fingerprint、allowed Agent/scope、`jti` replay に閉じる。`x-agent-test-*` は tests 専用 path に残せるが、production credential として扱わない。根拠: `specs/agent-security/spec.md:13-20`、`design.md:31`、`design.md:493-506`。
- 分離方針: Client Agent RPC signing source は Client D1 の encrypted Ed25519 signing key store と `CLIENT_CREDENTIAL_ENCRYPTION_KEY` に限定し、HS256 signing、`resolveCredentialSecret`、`AGENT_CREDENTIAL_*` Worker Secret、Provider credential reference、`credentialRef` を Agent RPC bearer JWT signing に使わない。根拠: `specs/client-registry/spec.md:41-51`、`specs/client-registry/spec.md:64-69`、`design.md:508-519`、`design.md:521-532`、`design.md:657-660`。

## 6. 次工程の不変条件

- Agent / Client 所有境界: Agent は `AI_AGENT` Durable Object と Agent-owned storage を所有し、Client は `CLIENT_DB` と encrypted Client Service signing key store / credential references を所有する。根拠: `AGENTS.md:63-71`、`design.md:508-519`。
- Protobuf RPC-only / generated 境界: Agent public API は TypeSpec を正本にして proto/RPC generated output をコマンドで更新する。根拠: `AGENTS.md:37-45`、`design.md:13`、`design.md:646-647`。
- 検証基準: 最終的に `pnpm check:codegen`、`pnpm test:agent`、`pnpm test:client`、`pnpm test:governance`、`pnpm check:agent && pnpm check:client` を成功させる。根拠: `design.md:646-650`、`design.md:666`。
