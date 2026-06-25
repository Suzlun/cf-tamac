## ADDED Requirements

### Requirement: Model execution authorization and secret-safe observability

Model execution authorization と observability は secret-safe 境界を強制 MUST。

**Customer Context**

Model policy override、provider credential、prompt、completion、reasoning は Agent の判断能力と機密情報に直結する。これらが Browser、Client D1、log、audit、response に漏れると、顧客データと Agent 権限が侵害される。

**Requirement**

AIAgent Durable Object は model policy upsert、archive、validate、default selection、Event override、Run execution、decision commit に対して Agent-local final authorization を実行 SHALL。Client principal は granted model policy scopes に限定 MUST。Integration principal は Installation、Adapter、Connection に許可された model policy ref set の範囲だけ override できる MUST。

Log、metrics、audit、RPC response、Client UI は provider credential、raw prompt、raw completion、raw chain-of-thought、hidden reasoning、生 token、秘密鍵、署名 material を含めて MUST NOT。保存可能な情報は decision summary、decision records、model policy ref/digest/provider/model、安全な model metadata、prompt digest、response digest、tool trace、budget usage、safe error category に限定 SHALL。

Missing binding、invalid policy、unsupported provider/model、provider failure、malformed model output、authorization failure、budget exceeded、stale generation は安定した error category と Connect code に対応付けられる MUST。

#### Scenario: Model policy override 権限外 request は拒否される (AGENT-SECURITY-S016)

- **GIVEN** Client Service principal が Event publish scope を持つが model policy override scope を持っていない
- **WHEN** principal が `modelPolicyRef = policy-expensive` を指定して Event を publish する
- **THEN** AIAgent Durable Object は permission denied として状態変更前に拒否する
- **AND** Event、pending Run、Queue wake は作成されない

#### Scenario: Observability が prompt completion reasoning を保存しない (AGENT-SECURITY-S017)

- **GIVEN** Run が model request と model output を処理している
- **WHEN** log、metrics、audit、Run response、Client UI data が生成される
- **THEN** prompt digest、response digest、decision summary、policy metadata、budget usage は含まれる
- **AND** raw prompt、raw completion、raw chain-of-thought、hidden reasoning、provider credential は含まれない

#### Scenario: Model failure categories が安定した Connect code に map される (AGENT-SECURITY-S018)

- **GIVEN** model execution が missing binding、invalid policy、provider timeout、malformed output、budget exceeded のいずれかで失敗している
- **WHEN** Agent RPC facade または Run query が失敗情報を返す
- **THEN** failure は `unavailable`、`failed_precondition`、`deadline_exceeded`、`invalid_argument`、`resource_exhausted` などの安定した code と safe detail に map される
- **AND** retry 可能 category と retry 不可 category を caller が区別できる
