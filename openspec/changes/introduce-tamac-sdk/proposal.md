## Why

TAMAC Agent を操作するサーバーサイド利用者は、Agent RPC、Client Service 認証、acting user 文脈、Connect error 正規化を一貫した契約として扱える SDK を必要としている。`@cf-tamac/sdk` を第一級の server-side SDK として提供することで、Management Client と新しいサーバーサイド Client が同じ操作体験で Agent lifecycle、model policy、Event、Thread、Run、State、Schedule、Tool、Integration、Health を扱える。

この change は、Agent の Protobuf RPC-only contract を利用する Client Service JWT surface と Provider detached-signature surface に専用の認証文脈を与え、SDK 利用者が小さい組み込み面で TAMAC Agent 操作を始められる状態を作る。Management Client は信頼済み Agent RPC origin と安全化済み Server Action result を扱い、Agent RPC credential と署名処理は server-side execution boundary が所有する。

## What Changes

- `@cf-tamac/sdk` が server-side SDK として提供され、TAMAC Agent の generated Protobuf RPC service 群を統一された TypeScript API で呼び出せる。
- SDK は Client Service principal が認可された lifecycle、model policy、event、thread、run、state、schedule、tool、integration、health operations と、Client Service JWT metadata、acting user 文脈、Connect error 正規化を一つの client 集約で提供する。
- Integration Provider は detached-signature principal と Provider-facing signature context を備えた専用 integration surface から ingress operations を呼び出す。
- Management Client は server-managed HTTPS origin allowlist で登録時と SDK transport 構築時に Agent RPC origin を検証し、Client-owned D1 と signing key store を所有する adapter を通じて SDK を利用する。
- Management Client の Server Action result は safe display data、safe status、safe error category、correlation ID で構成され、Browser へ安全な操作結果を提供する。
- SDK の server/browser boundary、Agent RPC origin policy、generated descriptor ownership は workspace validation と package boundary rules で検査される。
- Deploy artifact generation は SDK source と generated Agent RPC descriptors を含む self-contained Client artifact を生成する。

## Spec Units

### New Spec Units

- `tamac-sdk`: `@cf-tamac/sdk` の Client Service Agent 操作 contract、認証 metadata、Agent RPC origin policy、error 正規化、generated Protobuf RPC 利用、browser boundary、SDK consumer expectations を扱う。

### Modified Spec Units

- `workspace-governance`: SDK package、server-side boundary、generated Agent RPC descriptor root、Deploy artifact、lint/test/codegen validation を mandatory workspace validation target として扱う。

## Naming

- `tamac-sdk` の Scenario ID prefix は `TAMAC-SDK` とし、`TAMAC-SDK-S001` から採番する。
- `workspace-governance` の追加 Scenario ID prefix は既存の `WORKSPACE-GOVERNANCE` を使う。
- SDK contract と workspace validation は別責務として扱い、SDK 利用体験は `tamac-sdk`、repository validation は `workspace-governance` に記述する。

## Impact

- Impacted packages: Agent TypeSpec/codegen pipeline、`@cf-tamac/sdk` package、Management Client server-side Agent RPC integration、Deploy artifact generator、workspace governance scripts、tests。
- Impacted APIs: Agent Protobuf RPC descriptors、SDK public TypeScript API、Client Service JWT metadata、Provider detached-signature context、Connect error mapping、Server Action result schema。
- Impacted operations: Client HTTPS origin allowlist 設定、managed Agent 登録、Client artifact generation、codegen drift check、package boundary lint、OpenSpec Scenario ID coverage。
- Security impact: principal-specific integration surface、server-side SDK boundary、Client Service signing key handling、Agent RPC origin validation、acting user audit metadata、browser-delivered data classification。
- Performance impact: SDK client aggregation と transport construction は server-side request context ごとに再利用でき、generated descriptor output は決定的に生成される。
