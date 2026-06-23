## 1. Baseline / Contract Prep

- [ ] 1.1 `proposal.md`、`design.md`、delta specs、Issue #3 を照合し、対象 Spec Unit、Scenario ID、implementation file list を作業メモに固定する。
- [ ] 1.2 `packages/agent/src/env.ts` と `packages/client/src/server/env.ts` の現在の required secret handling を確認し、`AGENT_CONTROL_PLANE_TRUST` と `CLIENT_CREDENTIAL_ENCRYPTION_KEY` への変更点を整理する。
- [ ] 1.3 `packages/agent/src/domain/security/**`、`packages/agent/src/rpc/interceptors/**`、`packages/client/src/server/agent-rpc/**` の既存 test seam と HS256 path を棚卸しし、production path と test-only path の分離方針を実装メモに残す。

## 2. Agent Trust Config / Authentication

- [ ] 2.1 `packages/agent/src/env.ts` を更新し、required Agent secret を `AGENT_CONTROL_PLANE_TRUST` に切り替え、`AGENT_CLIENT_JWT_PUBLIC_KEYS` を production source から外す。
- [ ] 2.2 `packages/agent/src/domain/security/trust-config.ts` を追加し、trust config JSON parse、schema validation、private parameter rejection、fingerprint、loadedAt、issuer/kid lookup、key status handling を実装する。
- [ ] 2.3 `packages/agent/src/domain/security/types.ts` を更新し、principal policy、issuer/kid/fingerprint、principalType、allowedAgentIds、allowedScopes、trust diagnostic 型を追加する。
- [ ] 2.4 `packages/agent/src/domain/security/jwt.ts` を EdDSA-only Client Service JWT verifier に更新し、`alg`、`kid`、`iss`、signature、audience、time window、max TTL、agent scope、allowed scope、acting user、failure reason を扱う。
- [ ] 2.5 `packages/agent/src/domain/security/replay.ts` と `packages/agent/src/rpc/interceptors/replay-protection.ts` を更新し、Client Service `jti` を principal + Agent scope に紐付けて replay rejection に接続する。
- [ ] 2.6 `packages/agent/src/rpc/interceptors/authentication.ts` を更新し、production request は `Authorization: Bearer <jwt>` だけを使い、`x-agent-test-*` seam は tests 専用 path に閉じる。
- [ ] 2.7 `packages/agent/src/rpc/interceptors/authorization.ts` を更新し、health/read/write/tool/integration/admin の method scope matrix と allowedAgentIds validation を実装する。
- [ ] 2.8 `packages/agent/src/rpc/command-context.ts` と `packages/agent/src/rpc/interceptors/types.ts` を更新し、AIAgent へ issuer、subject、kid、fingerprint、principalType、actingUserId、scopes、jwtId を渡す。
- [ ] 2.9 `packages/agent/src/rpc/interceptors/audit.ts`、`packages/agent/src/observability/records.ts`、`packages/agent/src/observability/redaction.ts` を更新し、safe auth audit fields と JWT/key/private material redaction を実装する。

## 3. Agent Health / TypeSpec / Codegen

- [ ] 3.1 `packages/agent/src/typespec/src/common/security.tsp` と `packages/agent/src/typespec/src/services/agent-health.tsp` を更新し、trust config diagnostic と current issuer/kid/fingerprint summary を Agent health contract に追加する。
- [ ] 3.2 `packages/agent/src/rpc/services/health.ts` を更新し、trust config version/fingerprint/loadedAt、issuer/kid/fingerprint verification result、secret-free serving/degraded status を返す。
- [ ] 3.3 `pnpm gen:agent:proto && pnpm gen:agent:rpc` を実行し、`packages/agent/proto/cftamac/agent/v1.proto`、`packages/agent/src/generated/rpc/cftamac/agent/v1_pb.ts`、`packages/client/src/generated/agent-rpc/cftamac/agent/v1_pb.ts` をコマンドで更新する。
- [ ] 3.4 `pnpm check:codegen` を実行し、generated output drift と field stability guard が通ることを確認する。

## 4. Client D1 / Signing Key Store

- [ ] 4.1 `packages/client/src/server/env.ts` と `packages/client/wrangler.toml` を更新し、`CLIENT_CREDENTIAL_ENCRYPTION_KEY` を server-only required secret として扱う。
- [ ] 4.2 `packages/client/src/server/db/migrations/0002_control_plane_signing_keys.sql` を追加し、`client_signing_keys` table と managed Agent signing metadata columns を追加する。
- [ ] 4.3 `packages/client/src/server/db/schema.ts` を更新し、signing key table、managed Agent signing columns、table metadata、forbidden snapshot table checks を整合させる。
- [ ] 4.4 `packages/client/src/server/db/signing-keys.ts` を追加し、key create/list/get/update status/default selection/last-used update repository を実装する。
- [ ] 4.5 `packages/client/src/server/db/managed-agents.ts` を更新し、signingIssuer/signingKid/publicFingerprint/lastVerifiedAt の読み書きと validation を追加する。
- [ ] 4.6 `packages/client/src/server/credentials/encryption.ts` を追加し、`CLIENT_CREDENTIAL_ENCRYPTION_KEY` による private JWK 暗号化/復号、tamper rejection、safe error を実装する。
- [ ] 4.7 `packages/client/src/server/credentials/signing-keys.ts` を追加し、Ed25519 key generation、public JWK fingerprint、private JWK encryption envelope、active key resolution を実装する。

## 5. Client RPC / Server Actions

- [ ] 5.1 `packages/client/src/server/agent-rpc/authentication.ts` を更新し、HS256 signing path を削除して EdDSA compact JWT signing と `Authorization: Bearer <jwt>` interceptor を実装する。
- [ ] 5.2 `packages/client/src/server/agent-rpc/agent-loader.ts` を更新し、managed Agent metadata、selected signing key、fingerprint match、disabled/deleted key rejection を読み込み時に処理する。
- [ ] 5.3 `packages/client/src/server/agent-rpc/create-client.ts` を更新し、generated Connect client が selected signing key の interceptor を使うようにする。
- [ ] 5.4 `packages/client/src/server/actions/signing-keys.ts` を追加し、key generation、disable、delete、default selection、browser-safe serialization を実装する。
- [ ] 5.5 `packages/client/src/server/actions/trust-config.ts` を追加し、public-only trust config export、merge/update JSON、scope/Agent selection、schema validation、broad permission warning metadata を実装する。
- [ ] 5.6 `packages/client/src/server/actions/agent-health.ts` を追加し、selected signing key で `AgentHealthService.Check` を呼び、lastVerifiedAt 更新と safe result mapping を実装する。
- [ ] 5.7 Access identity/acting user derivation を Agent RPC JWT payload に接続し、scope selection と `acting_user_id` が server-only source から決まることを確認する。

## 6. Client UI

- [ ] 6.1 `packages/client/src/components/schemas/signing-key.ts` を追加し、issuer/kid/status/scope/allowedAgentIds/trust export form validation を実装する。
- [ ] 6.2 `packages/client/src/components/signing-key-management.tsx` を追加し、key list、generate、default selection、disable/delete、trust config update warning を表示する。
- [ ] 6.3 `packages/client/src/components/trust-config-export.tsx` を追加し、public-only JSON preview、merge/update JSON、schema validation result、broad scope warning、fingerprint display を表示する。
- [ ] 6.4 `packages/client/src/components/agent-signing-key-select.tsx` を追加し、Agent ごとの issuer/kid/fingerprint selection と mismatch error を表示する。
- [ ] 6.5 `packages/client/src/components/key-rotation-guide.tsx` を追加し、rotation、emergency revoke、break-glass recovery guidance と health verification status を表示する。
- [ ] 6.6 `packages/client/app/agents/page.tsx` を更新し、registry page から signing key management と trust config export に到達できるようにする。
- [ ] 6.7 `packages/client/app/agents/[agentId]/settings/page.tsx` を更新し、Agent signing key selection、issuer/kid/fingerprint、last verified at、health verification、rotation guidance を表示する。
- [ ] 6.8 UI の Browser payload、component props、storage、client bundle に private JWK、encrypted private JWK、生 JWT、signing logic が出ないことを開発中に確認する。

## 7. Documentation / Governance

- [ ] 7.1 `docs/operations/agent-control-plane-auth.md` を追加し、`AGENT_CONTROL_PLANE_TRUST` schema、Client signing key generation、trust config export、Agent Worker secret 設定、rotation、emergency revoke、break-glass recovery を記述する。
- [ ] 7.2 `packages/agent/README.md` と `packages/client/README.md` を更新し、required secrets、local/staging smoke、health verification、private key 非露出境界を説明する。
- [ ] 7.3 `scripts/governance/verify-agent-surface.mjs` を更新し、Agent REST/JSON auth route、bootstrap RPC、AgentTrustRegistry Durable Object、Client private key Worker Secret 手貼り前提を検出する。
- [ ] 7.4 `scripts/governance/verify-package-boundaries.mjs` を更新し、Browser-visible modules と public Client routes から signing material/server-only Agent RPC module への到達を検出する。
- [ ] 7.5 `scripts/openspec/verify-scenario-coverage.mjs` を確認し、production auth Scenario ID と manual tag handling の coverage が維持されるよう fixture を追加する。

## 8. Agent Scenario Tests

- [ ] 8.1 `packages/agent/src/tests/client-service-ed25519-auth.test.ts` に `[AGENT-SECURITY-S001] Valid Client Service JWT authenticates Agent RPC` を追加する。
- [ ] 8.2 `packages/agent/src/tests/client-service-ed25519-auth.test.ts` に `[AGENT-SECURITY-S002] Invalid Client JWT is rejected before mutation` を追加し、JWT 不在、alg 不一致、unknown issuer/kid、署名不正、audience/time/agent/scope error を覆う。
- [ ] 8.3 `packages/agent/src/tests/security-foundation.test.ts` に `[AGENT-SECURITY-S007] Domain error maps to stable Connect code` を更新追加する。
- [ ] 8.4 `packages/agent/src/tests/security-foundation.test.ts` に `[AGENT-SECURITY-S008] Observability excludes secret material` を更新追加する。
- [ ] 8.5 `packages/agent/src/tests/control-plane-trust-config.test.ts` に `[AGENT-SECURITY-S010] Trust config resolves issuer and Ed25519 public key policy` を追加する。
- [ ] 8.6 `packages/agent/src/tests/control-plane-trust-config.test.ts` に `[AGENT-SECURITY-S011] Invalid trust config fails closed` を追加する。
- [ ] 8.7 `packages/agent/src/tests/control-plane-trust-config.test.ts` に `[AGENT-SECURITY-S012] Retiring key validates only within bounded token window` を追加する。
- [ ] 8.8 `packages/agent/src/tests/client-service-ed25519-auth.test.ts` に `[AGENT-SECURITY-S013] Method scope matrix rejects missing scope` を追加する。
- [ ] 8.9 `packages/agent/src/tests/client-service-ed25519-auth.test.ts` に `[AGENT-SECURITY-S014] Agent id and allowedAgentIds mismatch is rejected` を追加する。
- [ ] 8.10 `packages/agent/src/tests/client-service-ed25519-auth.test.ts` に `[AGENT-SECURITY-S015] Replayed jti is rejected before mutation` を追加する。
- [ ] 8.11 `packages/agent/src/tests/health-rpc.test.ts` に `[AGENT-HEALTH-S001] Check returns safe serving status over Protobuf RPC` を更新追加する。
- [ ] 8.12 `packages/agent/src/tests/health-rpc.test.ts` に `[AGENT-HEALTH-S002] REST health endpoint is not a public Agent API` を更新追加する。
- [ ] 8.13 `packages/agent/src/tests/health-rpc.test.ts` に `[AGENT-HEALTH-S003] Check diagnoses issuer kid fingerprint trust state` を追加する。
- [ ] 8.14 `packages/agent/src/tests/rpc-interceptors.test.ts` を更新し、production path が `x-agent-test-*` を credential として扱わないことを確認する。

## 9. Client Scenario Tests

- [ ] 9.1 `packages/client/src/tests/client-registry-repositories.test.ts` に `[CLIENT-REGISTRY-S001] Managed Agent ledger persists display and signing identity metadata` を更新追加する。
- [ ] 9.2 `packages/client/src/tests/client-signing-key-store.test.ts` に `[CLIENT-REGISTRY-S002] Credential references and encrypted signing key store do not persist plaintext secrets` を追加する。
- [ ] 9.3 `packages/client/src/tests/client-agent-rpc-factory.test.ts` に `[CLIENT-REGISTRY-S003] Server Action calls Agent RPC with signing key store and generated Connect client` を更新追加する。
- [ ] 9.4 `packages/client/src/tests/client-signing-key-store.test.ts` に `[CLIENT-REGISTRY-S006] Server-side key generation does not return private JWK to browser` を追加する。
- [ ] 9.5 `packages/client/src/tests/client-signing-key-store.test.ts` に `[CLIENT-REGISTRY-S007] Disabled or deleted signing key is not used for JWT signing` を追加する。
- [ ] 9.6 `packages/client/src/tests/client-agent-rpc-factory.test.ts` に `[CLIENT-REGISTRY-S008] Signing key fingerprint is matched against Agent registry metadata` を追加する。
- [ ] 9.7 `packages/client/src/tests/agent-management-ui.test.tsx` と `tests/e2e/management-agent-registry.spec.ts` に `[CLIENT-MANAGEMENT-S010] Signing key management screen handles key lifecycle` を追加する。
- [ ] 9.8 `packages/client/src/tests/browser-agent-rpc-secrecy.test.ts` と `tests/e2e/management-agent-rpc-secrecy.spec.ts` に `[CLIENT-MANAGEMENT-S011] Browser receives no signing material` を追加する。
- [ ] 9.9 `packages/client/src/tests/agent-management-ui.test.tsx` と `tests/e2e/management-agent-registry.spec.ts` に `[CLIENT-MANAGEMENT-S012] Agent detail displays issuer kid fingerprint and verification result` を追加する。
- [ ] 9.10 `packages/client/src/tests/agent-management-ui.test.tsx` と `tests/e2e/management-agent-registry.spec.ts` に `[CLIENT-MANAGEMENT-S013] Trust config export generates public-only JSON` を追加する。
- [ ] 9.11 `packages/client/src/tests/agent-management-ui.test.tsx` と `tests/e2e/management-agent-registry.spec.ts` に `[CLIENT-MANAGEMENT-S014] Broad scope selection shows warning and schema validation` を追加する。
- [ ] 9.12 `packages/client/src/tests/agent-management-ui.test.tsx` に `[CLIENT-MANAGEMENT-S015] Rotation guidance links trust config and Agent verification` を追加する。
- [ ] 9.13 `packages/client/src/tests/agent-management-ui.test.tsx` に `[CLIENT-MANAGEMENT-S016] Emergency revoke and break-glass recovery guidance is displayed` を追加する。

## 10. Governance Scenario Tests

- [ ] 10.1 `scripts/governance/verify-agent-surface.test.mjs` と documentation checks に `[WORKSPACE-GOVERNANCE-S010] Documentation exposes production credential runbooks` を追加する。
- [ ] 10.2 `scripts/governance/verify-agent-surface.test.mjs` と `scripts/governance/verify-package-boundaries.test.mjs` に `[WORKSPACE-GOVERNANCE-S011] Guardrails reject browser-visible signing material and forbidden Agent auth surfaces` を追加する。
- [ ] 10.3 `scripts/openspec/verify-scenario-coverage.test.mjs` に `[WORKSPACE-GOVERNANCE-S012] Scenario coverage validates production authentication specs` を追加する。

## 11. Verification

- [ ] 11.1 `pnpm gen:agent:proto && pnpm gen:agent:rpc` を再実行し、generated files に手編集 drift がないことを確認する。
- [ ] 11.2 `pnpm check:codegen` を実行し、TypeSpec/proto/RPC generation drift がないことを確認する。
- [ ] 11.3 `pnpm format:check` を実行し、Markdown、TypeScript、JSON の formatting gate が通ることを確認する。
- [ ] 11.4 `pnpm lint` を実行し、ESLint、OpenSpec validate、Scenario ID coverage、governance、supply-chain guardrails が通ることを確認する。
- [ ] 11.5 `pnpm check` を実行し、workspace package checks が通ることを確認する。
- [ ] 11.6 `pnpm test:run` を実行し、root Vitest suite が通ることを確認する。
- [ ] 11.7 `pnpm test:agent` を実行し、Agent security/health/interceptor tests が通ることを確認する。
- [ ] 11.8 `pnpm test:management-client` を実行し、Client D1/signing/UI/browser secrecy tests が通ることを確認する。
- [ ] 11.9 `pnpm test:governance` を実行し、forbidden surface、package boundary、scenario coverage tests が通ることを確認する。
- [ ] 11.10 `pnpm test:e2e` を実行し、Management Client signing key/trust export/health verification E2E が通ることを確認する。
- [ ] 11.11 `pnpm check:agent && pnpm check:management-client` を実行し、Agent/Client package checks が通ることを確認する。
- [ ] 11.12 `pnpm build:foundation` を実行し、Agent/Client build が通ることを確認する。
- [ ] 11.13 `pnpm lint:openspec` を実行し、OpenSpec validation と Scenario ID coverage check が通ることを確認する。
