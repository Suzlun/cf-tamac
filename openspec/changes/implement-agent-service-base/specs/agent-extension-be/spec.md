## ADDED Requirements

### Requirement: Extension manifest and Installation

AIAgent Durable Object SHALL verify Extension manifests before activating Installations.

**Customer Context**

Agent 管理者は、外部 Provider が提供する Adapter、Tool、Delivery capability を Agent に追加したいが、Provider の身元、鍵、grant、schema、version を検証せずに導入すると不正な ingress や外部作用につながる。

**Requirement**

- Extension Installation MUST be owned by one AIAgent Durable Object.
- Extension manifest MUST include extension ID, version, schema version, Provider identity, Provider public signing keys, supported RPC base URL, Adapter definitions, Tool definitions, Delivery definitions, requested grants, and update policy.
- Manifest MUST be signed by the Provider and verified before Installation becomes active.
- Installation state MUST support installing, pending_external_setup, active, disabled, uninstalling, uninstalled, and failed.

#### Scenario: InstallExtension verifies signed manifest before activation (AGENT-EXTENSION-BE-S001)

- **GIVEN** an authorized Client Service principal requests Extension installation with a manifest URL or manifest payload
- **WHEN** AIAgent Durable Object fetches or receives the manifest
- **THEN** it verifies Provider signature, schema version, extension identity, keys, requested grants, and supported RPC profile
- **AND** it rejects the installation without persisting active grants when verification fails

#### Scenario: Successful install persists grants adapters tools delivery and trust keys (AGENT-EXTENSION-BE-S002)

- **GIVEN** a manifest is valid and requested grants are approved by policy
- **WHEN** `InstallExtension` succeeds
- **THEN** the Agent stores Installation record, Provider public keys, grants, Adapter definitions, Tool definitions, Delivery definitions, manifest digest, and setup status
- **AND** an audit Event is appended to the system Thread

#### Scenario: Installation can wait for external setup (AGENT-EXTENSION-BE-S003)

- **GIVEN** an Extension requires Provider-side connection setup before ingress is active
- **WHEN** `InstallExtension` completes Agent-side persistence but external setup is incomplete
- **THEN** the Installation state is `pending_external_setup`
- **AND** ingress, Tool, or Delivery capability is enabled only for grants that are valid in that state
- **AND** the Client can query setup instructions without exposing secret material

### Requirement: Adapter Connection and Extension ingress

AIAgent Durable Object SHALL manage Adapter Connections and signed Extension ingress per Installation.

**Customer Context**

Extension Provider は外部 platform protocol を AgentEvent に変換する ingress capability を持つ。Agent は Connection ごとの grant、signature、nonce、thread_key、DeliveryContext を検証し、Provider からの Event を正しい Thread に受け入れる必要がある。

**Requirement**

- AdapterConnection は active Extension Installation と一つの Agent に所属 MUST。
- Adapter Connection の作成、削除、一覧取得は `AgentExtensionService.CreateAdapterConnection`、`DeleteAdapterConnection`、`ListAdapterConnections` として `packages/agent/src/typespec/src/services/agent-extension.tsp` から公開され、Agent-scoped であり、Client Service scope により認可される MUST。
- `packages/agent/src/typespec/src/services/agent-adapter.tsp` は Agent TypeSpec service tree に存在 MUST し、`ExtensionIngressService.PublishEvent`、`PublishToolResult`、`PublishDeliveryResult` を定義 MUST。
- `packages/agent/src/typespec/src/services/agent-adapter.tsp` は Adapter Connection 管理、Connection 個別取得、または Agent-facing Adapter 管理用の別 service を定義 MUST NOT。
- ExtensionIngressService は valid detached signature、timestamp、nonce、idempotency、body digest、grant、connection ownership を持つ active Extension Installation principals からの requests のみ受理 MUST。
- Extension ingress Events は valid `thread_key` を含むか導出 MUST し、ingress protocol が response delivery をサポートする場合は DeliveryContext を作成 MAY。

#### Scenario: Adapter Connection lifecycle is Agent-local (AGENT-EXTENSION-BE-S004)

- **GIVEN** Installation `inst-1` が active で Adapter definition を提供している
- **WHEN** authorized principal が `AgentExtensionService.CreateAdapterConnection`、`ListAdapterConnections`、`DeleteAdapterConnection` を呼び、`inst-1` の Adapter Connection を作成、一覧取得、削除する
- **THEN** Connection state は target Agent 内だけで変更される
- **AND** list responses は他の Agents または Installations の Connections を露出しない
- **AND** 削除後、その Connection からの future ingress は無効化される

#### Scenario: Signed extension ingress appends Event and DeliveryContext (AGENT-EXTENSION-BE-S005)

- **GIVEN** active Installation `inst-1` has Connection `conn-1` with ingress grant
- **WHEN** the Provider calls `ExtensionIngressService.PublishEvent` with valid signature, nonce, body digest, idempotency key, and `thread_key`
- **THEN** AIAgent Durable Object accepts the Event into the resolved Thread
- **AND** creates DeliveryContext when delivery metadata is included
- **AND** coalesces pending Run work for the Thread

### Requirement: Delivery interoperability

Delivery interoperability SHALL bind Provider responses to prior ingress DeliveryContext.

**Customer Context**

Adapter ingress に対する応答は、元の platform context へ返る必要がある。一方で、元 ingress と無関係な外向き送信は Tool で扱う必要がある。Delivery と Tool の境界が明確でないと、権限と監査が曖昧になる。

**Requirement**

- DeliveryContext MUST represent a response capability tied to a prior ingress Event and Adapter Connection.
- Agent API TypeSpec MUST define the Provider-facing `ExtensionDeliveryService` in `packages/agent/src/typespec/src/services/extension-delivery.tsp` or an equivalent service module, with unary `Deliver` method.
- Agent-to-Provider Delivery RPC MUST use signed Connect + binary Protobuf and MUST include Agent, Installation, Connection, DeliveryContext, timestamp, nonce, idempotency key, and raw body digest in the signature base.
- AIAgent Durable Object MUST call Delivery Providers through generated Protobuf client descriptors, not through raw ad-hoc JSON or REST requests.
- AIAgent Durable Object MUST distinguish Delivery responses from proactive outbound actions, which MUST be modeled as ToolInvocations.
- Delivery result callbacks MUST be authenticated as Extension Installation principal and tied to the original DeliveryContext.

#### Scenario: Agent sends Delivery response through Provider RPC (AGENT-EXTENSION-BE-S006)

- **GIVEN** a Run decides to respond to an ingress Event that has DeliveryContext `deliv-1`
- **WHEN** AIAgent Durable Object performs the delivery
- **THEN** it sends `ExtensionDeliveryService.Deliver` as a signed binary Protobuf RPC through the generated Provider client
- **AND** records AdapterDelivery status, request digest, and causal Run/Event links
- **AND** later Delivery result callback updates the same DeliveryContext

### Requirement: Uninstall cleanup and provider-generic boundary

Uninstall cleanup SHALL disable Extension capabilities while preserving trace history.

**Customer Context**

Extension を外すとき、ingress、Tool、Schedule、Delivery、trust key が残ると不要な外部入力や作用が発生する。Agent 側は Discord など特定 Provider 実装に依存せず、generic な Extension protocol 境界で相互運用できる必要がある。

**Requirement**

- UninstallExtension MUST transition through uninstalling and MUST disable ingress, Adapter Connections, Extension Tools, pending ToolInvocations, Extension-owned Schedules, DeliveryContexts, trust keys, and grants before marking Installation uninstalled.
- Uninstall MUST preserve Events, History, ToolInvocation records, Compactions, and audit records for traceability.
- Agent Service MUST define generic Extension, Adapter, Tool, and Delivery interoperability and MUST NOT require a Discord-specific Provider implementation to satisfy Agent-side Extension behavior.

#### Scenario: UninstallExtension disables capabilities and preserves history (AGENT-EXTENSION-BE-S007)

- **GIVEN** Installation `inst-1` has active Adapter Connections, Tools, Schedules, pending ToolInvocations, and DeliveryContexts
- **WHEN** an authorized principal calls `UninstallExtension`
- **THEN** ingress is rejected, Connections are disabled, Tools are unavailable, associated Schedules are cancelled, pending ToolInvocations are cancelled or marked outcome_unknown, DeliveryContexts are revoked, and trust keys are revoked
- **AND** existing Events, History, ToolInvocation records, and audit Events remain queryable

#### Scenario: Generic Extension Provider works without Discord-specific code (AGENT-EXTENSION-BE-S008)

- **GIVEN** a Provider implements the generic manifest, ingress, Tool, and Delivery RPC contracts
- **WHEN** it installs into an Agent and publishes Events through a valid Adapter Connection
- **THEN** Agent Service accepts and processes the generic Extension interactions using the same signature, grant, Thread, Tool, and Delivery rules
- **AND** no Discord-specific Provider package or platform payload parser is required inside Agent Service
