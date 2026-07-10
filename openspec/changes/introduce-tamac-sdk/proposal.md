## Why

TAMAC Agent を操作するサーバーサイド利用者は、Agent RPC、Client Service 認証、acting user 文脈、Connect error 正規化を一貫した契約として扱える SDK を必要としている。`@cf-tamac/sdk` を第一級の server-side SDK として提供することで、Management Client と新しいサーバーサイド Client が同じ操作体験で Agent lifecycle、Thread、Event、Run、Schedule、Tool、Integration、Health を扱える。

この change は、Agent の Protobuf RPC-only contract と Client Service 認証境界を維持したまま、SDK 利用者が小さい組み込み面で TAMAC Agent 操作を始められる状態を作る。ブラウザ配信物は UI 表示データに限定され、Agent RPC credential と署名処理は server-side execution boundary が所有する。

## What Changes

- `@cf-tamac/sdk` が server-side SDK として提供され、TAMAC Agent の generated Protobuf RPC service 群を統一された TypeScript API で呼び出せる。
- SDK は Client Service JWT 作成、Agent RPC 認証 metadata 付与、acting user 文脈、Connect error 正規化、service client 集約を server-side 利用者向けに提供する。
- Management Client は Client-owned D1 と signing key store を所有する adapter を通じて SDK を利用し、UI からの Agent 操作を同じ SDK contract へ揃える。
- SDK の browser boundary は workspace validation と package boundary rules で検査され、ブラウザ配信物は安全化済み UI データだけを扱う。
- Deploy artifact generation は SDK source と generated Agent RPC descriptors を含む self-contained Client artifact を生成する。

## Spec Units

### New Spec Units

- `tamac-sdk`: `@cf-tamac/sdk` の server-side Agent 操作 contract、認証 metadata、error 正規化、generated Protobuf RPC 利用、browser boundary、SDK consumer expectations を扱う。

### Modified Spec Units

- `workspace-governance`: SDK package、server-side boundary、generated Agent RPC descriptors、Deploy artifact、lint/test/codegen validation を workspace validation の対象として扱う。

## Naming

- `tamac-sdk` の Scenario ID prefix は `TAMAC-SDK` とし、`TAMAC-SDK-S001` から採番する。
- `workspace-governance` の追加 Scenario ID prefix は既存の `WORKSPACE-GOVERNANCE` を使う。
- SDK contract と workspace validation は別責務として扱い、SDK 利用体験は `tamac-sdk`、repository validation は `workspace-governance` に記述する。

## Impact

- Impacted packages: Agent TypeSpec/codegen pipeline、`@cf-tamac/sdk` package、Management Client server-side Agent RPC integration、Deploy artifact generator、workspace governance scripts、tests。
- Impacted APIs: Agent Protobuf RPC descriptors、SDK public TypeScript API、Client Service JWT metadata、Connect error mapping。
- Impacted operations: Client artifact generation、codegen drift check、package boundary lint、OpenSpec Scenario ID coverage。
- Security impact: server-side SDK boundary、Client Service signing key handling、acting user audit metadata、browser-delivered data classification。
- Performance impact: SDK client aggregation と transport construction は server-side request context ごとに再利用でき、generated descriptor output は決定的に生成される。
