# agent-lifecycle Specification

## Purpose

TBD - created by archiving change implement-agent-service-base. Update Purpose after archive.

## Requirements

### Requirement: Agent ID と Durable Object identity

Agent Service は、各 Agent ID を単一の AIAgent Durable Object identity に bind SHALL。

**利用者文脈**

Agent 管理者は、同じ Agent ID への操作が常に同じ自律主体へ届き、別 Agent の状態や履歴と混線しないことを必要としている。Agent が Thread、Event、Run、Memory、Schedule、Tool、Integration を長期的に所有するため、identity の揺れは復旧不能な文脈破壊につながる。

**要件**

- Agent Service は、一つの `agent_id` を厳密に一つの AIAgent Durable Object instance かつ一つの Agent aggregate root として扱う MUST。
- Agent Service は、すべての公開 RPC リクエストをメタデータだけでなくリクエスト message に含まれる `agent_id` で route MUST。
- AIAgent Durable Object は、Agent profile、ライフサイクル状態、config 版、credential generation、監査 pointer、予約済み system Thread identity を Agent-owned store 内に永続化 MUST。
- Agent Service は、list-all または search-all Agent のような Agent 横断ライフサイクル RPC を公開して MUST NOT。

#### Scenario: InitializeAgent が指定名の Agent aggregate を作成する (AGENT-LIFECYCLE-S001)

- **GIVEN** 有効な Client Service principal が `agent_id = agent-alpha` に対するライフサイクル scope を持っている
- **WHEN** 必須 profile、config、idempotency key を指定して `InitializeAgent` を呼ぶ
- **THEN** リクエストは `agent-alpha` という名前の AIAgent Durable Object に route される
- **AND** Agent profile、有効なライフサイクル状態、初期 config 版、credential generation、予約済み system Thread、ライフサイクル監査 Event はその Agent のためだけに永続化される

#### Scenario: GetAgent が Agent-local profile と config を返す (AGENT-LIFECYCLE-S002)

- **GIVEN** `agent-alpha` が initialized である
- **WHEN** 認可済み Client Service principal が `agent-alpha` に対して `GetAgent` を呼ぶ
- **THEN** 応答には `agent-alpha` が所有する Agent profile、ライフサイクル状態、config 版、credential generation、capability 要約が含まれる
- **AND** 別 Agent の Thread、Memory、Schedule、ToolInvocation、Integration 状態は含まれない

### Requirement: Agent ライフサイクル状態遷移の強制

AIAgent Durable Object は、各 Agent の監査可能なライフサイクル遷移を強制 SHALL。

**利用者文脈**

Agent 管理者は、作成、停止、破棄、credential rotation のような管理操作が監査可能で、実行中の Event/Run/Tool/Integration と矛盾しないライフサイクル境界を必要としている。

**要件**

- AIAgent Durable Object は initialize、有効 operation、無効 operation、destroyed operation のライフサイクル状態遷移を強制 MUST。
- Destroyed Agent は、明示的に許可された監査/照会 operation を除き、変更系公開 RPC を拒否 MUST。
- Lifecycle command は `agent_id + principal_id + idempotency_key` で冪等である MUST し、異なるリクエスト body digest を持つ同じ key を拒否 MUST。
- Lifecycle command は予約済み system Thread に監査 Event を追加 MUST。

#### Scenario: DestroyAgent が mutating Agent operations を無効化する (AGENT-LIFECYCLE-S003)

- **GIVEN** `agent-alpha` が有効で、Thread、Schedule、ToolInvocation、Integration Installation を持っている
- **WHEN** 認可済み principal が有効な idempotency key で `DestroyAgent` を呼ぶ
- **THEN** Agent ライフサイクル状態は `destroyed` になる
- **AND** `agent-alpha` に対する以後の Event publish、Schedule creation、Tool 承認、Integration install command はライフサイクル事前条件エラーで失敗する
- **AND** 既存の監査/History 記録は認可ポリシーに従って照会可能なままである

#### Scenario: 重複ライフサイクル command が記録済み応答を replay する (AGENT-LIFECYCLE-S004)

- **GIVEN** `InitializeAgent` または `DestroyAgent` が idempotency key `idem-1` で `agent-alpha` に対してすでに成功している
- **WHEN** 同じ principal が同じ body digest と `idem-1` で同じ command を繰り返す
- **THEN** Agent Service は重複する profile、監査、Thread、ライフサイクル記録を作成せず、記録済み成功応答を返す
- **AND** `idem-1` と異なる body digest を持つ反復 command は idempotency conflict として拒否される

### Requirement: credential と構成管理

Agent Service は、版管理された Agent-local 認可により credential と構成を管理 SHALL。

**利用者文脈**

Client Service や管理者は、Agent への接続資格情報と Agent 設定を安全に更新し、rotation 中も一貫した認可と監査を維持したい。credential が失効している Agent への操作は、誤動作や不正アクセスを避けるために拒否される必要がある。

**要件**

- Agent Service は明示 key identifier、有効/重複期間/revoked 状態、generation number、監査 Event を持つ credential rotation を支援 MUST。
- Agent Service は検証に必要な verifier material、公開 fingerprint、または secret 参照だけを保存 MUST。秘密鍵と生 shared secret は平文 Agent 記録に保存して MUST NOT。
- Agent 構成更新は config 版を increment MUST し、その版は AgentRun スナップショットに capture MUST。
- AIAgent Durable Object 内の final authorization は、状態を変更する前にライフサイクル状態、credential 状態、principal type、scope/grant、要求された operation を検証 MUST。

#### Scenario: RotateAgentCredential が新しい有効 generation を作成する (AGENT-LIFECYCLE-S005)

- **GIVEN** `agent-alpha` が credential generation `1` を持っている
- **WHEN** 認可済み principal が generation `2` メタデータと overlap policy で `RotateAgentCredential` を呼ぶ
- **THEN** generation `2` は policy に従って有効または overlap 中になる
- **AND** generation `1` は構成済み overlap window の間だけ保持される
- **AND** credential rotation は平文の秘密鍵 material を保存せずに system Thread 監査 Event に記録される

#### Scenario: UpdateConfig が後続 Run に capture される版を変更する (AGENT-LIFECYCLE-S006)

- **GIVEN** `agent-alpha` が config 版 `3` を持っている
- **WHEN** 認可済み principal が model、予算、Memory、Tool、または scheduling 構成を更新する
- **THEN** Agent config 版は `4` に increment する
- **AND** 後続の AgentRun スナップショットは config 版 `4` を参照する
- **AND** すでに running の AgentRun スナップショットは開始時に capture した config 版を保持する

### Requirement: Agent 状態と構成照会

Agent Service は Agent-local 状態と構成を安全なスナップショットとして公開 MUST。

**利用者文脈**

管理 UI と運用者は、Agent の現在状態、ライフサイクル、config 版、予算、model、Memory、Tool、Schedule 設定を確認したい。照会が secret や別 Agent 状態を返すと、運用判断と権限境界が崩れる。

**要件**

- `AgentStateService.GetState` は対象 Agent のライフサイクル状態、現在の有効 Run 要約、scheduler/wake 要約、storage 閾値状態、capability 要約、安全な運用メタデータを返す MUST。
- `AgentStateService.GetConfig` は対象 Agent の現在 config 版、model/予算/Memory/Tool/Schedule policy、更新実行者/時刻メタデータを返す MUST。
- GetState と GetConfig は Agent-local final authorization を通り、秘密鍵、生 credential、Provider secret、Thread payload body、未 redaction の signature material を返す MUST NOT。
- GetState と GetConfig は running Run のスナップショット config を変更 MUST NOT し、照会結果は変更を発生させない MUST。

#### Scenario: GetState と GetConfig が Agent-local スナップショットを返す (AGENT-LIFECYCLE-S007)

- **GIVEN** `agent-alpha` が config 版 `4` で initialized され、別 Agent が異なる状態を持っている
- **WHEN** 認可済み Client Service principal が `agent-alpha` に対して `GetState` と `GetConfig` を呼ぶ
- **THEN** 応答には `agent-alpha` の状態要約、現在 config 版、安全な policy メタデータ、運用状態だけが含まれる
- **AND** secret material、Thread payload body、その他の Agent 状態は返されない

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
