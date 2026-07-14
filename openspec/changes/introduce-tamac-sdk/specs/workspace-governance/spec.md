## ADDED Requirements

### Requirement: SDK の workspace governance と deploy artifact validation

Workspace validation は TAMAC server-side SDK、generated Agent RPC contract outputs、deploy artifact closure を maintainer 向け validation report で検査する SHALL。

**Customer Context**

Maintainer は TAMAC SDK を Agent RPC の server-side consumer surface として扱い、Agent Service、SDK、Management Client、Deploy artifact が同じ Protobuf RPC contract を参照していることを検証したい。SDK が第一級の検査対象になることで、生成、lint、execution boundary、deploy artifact の validation report が明確になり、Client と server-side consumer が同じ SDK contract を使える。

**Requirement**

Workspace validation は TAMAC SDK usage を server-side Agent RPC execution boundary として報告する SHALL。

Workspace validation は Agent、SDK、Management Client が参照する generated Agent RPC contract outputs を決定的な generation output として検査 SHALL。

SDK generated Agent RPC contract output は codegen drift、generated ownership、execution boundary policy の mandatory validation target として検査される SHALL。

Workspace validation は SDK usage と server-side execution graph の ownership を関連付ける SHALL。

Workspace validation は SDK の server-side execution ownership、generated output consistency、generated policy coverage、Client deploy artifact completeness を一つの validation report で確認 SHALL。

Deploy artifact generation は Management Client artifact に SDK runtime closure、generated Agent RPC contract outputs、Client Worker runtime dependencies、Worker configuration を含める SHALL。生成された Client artifact は Cloudflare Worker deploy root として自己完結する SHALL。

#### Scenario: Workspace validation が SDK usage を server-side Agent RPC boundary として報告する (WORKSPACE-GOVERNANCE-S015)

- **GIVEN** maintainer が workspace validation を実行できる
- **WHEN** workspace validation が Agent、SDK、Management Client の execution ownership を列挙する
- **THEN** TAMAC SDK usage は server-side Agent RPC execution boundary として報告される
- **AND** SDK usage は server-side execution ownership として検査される
- **AND** Browser-delivered graph は UI display data boundary として分類される

#### Scenario: Generated policy が SDK Agent RPC contract output を検査する (WORKSPACE-GOVERNANCE-S016)

- **GIVEN** Agent RPC contract source と generated Agent RPC contract outputs が利用できる
- **WHEN** root codegen drift check と generated package policy validation が実行される
- **THEN** SDK generated Agent RPC contract output は codegen drift、generated ownership、execution boundary policy の mandatory target として検査される
- **AND** Agent、SDK、Management Client の generated Agent RPC contract outputs は同じ Protobuf RPC contract から生成された安定 output として検査される
- **AND** validation report は対象 root、rule、command context を確認可能にする

#### Scenario: Client deploy artifact が SDK runtime closure を含む (WORKSPACE-GOVERNANCE-S017)

- **GIVEN** repository source と generated Agent RPC contract outputs が利用できる
- **WHEN** deploy artifact generation command が Client artifact を生成する
- **THEN** Client artifact は Management Client Worker runtime、SDK runtime closure、generated Agent RPC contract outputs、Client Worker configuration を含む
- **AND** artifact root は Cloudflare Deploy Button から Management Client Worker として deploy できる自己完結した構成になる
