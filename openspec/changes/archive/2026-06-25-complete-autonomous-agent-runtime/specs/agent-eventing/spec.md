## ADDED Requirements

### Requirement: Event-scoped model policy reference

Agent Event publication は Event-scoped model policy ref を安全に検証 MUST。

**Customer Context**

Client、Integration、Schedule、Tool result は Event ごとに異なる判断コストや能力を求める場合がある。Event が raw provider/model ID や credential を直接指定できると、予算と認可を迂回し、secret-safe storage も壊れる。

**Requirement**

`AgentEventInput` または public Event publish request は optional な `modelPolicyRef` を受け取れる SHALL。`modelPolicyRef` は Agent-owned model policy ref だけを指す MUST。Event publish request は raw provider ID、raw model ID、provider credential、secret value を含んで MUST NOT。

Client 由来 Event の override は principal scope/grant により Event acceptance 時に検証 MUST。Integration 由来 Event の override は Installation、Adapter、Connection に許可された policy ref set に含まれる場合だけ Event acceptance 時に検証 MUST。未登録、無効、archived、権限外、grant 外の override は Event、Thread、pending Run、Queue wake を作成せず拒否 MUST。

受理済み Event は requested model policy ref、安全な policy metadata、validation result だけを保存 SHALL。Secret、raw credential、raw provider token、raw model ID は Event storage、response、audit、log に保存して MUST NOT。Run start は Event acceptance 後に policy status や digest が変化していないか再検証し、stale または無効な場合は model call 前に fail closed MUST。

#### Scenario: Client Event の model policy override が受理される (AGENT-EVENTING-S010)

- **GIVEN** `agent-alpha` に active policy `policy-fast` があり、Client Service principal が override scope を持っている
- **WHEN** principal が `thread_key` と `modelPolicyRef = policy-fast` を指定して Event を publish する
- **THEN** Event は同じ Thread に受理され、requested model policy ref と safe metadata を保存する
- **AND** pending Run work は Event の policy override を参照できる状態で coalesce される

#### Scenario: Integration Event の grant 外 policy override は拒否される (AGENT-EVENTING-S011)

- **GIVEN** Installation `inst-1` の Adapter Connection が `policy-default` だけを許可している
- **WHEN** Provider が `modelPolicyRef = policy-expensive` を指定して `IntegrationIngressService.PublishEvent` を呼ぶ
- **THEN** AIAgent Durable Object は grant 外 override として request を拒否する
- **AND** Event、Thread sequence、pending Run、Queue wake は作成されない
