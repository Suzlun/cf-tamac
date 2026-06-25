# agent-model-invocation Specification

## Purpose

Agent model invocation は、Agent runtime が model policy、context assembly、provider boundary、typed decision output、invocation ledger を安全に接続する契約を定義する。

## Requirements

### Requirement: ModelProvider boundary and Workers AI adapter

Model invocation は pure provider boundary と Workers AI adapter を通じて実行 SHALL。

**Customer Context**

Agent 実行は Cloudflare 上で model call まで進む必要があるが、provider 固有 binding や SDK 依存が domain layer に漏れると、テスト、監査、provider 追加、安全な error handling が困難になる。

**Requirement**

Agent runtime は `ModelProvider` boundary を持つ SHALL。Domain と harness logic は Workers AI binding、provider-specific SDK、network transport を直接 import して MUST NOT。Provider adapter は model request、policy metadata、timeout、budget hints を受け取り、typed provider result または正規化済み domain error を返す MUST。

初期 provider として Workers AI adapter を提供 SHALL。Agent Worker env は model execution capability として `AI` binding を持つ MUST。Binding が未設定または利用不能な場合、model execution は model call 前に `unavailable` として fail closed MUST。

Provider error は `missing_binding`、`unsupported_provider`、`unsupported_model`、`provider_unavailable`、`provider_timeout`、`provider_rate_limited`、`provider_invalid_response` などの安全な domain category へ正規化 SHALL。Provider credential、raw response、raw prompt は error object、audit、log、RPC response に含めて MUST NOT。

#### Scenario: Missing Workers AI binding は model call 前に拒否される (AGENT-MODEL-INVOCATION-S001)

- **GIVEN** `agent-alpha` の resolved model policy が `provider = workers-ai` を指している
- **WHEN** Agent Worker env に `AI` binding が存在しない状態で Run execution が model call を開始する
- **THEN** ModelProvider boundary は provider 呼び出し前に `missing_binding` を返す
- **AND** Run は分類済み失敗として記録され、secret、raw prompt、raw completion は保存されない

#### Scenario: Provider failure は Agent domain error に正規化される (AGENT-MODEL-INVOCATION-S002)

- **GIVEN** Workers AI adapter が provider timeout または rate limit を受け取っている
- **WHEN** ModelProvider boundary が結果を Agent runtime へ返す
- **THEN** Agent runtime は retry 可能 category と safe provider metadata を区別する
- **AND** RPC response、audit、log は provider credential、生 request、生 response を含まない

### Requirement: Context Builder output to model input

Context Builder output は安定順序と digest metadata で model input に変換 SHALL。

**Customer Context**

Agent の判断は、同じ Thread と同じ snapshot から再現できる形で model に渡される必要がある。Context の順序が不定だと、判断品質と監査可能性が失われる。raw prompt を保存すると、秘密情報や reasoning-like text が漏えいする。

**Requirement**

Model request assembly は immutable Run snapshot から Context Builder bundle を生成 SHALL。Bundle は identity、selected model policy metadata、ThreadMemory、latest ready Handoff、uncompacted Events、retrieved History、AgentMemory、trigger Event の順序を維持 MUST。

Model request は resolved model policy ref/digest/provider/model、decision schema version、prompt digest、安全な token/size estimate、context part metadata を含む MUST。Agent Service は raw prompt bytes、生 Event payload body、生 History body、生 Memory bodyを debug log、audit detail、RPC response、Client UI に保存または公開して MUST NOT。

#### Scenario: Context bundle が安定順序で model request へ変換される (AGENT-MODEL-INVOCATION-S003)

- **GIVEN** Run snapshot が ThreadMemory、latest ready Handoff、uncompacted Events、retrieved History、AgentMemory、trigger Event を持っている
- **WHEN** model request assembly が Context Builder output を変換する
- **THEN** model input は identity、policy、ThreadMemory、Handoff、Events、History、AgentMemory、trigger Event の順序を維持する
- **AND** audit には prompt digest と safe context metadata だけが保存され、raw prompt は保存されない

### Requirement: Typed harness decision output

Model output は typed HarnessDecision として parse と validation を通過 MUST。

**Customer Context**

Model output をそのまま実行すると、未知の action、不正な Tool、壊れた ref、権限外 Event emit が Agent-owned state を破壊する可能性がある。Agent は model output を型付き decision として検証し、失敗原因を区別できる必要がある。

**Requirement**

Agent runtime は model decision output schema を versioned contract として定義 SHALL。Model policy は要求する decision schema version を持つ MUST。Run snapshot は decision schema version を固定 MUST。

Model output parser は provider output を `HarnessDecision[]` へ parse/validate SHALL。Unknown decision type、unsupported schema version、malformed output、権限外 Tool、壊れた ref、不正な Event emit、budget 超過につながる decision は commit 前に拒否 MUST。

Parse failure、provider failure、authorization failure、budget failure、stale generation failure は区別される MUST。Malformed model output は fail closed し、Agent-owned side effect を確定して MUST NOT。

#### Scenario: Valid model output が typed HarnessDecision に変換される (AGENT-MODEL-INVOCATION-S004)

- **GIVEN** Run snapshot が decision schema version `v1` を固定している
- **WHEN** model output が `respond`、`write_memory`、`stop` の valid decision payload を返す
- **THEN** parser は `HarnessDecision[]` と safe decision summary を返す
- **AND** commit layer は decision ごとの authorization、budget、stale guard を適用できる

#### Scenario: Malformed model output は side effect なしで拒否される (AGENT-MODEL-INVOCATION-S005)

- **GIVEN** model output が unsupported schema version、unknown decision type、または壊れた JSON を含む
- **WHEN** parser が output を検証する
- **THEN** Run は `malformed_model_output` として分類される
- **AND** Memory、ToolInvocation、Schedule、Delivery、AgentEvent は作成されない

### Requirement: Model invocation ledger and reasoning safety

Model invocation ledger は safe metadata と digest だけを永続化 MUST。

**Customer Context**

運用者は model call の失敗、latency、usage、retry、recovery を調査したいが、raw prompt、raw completion、chain-of-thought、hidden reasoning を保存すると重大な情報漏えいになる。

**Requirement**

Agent Service は model invocation attempt を safe ledger として永続化 SHALL。Ledger は invocation ID、run ID、thread ID、model policy ref/digest、provider、model、decision schema version、request digest、response digest、status、provider error category、token usage、latency、attempt、lease/heartbeat、created timestamp を保持 MUST。

Ledger は raw prompt、raw completion、raw chain-of-thought、hidden reasoning、provider credential、signature token を保持して MUST NOT。Model が reasoning-like text を返す場合、Agent runtime は保存可能な decision summary、decision records、tool trace、budget usage、安全な metadata に正規化 MUST。

Running Run は lease、heartbeat、attempt を持つ SHALL。Worker restart、Queue callback failure、provider timeout 後の recovery policy は one active Run slot を破らず、retryable、failed、interrupted の分類へ収束 MUST。Duplicate invocation と late provider response は stale guard により破棄 MUST。

#### Scenario: Invocation ledger が safe metadata と digest だけを記録する (AGENT-MODEL-INVOCATION-S006)

- **GIVEN** Run が Workers AI provider へ model request を送信している
- **WHEN** invocation attempt が開始、成功、失敗のいずれかに遷移する
- **THEN** ledger は request digest、response digest、status、usage、latency、provider error category を保存する
- **AND** raw prompt、raw completion、raw reasoning、provider credential は保存されない

#### Scenario: Lease recovery が one active Run slot を維持する (AGENT-MODEL-INVOCATION-S007)

- **GIVEN** Run `run-1` が model invocation lease を持つ running 状態で Worker restart または provider timeout を経験している
- **WHEN** scheduler recovery が lease を評価する
- **THEN** `run-1` は retryable、failed、または interrupted に deterministic に分類される
- **AND** retry または再開は同じ Agent 内で one active Run slot を再取得してから実行される
- **AND** late provider response は generation と invocation attempt が一致しない場合に破棄される
