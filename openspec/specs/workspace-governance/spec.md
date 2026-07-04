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

### Requirement: Deploy Button artifact generation

Workspace governance は、Agent Service と Management Client を Cloudflare Deploy Button から個別に導入できる self-contained artifact branch を生成 MUST。

**Customer Context**

利用者は repository clone、local package install、local Wrangler 操作なしで、Cloudflare Dashboard から Agent Worker と Management Client Worker を順番に導入したい。artifact branch に monorepo 前提や秘密鍵手貼り運用が残ると、導入時の失敗と credential exposure risk が増える。

**Requirement**

Root workspace scripts は `deploy-agent` branch root 用 Agent Worker artifact と `deploy-client` branch root 用 Management Client Worker artifact を生成 SHALL。

Deploy artifact は runtime source、generated RPC descriptors、Worker config、binding descriptions、`.dev.vars.example`、artifact README を含む SHALL。

Deploy artifact は package tests、TypeSpec source、monorepo parent `tsconfig` dependency を含めて MUST NOT。

Deploy artifact generation は `AGENT_CONTROL_PLANE_TRUST` の public-only 運用、Client encrypted signing key store、Cloudflare Access post-install checklist、Agent health RPC verification を文書化 SHALL。

#### Scenario: Deploy artifact generation creates self-contained Worker roots (WORKSPACE-GOVERNANCE-S014)

- **GIVEN** repository source と generated Agent RPC descriptors が存在する
- **WHEN** deploy artifact generation command を実行する
- **THEN** Agent artifact root は Agent Worker source、`AI_AGENT` Durable Object binding、`AGENT_BLOBS` binding、`AGENT_CONTROL_PLANE_TRUST` example、local generated Agent RPC descriptors を含む
- **AND** Client artifact root は Next.js App Router source、Client D1 migrations、`CLIENT_DB` binding、`AGENT_RPC_DEFAULT_ORIGIN` example、local generated Client Agent RPC descriptors を含む
- **AND** artifact roots は package tests、TypeSpec source、parent monorepo `tsconfig` dependency、Client private signing key Worker Secret example を含まない

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
