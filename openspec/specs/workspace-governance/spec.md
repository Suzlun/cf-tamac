## Purpose

Workspace governance は、Agent/Client foundation の codegen、lint、documentation、OpenCode workflow、supply-chain guardrails を一貫して検証し、Protobuf RPC-only Agent boundary と Client server-side boundary を保つことを定義する。

## Requirements

### Requirement: Agent Protobuf generation and drift governance

Workspace governance は、Agent proto/RPC generation を決定的にし、generated-output drift checks を提供 MUST。

**Customer Context**

開発者は Agent API の正本を TypeSpec に置き、proto3 と TypeScript RPC descriptors を再現可能に生成したい。生成結果の差分が検出されないと、Client、Worker facade、spec、tests が別々の contract を参照してしまう。

**Requirement**

Root workspace scripts は、TypeSpec-to-proto、Buf validation、Protobuf-ES output generation 用の再現可能な Agent contract generation commands を提供 SHALL。

Root codegen drift checks は Agent proto と RPC outputs を再生成 SHALL し、tracked generated outputs が repository contents と異なる場合に失敗 SHALL。

Root codegen drift checks は、public Agent OpenAPI artifact が Agent API output として存在する場合に失敗 SHALL。

Generated output tasks は command-driven SHALL であり、generated files の手編集に依存 SHALL NOT。

Root codegen drift checks は Protobuf field stability guard を含む SHALL。Guard は、TypeSpec source の `@field(n)` または generated equivalent によりすべての Protobuf field が明示 field number を持つこと、削除済み field number/name が reserve されること、field number reuse が存在しないこと、同一 package 内の service 名と同一 service 内の method 名が一意であることを検査 SHALL。

#### Scenario: Root generation commands produce deterministic Agent outputs (WORKSPACE-GOVERNANCE-S001)

- **GIVEN** dependencies が install 済みである
- **WHEN** root Agent generation commands を source changes なしで二回実行する
- **THEN** TypeSpec、proto、Buf、Protobuf-ES outputs は両方の実行で安定している
- **AND** public Agent OpenAPI output は生成されない

#### Scenario: Codegen check fails on Agent generated drift (WORKSPACE-GOVERNANCE-S002)

- **GIVEN** tracked Agent proto または generated RPC output が generation command 外で変更されている
- **WHEN** root codegen drift check が実行される
- **THEN** command は失敗し、generated output diff を報告する

#### Scenario: Protobuf field stability guard rejects unstable descriptors (WORKSPACE-GOVERNANCE-S009)

- **GIVEN** TypeSpec または generated proto fixtures が明示 `@field(n)` のない field、削除済み field number/name の reserve 漏れ、field number reuse、service 名重複、または同一 service 内 method 名重複を含む
- **WHEN** root codegen drift check の Protobuf field stability guard が実行される
- **THEN** guard は該当する unstable descriptor を path と rule 名付きで報告し、failure で終了する
- **AND** すべての field number が明示され、削除済み field が reserve され、service/method 名が一意な fixture は pass する

### Requirement: Forbidden Agent API surface guardrails

Workspace lint は、禁止された Agent API surface と Agent/Client runtime coupling を拒否 MUST。

**Customer Context**

チームは Protobuf RPC-only の境界を保ちたい。REST route、OpenAPI output、Orval Agent client、browser-direct Agent RPC が検査なしで入ると、Agent contract と security model が分岐する。

**Requirement**

Workspace lint は、public Agent REST resource routes、Agent OpenAPI artifacts、Orval-generated Agent clients、ad-hoc JSON Agent DTO APIs、browser-direct Agent RPC invocation paths を検出する guardrails を含む SHALL。

Workspace lint は、Agent runtime source と Client runtime source を独立させる package-boundary 検査を含む SHALL。

Workspace lint は、Agent/Client package graph に対して依存方向の規律を検査 SHALL。Agent 側は Worker entrypoint、RPC facade、service modules、Agent domain/runtime modules、Agent-owned storage/generated RPC の方向を検査 SHALL。Client 側は Next.js App Router、browser-visible modules、Server Components/Server Actions、server-only modules、Client D1 repositories/generated Agent RPC client の方向を検査 SHALL。

Workspace lint と documentation checks は、demonstration package graph を active package boundary として扱って MUST NOT。

Workspace lint は、OpenSpec scenario IDs と automated test titles を整合させる検査を含む SHALL。

#### Scenario: Lint rejects forbidden Agent API surface fixtures (WORKSPACE-GOVERNANCE-S003)

- **GIVEN** fixture または test case が public Agent REST route、Agent OpenAPI output、Orval Agent client、ad-hoc JSON Agent DTO API を導入する
- **WHEN** workspace lint guardrails が実行される
- **THEN** guardrail は禁止された Agent API surface を報告し、failure で終了する

#### Scenario: Lint rejects Agent and Client runtime coupling and layer inversion (WORKSPACE-GOVERNANCE-S004)

- **GIVEN** fixture または test case が Agent runtime source から Client runtime source、Client runtime source から Agent runtime source、Agent layer の逆方向 import、または Client browser-visible module から server-only Agent RPC/credential module への import を導入する
- **WHEN** workspace lint guardrails が実行される
- **THEN** guardrail は package-boundary violation を報告し、failure で終了する

#### Scenario: Scenario ID coverage validates foundation specs (WORKSPACE-GOVERNANCE-S005)

- **GIVEN** main specs が foundation Scenario IDs を含む
- **WHEN** workspace OpenSpec lint が実行される
- **THEN** すべての automated foundation scenario は bracketed Scenario ID notation を使う test title から参照される
- **AND** duplicate または orphan Scenario IDs は failures として報告される

### Requirement: OpenCode workflow alignment for Agent and Client packages

OpenCode workflow、permission、delegation guidance は、implementation delegation が始まる前に Agent/Client package restructure を認識 MUST。

**Customer Context**

実装担当者と reviewer は、`packages/agent/**` と `packages/client/**` がそれぞれ Agent Service と management Client の新しい作業単位であることを、subagent permission、delegation map、coding-guardian の entrypoint から判断できる必要がある。demonstration package 前提だけが残ると、applier が誤った担当 agent へ委譲したり、engineer/reviewer が新しい path を規約外として扱ったりする。

**Requirement**

`.opencode/skills/coding-guardian/SKILL.md` は、generated-output と OpenSpec guardrails を含め、`packages/agent/**` と `packages/client/**` を認識済みの implementation areas として説明 SHALL。

`.opencode/skills/coding-guardian/references/repo-entrypoints.md` は、demonstration template entrypoints を置き換える Agent/Client entrypoints、codegen scripts、Worker configs、governance scripts を列挙 SHALL。

OpenSpec applier delegation guidance は、implementation delegation が始まる前に、`packages/agent/**`、Agent TypeSpec/proto/codegen/governance work、`packages/client/**` Client management work を正しい engineer/reviewer agents へ委譲できる状態 SHALL。

Unit engineer/reviewer agent permission と role guidance は、implementation delegation が始まる前に、`packages/agent/**`、`packages/client/**`、generated RPC outputs、`.opencode` governance update ownership を認識 SHALL し、generated-file 手編集や lint bypass を許可 SHALL NOT。

#### Scenario: OpenCode workflow recognizes Agent and Client foundations (WORKSPACE-GOVERNANCE-S008)

- **GIVEN** OpenCode skill と agent definition files を検査できる
- **WHEN** coding-guardian entrypoints、applier delegation maps、engineer/reviewer permissions を列挙する
- **THEN** `packages/agent/**` は Agent Service implementation と review の scope として認識される
- **AND** `packages/client/**` は Next.js management Client implementation と review の scope として認識される
- **AND** generated RPC output paths は command-owned のままであり、手編集は許可されない
- **AND** `.opencode` workflow updates は demonstration template paths に暗黙依存せず governance verification で coverage される
- **AND** package/code implementation delegation はこの guidance 更新後にのみ開始できる

### Requirement: Repository documentation and command alignment

Repository documentation は、Agent/Client foundation commands を説明し、unsupported demonstration API routes を省く MUST。

**Customer Context**

開発者と reviewer は、どの package が Agent Worker で、どの package が Client Worker で、どの commands が codegen と verification を担うのかを迷わず確認したい。ドキュメントやコマンド名が demo API や REST/OpenAPI 前提のままだと、レビュー時に誤った確認手順が使われる。

**Requirement**

Repository documentation は、`packages/agent` を Agent Service Worker として、`packages/client` を management Client Worker として説明 SHALL。

Repository documentation は、Agent proto generation、Agent RPC generation、codegen drift checking、lint、tests、build、supply-chain validation の commands を公開 SHALL。

Repository documentation は、`hello` または `users` demonstration API routes を supported product APIs として文書化 MUST NOT。

Repository documentation は、active development units を `packages/agent/**` と `packages/client/**` として説明 SHALL し、demonstration package categories を primary architecture、dependency direction、development commands として説明 MUST NOT。

Developer guidance は、TypeSpec-to-proto を Agent API contract path として識別 SHALL し、OpenSpec scenario coverage を spec-to-test contract として識別 SHALL。

#### Scenario: Documentation exposes Agent and Client foundation commands (WORKSPACE-GOVERNANCE-S006)

- **GIVEN** repository documentation と contributor guidance を検査できる
- **WHEN** setup、development、codegen、lint、test、build sections を読む
- **THEN** Agent Worker、Client Worker、TypeSpec-to-proto generation、Protobuf-ES generation、OpenSpec scenario coverage commands が文書化されている
- **AND** `hello` と `users` demonstration API routes は supported product APIs として文書化されていない

### Requirement: Repository production delivery

Workspace governance は、fork repository の Agent Service と Management Client を独立した security boundary で production 配信し、canonical package publication を検証できる repository contract を提供 MUST。

**Customer Context**

fork 利用者は、自分の Cloudflare account、GitHub Environments、service configuration を所有しながら、Agent Service と Management Client を個別に構築・配信したい。Maintainer は package consumer と production configuration を repository-local evidence で検証し、delivery authorityを一意に把握したい。

**Requirement**

Repository production delivery は Agent Service に `agent-production`、Management Client に `client-production` GitHub Environment を使用 SHALL。

各 service は独立した`workflow_dispatch` entrypoint、検証済み`main` revision trigger、Environment preflight、service-owned production configuration、build compatibility check、fixed concurrency identity、production delivery command contractを提供 SHALL。

Workspace validation は service workflow の trigger、Environment、enablement、required configuration、permissions、failure boundary、concurrencyを repository-local fixture で検査 SHALL。

Workspace validation は `cf-tamac` と `tamac-sdk` の同一version package artifactsを作成し、isolated Agent Worker consumerとserver-side SDK consumerでESM/type/generated RPC closureを検査 SHALL。

Workspace validationはAgent ServiceとManagement Clientのservice-owned production configurationをnative configuration interfaceへ直接渡し、production topology、resource identity、Worker build compatibilityを検査 SHALL。

Repository delivery authority は Agent production、Client production、canonical package publicationの三責務で構成 SHALL。Workspace validation は三責務のtrigger、Environment、permissions、concurrency、preflight、provenanceをexact inventoryとして検査 SHALL。

Repository documentation は fork Environment setup、service別manual/main gate、Client public trust handoff、package consumer、repository-local verification commandsを説明 SHALL。

#### Scenario: Repository production delivery contractを検証する (WORKSPACE-GOVERNANCE-S014)

- **GIVEN** repository production workflows、production configuration contracts、package build contractsが利用できる
- **WHEN** workspace validationがdeliveryとpackage consumerのcontractを列挙する
- **THEN** Agent ServiceとManagement Clientは別Environment、別trigger、別preflight、別concurrency、別service-owned production configurationを持つ独立したproduction gateとして検証される
- **AND** package consumer validationは`cf-tamac`と`tamac-sdk`の同一version、ESM/type exports、generated RPC closureを検証する
- **AND** delivery authority inventoryはAgent production、Client production、canonical package publicationの三責務と一致する

#### Scenario: delivery workflow contractをstatic validationする (WORKSPACE-GOVERNANCE-S018)

- **GIVEN** repositoryのproduction deliveryとpackage release workflow definitionsが利用できる
- **WHEN** governance validationがtrigger、Environment、permissions、preflight、concurrency、provenance contractを列挙する
- **THEN** Agent ServiceとManagement Clientはservice-owned production configurationをnative configuration inputとして直接使用する独立したproduction gateとして検証される
- **AND** required configuration failureは対象serviceのCloudflare command eligibilityより前にsafe resultへ確定するcontractとして検証される
- **AND** package releaseはcanonical upstream tag、OIDC identity、同一package versionのcontractとして検証される

#### Scenario: package artifactsをisolated consumersで検証する (WORKSPACE-GOVERNANCE-S019)

- **GIVEN** workspace sourceとcommand-owned generated RPC outputsが利用できる
- **WHEN** package validationが一つのignored deterministic build rootで`cf-tamac`と`tamac-sdk`のartifactsを作成してisolated fixturesにinstallする
- **THEN** Agent consumer fixtureは公開Worker handler、Durable Object class export、Worker構成API、admission contract typesをimportしてbundleと型検査を完了する
- **AND** SDK consumer fixtureはserver-side SDK APIをimportしてmodule loadと型検査を完了する
- **AND** 二packageのversion、ESM/type exports、generated RPC closureは一致するcontractとして検証される
- **AND** validation reportはartifact rootのdeterministic identityとlifecycle completionを確認可能にする

#### Scenario: service-owned production configurationをbuild検証する (WORKSPACE-GOVERNANCE-S020)

- **GIVEN** Agent ServiceとManagement Clientのservice-owned production configurationが利用できる
- **WHEN** workspace validationが各configurationをnative configuration inputとしてWorker build compatibility checkへ直接渡す
- **THEN** 各serviceのentrypoint、compatibility settings、binding identity、resource reference、required variable contractが検証される
- **AND** build compatibility outputはrepository-local evidenceとして完了する

#### Scenario: delivery authorityが三責務へ閉じる (WORKSPACE-GOVERNANCE-S021)

- **GIVEN** repository workflow definitionsとproduction configuration contractsが利用できる
- **WHEN** workspace validationがdelivery authorityを列挙する
- **THEN** authority inventoryはAgent production、Client production、canonical package publicationの三責務と一致する
- **AND** 各責務は専用trigger、permission、failure boundaryへ関連付けられる

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

### Requirement: Supply-chain guardrail preservation

Workspace package management は、foundation dependencies の導入中も release-age と build-script approval guardrails を維持 MUST。

**Customer Context**

Foundation work では新しい runtime と codegen dependencies が必要になる。Release managers は、それらの dependencies を導入している間も、repository が 72-hour dependency release-age gate と明示的な install-script approval model を維持することを必要とする。

**Requirement**

Workspace package management は `minimumReleaseAge: 4320` またはより厳しい挙動を維持 SHALL。

Workspace package management は `dangerouslyAllowAllBuilds` を有効化 MUST NOT。

Workspace package management は release-age gate を bypass するために `minimumReleaseAgeExclude` を使用 MUST NOT。

Workspace package management は dependency build scripts に対し、`allowBuilds` による package-by-package approval を要求 SHALL。

#### Scenario: Supply-chain lint enforces release-age and build-script policy (WORKSPACE-GOVERNANCE-S007)

- **GIVEN** workspace package manager configuration が supply-chain lint script によって検査される
- **WHEN** minimum release age、build-script approvals、bypass settings を確認する
- **THEN** script は release-age と explicit build approval policies が保持されている場合だけ pass する
- **AND** policy が弱められている場合は fail する

### Requirement: SDK の workspace governance と package consumer validation

Workspace validation は TAMAC server-side SDK、generated Agent RPC contract outputs、package consumer closure を maintainer向けvalidation reportで検査 SHALL。

**Customer Context**

Maintainer は TAMAC SDKをAgent RPCのserver-side consumer surfaceとして扱い、Agent Service、SDK、Management Client、package consumersが同じProtobuf RPC contractとrelease versionを参照していることを検証したい。SDKを第一級の検査対象にすることで、generation、lint、execution boundary、package closureのvalidation reportを一貫させられる。

**Requirement**

Workspace validation は TAMAC SDK usageをserver-side Agent RPC execution boundaryとして報告 SHALL。

Workspace validation は Agent、SDK、Management Clientが参照するgenerated Agent RPC contract outputsを決定的なgeneration outputとして検査 SHALL。

SDK generated Agent RPC contract output は codegen drift、generated ownership、execution boundary policyのmandatory validation targetとして検査される SHALL。

Workspace validation は SDK usageとserver-side execution graphのownershipを関連付ける SHALL。

Workspace validation は SDKのserver-side execution ownership、generated output consistency、generated policy coverage、`tamac-sdk` package closureを一つのvalidation reportで確認 SHALL。

`tamac-sdk` package consumer validation はSDK runtime、generated Agent RPC contract outputs、ESM/type exports、runtime dependency metadataをisolated server-side consumerで検査 SHALL。

#### Scenario: Workspace validationがSDK usageをserver-side Agent RPC boundaryとして報告する (WORKSPACE-GOVERNANCE-S015)

- **GIVEN** maintainerがworkspace validationを実行できる
- **WHEN** workspace validationがAgent、SDK、Management Clientのexecution ownershipを列挙する
- **THEN** TAMAC SDK usageはserver-side Agent RPC execution boundaryとして報告される
- **AND** SDK usageはserver-side execution ownershipとして検査される
- **AND** Browser-delivered graphはUI display data boundaryとして分類される

#### Scenario: Generated policyがSDK Agent RPC contract outputを検査する (WORKSPACE-GOVERNANCE-S016)

- **GIVEN** Agent RPC contract sourceとgenerated Agent RPC contract outputsが利用できる
- **WHEN** root codegen drift checkとgenerated package policy validationが実行される
- **THEN** SDK generated Agent RPC contract outputはcodegen drift、generated ownership、execution boundary policyのmandatory targetとして検査される
- **AND** Agent、SDK、Management Clientのgenerated Agent RPC contract outputsは同じProtobuf RPC contractから生成された安定outputとして検査される
- **AND** validation reportは対象root、rule、command contextを確認可能にする

#### Scenario: SDK package consumerがruntime closureを解決する (WORKSPACE-GOVERNANCE-S017)

- **GIVEN** `tamac-sdk` package artifactとisolated server-side consumerが利用できる
- **WHEN** consumerが公開SDK APIとgenerated Agent RPC typesをimportしてtypecheckとmodule loadを実行する
- **THEN** SDK runtime、generated Agent RPC contract outputs、ESM/type exportsはpackage artifactから解決する
- **AND** validation reportはpackage version、exports、runtime dependency metadata、consumer resultを確認可能にする
