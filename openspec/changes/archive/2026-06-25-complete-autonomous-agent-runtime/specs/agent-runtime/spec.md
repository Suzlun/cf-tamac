## ADDED Requirements

### Requirement: Run execution loop with model policy snapshot

Run execution は model policy snapshot を固定して model call と decision commit へ進む SHALL。

**Customer Context**

Agent は Event を受理するだけでなく、pending Run を model execution へ進め、どの policy と context で判断したかを監査できる必要がある。Run が開始後に config や policy の変化を取り込むと、再実行と説明可能性が失われる。

**Requirement**

`processPendingRuns` は pending Run を `running` にするだけで終了して MUST NOT。AIAgent Durable Object は one active Run slot を取得し、immutable Run snapshot を作成し、model policy resolution、Context Builder、ModelProvider invocation、decision parsing、decision commit、status transition を一つの Run execution loop として実行 SHALL。

Run snapshot は requested model policy ref、resolved model policy ref、resolved model policy digest、resolved provider、resolved model、model policy version、model policy source、Agent config version、decision schema version、Tool catalog generation、Integration capability generation、ThreadMemory version、trigger Event range を固定 MUST。Model policy source は `event_override` と `agent_default` を区別 MUST。

Model policy resolution failure、missing binding、unsupported provider/model、stale config、stale policy digest、stale capability generation は model call または commit 前に fail closed MUST。Failure は safe error category と audit metadata を持つ Run status に収束し、active slot を解放 MUST。

#### Scenario: Pending Run が model execution から terminal status へ進む (AGENT-RUNTIME-S011)

- **GIVEN** Thread A に accepted Event と active default model policy があり、有効 Run がない
- **WHEN** scheduler wake が pending Run を選択する
- **THEN** AIAgent Durable Object は one active Run slot を取得し、Run snapshot に resolved model policy identity と context identity を固定する
- **AND** model call と decision commit が成功した場合、Run は `completed` または `waiting` ではない terminal success status に遷移し active slot を解放する

#### Scenario: Event override と default policy の source が snapshot に固定される (AGENT-RUNTIME-S012)

- **GIVEN** Event A は `modelPolicyRef = policy-fast` を指定し、Event B は override を指定していない
- **WHEN** それぞれの Event から Run が開始される
- **THEN** Event A の Run snapshot は `model_policy_source = event_override` と requested/resolved ref/digest を保持する
- **AND** Event B の Run snapshot は `model_policy_source = agent_default` と config version/resolved digest を保持する

#### Scenario: Stale policy digest は model call または commit を拒否する (AGENT-RUNTIME-S013)

- **GIVEN** Run snapshot が policy version `3` と digest `digest-a` を固定している
- **WHEN** commit 前の guard が repository の active policy version または digest と一致しないことを検出する
- **THEN** Run は stale model policy failure として分類される
- **AND** Memory、ToolInvocation、Schedule、Delivery、AgentEvent の side effect は確定されない

### Requirement: Decision commit and waiting resume semantics

Decision commit と waiting resume は active slot、budget、stale guard を維持 MUST。

**Customer Context**

Agent は model output を Memory、Tool、Schedule、Delivery、Event、stop へ接続する必要がある。Tool や human approval で待つ Run が active slot を保持し続けると、同じ Agent の他 Thread が詰まる。Late result が stale commit されると安全性が壊れる。

**Requirement**

Harness は typed `HarnessDecision[]` を `write_memory`、`invoke_tool`、`create_schedule`、`respond`、`emit_event`、`stop`、認可済み状態更新に commit SHALL。各 commit は idempotency、authorization、budget、stale guard、lifecycle、generation、capability availability を side effect 前に検証 MUST。

ToolInvocation、human approval、Delivery response など外部結果を待つ decision は Run を `waiting` に遷移させ、active Run slot を解放 MUST。Waiting Run resume は Tool result、approval result、Delivery result、または follow-up Event の定義済み trigger により行われ、resume 時にも one active Run slot、stale guard、idempotency、authorization、budget、model policy generation check を通過 MUST。

Budget usage は model call count、token usage、provider cost unit、Tool/Integration cost、per-run/daily/integration/tool limits を commit 前に反映 SHALL。Budget exceeded は未認可 side effect を部分確定せず Run を `failed` または `interrupted` に分類 MUST。

#### Scenario: Harness decisions が Agent-owned side effects を確定する (AGENT-RUNTIME-S014)

- **GIVEN** Model output parser が valid `write_memory`、`create_schedule`、`emit_event`、`stop` decisions を返している
- **WHEN** commit layer が authorization、budget、stale guard を通過する
- **THEN** Memory、Schedule、AgentEvent、Run terminal status は同じ Run と Thread への因果 link を持って確定される
- **AND** audit は safe decision summary と budget usage を記録する

#### Scenario: Tool waiting は active slot を解放して結果で resume する (AGENT-RUNTIME-S015)

- **GIVEN** Run が承認または Provider result を必要とする `invoke_tool` decision を commit している
- **WHEN** ToolInvocation が `pending_approval` または `running` になり外部結果を待つ
- **THEN** Run は `waiting` になり active Run slot を解放する
- **AND** Tool result または approval result が到着したとき、resume は one active Run slot を再取得してから実行される

#### Scenario: Budget exceeded は decision commit 前に Run を停止する (AGENT-RUNTIME-S016)

- **GIVEN** Run が model token または provider cost budget を超過している
- **WHEN** commit layer が次の side effect decision を処理しようとする
- **THEN** Run は budget failure として terminal status に遷移する
- **AND** Tool、Schedule、Delivery、Memory、AgentEvent の追加 side effect は確定されない
