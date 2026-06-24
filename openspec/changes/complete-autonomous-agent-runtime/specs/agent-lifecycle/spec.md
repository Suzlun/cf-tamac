## ADDED Requirements

### Requirement: Model policy aware Agent configuration

Agent lifecycle と config は default model policy ref を Agent-owned policy として扱う MUST。

**Customer Context**

Agent 管理者は、Agent 作成時から default model policy を監査可能に固定し、Settings で明示的に更新したい。Run が raw model ID や env fallback に依存すると、後からどの policy で判断したか説明できない。

**Requirement**

`InitializeAgent` は initial model policy seed と `initialConfig.modelPolicyRef` を受け取れる SHALL。AIAgent Durable Object は seed policy を Agent-owned model policy repository に保存し、Agent config には policy body ではなく model policy ref、policy digest、安全な metadata、config version を保持 MUST。

`UpdateConfig` は default model policy ref を明示的に変更できる SHALL。対象 ref は同じ Agent の active model policy として存在する MUST。未設定、参照不能、disabled、archived、または unsupported provider/model の ref は config 更新時または Run start 時に fail closed MUST。

`GetAgent` と `GetConfig` は current default model policy ref、digest、provider、model、安全な generation metadata、config version を返せる MUST が、credentialRef が指す secret value、provider token、raw prompt、raw completion を返して MUST NOT。

#### Scenario: InitializeAgent が default model policy ref を config に固定する (AGENT-LIFECYCLE-S008)

- **GIVEN** 認可済み Client Service principal が `agent-alpha` を initialize できる
- **WHEN** initial model policy seed と `initialConfig.modelPolicyRef` を含めて `InitializeAgent` を呼ぶ
- **THEN** Agent profile、ライフサイクル状態、default model policy、config version、system Thread 監査 Event は同じ AIAgent Durable Object に永続化される
- **AND** Agent config は raw model ID や secret value ではなく model policy ref と digest を参照する

#### Scenario: UpdateConfig は active model policy ref だけを default に設定する (AGENT-LIFECYCLE-S009)

- **GIVEN** `agent-alpha` が active policy `policy-a` と disabled policy `policy-b` を持っている
- **WHEN** 認可済み principal が `UpdateConfig` で `modelPolicyRef = policy-a` を指定する
- **THEN** Agent config version は increment し、後続 Run snapshot は `policy-a` を参照する
- **WHEN** principal が `policy-b` または未登録 ref を指定する
- **THEN** config 更新は状態変更前に拒否され、既存 config version は維持される
