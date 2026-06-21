## ADDED Requirements

### Requirement: Tool definitions and availability

AIAgent Durable Object SHALL maintain a versioned Agent-local Tool catalog.

**Customer Context**

Agent は外界へ作用するために Tool を呼ぶが、どの Tool が使えるか、どの入力/出力 schema を持つか、承認が必要かを実行時に説明できなければならない。Extension が Tool を追加しても Agent の所有境界と authorization が崩れてはならない。

**Requirement**

- AIAgent Durable Object MUST own the enabled ToolDefinition catalog for each Agent.
- ToolDefinition MUST include stable ID, version, display name, description, input schema, output schema, approval default, optional `installation_id`, and RPC target.
- Tool availability MUST be versioned so AgentRun snapshots can record the Tool set used during decision making.
- Disabled, revoked, or uninstalled Extension Tools MUST NOT be invokable by new Runs.

#### Scenario: ListTools returns the Agent-local available Tool catalog (AGENT-TOOL-BE-S001)

- **GIVEN** an Agent has built-in Tools and active Extension-provided Tools
- **WHEN** an authorized Client Service principal calls `ListTools`
- **THEN** the response returns Tool definitions available to that Agent with version, approval policy, installation ownership, and target metadata
- **AND** Tools from disabled or uninstalled Installations are excluded or explicitly marked unavailable according to query options

#### Scenario: Disabled Extension Tool cannot be invoked by a new Run (AGENT-TOOL-BE-S002)

- **GIVEN** Tool `calendar.create_event` belongs to Extension Installation `inst-1`
- **WHEN** `inst-1` is disabled or uninstalled before a new Run starts
- **THEN** the Tool is absent from the Run's available Tool set snapshot
- **AND** any attempt to invoke it is rejected with a capability precondition error

### Requirement: ToolInvocation lifecycle and approval

ToolInvocation SHALL track lifecycle, ownership, approval, and audit state.

**Customer Context**

Tool は外部 system に作用するため、実行状態、承認、入力/出力、再試行、失敗理由を追跡できる必要がある。人間の承認が必要な Tool は、明示的な承認なしに実行されてはならない。

**Requirement**

- ToolInvocation MUST belong to one Agent, Thread, and Run.
- ToolInvocation MUST track lifecycle states proposed, pending_approval, approved, running, succeeded, failed, outcome_unknown, and cancelled.
- ToolInvocation MUST include Tool ID, installation ID when applicable, idempotency key, input/output reference, status, approval record, attempt count, timestamps, and causal Event/Run links.
- Approval and rejection commands MUST require authorized Client Service scope and MUST be recorded as audit Events.

#### Scenario: Approval-required ToolInvocation waits before execution (AGENT-TOOL-BE-S003)

- **GIVEN** a Run decides to invoke a Tool whose definition requires approval by default
- **WHEN** the ToolInvocation is created
- **THEN** its status becomes `pending_approval`
- **AND** no Provider RPC is sent until an authorized approval is recorded
- **AND** the pending approval is visible through ToolInvocation query RPCs

#### Scenario: Authorized approval transitions ToolInvocation state (AGENT-TOOL-BE-S004)

- **GIVEN** a ToolInvocation is `pending_approval`
- **WHEN** an authorized Client Service principal calls `ApproveInvocation`
- **THEN** the approval record captures actor, timestamp, decision, and optional rationale
- **AND** the ToolInvocation transitions to `approved` and becomes eligible for execution
- **AND** unauthorized approval or rejection attempts are denied without changing state

### Requirement: Signed Tool Provider RPC

Agent-to-Provider Tool calls SHALL use signed Protobuf RPC metadata.

**Customer Context**

Extension Provider が Tool を実装する場合、Agent から Provider への呼び出しも改ざん・なりすまし・replay を防ぐ必要がある。Provider は Agent が発行した正当な ToolInvocation であることを検証できなければならない。

**Requirement**

- Agent-to-Provider Tool requests MUST use Protobuf RPC with Connect + binary Protobuf as the mandatory profile.
- Agent API TypeSpec MUST define the Provider-facing `ExtensionToolService` in `packages/agent/src/typespec/src/services/extension-tool.tsp` or an equivalent service module, with unary `InvokeTool`, `GetOperation`, and `CancelOperation` methods.
- AIAgent Durable Object MUST call Extension Tool Providers through generated Protobuf client descriptors, not through raw ad-hoc JSON or REST requests.
- Tool Provider RPC requests MUST be signed by Agent-controlled signing material and MUST include service, method, `agent_id`, `installation_id`, `tool_id`, `invocation_id`, timestamp, nonce, idempotency key, and raw protobuf body digest in the signature base.
- AIAgent Durable Object MUST store outgoing request digest, nonce, attempt, Provider operation ID when present, and timeout/retry policy.
- Tool Provider responses MUST be validated against expected invocation identity before committing result state.

#### Scenario: Agent invokes Extension Tool with signed binary Protobuf RPC (AGENT-TOOL-BE-S005)

- **GIVEN** an approved ToolInvocation targets an Extension Provider Tool endpoint
- **WHEN** AIAgent Durable Object executes the invocation
- **THEN** it sends `ExtensionToolService.InvokeTool` as a Connect unary RPC encoded as binary Protobuf through the generated Provider client
- **AND** the request includes signature metadata covering invocation identity and raw body digest
- **AND** the outgoing attempt is recorded with digest, nonce, and Provider target

### Requirement: Tool results and reconciliation

Tool results SHALL return to the originating Thread and support reconciliation.

**Customer Context**

Tool の結果は Agent の次の判断に入る Event でなければならない。外部 timeout で結果が不明な場合も、同一 invocation identity で後から照会・収束できる必要がある。

**Requirement**

- Tool success or failure MUST append a `tool.invocation.succeeded` or `tool.invocation.failed` AgentEvent to the same Thread as the ToolInvocation.
- Tool result payloads MUST be stored inline or by immutable R2 reference with digest metadata according to size threshold.
- If external execution outcome is unknown after timeout or ambiguous failure, ToolInvocation MUST enter `outcome_unknown` and MUST support Provider operation reconciliation through `ExtensionToolService.GetOperation`.
- Cancellation of a running or unknown Provider operation MUST call `ExtensionToolService.CancelOperation` when the Provider operation identity is known and the Tool definition permits cancellation.
- Reconciliation MUST NOT create duplicate success/failure Events for the same invocation outcome.

#### Scenario: Tool result Event returns to the same Thread (AGENT-TOOL-BE-S006)

- **GIVEN** ToolInvocation `inv-1` belongs to Thread A and Run `run-1`
- **WHEN** the Provider returns a successful result
- **THEN** ToolInvocation `inv-1` becomes `succeeded`
- **AND** a `tool.invocation.succeeded` AgentEvent is appended to Thread A with causal link to `run-1` and `inv-1`
- **AND** pending Run work is created or coalesced for the result Event

#### Scenario: Unknown Tool outcome is reconciled by operation status (AGENT-TOOL-BE-S007)

- **GIVEN** a Tool Provider RPC times out after the Provider may have accepted the operation
- **WHEN** AIAgent Durable Object cannot determine the outcome from the RPC response
- **THEN** the ToolInvocation becomes `outcome_unknown`
- **AND** reconciliation calls `ExtensionToolService.GetOperation` using the same invocation identity and Provider operation ID when present
- **AND** the final succeeded, failed, or cancelled status is committed once without duplicate result Events

#### Scenario: Tool cancellation propagates to Provider operation (AGENT-TOOL-BE-S008)

- **GIVEN** ToolInvocation `inv-2` has a running Provider operation that supports cancellation
- **WHEN** an authorized cancellation or interrupt policy cancels `inv-2`
- **THEN** AIAgent Durable Object calls `ExtensionToolService.CancelOperation` through the generated Provider client with signed binary Protobuf metadata
- **AND** the ToolInvocation records the cancellation attempt, Provider operation identity, and final cancelled or outcome_unknown status without appending duplicate result Events
