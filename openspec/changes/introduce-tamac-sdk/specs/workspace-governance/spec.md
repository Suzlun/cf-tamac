## ADDED Requirements

### Requirement: SDK package governance と deploy artifact validation

Workspace validation は `@cf-tamac/sdk` を server-side Agent RPC SDK package として分類し、generated descriptors と deploy artifact closure を検査する SHALL。

**Customer Context**

Maintainer は `@cf-tamac/sdk` を Agent RPC の server-side SDK として扱い、Agent Service、SDK、Management Client、Deploy artifact が同じ Protobuf RPC contract を参照していることを検証したい。SDK が第一級 package になることで、生成、lint、package boundary、deploy artifact の検査対象が明確になり、Client と新しい server-side consumer が同じ SDK contract を使える。

**Requirement**

Workspace validation は `@cf-tamac/sdk` を server-side Agent RPC SDK package として分類 SHALL。

Workspace validation は Agent、SDK、Management Client が参照する generated Agent RPC descriptors を決定的な generation output として検査 SHALL。

Workspace validation は SDK package boundary を server-side execution graph に関連付け SHALL。SDK package import ownership は server-side execution boundary に属する SHALL。

Workspace validation は SDK の server-side package classification、generated output consistency、Client deploy artifact completeness を一つの validation report で確認 SHALL。

Deploy artifact generation は Management Client artifact に SDK runtime closure、SDK package metadata、generated Agent RPC descriptors、Client Worker runtime dependencies を含める SHALL。生成された Client artifact は Cloudflare Worker deploy root として自己完結する SHALL。

#### Scenario: Workspace validation が SDK を server-side Agent RPC package として分類する (WORKSPACE-GOVERNANCE-S015)

- **GIVEN** maintainer が workspace validation を実行できる
- **WHEN** workspace validation が Agent、SDK、Management Client の package classification を列挙する
- **THEN** `@cf-tamac/sdk` は server-side Agent RPC SDK package として分類される
- **AND** SDK package imports は server-side execution boundary の所有として検査される
- **AND** Browser-delivered graph は UI display data boundary として分類される

#### Scenario: Codegen drift check が SDK Agent RPC descriptors を検査する (WORKSPACE-GOVERNANCE-S016)

- **GIVEN** Agent TypeSpec source と generated Agent RPC descriptors が利用できる
- **WHEN** root codegen drift check が実行される
- **THEN** Agent、SDK、Management Client の generated Agent RPC descriptors は同じ Protobuf RPC contract から生成された安定 output として検査される
- **AND** generation output の差分は path と command context を含む report で確認できる

#### Scenario: Client deploy artifact が SDK runtime closure を含む (WORKSPACE-GOVERNANCE-S017)

- **GIVEN** repository source と generated Agent RPC descriptors が利用できる
- **WHEN** deploy artifact generation command が Client artifact を生成する
- **THEN** Client artifact は Management Client Worker runtime、SDK runtime closure、SDK package metadata、generated Agent RPC descriptors、Client Worker configuration を含む
- **AND** artifact root は Cloudflare Deploy Button から Management Client Worker として deploy できる自己完結した構成になる
