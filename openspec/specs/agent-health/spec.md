# agent-health Specification

## Purpose

TBD - created by archiving change implement-agent-service-base. Update Purpose after archive.

## Requirements

### Requirement: Protobuf RPC 健全性確認の提供

Agent Service は REST health エンドポイントではなく `AgentHealthService.Check` を通じて健全性確認を公開 SHALL。

**利用者文脈**

運用者と自動 smoke test は、Agent Service の Connect facade、binary Protobuf 契約、AIAgent Durable Object routing が利用可能かを安全に確認したい。REST `/health` を別 API として持つと、Protobuf RPC-only 方針と監査/認証境界が分かれ、実際の Agent RPC 経路の健全性を確認できない。

**要件**

- Agent Service は `packages/agent/src/typespec/src/services/agent-health.tsp` で `AgentHealthService.Check(CheckHealthRequest) returns (CheckHealthResponse)` を定義 MUST。
- Check リクエストは Connect + binary Protobuf を使用 MUST し、確認が AIAgent routing または Agent-local ライフサイクル可視性を検証する場合は `agent_id` を含める MUST。
- Check 応答は `serving` 状態、service 版、契約 package、確認対象 Agent identity、依存状態要約など、安全な運用メタデータ項目だけを公開 MUST。
- Agent Service は REST `/health`、ad-hoc JSON health、Browser 直接 health API を Agent 公開 API として公開して MUST NOT。

#### Scenario: Check が Protobuf RPC 経由で安全な serving 状態を返す (AGENT-HEALTH-S001)

- **GIVEN** Agent Service が deploy され、`agent-alpha` が対応する AIAgent Durable Object へ route できる
- **WHEN** 認可済み smoke-test または Client Service principal が binary Protobuf を使い `agent_id = agent-alpha` で `AgentHealthService.Check` を呼ぶ
- **THEN** 応答は安全な service と契約メタデータとともに `serving` または `degraded` 状態を報告する
- **AND** Agent credential、秘密鍵、生 token、Provider secret、Thread payload、Memory body、domain スナップショットは返されない

#### Scenario: REST health エンドポイントは Agent 公開 API ではない (AGENT-HEALTH-S002)

- **GIVEN** Agent Service が Protobuf RPC facade を公開している
- **WHEN** caller が REST `/health`、Connect JSON、HTTP GET unary、または Browser 直接 health リクエストを Agent origin に送信する
- **THEN** Agent Service は Agent API 振る舞い用の公開 REST health 応答を提供しない
- **AND** 本番の健全性確認は他の Agent RPC と同じ binary Protobuf 強制経路を通じて `AgentHealthService.Check` を使用する

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
