## 1. SDK package と codegen 基盤

- [x] 1.1 `packages/sdk/package.json`、`packages/sdk/tsconfig.json`、`packages/sdk/src/index.ts` を作成し、`@cf-tamac/sdk` の exports、workspace scripts、server-side package metadata、re-export only entrypoint を定義する。
- [x] 1.2 `pnpm-workspace.yaml`、`package.json`、`tsconfig.base.json` を更新し、`packages/sdk`、`@cf-tamac/sdk`、`@cf-tamac/sdk/*`、`@cf-tamac/sdk-agent-rpc/*` を workspace と TypeScript resolution に登録する。
- [x] 1.3 `packages/agent/buf.gen.yaml` を更新し、`packages/sdk/src/generated/agent-rpc/**` を Agent RPC descriptor generation target に追加する。
- [x] 1.4 `scripts/codegen/check-agent-codegen-drift.mjs` の `collectAgentCodegenIssues()` を contract surface policy、generated descriptor output、TypeSpec contract、proto contract の責務別 helper へ分解し、SDK generated descriptor root、issue ordering、command context を維持したまま complexity gate を満たす。
- [x] 1.5 `scripts/codegen/check-agent-codegen-drift.test.mjs`の`[WORKSPACE-GOVERNANCE-S016] 生成物policyがSDKのAgent RPC契約出力を検査する`を更新し、SDK rootのmissing/drift/unexpected report、helper behavior、rule/path/`pnpm gen:agent:rpc` contextを検証する。
- [x] 1.6 `pnpm gen:agent:proto && pnpm gen:agent:rpc` を実行し、Agent と SDK の generated descriptors を command output として生成する。
- [x] 1.7 `pnpm check:codegen` を実行し、Agent、Client、SDK descriptor parity と responsibility-specific codegen collectors を通す。

## 2. SDK client 集約、認証、error 実装

- [x] 2.1 `packages/sdk/src/transport.ts` を作成し、Connect unary binary Protobuf transport factory と request context injection seam を実装する。
- [x] 2.2 `packages/sdk/src/invocation-context.ts` と `packages/sdk/src/auth/types.ts` を作成し、`ResolvedAgentRpcCredential`、`ActingUserContext`、`ClientServiceSigningContext`、scope、request ID、correlation ID、idempotency context の public types を定義する。
- [x] 2.3 `packages/sdk/src/auth/client-service-jwt.ts` を作成し、EdDSA Client Service JWT generation、Bearer metadata、service/method/request context metadata builder を実装する。
- [x] 2.4 `packages/sdk/src/client.ts` を Client Service JWT 専用 aggregate に揃え、design の property/service/method/scope/request-semantics matrix に従う lifecycle、modelPolicies、events、threads、runs、state、schedules、tools、integrations、health と `createTamacAgentClient` を実装する。
- [x] 2.5 `packages/sdk/src/errors.ts` を作成し、Connect code、service/method、`agent_id`、request ID、idempotency key、correlation ID、safe detail を含む `TamacSdkOperationError` と `normalizeTamacSdkError` を実装する。
- [x] 2.6 `packages/sdk/src/tests/client.test.ts`に`[TAMAC-SDK-S001] サーバー側consumerがSDKでAgent healthを確認する`を追加し、health clientのbinary Connect request、Client Service metadata、typed responseを検証する。
- [x] 2.7 `packages/sdk/src/tests/client.test.ts` の `[TAMAC-SDK-S002] Client Service aggregate が認可 operation inventory を共有する` を更新し、lifecycle/model policy/event/thread/run/state/schedule/tool/integration/health と shared Client Service JWT、Agent scope、acting user、correlation context を検証する。
- [x] 2.8 `packages/sdk/src/tests/auth.test.ts` に `[TAMAC-SDK-S003] SDK が acting user 付き Client Service JWT を付与する` を追加し、JWT claims と request metadata を検証する。
- [x] 2.9 `packages/sdk/src/tests/auth.test.ts` に `[TAMAC-SDK-S004] SDK consumer が自身の server-side storage から signing context を供給する` を追加し、caller-supplied signing context と public credential view を検証する。
- [x] 2.10 `packages/sdk/src/tests/errors.test.ts`に`[TAMAC-SDK-S006] 権限拒否がSDK normalized errorとして返る`を追加し、`permission_denied`と`aborted`を含むConnect code mappingを検証する。
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
- [x] 3.10 `packages/client/src/tests/client-import-graph.test.ts`と`client-bindings.test.ts`の`[WORKSPACE-GOVERNANCE-S015] ワークスペース検証がSDK利用をサーバー側Agent RPC境界として報告する`を更新し、SDK/provider modules、origin policy、Browser-safe data graph、Worker bindingを検証する。
- [x] 3.11 `pnpm test:client` を実行し、origin policy、SDK-backed actions、Browser-safe result、server/browser boundary tests を通す。
- [x] 3.12 `tests/e2e/managed-agent-fixture.ts`、`management-agent-registry.spec.ts`、`management-agent-rpc-secrecy.spec.ts`、`management-model-policy.spec.ts` に `[TAMAC-SDK-S005] Management Client が閉じた Browser-safe result を返す` と `[TAMAC-SDK-S007] 許可済み HTTPS origin で managed Agent を登録する` を追加し、desktop/mobile の wireframe states、copy、focus、live region、correlation ID support affordance を検証して `pnpm test:e2e` を通す。

## 4. Workspace governance と deploy artifact

- [x] 4.1 `eslint.config.js` を更新し、`sdk-runtime` と `sdk-generated-agent-rpc` の boundary element と server-side import ownership を定義する。
- [x] 4.2 `scripts/governance/verify-package-boundaries.mjs` の generated policy registry に SDK generated descriptor output root を mandatory target として登録し、`@cf-tamac/sdk` classification、generated ownership、Client browser boundary validation を一つの report に統合する。
- [x] 4.3 `scripts/governance/verify-package-boundaries.test.mjs`の`[WORKSPACE-GOVERNANCE-S015]` fixturesを更新し、`[WORKSPACE-GOVERNANCE-S016] 生成物policyがSDKのAgent RPC契約出力を検査する`を追加して、SDK root、canonical descriptor entry、Buf target、workflow generated policyのmandatory coverageを検証する。
- [x] 4.4 `scripts/governance/verify-agent-surface.mjs` を更新し、SDK package を Protobuf RPC SDK surface validation の scan 対象に加える。
- [x] 4.5 `scripts/governance/verify-agent-surface.test.mjs` に SDK package fixture を追加し、Agent RPC SDK surface が generated Protobuf RPC contract と Connect runtime に揃うことを検証する。
- [x] 4.6 `scripts/deploy/generate-deploy-artifacts.mjs` を更新し、Client artifact に SDK runtime closure、SDK generated descriptors、Provider/Client SDK source、`AGENT_RPC_ALLOWED_ORIGINS` configuration example を含める。
- [x] 4.7 `scripts/deploy/generate-deploy-artifacts.test.mjs`の`[WORKSPACE-GOVERNANCE-S014] デプロイ成果物生成が自己完結したWorker成果物を作成する`と`[WORKSPACE-GOVERNANCE-S017] Clientデプロイ成果物がSDK実行時依存を含む`を更新し、環境別Rate Limiting設定、公開信頼設定、SDK package/runtime/generated descriptors、canonical HTTPS allowlist configを検証する。
- [x] 4.8 `pnpm test:governance`と`pnpm gen:deploy-artifacts && pnpm check:deploy-artifacts`を実行し、必須生成物policyとClientデプロイ成果物検証を通す。

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

## 6. Provider ingressのセキュリティとAgentデータ整合性

- [x] 6.1 `packages/agent/wrangler.toml` と `packages/agent/src/env.ts` に `PROVIDER_INGRESS_RATE_LIMITER` を追加し、production/stagingごとの専用`namespace_id` fixture、`limit = 100`、`period = 60`、required `RateLimit`型を定義する。Deploy artifact generatorはrelease operatorのenvironment-specific namespace IDを検証・注入し、Agent Worker binding inventoryが`AI_AGENT`、Agent-owned storage/AI、Provider Rate Limiting bindingで構成されることを`packages/agent/src/tests/agent-worker-bindings.test.ts`で検証する。`[TAMAC-SDK-S002]`
- [x] 6.2 `packages/agent/src/rpc/interceptors/provider-ingress-rate-limit.ts`を作成し、単一の妥当な`CF-Connecting-IP`とgenerated Provider RPC service/methodだけからversioned SHA-256/base64url keyを生成して`RateLimit.limit({ key })`を一回呼ぶ。exported APIへ日本語の複数行TSDoc、trusted source検査・key生成・binding call・decisionの各処理へ日本語commentを追加する。`[TAMAC-SDK-S002]`
- [x] 6.3 `packages/agent/src/rpc/connect-worker-adapter.ts`を更新し、binary profile/path分類、Provider `Authorization`判定、trusted source/rate-limit、raw body/identity、detached signature、Agent routingの順序を固定する。Allowance超過、binding resolution error・operation exception・異常outcome、trusted source validation errorを固定safe `Code.ResourceExhausted` / HTTP 429へ変換し、pre-auth phaseで完了してAgent state versionと高コスト処理counterがrequest前の値を保持することを完了条件とする。`[TAMAC-SDK-S002]`
- [x] 6.4 `packages/agent/src/worker.ts`にsafe denial observerを接続し、`agent.provider_ingress_rate_limit_denied`、service、method、`PROVIDER_INGRESS_PRE_AUTH`、固定reason、timestampだけで構成する`AgentCounterRecord`をWorkers Logsへ出力する。ResponseはConnect codeと固定safe message、counterは前記field集合で閉じることをfixtureで検証する。`[TAMAC-SDK-S002]`
- [x] 6.5 `packages/agent/src/tests/provider-ingress-rate-limit.test.ts`と`rpc-interceptors.test.ts`へ`[TAMAC-SDK-S002]` testsを追加し、同一source/procedure、別source、別procedure、異なるpayload identity、allowance超過、binding operation failure、`CF-Worker`、trusted source input validation、Authorization優先、429 body、observer、pre-auth terminal phaseを検証する。Exhausted bucketでは各detached signature outcomeが同じ429/`resource_exhausted`となること、denial前後の認可済み`AgentStateService.GetState` responseで`state_version`が一致することを検証し、既存`[TAMAC-SDK-S002]`のClient Service・Provider signature testsを維持する。
- [x] 6.6 Agent test env factoryを利用する`packages/agent/src/tests/{connect-binary,health-rpc,fail-closed-routing,forbidden-agent-surface,forbidden-demo-routes,agent-id-routing,client-service-ed25519-auth,agent-stage4-query-handlers,rpc-interceptors}.test.ts`へdeterministic `RateLimit` stubを供給し、Provider guard追加後もClient Service JWT、binary Protobuf、fail-closed routing、Agent ID routingの既存contractを通す。

## 7. SDK通信とClient Service JWT境界

- [x] 7.1 `packages/sdk/src/provider-ingress.ts`、`provider-ingress-transport.ts`、`errors.ts`を更新し、Provider ingressの429/`resource_exhausted`をProvider invocationのservice/method/Agent/request/correlation contextを持つ`TamacSdkOperationError`へ正規化する。`TamacAgentClient`はClient Service JWT aggregate、`TamacProviderIngressClient`はdetached-signature three-method aggregateとして専用contextを維持する。`[TAMAC-SDK-S002]`
- [x] 7.2 `packages/sdk/src/tests/provider-ingress.test.ts`へ`[TAMAC-SDK-S002]`を参照するtestsを追加し、binary Protobuf、detached signature metadata、HTTP metadata allowlist、Provider 429の`resource_exhausted`正規化、Client Service aggregateのJWT contextとの分離を検証する。正当な複数の`[TAMAC-SDK-S002]` test titleを維持する。
- [x] 7.3 7.1で変更するSDK public API/type/functionへ日本語の複数行TSDocを追加し、役割、引数、戻り値、error cases、usage exampleを記述する。Transport validation、normalization、external callの各処理へ意図・入出力・side effectを示す日本語commentを追加し、`pnpm --filter @cf-tamac/sdk check`と`pnpm --filter @cf-tamac/sdk test`を通す。

## 8. Client登録の原子性、状態確認、UI状態

- [x] 8.1 `packages/client/src/server/db/schema.ts`と新規`packages/client/src/server/db/migrations/0004_managed_agent_registration_reconciliation.sql`に、Client-owned managed Agent ledger metadataとして`registration_state`、attempt ID、initialization idempotency key、request digestを追加する。`packages/client/src/tests/client-d1-schema.test.ts`と`client-repository-boundary.test.ts`でClient-owned data classificationとschema apply contractを検証する。`[CLIENT-REGISTRY-S001]`
- [x] 8.2 `packages/client/src/server/db/managed-agents.ts`、`access-credentials.ts`、`actions/managed-agent-registration.ts`にmanaged Agent、credential reference、signing metadata、registration attemptを一つのatomic D1 commitで保存するrepository APIを実装する。Create failureは作成前postcondition、edit failureはpreimage postconditionへ一致することをfailure phaseごとのtestsで検証する。`[CLIENT-REGISTRY-S001]` `[AGENT-MANAGEMENT-UI-S002]`
- [x] 8.3 新規`packages/client/src/server/actions/managed-agent-registration-attempt.ts`と`managed-agents.ts`でcreate専用`InitializeAgent`、固定idempotency key/request digest、`initializing`→`active`確定、`reconciliation_required`→`GetAgent`照合を実装する。Edit flowはatomic ledger/credential metadata更新を所有し、Agent初期化はcreate flowだけが所有する。Cleanup failureをattempt phase/correlation ID付きserver-only observabilityへ記録し、状態確認actionを返す。`[AGENT-MANAGEMENT-UI-S017]` `[TAMAC-SDK-S005]`
- [x] 8.4 `packages/client/src/server/actions/model-policies.ts`と`agent-operations/default-model-policy.ts`で同一`ServerAgentRpcClients`、correlation ID、親operation keyから派生する`:policy`/`:config` idempotency keyを使用する。`UpdateConfig` responseが未確定な場合は`GetConfig`でdesired/previous refを照合し、成功、confirmed failure、`適用状態を確認`resultへ確定する。`[AGENT-MANAGEMENT-UI-S018]` `[TAMAC-SDK-S005]`
- [x] 8.5 `packages/client/src/components/agent-registration-form.tsx`、`model-policy-settings-section.tsx`、関連schema/safe result mapperを更新し、状態確認中は利用者draftと直前に確認済みの概要を保持し、同じidempotency contextの`登録状態を確認`または`適用状態を確認`を唯一の状態確認actionとして表示する。全resultを`displayData`、`safeStatus`、`safeErrorCategory`、`correlationId`の四属性で返す。`[TAMAC-SDK-S005]`
- [x] 8.6 `packages/client/src/components/operation-result-region.tsx`のnotification containerとresult headingの責務を維持し、成功・safe failure・状態確認完了時に`tabIndex={-1}`を持つ結果見出しへprogrammatic focusを移す。`packages/client/src/tests/agent-management-ui.test.tsx`へ`[MANAGEMENT-CLIENT-WIREFRAMES-S001]` component testsを追加し、heading focus、ancestor status/alert、live属性、Tab順を検証する。
- [x] 8.7 `tests/e2e/management-agent-registry.spec.ts`、`management-agent-rpc-secrecy.spec.ts`、`management-model-policy.spec.ts`に`[MANAGEMENT-CLIENT-WIREFRAMES-S001]`と`[TAMAC-SDK-S005]` testsを追加し、desktop/mobileの成功・safe failure・状態確認resultでheading `tabindex=-1`、focus、status/alert、draft/summary保持、correlation ID、次actionを検証する。
- [x] 8.8 `packages/client/src/tests`のregistration、signing-key store、Server Action boundary、Agent operation suitesへ`[CLIENT-REGISTRY-S001]`、`[AGENT-MANAGEMENT-UI-S002]`、`[AGENT-MANAGEMENT-UI-S017]`、`[AGENT-MANAGEMENT-UI-S018]`、`[TAMAC-SDK-S005]`を参照するphase failure testsを追加し、D1 postcondition、Agent RPC call order、same idempotency/correlation context、四属性safe resultを検証して`pnpm test:client`を通す。

## 9. TSDoc、運用文書、ツール検証

- [x] 9.1 `docs/operations/self-host-deploy.md`と`agent-control-plane-auth.md`へRate Limiting namespace割当、100/60 policy、Cloudflare proxied ingress、429/counter監視、binding failure smoke、registration/model-policy reconciliation、correlation ID照合手順を追加する。
- [x] 9.2 `scripts/governance/verify-package-boundaries.mjs`と対応testへAgent Rate Limiting binding classification、Client D1 registration metadata ownership、Provider/Client Service SDK境界のstatic validationを追加し、`pnpm test:governance`を通す。`[TAMAC-SDK-S002]` `[WORKSPACE-GOVERNANCE-S015]`
- [x] 9.3 変更したexported TS/TSX declarationの日本語TSDocと各processの日本語commentをreviewし、`pnpm format:check`、`pnpm lint`でformat、OpenSpec、Scenario coverage、ESLint、governance、supply-chain gatesを通す。

## 10. レビュー指摘対応後の全体検証

- [x] 10.1 `pnpm --filter @cf-tamac/sdk test && pnpm test:agent && pnpm test:client && pnpm test:governance && pnpm test:run`を実行し、`TAMAC-SDK-S002`の複数test参照、`TAMAC-SDK-S005`、`MANAGEMENT-CLIENT-WIREFRAMES-S001`、関連Client Scenario IDsを通す。
- [x] 10.2 `pnpm check:agent && pnpm --filter @cf-tamac/sdk check && pnpm check:client && pnpm check:codegen`を実行し、Agent/SDK/Client型、generated descriptor drift、Provider/Client authentication boundaryを通す。
- [x] 10.3 `pnpm gen:deploy-artifacts && pnpm check:deploy-artifacts && pnpm build`を実行し、Agent Rate Limiting binding config、Client schema/SDK closure、Agent/SDK/Management Client buildを通す。
- [x] 10.4 `pnpm test:e2e`を実行し、Browser-safe reconciliation、result heading focus、responsive status/alert semanticsを通す。
- [x] 10.5 `openspec validate --type change "introduce-tamac-sdk" --strict --no-interactive`を実行し、review remediation後のchange artifactsをstrict validationへ通す。

## 11. 初期化receipt完全一致契約のレビュー指摘対応

- [x] 11.1 TypeSpecで`InitializeAgentRequest.registration_request_digest`（field 8）、`InitializeAgentResponse.initialization_receipt`（field 7）、`GetAgentResponse.initialization_receipt`（field 6）を必須契約として定義し、receipt fields 1/2のfield stabilityを維持する。
- [x] 11.2 Agent proto/Agent・Client・SDK descriptorsをcommandで生成し、4 generated rootsのsha256 snapshotを再生成前後で比較して不変であることを確認する。
- [x] 11.3 Agent domain/storageで非空digest validation、profile/config/credential/audit/system Thread/immutable receipt/idempotency responseの単一transaction確定、日本語TSDocを実装する。
- [x] 11.4 RPC dispatch/mapperで必須digestとreceiptを往復し、replay、digest conflict、transaction error、aggregate invariantをfail closedにする。
- [x] 11.5 実Durable Object SQLiteの`packages/agent/src/tests/initialization-receipt-storage.test.ts`で`AGENT-LIFECYCLE-S001`/`S002`/`S010`、atomicity、replay、conflict、欠落・改竄・rollbackを検証する。
- [x] 11.6 Hand-written SDK wrapperを追加せず、generated lifecycle clientの必須digest/typed receiptを`packages/sdk/src/tests/client.test.ts`のruntime binary transport fixtureで検証する。
- [x] 11.7 Client D1 registration attemptの`initializing`/`reconciliation_required`/`active`、safe observation、not_found atomic cleanupを実装する。
- [x] 11.8 Clientが固定key/digestを保存し、Initialize/Getのreceipt、profile、config、default policy完全一致だけをactive条件にする。
- [x] 11.9 UIでreconciliation mutation lock、唯一の確認action、not_found再登録、result persistence、focus/notification semanticsを実装する。
- [x] 11.10 Client unit/UI/E2Eでactive、not_found、destroyed、missing/partial receipt、response loss、timeout、locking、cross-browser focusを検証する。
- [x] 11.11 運用docsへattempt key/digest、receipt完全一致、active、not_found cleanup、destroyed/missing receipt、correlation ID照合を反映する。
- [x] 11.12 agent-lifecycle、tamac-sdk、management-client-wireframes、workspace-governanceのdeltaをmain specsへ同期し、Scenario ID coverageを確定する。
- [x] 11.13 SDK/Agent/Client/governance/full tests、checks、deploy artifact、build、全browser E2Eを実行してrelease gateを通す。
- [x] 11.14 commit/clean checkoutを要求せず、`pnpm check:codegen`（4 generated rootsのsha256 snapshot、`pnpm gen`再実行、hash不変、`node scripts/codegen/check-agent-codegen-drift.mjs`）を実行してPASSを確認する。
- [x] 11.15 format、lint、strict OpenSpec all/change validationを最終実行する。
