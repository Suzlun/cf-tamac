## ADDED Requirements

### Requirement: Model execution binding and model policy RPC inventory

Agent platform は Workers AI binding と model policy RPC inventory を Protobuf RPC-only 境界で扱う MUST。

**Customer Context**

Agent Service の利用者は、Cloudflare Workers 上の同じ Protobuf RPC-only 境界から model policy 管理と model execution readiness を扱いたい。Workers AI capability が任意の env fallback や JSON route に分岐すると、運用、監査、security boundary が分裂する。

**Requirement**

Agent Worker configuration は `AI_AGENT` Durable Object binding と Agent-owned blob storage bindings に加えて、model execution capability として Workers AI `AI` binding を定義 SHALL。Agent Worker は `CLIENT_DB`、Agent-cross D1、Cloudflare Queues producer/consumer bindings を定義して MUST NOT。

Agent TypeSpec source tree と generated proto/RPC descriptors は `AgentModelPolicyService` を public Agent RPC inventory に含む SHALL。`AgentModelPolicyService` は generated Protobuf RPC service と binary Connect transport だけで公開 MUST。Agent Service は model policy REST route、OpenAPI model policy artifact、Orval-generated Agent model policy client、ad-hoc JSON model policy API を公開して MUST NOT。

Production Agent RPC は model policy methods と health/model execution diagnostics についても `POST` と `Content-Type: application/proto` を要求 MUST。Unmapped generated methods、missing handler、unsupported content type は fail closed MUST。

#### Scenario: Agent Worker bindings include Workers AI and exclude Client storage (AGENT-PLATFORM-S015)

- **GIVEN** Agent Worker configuration を検査できる
- **WHEN** bindings を列挙する
- **THEN** configuration は `AI_AGENT` Durable Object binding、Agent-owned blob storage bindings、Workers AI `AI` binding を含む
- **AND** `CLIENT_DB`、Agent-cross D1 binding、Cloudflare Queues producer/consumer binding を含まない

#### Scenario: AgentModelPolicyService is generated as Protobuf RPC only (AGENT-PLATFORM-S016)

- **GIVEN** Agent TypeSpec project と generated descriptors が利用できる
- **WHEN** RPC Service Inventory、router registration、public output artifacts を検査する
- **THEN** `AgentModelPolicyService` は generated proto と Protobuf-ES descriptors に存在する
- **AND** service methods は binary Connect router でだけ公開される
- **AND** REST、OpenAPI、Orval、ad-hoc JSON の Agent model policy surface は存在しない
