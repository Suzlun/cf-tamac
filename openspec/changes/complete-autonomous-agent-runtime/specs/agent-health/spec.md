## ADDED Requirements

### Requirement: Model execution capability health

Agent health は model execution capability の readiness を secret-free に報告 SHALL。

**Customer Context**

運用者と smoke test は、Agent RPC facade だけでなく model execution capability が利用可能かを確認したい。Binding や default policy が壊れている状態を `serving` と誤認すると、Event publish 後の Run が進まず障害発見が遅れる。

**Requirement**

`AgentHealthService.Check` は safe dependency summary として model execution capability status を返す SHALL。Status は少なくとも `serving`、`degraded`、`unavailable` を区別 MUST。Workers AI binding 欠落は `unavailable`、default model policy の未設定または参照不能は対象 Agent の model execution readiness として `degraded` または `unavailable` に分類 MUST。

Health response は provider、model、policy ref、policy digest、binding presence、last safe smoke result などの安全な metadata を返せる MUST が、provider credential、raw prompt、raw completion、secret、Thread payload、Memory body を返して MUST NOT。

#### Scenario: Health Check が model execution capability を安全に報告する (AGENT-HEALTH-S004)

- **GIVEN** `agent-alpha` が AgentHealthService.Check を受けられる
- **WHEN** Check が `agent-alpha` の Workers AI binding と default model policy readiness を評価する
- **THEN** response は model execution capability を `serving`、`degraded`、または `unavailable` として返す
- **AND** response は policy ref、digest、provider、model などの safe metadata だけを含む
- **AND** provider credential、raw prompt、raw completion、Thread payload、Memory body は返されない
