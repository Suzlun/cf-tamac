## 1. SDK package と codegen foundation

- [ ] 1.1 `packages/sdk/package.json`、`packages/sdk/tsconfig.json`、`packages/sdk/src/index.ts` を作成し、`@cf-tamac/sdk` の exports、workspace scripts、server-side package metadata、re-export only entrypoint を定義する。
- [ ] 1.2 `pnpm-workspace.yaml`、`package.json`、`tsconfig.base.json` を更新し、`packages/sdk`、`@cf-tamac/sdk`、`@cf-tamac/sdk/*`、`@cf-tamac/sdk-agent-rpc/*` を workspace と TypeScript resolution に登録する。
- [ ] 1.3 `packages/agent/buf.gen.yaml` を更新し、`packages/sdk/src/generated/agent-rpc/**` を Agent RPC descriptor generation target に追加する。
- [ ] 1.4 `scripts/codegen/check-agent-codegen-drift.mjs` を更新し、SDK generated descriptor root を drift/parity/report 対象に追加する。
- [ ] 1.5 `scripts/codegen/check-agent-codegen-drift.test.mjs` に `[WORKSPACE-GOVERNANCE-S016] Codegen drift check が SDK Agent RPC descriptors を検査する` を追加し、SDK descriptor 差分 report を検証する。
- [ ] 1.6 `pnpm gen:agent:proto && pnpm gen:agent:rpc` を実行し、Agent と SDK の generated descriptors を command output として生成する。
- [ ] 1.7 `pnpm check:codegen` を実行し、SDK descriptor target を含む drift check を通す。

## 2. SDK client aggregate / auth / error implementation

- [ ] 2.1 `packages/sdk/src/transport.ts` を作成し、Connect unary binary Protobuf transport factory と request context injection seam を実装する。
- [ ] 2.2 `packages/sdk/src/invocation-context.ts` と `packages/sdk/src/auth/types.ts` を作成し、`ResolvedAgentRpcCredential`、`ActingUserContext`、`ClientServiceSigningContext`、scope、request ID、correlation ID、idempotency context の public types を定義する。
- [ ] 2.3 `packages/sdk/src/auth/client-service-jwt.ts` を作成し、EdDSA Client Service JWT generation、Bearer metadata、service/method/request context metadata builder を実装する。
- [ ] 2.4 `packages/sdk/src/client.ts` を作成し、lifecycle、modelPolicies、events、threads、runs、state、schedules、tools、integrations、integrationIngress、health を持つ `TamacAgentClient` aggregate と `createTamacAgentClient` を実装する。
- [ ] 2.5 `packages/sdk/src/errors.ts` を作成し、Connect code、service/method、`agent_id`、request ID、idempotency key、correlation ID、safe detail を含む `TamacSdkOperationError` と `normalizeTamacSdkError` を実装する。
- [ ] 2.6 `packages/sdk/src/tests/client.test.ts` に `[TAMAC-SDK-S001] Server-side consumer が SDK で Agent health を確認する` を追加し、health client の binary Connect request、Client Service metadata、typed response を検証する。
- [ ] 2.7 `packages/sdk/src/tests/client.test.ts` に `[TAMAC-SDK-S002] SDK client 集約が Agent service 群を同じ呼び出し文脈で提供する` を追加し、全 service clients が shared origin、Agent ID、scope、acting user、correlation context を使うことを検証する。
- [ ] 2.8 `packages/sdk/src/tests/auth.test.ts` に `[TAMAC-SDK-S003] SDK が acting user 付き Client Service JWT を付与する` を追加し、JWT claims と request metadata を検証する。
- [ ] 2.9 `packages/sdk/src/tests/auth.test.ts` に `[TAMAC-SDK-S004] SDK consumer が自身の server-side storage から signing context を供給する` を追加し、caller-supplied signing context と public signing context view を検証する。
- [ ] 2.10 `packages/sdk/src/tests/errors.test.ts` に `[TAMAC-SDK-S006] Permission denied が SDK normalized error として返る` を追加し、`permission_denied` と `aborted` を含む Connect code mapping を検証する。

## 3. Management Client server-side SDK adapter

- [ ] 3.1 `packages/client/package.json` を更新し、Management Client が workspace dependency として `@cf-tamac/sdk` を利用できるようにする。
- [ ] 3.2 `packages/client/src/server/agent-rpc/agent-loader.ts` を更新し、Client D1 managed Agent record、signing key store、acting user context を解決したうえで `createTamacAgentClient` に渡す adapter とする。
- [ ] 3.3 `packages/client/src/server/agent-rpc/index.ts` を更新し、Server Actions が利用する SDK-backed adapter exports と safe result helpers を整理する。
- [ ] 3.4 `packages/client/src/server/actions/model-policies.ts` の Agent RPC validation path を SDK-backed server adapter 経由に揃える。
- [ ] 3.5 `packages/client/src/tests/client-agent-rpc-factory.test.ts` に `[TAMAC-SDK-S003] SDK が acting user 付き Client Service JWT を付与する` と `[TAMAC-SDK-S005] Management Client が SDK result を安全な表示データとして返す` の adapter assertions を追加する。
- [ ] 3.6 `packages/client/src/tests/browser-agent-rpc-secrecy.test.ts` に `[TAMAC-SDK-S005] Management Client が SDK result を安全な表示データとして返す` を追加し、Browser-delivered payload が display data、safe status、safe error category、correlation identifier で構成されることを検証する。
- [ ] 3.7 `packages/client/src/tests/client-import-graph.test.ts` に `[WORKSPACE-GOVERNANCE-S015] Workspace validation が SDK を server-side Agent RPC package として分類する` の Client server/browser graph assertions を追加する。
- [ ] 3.8 `pnpm test:client` を実行し、SDK-backed Client adapter と browser boundary tests を通す。

## 4. Governance と deploy artifact

- [ ] 4.1 `eslint.config.js` を更新し、`sdk-runtime` と `sdk-generated-agent-rpc` の boundary element と server-side import ownership を定義する。
- [ ] 4.2 `scripts/governance/verify-package-boundaries.mjs` を更新し、`@cf-tamac/sdk` package classification、SDK generated descriptor ownership、Client browser boundary validation を検査する。
- [ ] 4.3 `scripts/governance/verify-package-boundaries.test.mjs` に `[WORKSPACE-GOVERNANCE-S015] Workspace validation が SDK を server-side Agent RPC package として分類する` を追加し、server-side SDK ownership と browser-delivered graph classification を検証する。
- [ ] 4.4 `scripts/governance/verify-agent-surface.mjs` を更新し、SDK package を Protobuf RPC SDK surface validation の scan 対象に加える。
- [ ] 4.5 `scripts/governance/verify-agent-surface.test.mjs` に SDK package fixture を追加し、Agent RPC SDK surface が generated Protobuf RPC contract と Connect runtime に揃うことを検証する。
- [ ] 4.6 `scripts/deploy/generate-deploy-artifacts.mjs` を更新し、Client artifact に SDK runtime closure、SDK package metadata、SDK generated Agent RPC descriptors、Client Worker dependencies を含める。
- [ ] 4.7 `scripts/deploy/generate-deploy-artifacts.test.mjs` に `[WORKSPACE-GOVERNANCE-S017] Client deploy artifact が SDK runtime closure を含む` を追加し、Client artifact closure を検証する。
- [ ] 4.8 `pnpm test:governance` と `pnpm gen:deploy-artifacts && pnpm check:deploy-artifacts` を実行し、governance と deploy artifact validation を通す。

## 5. Guidance, documentation, and final verification

- [ ] 5.1 `.opencode/skills/coding-guardian/SKILL.md` と `.opencode/skills/coding-guardian/references/repo-entrypoints.md` を更新し、SDK package、SDK generated descriptor ownership、Client server-side SDK adapter を coding baseline に追加する。
- [ ] 5.2 `.opencode/agents/unit/agent/engineer.md`、`.opencode/agents/unit/agent/reviewer.md`、`.opencode/agents/unit/client/engineer.md`、`.opencode/agents/unit/client/reviewer.md` を更新し、SDK package/codegen/governance/Client boundary の apply/review ownership を明確にする。
- [ ] 5.3 `README.md`、`CONTRIBUTING.md`、`CODING_STANDARDS.md` の command/output references を SDK package と generated descriptor policy に合わせる。
- [ ] 5.4 `pnpm lint` を実行し、OpenSpec strict validation、Scenario ID coverage、ESLint、governance、supply-chain checks を通す。
- [ ] 5.5 `pnpm test:run` を実行し、workspace-wide tests を通す。
- [ ] 5.6 `pnpm test:agent && pnpm test:client && pnpm test:governance` を実行し、Agent/Client/governance test suites を通す。
- [ ] 5.7 `pnpm check:agent && pnpm check:client` を実行し、package type/check flows を通す。
- [ ] 5.8 `pnpm build` を実行し、Agent、SDK、Management Client build を通す。
- [ ] 5.9 `openspec validate --type change "introduce-tamac-sdk" --strict --no-interactive` を実行し、change artifacts の strict validation を通す。
