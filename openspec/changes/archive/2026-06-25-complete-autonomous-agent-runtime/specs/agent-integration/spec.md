## ADDED Requirements

### Requirement: Integration model policy grants and delivery resume

Integration ingress と Delivery result は policy grant と waiting resume 境界を検証 MUST。

**Customer Context**

Integration Provider は外部 Event と Delivery result を Agent に渡すが、Provider が任意の model policy を選べると費用、能力、data residency、権限境界を迂回できる。Delivery 待ちの Run は、結果到着後に deterministic に進む必要がある。

**Requirement**

Integration Installation、Adapter definition、Adapter Connection は、Event-scoped model policy override を許可する場合、Agent-owned model policy ref の allowlist を保持 SHALL。Allowlist は raw provider/model ID や credential ではなく policy ref だけを含む MUST。

`IntegrationIngressService.PublishEvent` は requested model policy ref が Installation/Adapter/Connection の allowlist と Agent-owned active policy repository の両方を満たす場合だけ受理 MUST。Grant 外または無効な ref は Event acceptance 前に拒否 MUST。

Delivery result callback は DeliveryContext、Run ID、decision ID、Connection、Installation、idempotency key、signature、generation を検証 SHALL。Delivery 待ち Run は result により resume、terminal failure、または follow-up Event creation の定義済み path に分類 MUST。

#### Scenario: Integration ingress は allowlist 内の policy override だけを受理する (AGENT-INTEGRATION-S009)

- **GIVEN** Installation `inst-1` の Connection `conn-1` が `policy-default` と `policy-fast` を allowlist に持っている
- **WHEN** Provider が `policy-fast` を指定して signed ingress Event を publish する
- **THEN** Event は `policy-fast` の requested ref と safe metadata を持って受理される
- **WHEN** Provider が allowlist 外の `policy-expensive` を指定する
- **THEN** Event acceptance は状態変更前に拒否される

#### Scenario: Delivery result が waiting Run の扱いを deterministic に決める (AGENT-INTEGRATION-S010)

- **GIVEN** Run `run-1` が DeliveryContext `deliv-1` の Provider result を待っている
- **WHEN** Provider が signed `PublishDeliveryResult` callback を送信する
- **THEN** AIAgent Durable Object は signature、DeliveryContext、Connection、Run generation、idempotency を検証する
- **AND** result は policy に従って `run-1` の resume、terminal failure、または follow-up Event creation のいずれかに分類される
- **AND** stale または duplicate callback は追加 side effect なしで記録される
