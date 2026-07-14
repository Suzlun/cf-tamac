## 1. SDK package と codegen 基盤

- [x] 1.1 `packages/sdk/package.json`、`packages/sdk/tsconfig.json`、`packages/sdk/src/index.ts` を作成し、`@cf-tamac/sdk` の exports、workspace scripts、server-side package metadata、re-export only entrypoint を定義する。
- [x] 1.2 `pnpm-workspace.yaml`、`package.json`、`tsconfig.base.json` を更新し、`packages/sdk`、`@cf-tamac/sdk`、`@cf-tamac/sdk/*`、`@cf-tamac/sdk-agent-rpc/*` を workspace と TypeScript resolution に登録する。
- [x] 1.3 `packages/agent/buf.gen.yaml` を更新し、`packages/sdk/src/generated/agent-rpc/**` を Agent RPC descriptor generation target に追加する。
- [x] 1.4 `scripts/codegen/check-agent-codegen-drift.mjs` の `collectAgentCodegenIssues()` を contract surface policy、generated descriptor output、TypeSpec contract、proto contract の責務別 helper へ分解し、SDK generated descriptor root、issue ordering、command context を維持したまま complexity gate を満たす。
- [x] 1.5 `scripts/codegen/check-agent-codegen-drift.test.mjs` の `[WORKSPACE-GOVERNANCE-S016] Generated policy が SDK Agent RPC contract output を検査する` を更新し、SDK root の missing/drift/unexpected report、helper behavior、rule/path/`pnpm gen:agent:rpc` context を検証する。
- [x] 1.6 `pnpm gen:agent:proto && pnpm gen:agent:rpc` を実行し、Agent と SDK の generated descriptors を command output として生成する。
- [x] 1.7 `pnpm check:codegen` を実行し、Agent、Client、SDK descriptor parity と responsibility-specific codegen collectors を通す。

## 2. SDK client 集約、認証、error 実装

- [x] 2.1 `packages/sdk/src/transport.ts` を作成し、Connect unary binary Protobuf transport factory と request context injection seam を実装する。
- [x] 2.2 `packages/sdk/src/invocation-context.ts` と `packages/sdk/src/auth/types.ts` を作成し、`ResolvedAgentRpcCredential`、`ActingUserContext`、`ClientServiceSigningContext`、scope、request ID、correlation ID、idempotency context の public types を定義する。
- [x] 2.3 `packages/sdk/src/auth/client-service-jwt.ts` を作成し、EdDSA Client Service JWT generation、Bearer metadata、service/method/request context metadata builder を実装する。
- [x] 2.4 `packages/sdk/src/client.ts` を Client Service JWT 専用 aggregate に揃え、design の property/service/method/scope/request-semantics matrix に従う lifecycle、modelPolicies、events、threads、runs、state、schedules、tools、integrations、health と `createTamacAgentClient` を実装する。
- [x] 2.5 `packages/sdk/src/errors.ts` を作成し、Connect code、service/method、`agent_id`、request ID、idempotency key、correlation ID、safe detail を含む `TamacSdkOperationError` と `normalizeTamacSdkError` を実装する。
- [x] 2.6 `packages/sdk/src/tests/client.test.ts` に `[TAMAC-SDK-S001] Server-side consumer が SDK で Agent health を確認する` を追加し、health client の binary Connect request、Client Service metadata、typed response を検証する。
- [x] 2.7 `packages/sdk/src/tests/client.test.ts` の `[TAMAC-SDK-S002] Client Service aggregate が認可 operation inventory を共有する` を更新し、lifecycle/model policy/event/thread/run/state/schedule/tool/integration/health と shared Client Service JWT、Agent scope、acting user、correlation context を検証する。
- [x] 2.8 `packages/sdk/src/tests/auth.test.ts` に `[TAMAC-SDK-S003] SDK が acting user 付き Client Service JWT を付与する` を追加し、JWT claims と request metadata を検証する。
- [x] 2.9 `packages/sdk/src/tests/auth.test.ts` に `[TAMAC-SDK-S004] SDK consumer が自身の server-side storage から signing context を供給する` を追加し、caller-supplied signing context と public credential view を検証する。
- [x] 2.10 `packages/sdk/src/tests/errors.test.ts` に `[TAMAC-SDK-S006] Permission denied が SDK normalized error として返る` を追加し、`permission_denied` と `aborted` を含む Connect code mapping を検証する。
- [x] 2.11 `packages/sdk/src/provider-ingress-types.ts`、`provider-ingress-transport.ts`、`provider-ingress.ts`、`index.ts` を更新し、design の fixed-order UTF-8 canonical text、lowercase SHA-256 digest、byte length、Ed25519 `signDetached(input)`、installation/method identity を使用する `TamacProviderIngressClient` の event/tool result/delivery result operations を実装する。
- [x] 2.12 `packages/sdk/src/tests/provider-ingress.test.ts` に `[TAMAC-SDK-S002] Provider ingress surface が detached-signature context を使用する` を追加し、three-method inventory、canonical field order/sentinel/encoding、unsigned-body digest、signature metadata、HTTP metadata allowlist、correlation context を検証する。
- [x] 2.13 `packages/agent/src/rpc/connect-worker-adapter.ts`、`rpc/interceptors/authorization.ts`、`rpc/dispatch/integration-ingress.ts`、`integrations/security.ts`、Integration operations、Durable Object handlers を更新し、Provider path classification、fixed `300_000` ms timestamp window、signature/digest verification、verified `INTEGRATION_INSTALLATION` principal、nonce/idempotency、method-specific grant、Agent-owned final authorization を design の順序で接続する。
- [x] 2.14 `packages/agent/src/tests/client-service-ed25519-auth.test.ts` と `rpc-interceptors.test.ts` に `[TAMAC-SDK-S002] Client Service SDK と Provider integration surface が専用の認証文脈を使用する` を追加し、Client Service method/scope/idempotency matrix、Provider verified-principal/grant flow、fixed timestamp window を検証する。

## 3. Management Client の server-side SDK adapter

- [x] 3.1 `packages/client/package.json` を更新し、Management Client が workspace dependency として `@cf-tamac/sdk` を利用できるようにする。
- [x] 3.2 `packages/client/src/server/env.ts`、`wrangler.toml`、`.dev.vars.example` と新規 `src/server/agent-rpc/origin-policy.ts` に non-empty/unique/canonical `AGENT_RPC_ALLOWED_ORIGINS` JSON schema、HTTPS URL component constraints、IDN/default-port normalization、exact-match Set、`ApprovedAgentRpcOrigin`、typed `configuration` error を実装する。
- [x] 3.3 `packages/client/src/server/actions/managed-agent-registration.ts`、`managed-agents.ts`、registration schema/form を更新し、Browser input を canonical origin policy で検証してから managed Agent metadata を保存し、safe validation result と correlation ID を返す。
- [x] 3.4 `packages/client/src/server/agent-rpc/agent-loader.ts`、`create-client.ts`、`e2e-fake-clients.ts`、`index.ts` を更新し、Client D1 record 読取直後かつ signing context 解決前に current allowlist を再検証し、`ApprovedAgentRpcOrigin` から SDK transport を構築する。
- [x] 3.5 `packages/client/src/server/agent-rpc/safe-results.ts` と `browser-safe-helpers.ts` を更新し、成功時 `safeErrorCategory: null`、失敗時 `TamacSdkErrorCategory | 'configuration'` を持つ `displayData`、`safeStatus`、`safeErrorCategory`、`correlationId` の四属性 result と固定安全文言を実装する。
- [x] 3.6 `packages/client/src/server/actions` の managed Agent/model policy/health/lifecycle/integration/schedule/tool/event/run/thread paths、view models、registration/default-model-policy UI components を更新し、SDK typed result と normalized error を action-specific safe display DTO と共通 Browser-safe result に投影し、`browser-safe-registration-operation-ui-spec.md` の placement/copy/focus/live-region states を実装する。
- [x] 3.7 `packages/client/src/tests/agent-rpc-origin-policy.test.ts` に `[TAMAC-SDK-S007] Registration が canonical HTTPS origin を policy で受理する` を追加し、env JSON schema、URL canonicalization、exact allowlist match、canonical metadata persistence、safe result を検証する。
- [x] 3.8 `packages/client/src/tests/agent-rpc-origin-policy.test.ts` と `client-agent-rpc-factory.test.ts` に `[TAMAC-SDK-S008] Loader が credential 解決前に stored origin を再検証する` を追加し、policy validation、credential resolver、SDK factory の順序と `configuration` result を検証する。
- [x] 3.9 `packages/client/src/tests/browser-agent-rpc-secrecy.test.ts`、`client-agent-rpc-factory.test.ts`、`server-action-boundary.test.ts` に `[TAMAC-SDK-S005] Server Action が閉じた Browser-safe result を返す` を追加し、全 SDK-backed actions の四属性 result と server-side sensitive context ownership を検証する。
- [x] 3.10 `packages/client/src/tests/client-import-graph.test.ts` と `client-bindings.test.ts` の `[WORKSPACE-GOVERNANCE-S015] Workspace validation が SDK usage を server-side Agent RPC boundary として報告する` を更新し、SDK/provider modules、origin policy、Browser-safe data graph、Worker binding を検証する。
- [x] 3.11 `pnpm test:client` を実行し、origin policy、SDK-backed actions、Browser-safe result、server/browser boundary tests を通す。
- [x] 3.12 `tests/e2e/managed-agent-fixture.ts`、`management-agent-registry.spec.ts`、`management-agent-rpc-secrecy.spec.ts`、`management-model-policy.spec.ts` に `[TAMAC-SDK-S005] Management Client が閉じた Browser-safe result を返す` と `[TAMAC-SDK-S007] 許可済み HTTPS origin で managed Agent を登録する` を追加し、desktop/mobile の wireframe states、copy、focus、live region、correlation ID support affordance を検証して `pnpm test:e2e` を通す。

## 4. Workspace governance と deploy artifact

- [x] 4.1 `eslint.config.js` を更新し、`sdk-runtime` と `sdk-generated-agent-rpc` の boundary element と server-side import ownership を定義する。
- [x] 4.2 `scripts/governance/verify-package-boundaries.mjs` の generated policy registry に SDK generated descriptor output root を mandatory target として登録し、`@cf-tamac/sdk` classification、generated ownership、Client browser boundary validation を一つの report に統合する。
- [x] 4.3 `scripts/governance/verify-package-boundaries.test.mjs` の `[WORKSPACE-GOVERNANCE-S015]` fixtures を更新し、`[WORKSPACE-GOVERNANCE-S016] Generated policy が SDK Agent RPC contract output を検査する` を追加して、SDK root、canonical descriptor entry、Buf target、workflow generated policy の mandatory coverage を検証する。
- [x] 4.4 `scripts/governance/verify-agent-surface.mjs` を更新し、SDK package を Protobuf RPC SDK surface validation の scan 対象に加える。
- [x] 4.5 `scripts/governance/verify-agent-surface.test.mjs` に SDK package fixture を追加し、Agent RPC SDK surface が generated Protobuf RPC contract と Connect runtime に揃うことを検証する。
- [x] 4.6 `scripts/deploy/generate-deploy-artifacts.mjs` を更新し、Client artifact に SDK runtime closure、SDK generated descriptors、Provider/Client SDK source、`AGENT_RPC_ALLOWED_ORIGINS` configuration example を含める。
- [x] 4.7 `scripts/deploy/generate-deploy-artifacts.test.mjs` の `[WORKSPACE-GOVERNANCE-S017] Client deploy artifact が SDK runtime closure を含む` を更新し、SDK package/runtime/generated descriptors と canonical HTTPS allowlist config を検証する。
- [x] 4.8 `pnpm test:governance` と `pnpm gen:deploy-artifacts && pnpm check:deploy-artifacts` を実行し、mandatory generated policy と Client deploy artifact validation を通す。

## 5. Guidance、運用文書、最終検証

- [x] 5.1 `.opencode/skills/coding-guardian/SKILL.md` と `.opencode/skills/coding-guardian/references/repo-entrypoints.md` を更新し、Client Service/Provider SDK surface、SDK generated descriptor mandatory policy、Client origin policy を coding baseline に追加する。
- [x] 5.2 `.opencode/agents/unit/agent/{engineer,reviewer}.md`、`.opencode/agents/unit/client/{engineer,reviewer}.md`、`.opencode/agents/unit/build/builder.md` を更新し、Provider verified-principal flow、codegen helper complexity、origin policy、Browser-safe result、SDK generated descriptor root の generation-only ownership を permission と apply/review guidance に反映する。
- [x] 5.3 `README.md`、`CONTRIBUTING.md`、`CODING_STANDARDS.md`、`packages/client/README.md`、`docs/operations/self-host-deploy.md`、`docs/operations/agent-control-plane-auth.md` を更新し、`AGENT_RPC_ALLOWED_ORIGINS` 設定、Client Service JWT destination validation、Provider signature context、safe correlation、staging smoke、verification commands を手順化する。
- [x] 5.4 `pnpm format:check` を実行し、Markdown/TypeScript/JavaScript/JSON formatting を通す。
- [x] 5.5 `pnpm lint` を実行し、OpenSpec strict validation、Scenario ID coverage、ESLint complexity、governance、supply-chain checks を通す。
- [x] 5.6 `pnpm --filter @cf-tamac/sdk test && pnpm test:agent && pnpm test:client && pnpm test:governance` を実行し、`TAMAC-SDK-S001` から `TAMAC-SDK-S008` と `WORKSPACE-GOVERNANCE-S015` から `WORKSPACE-GOVERNANCE-S017` の suites を通す。
- [x] 5.7 `pnpm test:run` を実行し、workspace-wide tests を通す。
- [x] 5.8 `pnpm check:agent && pnpm check:client && pnpm --filter @cf-tamac/sdk check` を実行し、Agent/Client/SDK type/check flows を通す。
- [x] 5.9 `pnpm check:codegen && pnpm gen:deploy-artifacts && pnpm check:deploy-artifacts` を実行し、generated descriptor policy と Client SDK/config closure を通す。
- [x] 5.10 `pnpm build` を実行し、Agent、SDK、Management Client build を通す。
- [x] 5.11 `openspec validate --type change "introduce-tamac-sdk" --strict --no-interactive` を実行し、change artifacts の strict validation を通す。
