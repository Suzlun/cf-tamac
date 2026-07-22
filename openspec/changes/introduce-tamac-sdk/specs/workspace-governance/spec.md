## MODIFIED Requirements

### Requirement: Deploy Button artifact generation

Workspace governance は、Agent Service と Management Client を Cloudflare Deploy Button から個別に導入できる self-contained artifact branch を生成 MUST。

**Customer Context**

利用者はCloudflare DashboardからAgent ServiceとManagement Clientを順番に導入し、各Workerに必要な実行資産、設定例、リソース定義、セキュリティ手順が一つのデプロイ成果物で完結することを必要としている。環境ごとのRate Limiting設定と公開情報だけで構成された信頼設定を検証できることで、安全で再現可能な導入を実施できる。

**Requirement**

Workspaceのデプロイ成果物生成commandは、Agent Service用とManagement Client用の自己完結したCloudflare Worker成果物を生成する SHALL。

各デプロイ成果物は、対象Workerの実行、設定、リソース作成、初期設定、運用確認に必要な資産と手順を含む SHALL。

Agent Service成果物は、Agent実行資産、Agent RPC契約出力、Agent専用リソース設定、公開情報で構成された信頼設定例、環境固有のRate Limiting設定を含む SHALL。

Management Client成果物は、Management Client実行資産、SDK実行時依存、Agent RPC契約出力、管理台帳設定、許可済みAgent RPC origin設定例を含む SHALL。

デプロイ成果物は、公開情報で構成されたAgent信頼設定、暗号化されたClient signing key運用、Cloudflare Access導入確認、Agent health RPC確認を文書化する SHALL。

Agent Service成果物の生成commandは、productionとstagingのRate Limiting namespace IDを必須入力として受け取り、正整数かつ相互に異なる値をAgent Serviceの環境別設定へ反映する SHALL。

#### Scenario: デプロイ成果物生成が自己完結したWorker成果物を作成する (WORKSPACE-GOVERNANCE-S014)

- **GIVEN** repository sourceと生成済みAgent RPC契約出力が利用でき、productionとstagingに正整数かつ相互に異なるRate Limiting namespace IDが割り当てられている
- **WHEN** maintainerがデプロイ成果物生成commandを実行する
- **THEN** Agent Service成果物はAgent WorkerをCloudflareへ導入するために必要な実行資産、Agent専用リソース設定、公開信頼設定例、Agent RPC契約出力を含む
- **AND** Management Client成果物はManagement Client WorkerをCloudflareへ導入するために必要な実行資産、管理台帳設定、SDK実行時依存、許可済みAgent RPC origin設定例、Agent RPC契約出力を含む
- **AND** Agent Service成果物は入力されたproductionとstagingのRate Limiting namespace IDを対応する環境設定へ反映する
- **AND** 各成果物のREADMEはCloudflare Access、暗号化signing key、Agent health RPCによる導入確認手順を案内する

## ADDED Requirements

### Requirement: SDKのワークスペース検証とデプロイ成果物検証

ワークスペース検証は、TAMAC server-side SDK、生成済みAgent RPC契約出力、デプロイ成果物の自己完結性をmaintainer向け検証reportで検査する SHALL。

**Customer Context**

MaintainerはTAMAC SDKをAgent RPCのサーバー側consumer surfaceとして扱い、Agent Service、SDK、Management Client、デプロイ成果物が同じProtobuf RPC契約を参照していることを検証したい。SDKが第一級の検査対象になることで、生成、lint、実行境界、デプロイ成果物の検証reportが明確になり、Clientとサーバー側consumerが同じSDK契約を使える。

**Requirement**

ワークスペース検証は、TAMAC SDKの利用をサーバー側Agent RPC実行境界として報告する SHALL。

ワークスペース検証は、Agent、SDK、Management Clientが参照する生成済みAgent RPC契約出力を決定的な生成結果として検査する SHALL。

SDKの生成済みAgent RPC契約出力は、codegen drift、生成物ownership、実行境界policyの必須検証対象として検査される SHALL。

ワークスペース検証は、SDK利用とサーバー側実行graphのownershipを関連付ける SHALL。

ワークスペース検証は、SDKのサーバー側実行ownership、生成結果の整合性、生成物policyのcoverage、Clientデプロイ成果物の自己完結性を一つの検証reportで確認する SHALL。

デプロイ成果物生成は、Management Client成果物にSDK実行時依存、生成済みAgent RPC契約出力、Client Worker実行時依存、Worker設定を含める SHALL。生成されたClient成果物はCloudflare Workerデプロイrootとして自己完結する SHALL。

#### Scenario: ワークスペース検証がSDK利用をサーバー側Agent RPC境界として報告する (WORKSPACE-GOVERNANCE-S015)

- **GIVEN** maintainerがワークスペース検証を実行できる
- **WHEN** ワークスペース検証がAgent、SDK、Management Clientの実行ownershipを列挙する
- **THEN** TAMAC SDKの利用はサーバー側Agent RPC実行境界として報告される
- **AND** SDK利用はサーバー側実行ownershipとして検査される
- **AND** Browser配信graphはUI表示data境界として分類される

#### Scenario: 生成物ポリシーがSDKのAgent RPC契約出力を検査する (WORKSPACE-GOVERNANCE-S016)

- **GIVEN** Agent RPC契約sourceと生成済みAgent RPC契約出力が利用できる
- **WHEN** root codegen drift checkと生成済みpackage policy検証が実行される
- **THEN** SDKの生成済みAgent RPC契約出力はcodegen drift、生成物ownership、実行境界policyの必須対象として検査される
- **AND** Agent、SDK、Management Clientの生成済みAgent RPC契約出力は同じProtobuf RPC契約から生成された安定出力として検査される
- **AND** 検証reportは対象root、rule、command contextを確認可能にする

#### Scenario: Clientデプロイ成果物がSDK実行時依存を含む (WORKSPACE-GOVERNANCE-S017)

- **GIVEN** repository sourceと生成済みAgent RPC契約出力が利用できる
- **WHEN** デプロイ成果物生成commandがClient成果物を生成する
- **THEN** Client成果物はManagement Client Worker実行資産、SDK実行時依存、生成済みAgent RPC契約出力、Client Worker設定を含む
- **AND** 成果物rootはCloudflare Deploy ButtonからManagement Client Workerとしてデプロイできる自己完結した構成になる
