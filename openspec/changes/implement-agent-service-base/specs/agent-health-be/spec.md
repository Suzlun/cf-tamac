## ADDED Requirements

### Requirement: Protobuf RPC health check

Agent Service SHALL expose health checks through `AgentHealthService.Check` instead of a REST health endpoint.

**Customer Context**

運用者と自動 smoke test は、Agent Service の Connect facade、binary Protobuf contract、AIAgent Durable Object routing が利用可能かを安全に確認したい。REST `/health` を別 API として持つと、Protobuf RPC-only 方針と監査/認証境界が分かれ、実際の Agent RPC 経路の健全性を確認できない。

**Requirement**

- Agent Service MUST define `AgentHealthService.Check(CheckHealthRequest) returns (CheckHealthResponse)` in `packages/agent/src/typespec/src/services/agent-health.tsp`.
- Check requests MUST use Connect + binary Protobuf and MUST include `agent_id` when the check verifies AIAgent routing or Agent-local lifecycle visibility.
- Check responses MUST expose only safe operational fields such as serving status, service version, contract package, checked Agent identity, and dependency status summary.
- Agent Service MUST NOT expose REST `/health`, ad-hoc JSON health, or Browser-direct health APIs as Agent public API.

#### Scenario: Check returns safe serving status through Protobuf RPC (AGENT-HEALTH-BE-S001)

- **GIVEN** Agent Service is deployed and `agent-alpha` can be routed to its AIAgent Durable Object
- **WHEN** an authorized smoke-test or Client Service principal calls `AgentHealthService.Check` with `agent_id = agent-alpha` using binary Protobuf
- **THEN** the response reports serving or degraded status with safe service and contract metadata
- **AND** no Agent credential, private key, raw token, Provider secret, Thread payload, Memory body, or domain snapshot is returned

#### Scenario: REST health endpoint is not an Agent public API (AGENT-HEALTH-BE-S002)

- **GIVEN** Agent Service exposes the Protobuf RPC facade
- **WHEN** a caller sends REST `/health`, Connect JSON, HTTP GET unary, or Browser-direct health requests to the Agent origin
- **THEN** Agent Service does not serve a public REST health response for Agent API behavior
- **AND** production health checks use `AgentHealthService.Check` through the same binary Protobuf enforcement path as other Agent RPCs
