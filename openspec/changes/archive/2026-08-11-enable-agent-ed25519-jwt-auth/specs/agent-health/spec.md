## MODIFIED Requirements

### Requirement: Protobuf RPC 健全性確認の提供

Agent Service は REST health エンドポイントではなく `AgentHealthService.Check` を通じて健全性確認を公開 SHALL。

**利用者文脈**

運用者と自動 smoke test は、Agent Service の Connect facade、binary Protobuf 契約、AIAgent Durable Object routing、Client Service 認証、Agent trust config が利用可能かを安全に確認したい。REST `/health` を別 API として持つと、Protobuf RPC-only 方針と監査/認証境界が分かれ、実際の Agent RPC 経路の健全性を確認できない。

**要件**

- Agent Service は `packages/agent/src/typespec/src/services/agent-health.tsp` で `AgentHealthService.Check(CheckHealthRequest) returns (CheckHealthResponse)` を定義 MUST。
- Check リクエストは Connect + binary Protobuf を使用 MUST し、確認が AIAgent routing または Agent-local ライフサイクル可視性を検証する場合は `agent_id` を含める MUST。
- Check RPC は他の Client Service RPC と同じ Ed25519 JWT bearer authentication、scope validation、`agent_id` 照合、replay protection、audit context を通過 MUST。
- Check 応答は `serving` 状態、service 版、契約 package、確認対象 Agent identity、依存状態要約、trust config version、trust config fingerprint、trust config loadedAt、認証 principal の issuer/kid/fingerprint summary など、安全な運用メタデータ項目だけを公開 MUST。
- Check 応答は Agent credential、秘密鍵、生 token、Provider secret、Thread payload、Memory body、domain スナップショット、public key full value、private JWK、encrypted private JWK を返して MUST NOT。
- Check 応答は認証済み request の issuer/kid/fingerprint が Agent trust config 上で active または retiring として検証済みであることを判定できる診断結果を含める SHALL。
- Unknown issuer、unknown kid、revoked key、fingerprint mismatch、署名不正、audience 不一致、scope 不足、replayed `jti` は通常の Check 応答ではなく、Connect error detail、audit record、metric の安全な failure reason として表現される MUST。
- Agent Service は REST `/health`、ad-hoc JSON health、Browser 直接 health API を Agent 公開 API として公開して MUST NOT。

#### Scenario: Check が Protobuf RPC 経由で安全な serving 状態を返す (AGENT-HEALTH-S001)

- **GIVEN** Agent Service が deploy され、`agent-alpha` が対応する AIAgent Durable Object へ route でき、Client Service JWT が `agent:read` scope を持っている
- **WHEN** 認可済み smoke-test または Client Service principal が binary Protobuf を使い `agent_id = agent-alpha` で `AgentHealthService.Check` を呼ぶ
- **THEN** 応答は安全な service と契約メタデータ、trust config version/fingerprint/loadedAt、issuer/kid/fingerprint summary とともに `serving` または `degraded` 状態を報告する
- **AND** Agent credential、秘密鍵、生 token、Provider secret、Thread payload、Memory body、domain スナップショット、public key full value は返されない

#### Scenario: 公開 REST health endpoint は Agent 公開 API ではない (AGENT-HEALTH-S002)

- **GIVEN** Agent Service が Protobuf RPC facade を公開している
- **WHEN** caller が REST `/health`、Connect JSON、HTTP GET unary、または Browser 直接 health リクエストを Agent origin に送信する
- **THEN** Agent Service は Agent API 振る舞い用の公開 REST health 応答を提供しない
- **AND** 本番の健全性確認は他の Agent RPC と同じ binary Protobuf 強制経路を通じて `AgentHealthService.Check` を使用する

#### Scenario: Check が issuer/kid/fingerprint の trust 状態を診断する (AGENT-HEALTH-S003)

- **GIVEN** Client Service が managed Agent record の issuer/kid/fingerprint で署名した JWT を使っている
- **WHEN** Client Service が `AgentHealthService.Check` を呼ぶ
- **THEN** 応答は提示された issuer/kid/fingerprint が trust config 上で active または retiring として検証済みであることを返す
- **AND** revoked、unknown issuer、unknown kid、fingerprint mismatch は通常の Check 応答ではなく Connect error detail、audit record、metric の安全な failure reason として表現される
- **AND** key material と token body は応答に含まれない

#### Scenario: 認証失敗は Check 応答ではなく安全な Connect error として診断される (AGENT-HEALTH-S005)

- **GIVEN** Client Service request が unknown issuer、unknown kid、revoked key、fingerprint mismatch、署名不正、audience 不一致、scope 不足、または replayed `jti` を持っている
- **WHEN** Client Service が `AgentHealthService.Check` を呼ぶ
- **THEN** Agent Service は通常の `CheckHealthResponse` を返さず、stable Connect error code と安全な error detail を返す
- **AND** audit record と metric は failure reason、issuer/kid/fingerprint などの安全な識別子だけを含む
- **AND** key material、token body、private JWK、encrypted private JWK は error detail、audit record、metric に含まれない
