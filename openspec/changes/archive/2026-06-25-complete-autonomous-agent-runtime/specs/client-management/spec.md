## ADDED Requirements

### Requirement: Model policy management UI

Management Client は model policy management UI を server-side Agent RPC 境界で提供 SHALL。

**Customer Context**

Agent 管理者は、Agent 作成時と Settings で default model policy を設定、検証、更新し、Run がどの policy を使うかを安全に確認したい。Browser に Agent credential や Provider credential が露出すると、管理 UI が攻撃面になる。

**Requirement**

Management Client は Agent creation flow と Agent Settings に default model policy 入力、検証、保存、表示 UI を提供 SHALL。UI は policy ref、provider、model、digest、安全な generation parameters、status、validation warning だけを表示 MUST。Provider credential、Agent credential、生 token、raw prompt、raw completion、raw reasoning は Browser payload、HTML、JavaScript bundle、storage に含めて MUST NOT。

Client server は Server Action または Server Component 経由で generated Agent RPC client を使用し、`UpsertModelPolicy`、`ValidateModelPolicy`、`UpdateConfig`、必要な `InitializeAgent` を順序付きで呼ぶ SHALL。Agent 作成では initial model policy と initial `modelPolicyRef` を同じ server-side flow で Agent に送信 MUST。Settings 更新では policy upsert が成功した policy ref だけを `UpdateConfig` に渡す MUST。

UI は missing binding、invalid policy、unsupported provider/model、permission denied、validation warning を secret-safe な user-facing message として表示 MUST。Browser-visible modules は Agent RPC client、Connect runtime、server-only Agent RPC factory、credential resolution logic を import して MUST NOT。

#### Scenario: Agent creation flow が initial model policy を server-side で送信する (CLIENT-MANAGEMENT-S017)

- **GIVEN** 運用者が Agent creation flow で policy ref、provider、model、generation parameters を入力している
- **WHEN** form を送信する
- **THEN** Client server は policy を検証し、Agent RPC を server-side で呼んで initial model policy と `initialConfig.modelPolicyRef` を送信する
- **AND** Browser は Agent credential、Provider credential、direct Agent RPC request を受け取らない

#### Scenario: Settings 画面が default model policy を安全に更新する (CLIENT-MANAGEMENT-S018)

- **GIVEN** 運用者が Agent Settings で default model policy を変更している
- **WHEN** policy upsert と config update が成功する
- **THEN** UI は policy ref、digest、provider、model、config version を更新表示する
- **AND** invalid policy または権限不足の場合は secret-free error message を表示し、Browser bundle に Agent RPC credential は含まれない
