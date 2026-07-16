## RENAMED Requirements

- FROM: `### Requirement: Agent ID と Durable Object identity`
- TO: `### Requirement: Agent ID と安定したidentity`

## MODIFIED Requirements

### Requirement: Agent ID と安定したidentity

Agent Service は、各 Agent ID を単一で安定した Agent identity に関連付ける SHALL。

**Customer Context**

Agent管理者は、同じAgent IDへの操作が常に同じ自律主体へ届き、初期化応答が不確定な場合も登録時の要求と取得済みAgent情報を安全に照合できることを必要としている。登録試行を一意に識別する値と要求内容のdigestが初期化receiptとして確認できることで、管理画面は利用者へ確定した登録状態を提示できる。

**Requirement**

Agent Serviceは、一つの`agent_id`を厳密に一つの安定したAgent identityとして扱う MUST。

Agent Serviceは、すべての公開RPC requestをrequest messageに含まれる`agent_id`へscopeする MUST。

`InitializeAgent` requestは、`agent_id`、`idempotency_key`、`registration_request_digest`を必須入力として受け付ける MUST。

`InitializeAgent`の成功responseは、requestと完全一致する`idempotency_key`と`registration_request_digest`を持つ`initialization_receipt`を返す SHALL。

同じ`agent_id`、`idempotency_key`、`registration_request_digest`による再実行は、同じAgent状態と`initialization_receipt`を返す SHALL。

`GetAgent` responseは、対象`agent_id`のprofile、lifecycle状態、config版、credential generation、capability要約、`initialization_receipt`を返す SHALL。

#### Scenario: InitializeAgentが指定Agent IDの状態を確立する (AGENT-LIFECYCLE-S001)

- **GIVEN** 有効なClient Service principalが`agent_id = agent-alpha`に対するlifecycle scopeを持っている
- **WHEN** 必須profile、config、`idempotency_key`、`registration_request_digest`を指定して`InitializeAgent`を呼ぶ
- **THEN** responseは`agent-alpha`のprofile、有効なlifecycle状態、初期config版、credential generationを返す
- **AND** `initialization_receipt`はrequestと完全一致する`idempotency_key`と`registration_request_digest`を返す

#### Scenario: GetAgentがAgent情報と初期化receiptを返す (AGENT-LIFECYCLE-S002)

- **GIVEN** `agent-alpha`が初期化済みである
- **WHEN** 認可済みClient Service principalが`agent-alpha`に対して`GetAgent`を呼ぶ
- **THEN** responseは`agent-alpha`のprofile、lifecycle状態、config版、credential generation、capability要約を返す
- **AND** responseの`initialization_receipt`は`agent-alpha`の初期化時に確定した`idempotency_key`と`registration_request_digest`を返す

#### Scenario: 登録試行を初期化receiptと照合する (AGENT-LIFECYCLE-S010)

- **GIVEN** Management Clientが固定した`idempotency_key`と`registration_request_digest`で`InitializeAgent`を呼び、登録結果の状態確認を必要としている
- **WHEN** Management Clientが同じ`agent_id`に対して`GetAgent`を呼ぶ
- **THEN** `GetAgent`は初期化時に確定した`idempotency_key`と`registration_request_digest`を持つ`initialization_receipt`を返す
- **AND** Management Clientはreceiptの両値と登録対象のprofileおよびconfigが登録試行と完全一致したときに登録状態を`active`として確定する
