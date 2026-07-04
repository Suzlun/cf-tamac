## 1. 基準確認 / 契約準備

- [x] 1.1 `proposal.md`、`design.md`、delta specs、Issue #3 を照合し、対象 Spec Unit、Scenario ID、implementation file list を作業メモに固定する。
- [x] 1.2 `packages/agent/src/env.ts` と `packages/client/src/server/env.ts` の現在の required secret handling を確認し、`AGENT_CONTROL_PLANE_TRUST` と `CLIENT_CREDENTIAL_ENCRYPTION_KEY` への変更点を整理する。
- [x] 1.3 `packages/agent/src/domain/security/**`、`packages/agent/src/rpc/interceptors/**`、`packages/client/src/server/agent-rpc/**` の既存 test seam と HS256 path を棚卸しし、本番経路と test-only path の分離方針を実装メモに残す。

## 2. Agent 信頼設定 / 認証

- [x] 2.1 `packages/agent/src/env.ts` を更新し、required Agent secret を `AGENT_CONTROL_PLANE_TRUST` に切り替え、`AGENT_CLIENT_JWT_PUBLIC_KEYS` を本番の正本から外す。
- [x] 2.2 `packages/agent/src/domain/security/trust-config.ts` を追加し、trust config JSON parse、schema validation、private parameter rejection、fingerprint、loadedAt、issuer/kid lookup、key status handling を実装する。
- [x] 2.3 `packages/agent/src/domain/security/types.ts` を更新し、principal policy、issuer/kid/fingerprint、principalType、allowedAgentIds、allowedScopes、trust diagnostic 型を追加する。
- [x] 2.4 `packages/agent/src/domain/security/jwt.ts` を EdDSA-only Client Service JWT verifier に更新し、`alg`、`kid`、`iss`、signature、audience、time window、max TTL、agent scope、allowed scope、acting user、failure reason を扱う。
- [x] 2.5 `packages/agent/src/domain/security/replay.ts` と `packages/agent/src/rpc/interceptors/replay-protection.ts` を更新し、Client Service `jti` を principal + Agent scope に紐付けて replay rejection に接続する。
- [x] 2.6 `packages/agent/src/rpc/interceptors/authentication.ts` を更新し、本番 request は `Authorization: Bearer <jwt>` だけを使い、`x-agent-test-*` seam は tests 専用 path に閉じる。
- [x] 2.7 `packages/agent/src/rpc/interceptors/authorization.ts` を更新し、health/read/write/tool/integration/admin の method scope matrix と allowedAgentIds validation を実装する。
- [x] 2.8 `packages/agent/src/rpc/command-context.ts` と `packages/agent/src/rpc/interceptors/types.ts` を更新し、AIAgent へ issuer、subject、kid、fingerprint、principalType、actingUserId、scopes、jwtId を渡す。
- [x] 2.9 `packages/agent/src/rpc/interceptors/audit.ts`、`packages/agent/src/observability/records.ts`、`packages/agent/src/observability/redaction.ts` を更新し、安全な auth audit fields と JWT/key/private material redaction を実装する。

## 3. Agent Health / TypeSpec / Codegen

- [x] 3.1 `packages/agent/src/typespec/src/common/security.tsp` と `packages/agent/src/typespec/src/services/agent-health.tsp` を更新し、trust config diagnostic と current issuer/kid/fingerprint summary を Agent health contract に追加する。
- [x] 3.2 `packages/agent/src/rpc/services/health.ts` を更新し、trust config version/fingerprint/loadedAt、issuer/kid/fingerprint verification result、secret-free serving/degraded status を返す。
- [x] 3.3 `pnpm gen:agent:proto && pnpm gen:agent:rpc` を実行し、`packages/agent/proto/cftamac/agent/v1.proto`、`packages/agent/src/generated/rpc/cftamac/agent/v1_pb.ts`、`packages/client/src/generated/agent-rpc/cftamac/agent/v1_pb.ts` をコマンドで更新する。
- [x] 3.4 `pnpm check:codegen` を実行し、generated output drift と field stability guard が通ることを確認する。

## 4. Client D1 / 署名鍵ストア

- [x] 4.1 `packages/client/src/server/env.ts` と `packages/client/wrangler.toml` を更新し、`CLIENT_CREDENTIAL_ENCRYPTION_KEY` を server-only required secret として扱う。
- [x] 4.2 `packages/client/src/server/db/migrations/0002_control_plane_signing_keys.sql` を追加し、`client_signing_keys` table と managed Agent signing metadata columns を追加する。
- [x] 4.3 `packages/client/src/server/db/schema.ts` を更新し、signing key table、managed Agent signing columns、table metadata、forbidden snapshot table checks を整合させる。
- [x] 4.4 `packages/client/src/server/db/signing-keys.ts` を追加し、key create/list/get/update status/default selection/last-used update repository と Client status / trust export status mapping helper を実装する。
- [x] 4.5 `packages/client/src/server/db/managed-agents.ts` を更新し、signingIssuer/signingKid/publicFingerprint/lastVerifiedAt の読み書きと validation を追加する。
- [x] 4.6 `packages/client/src/server/credentials/encryption.ts` を追加し、`CLIENT_CREDENTIAL_ENCRYPTION_KEY` による private JWK 暗号化/復号、tamper rejection、安全な error を実装する。
- [x] 4.7 `packages/client/src/server/credentials/signing-keys.ts` を追加し、Ed25519 key generation、public JWK fingerprint、private JWK encryption envelope、active key resolution を実装する。
- [x] 4.8 `packages/client/src/server/db/migrations/0002_control_plane_signing_keys.sql` で既存 managed Agent 行が壊れない nullable signing metadata migration を定義し、key 未選択状態では Agent RPC 実行前に明示的な key selection を要求する。
- [x] 4.9 `packages/client/src/server/credentials/secret-resolution.ts` を更新し、Agent RPC 認証経路から `AGENT_CREDENTIAL_*` 解決を除去して Provider/外部 credential 参照解決専用に縮小し、Agent RPC signing source として使わせない。

## 5. Client RPC / Server Actions

- [x] 5.1 `packages/client/src/server/agent-rpc/authentication.ts` を更新し、HS256 signing path を削除して EdDSA compact JWT signing と `Authorization: Bearer <jwt>` interceptor を実装する。
- [x] 5.2 `packages/client/src/server/agent-rpc/agent-loader.ts` を更新し、managed Agent metadata、selected signing key、fingerprint match、disabled/deleted key rejection を読み込み時に処理する。
- [x] 5.3 `packages/client/src/server/agent-rpc/create-client.ts` を更新し、generated Connect client が selected signing key の interceptor を使うようにする。
- [x] 5.4 `packages/client/src/server/actions/signing-keys.ts` を追加し、key generation、disable、delete、default selection、browser-safe serialization を実装する。
- [x] 5.5 `packages/client/src/server/actions/trust-config.ts` を追加し、公開情報だけの trust config export、merge/update JSON、scope/Agent selection、schema validation、broad permission warning metadata、Client `active` -> trust `active|retiring` と Client `disabled|deleted` -> trust `revoked` の mapping を実装する。
- [x] 5.6 `packages/client/src/server/actions/agent-health.ts` を追加し、selected signing key で `AgentHealthService.Check` を呼び、lastVerifiedAt 更新と安全な result mapping を実装する。
- [x] 5.7 Access identity/acting user derivation を Agent RPC JWT payload に接続し、scope selection と `acting_user_id` が server-only source から決まることを確認する。
- [x] 5.8 `packages/client/src/server/agent-rpc/**` から HS256 signing、`resolveCredentialSecret`、`secretMaterial`、`credentialRef` Agent RPC signing source を撤去し、Ed25519 signing key store だけで bearer JWT を生成する。

## 6. Client UI

- [x] 6.1 `packages/client/src/components/schemas/signing-key.ts` を追加し、issuer/kid/status/scope/allowedAgentIds/trust export form validation を実装する。
- [x] 6.2 `packages/client/src/components/signing-key-management.tsx` を追加し、Global Settings 配下で key list、generate、default selection、disable/delete、trust config update warning、Agent 0 件 empty state を表示する。
- [x] 6.3 `packages/client/src/components/trust-config-export.tsx` を追加し、Global Settings 配下で公開情報だけの JSON preview、merge/update JSON、schema validation result、Client key status と trust config status の mapping、broad scope warning、fingerprint display、Agent 0 件でも使える export state を表示する。
- [x] 6.4 `packages/client/src/components/agent-signing-key-select.tsx` を追加し、Agent ごとの既存 global signing key selection、issuer/kid/fingerprint の read-only summary、mismatch error、Global key 未作成時の導線を表示する。
- [x] 6.5 `packages/client/src/components/key-rotation-guide.tsx` を追加し、Global Settings 配下で rotation、emergency revoke、break-glass recovery guidance と Agent assignment / health verification sequencing を表示する。
- [x] 6.6 `packages/client/app/global-settings/{page.tsx,signing-keys/page.tsx,trust-config-export/page.tsx}` と `packages/client/src/components/management-nav-config.ts` を追加/更新し、Global Settings から signing key management と trust config export に Agent 0 件でも到達できるようにし、`packages/client/src/tests/management-navigation.test.tsx` の positive route graph を更新する。
- [x] 6.7 `packages/client/app/agents/[agentId]/settings/page.tsx` を更新し、Agent ごとの既存 global signing key selection、issuer/kid/fingerprint、last verified at、health verification を表示し、鍵生成と rotation/revoke/recovery guidance は Global Settings 側へ分離する。
- [x] 6.8 UI のブラウザー payload、component props、storage、client bundle に private JWK、encrypted private JWK、生 JWT、signing logic が出ないことを開発中に確認する。
- [x] 6.9 `packages/client/app/agents/[agentId]/page.tsx` と `packages/client/app/agents/[agentId]/{threads,events,runs,schedules,integrations,settings}/page.tsx` を更新し、trust 設定成功後に selected-Agent pages が safe fallback ではなく server-only Agent RPC 由来の実データを表示することを確認する。

## 6.5 Wireframes

- [x] 6.10 `openspec/changes/enable-agent-ed25519-jwt-auth/wireframes/signing-key-management.wireframe.json` を正本として確認し、対応する `.wireframe.html` preview と `Global Settings / Signing Keys` breadcrumb、Agent 0 件 empty state、key list / generate / default selection / disable / delete / public fingerprint 表示に沿って UI 実装を進める。
- [x] 6.11 `openspec/changes/enable-agent-ed25519-jwt-auth/wireframes/trust-config-export.wireframe.json` を正本として確認し、対応する `.wireframe.html` preview と `Global Settings / Trust Config Export` breadcrumb、Agent 0 件でも使える issuer/kid/public JWK summary / allowedAgentIds / allowedScopes / broad permission warning / schema validation / copyable public-only JSON に沿って UI 実装を進める。
- [x] 6.12 `openspec/changes/enable-agent-ed25519-jwt-auth/wireframes/agent-signing-key-select-health.wireframe.json` を正本として確認し、対応する `.wireframe.html` preview と Agent settings/detail の既存 global key selection、issuer/kid/fingerprint read-only summary、last verified/verification result、Global key 未作成 state、Health Check 実行 UI に沿って実装を進める。
- [x] 6.13 `openspec/changes/enable-agent-ed25519-jwt-auth/wireframes/key-rotation-revoke-recovery.wireframe.json` と `connected-happy-path.wireframe.json` を正本として確認し、対応する `.wireframe.html` previews と Global key lifecycle / rotation/revoke/recovery guidance、Agent assignment / health sequencing、Global Settings signing key/trust export 前提後の実データ表示状態に沿って実装を進める。

## 7. ドキュメント / Governance

- [x] 7.1 `docs/operations/agent-control-plane-auth.md` を追加し、`AGENT_CONTROL_PLANE_TRUST` schema、Client signing key generation、trust config export、Agent Worker secret 設定、rotation、emergency revoke、break-glass recovery を記述する。
- [x] 7.2 `packages/agent/README.md`、`packages/client/README.md`、`AGENTS.md`、`CODING_STANDARDS.md`、`CONTRIBUTING.md` を更新し、required secrets、Client D1 の許可データ集合、encrypted Client Service signing key store、local/staging smoke、health verification、private key 非露出境界を説明する。
- [x] 7.3 `scripts/governance/verify-agent-surface.mjs` を更新し、Agent REST/JSON auth route、bootstrap RPC、AgentTrustRegistry Durable Object、Client private key Worker Secret 手貼り前提を検出する。
- [x] 7.4 `scripts/governance/verify-package-boundaries.mjs` を更新し、Browser-visible modules と public Client routes から signing material/server-only Agent RPC module への到達を検出し、Client D1 schema tests が encrypted signing key store を許可しつつ Agent domain snapshots と plaintext secrets を拒否するようにする。
- [x] 7.5 `scripts/openspec/verify-scenario-coverage.mjs` を確認し、本番 auth Scenario ID と manual tag handling の coverage が維持されるよう fixture を追加する。
- [x] 7.6 governance fixtures を追加し、HS256 Agent RPC signing、`resolveCredentialSecret` による Agent RPC signing source、`AGENT_CREDENTIAL_*` Agent RPC auth path、public Client Agent proxy route、Client D1 plaintext signing material、Agent domain snapshot table が failure になることを確認する。

## 8. Agent Scenario Tests

- [x] 8.1 `packages/agent/src/tests/client-service-ed25519-auth.test.ts` に `[AGENT-SECURITY-S001] 有効な Client Service JWT が Agent RPC を認証する` を追加する。
- [x] 8.2 `packages/agent/src/tests/client-service-ed25519-auth.test.ts` に `[AGENT-SECURITY-S002] 不正な Client JWT は mutation 前に拒否される` を追加し、JWT 不在、alg 不一致、unknown issuer/kid、署名不正、audience/time/agent/scope error を覆う。
- [x] 8.3 `packages/agent/src/tests/security-foundation.test.ts` に `[AGENT-SECURITY-S007] ドメイン error が安定した Connect code へ対応付けられる` を更新追加する。
- [x] 8.4 `packages/agent/src/tests/security-foundation.test.ts` に `[AGENT-SECURITY-S008] 観測文脈が secret material を除外する` を更新追加する。
- [x] 8.5 `packages/agent/src/tests/control-plane-trust-config.test.ts` に `[AGENT-SECURITY-S010] 信頼設定が issuer と Ed25519 public key policy を解決する` を追加する。
- [x] 8.6 `packages/agent/src/tests/control-plane-trust-config.test.ts` に `[AGENT-SECURITY-S011] 不正な trust config は安全側で拒否される` を追加する。
- [x] 8.7 `packages/agent/src/tests/control-plane-trust-config.test.ts` に `[AGENT-SECURITY-S012] retiring key は bounded token window 内だけ検証される` を追加する。
- [x] 8.8 `packages/agent/src/tests/client-service-ed25519-auth.test.ts` に `[AGENT-SECURITY-S013] メソッド scope matrix が不足 scope を拒否する` を追加する。
- [x] 8.9 `packages/agent/src/tests/client-service-ed25519-auth.test.ts` に `[AGENT-SECURITY-S014] 対象 Agent id と allowedAgentIds の不一致が拒否される` を追加する。
- [x] 8.10 `packages/agent/src/tests/client-service-ed25519-auth.test.ts` に `[AGENT-SECURITY-S015] 再利用された jti は mutation 前に拒否される` を追加する。
- [x] 8.11 `packages/agent/src/tests/health-rpc.test.ts` に `[AGENT-HEALTH-S001] Check が Protobuf RPC 経由で安全な serving 状態を返す` を更新追加する。
- [x] 8.12 `packages/agent/src/tests/health-rpc.test.ts` に `[AGENT-HEALTH-S002] 公開 REST health endpoint は Agent 公開 API ではない` を更新追加する。
- [x] 8.13 `packages/agent/src/tests/health-rpc.test.ts` に `[AGENT-HEALTH-S003] Check が issuer kid fingerprint の trust 状態を診断する` を追加する。
- [x] 8.14 `packages/agent/src/tests/rpc-interceptors.test.ts` を更新し、本番 path が `x-agent-test-*` を credential として扱わないことを確認する。
- [x] 8.15 `packages/agent/src/tests/health-rpc.test.ts` に `[AGENT-HEALTH-S005] 認証失敗は Check 応答ではなく安全な Connect error として診断される` を追加し、unknown issuer/kid、revoked key、fingerprint mismatch、replayed `jti` を覆う。

## 9. Client Scenario Tests

- [x] 9.1 `packages/client/src/tests/client-registry-repositories.test.ts` に `[CLIENT-REGISTRY-S001] 管理対象 Agent 台帳が表示と署名 identity metadata を永続化する` を更新追加する。
- [x] 9.2 `packages/client/src/tests/client-signing-key-store.test.ts` に `[CLIENT-REGISTRY-S002] credential 参照と暗号化済み signing key store は平文 secret を保存しない` を追加する。
- [x] 9.3 `packages/client/src/tests/client-agent-rpc-factory.test.ts` に `[CLIENT-REGISTRY-S003] サーバー Action が signing key store と生成済み Connect client で Agent RPC を呼ぶ` を更新追加する。
- [x] 9.4 `packages/client/src/tests/client-signing-key-store.test.ts` に `[CLIENT-REGISTRY-S006] サーバー側 key generation は private JWK をブラウザーに返さない` を追加する。
- [x] 9.5 `packages/client/src/tests/client-signing-key-store.test.ts` に `[CLIENT-REGISTRY-S007] disabled または deleted signing key は JWT signing に使われない` を追加する。
- [x] 9.6 `packages/client/src/tests/client-agent-rpc-factory.test.ts` に `[CLIENT-REGISTRY-S008] 署名鍵 fingerprint が Agent registry metadata と照合される` を追加する。
- [x] 9.7 `packages/client/src/tests/client-agent-rpc-factory.test.ts` に `[CLIENT-REGISTRY-S011] Agent RPC 認証が signing key store だけを署名 source にする` を追加し、`credentialRef`、`AGENT_CREDENTIAL_*`、HS256 signing、Provider credential reference が Agent RPC signing に使われないことを確認する。
- [x] 9.8 `packages/client/src/tests/agent-management-ui.test.tsx` と `tests/e2e/management-agent-registry.spec.ts` に `[AGENT-MANAGEMENT-UI-S010] 署名鍵管理画面が key lifecycle を扱う` を追加し、Global Settings 配下で key lifecycle を扱うことを確認する。
- [x] 9.9 `packages/client/src/tests/browser-agent-rpc-secrecy.test.ts` と `tests/e2e/management-agent-rpc-secrecy.spec.ts` に `[AGENT-MANAGEMENT-UI-S011] ブラウザーが signing material を受け取らない` を追加する。
- [x] 9.10 `packages/client/src/tests/agent-management-ui.test.tsx` と `tests/e2e/management-agent-registry.spec.ts` に `[AGENT-MANAGEMENT-UI-S012] 詳細画面が issuer kid fingerprint と verification result を表示する` を追加する。
- [x] 9.11 `packages/client/src/tests/agent-management-ui.test.tsx` と `tests/e2e/management-agent-registry.spec.ts` に `[AGENT-MANAGEMENT-UI-S013] 信頼設定 export が公開情報だけの JSON を生成する` を追加し、Global Settings 配下で public-only JSON と Client status / trust status mapping を生成することを確認する。
- [x] 9.12 `packages/client/src/tests/agent-management-ui.test.tsx` と `tests/e2e/management-agent-registry.spec.ts` に `[AGENT-MANAGEMENT-UI-S014] 広い scope selection が警告と schema validation を表示する` を追加する。
- [x] 9.13 `packages/client/src/tests/agent-management-ui.test.tsx` に `[AGENT-MANAGEMENT-UI-S015] 鍵交代 guidance が trust config と Agent verification を結び付ける` を追加し、Global Settings の key lifecycle と Agent settings の assignment/health sequencing を確認する。
- [x] 9.14 `packages/client/src/tests/agent-management-ui.test.tsx` に `[AGENT-MANAGEMENT-UI-S016] 緊急失効と break-glass recovery guidance が表示される` を追加する。
- [x] 9.15 `packages/client/src/tests/agent-management-ui.test.tsx` と `tests/e2e/management-agent-registry.spec.ts` に `[AGENT-MANAGEMENT-UI-S019] 信頼設定後に selected-Agent pages が実 Agent データを描画する` を追加し、Global Settings signing key/trust export、Agent settings key selection、Health Check 成功後の real data 表示を確認する。
- [x] 9.16 `packages/client/src/tests/agent-management-ui.test.tsx` と `tests/e2e/management-agent-registry.spec.ts` に `[AGENT-MANAGEMENT-UI-S020] Agent 0件でも Global Settings signing operations が利用できる` を追加する。
- [x] 9.17 `packages/client/src/tests/agent-management-ui.test.tsx` に `[AGENT-MANAGEMENT-UI-S003] Agent overview がサーバー側 profile と config を描画する` を更新し、selected global signing key verification summary と signing material 非露出を確認する。
- [x] 9.18 `packages/client/src/tests/agent-management-ui.test.tsx` に `[AGENT-MANAGEMENT-UI-S004] Settings 画面が Agent RPC 経由で config 更新と credential rotation を行う` を更新し、Agent settings が Agent access credential/config と既存 global key selection + Health Check に絞られることを確認する。

  - 9.8-9.12 / 9.15-9.16 は `packages/client/src/tests/**` と `tests/e2e/**` の両方で Scenario ID coverage を確認済み。

## 10. Governance Scenario Tests

- [x] 10.1 `scripts/governance/verify-agent-surface.test.mjs` と documentation checks に `[WORKSPACE-GOVERNANCE-S010] ドキュメントが本番 credential runbook を公開する` を追加する。
- [x] 10.2 `scripts/governance/verify-agent-surface.test.mjs` と `scripts/governance/verify-package-boundaries.test.mjs` に `[WORKSPACE-GOVERNANCE-S011] ガードレールが browser-visible signing material と禁止 Agent auth surface を拒否する` を追加する。
- [x] 10.3 `scripts/openspec/verify-scenario-coverage.test.mjs` に `[WORKSPACE-GOVERNANCE-S012] シナリオ coverage が本番認証 specs を検証する` を追加する。
- [x] 10.4 `tests/e2e/management-agent-registry.spec.ts` または smoke fixture に `[WORKSPACE-GOVERNANCE-S013] 運用 smoke が Management Client から Agent RPC 実データ表示までを検証する` を追加する。

## 11. Smoke / UAT

- [x] 11.1 Agent 0 件状態の Management Client `Global Settings > Signing Keys` で Ed25519 signing key を生成し、key list に issuer/kid/public fingerprint/status が表示されることを確認する。
- [x] 11.2 Management Client `Global Settings > Trust Config Export` で public-only `AGENT_CONTROL_PLANE_TRUST` JSON を生成し、`d`、private JWK、encrypted private JWK、生 JWT が含まれないことを確認する。
- [x] 11.3 Agent 作成後、Agent Worker に `AGENT_CONTROL_PLANE_TRUST` を設定し、managed Agent に既存 global signing issuer/kid/fingerprint を選択する。
- [x] 11.4 選択済み signing key で `AgentHealthService.Check` を実行し、認証済み response の `serving` または `degraded`、trust config fingerprint、lastVerifiedAt が UI に表示されることを確認する。
- [x] 11.5 Overview、Threads、Events、Runs、Schedules、Integrations、Settings が safe fallback ではなく server-only Agent RPC 由来の実データを表示することを確認する。
- [x] 11.6 Browser payload、HTML、storage、bundle、public Client routes に private JWK、encrypted private JWK、生 JWT、signing logic、Agent credential forwarding が含まれないことを確認する。

  - 2026-06-29 local UAT: AgentBrowser で `CLIENT_CREDENTIAL_ENCRYPTION_KEY` と local D1 migration 済み Management Client を開き、`Global Settings > Signing Keys` の Ed25519 key list/generate、`Global Settings > Trust Config Export` の public-only JSON 生成、managed Agent `uat-agent-03476339` の global signing key selection、local Agent RPC health verification、Overview / Threads / Events / Runs / Schedules / Integrations / Settings の Agent scoped data 表示、HTML / body / localStorage / sessionStorage の signing material 非露出を確認した。

## 12. 検証

- [x] 12.1 `pnpm gen:agent:proto && pnpm gen:agent:rpc` を再実行し、generated files に手編集 drift がないことを確認する。
- [x] 12.2 `pnpm check:codegen` を実行し、TypeSpec/proto/RPC generation drift がないことを確認する。
- [x] 12.3 `pnpm format:check` を実行し、Markdown、TypeScript、JSON の formatting gate が通ることを確認する。
- [x] 12.4 `pnpm lint` を実行し、ESLint、OpenSpec validate、Scenario ID coverage、governance、supply-chain guardrails が通ることを確認する。
- [x] 12.5 `pnpm check` を実行し、workspace package checks が通ることを確認する。
- [x] 12.6 `pnpm test:run` を実行し、root Vitest suite が通ることを確認する。
- [x] 12.7 `pnpm test:agent` を実行し、Agent security/health/interceptor tests が通ることを確認する。
- [x] 12.8 `pnpm test:client` を実行し、Client D1/signing/UI/browser secrecy tests が通ることを確認する。
- [x] 12.9 `pnpm test:governance` を実行し、forbidden surface、package boundary、scenario coverage tests が通ることを確認する。
- [x] 12.10 `pnpm test:e2e` を実行し、Management Client signing key/trust export/health verification E2E が通ることを確認する。
- [x] 12.11 `pnpm check:agent && pnpm check:client` を実行し、Agent/Client package checks が通ることを確認する。
- [x] 12.12 `pnpm build` を実行し、Agent/Client build が通ることを確認する。
- [x] 12.13 `pnpm lint:openspec` を実行し、OpenSpec validation と Scenario ID coverage check が通ることを確認する。
