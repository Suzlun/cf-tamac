## ADDED Requirements

### Requirement: Principal authentication

Agent Service SHALL authenticate each RPC caller as a supported principal type.

**Customer Context**

Agent API は Client Service、Extension Installation、Internal Service、Admin Operator など複数の主体から呼ばれる。Browser user を直接 Agent principal にせず、server-side service identity と acting user 情報で監査できる必要がある。

**Requirement**

- Agent Service MUST authenticate Client Service requests using short-lived JWT or equivalent application-level credentials with issuer, subject, JWT ID, audience, expiry, not-before, `agent_id`, scopes, and acting user identity.
- Agent Service MUST authenticate Extension Provider requests as Extension Installation principals using detached signatures unless a narrower internal trust profile is explicitly configured.
- Browser sessions MUST NOT be accepted as direct Agent principals.
- Authentication metadata MUST be bound to the decoded request and raw body digest forwarded to AIAgent Durable Object for final authorization.

#### Scenario: Valid Client Service JWT authenticates Agent RPC (AGENT-SECURITY-BE-S001)

- **GIVEN** Client Service holds an active credential for `agent-alpha`
- **WHEN** it calls a permitted Agent RPC with a valid short-lived JWT containing required claims and scopes
- **THEN** the RPC facade authenticates the Client Service principal
- **AND** passes principal, acting user, claims, and raw body digest context to AIAgent Durable Object

#### Scenario: Invalid Client JWT is rejected before mutation (AGENT-SECURITY-BE-S002)

- **GIVEN** a request has an expired token, not-yet-valid token, wrong audience, wrong `agent_id`, missing scope, or revoked key ID
- **WHEN** it calls a mutating Agent RPC
- **THEN** Agent Service rejects the request as unauthenticated or permission denied according to error taxonomy
- **AND** no Agent-owned state is mutated

### Requirement: Extension detached signature and replay protection

Extension requests SHALL be protected by detached signature, nonce, and idempotency checks.

**Customer Context**

Extension Provider からの ingress、Tool result、Delivery result は外部 network 経由で届くため、body 改ざん、nonce replay、idempotency replay、key rotation の不整合を防ぐ必要がある。

**Requirement**

- Extension signature base MUST include RPC service, RPC method, `agent_id`, `installation_id`, `connection_id` when applicable, timestamp, nonce, idempotency key, and SHA-256 digest of the raw protobuf request body.
- AIAgent Durable Object MUST verify timestamp window, nonce uniqueness, key status, Installation status, requested RPC grant, idempotency key, and body digest.
- Nonces MUST be stored with TTL per principal and MUST be rejected on replay.
- Same idempotency key with the same body digest MUST replay the recorded result, while the same key with a different body digest MUST be rejected.

#### Scenario: Valid Extension signature accepts ingress within grant (AGENT-SECURITY-BE-S003)

- **GIVEN** active Installation `inst-1` has Provider public key `key-1` and ingress grant for Connection `conn-1`
- **WHEN** the Provider calls an ingress RPC with valid timestamp, nonce, idempotency key, raw body digest, and detached signature
- **THEN** AIAgent Durable Object verifies the signature and grant
- **AND** the command proceeds to Event acceptance or result handling according to the RPC method

#### Scenario: Body tampering and nonce replay are rejected (AGENT-SECURITY-BE-S004)

- **GIVEN** a Provider request was signed for a specific raw protobuf body and nonce
- **WHEN** the body bytes are changed or the same nonce is reused
- **THEN** Agent Service rejects the request before state mutation
- **AND** the rejection is auditable without logging secret key material or full signature base containing sensitive values

### Requirement: Agent-local final authorization

AIAgent Durable Object SHALL perform final authorization using Agent-local state.

**Customer Context**

RPC facade の認証成功だけでは、Agent の lifecycle、Installation status、grant、connection ownership、Tool capability、nonce/idempotency の状態は確定しない。最終判断は Agent-owned state を知る AIAgent Durable Object で行う必要がある。

**Requirement**

- AIAgent Durable Object MUST perform final authorization for every command and sensitive query.
- Final authorization MUST check target Agent ID, lifecycle status, credential status, principal type, scopes/grants, Installation status, connection ownership, Tool/Adapter capability, nonce/idempotency, and requested operation.
- Durable Object RPC methods MUST be Worker-internal calls from the Agent RPC facade to AIAgent Durable Object and MUST NOT be exposed as public fetch routes, public REST endpoints, or Browser-callable APIs.
- Extension Installation principals MUST NOT call Agent config, install/uninstall, credential rotation, or Tool approval RPCs.
- Authorization denial MUST leave Agent-owned state unchanged except for permitted audit/security metrics.

#### Scenario: Method outside Extension grant is denied by AIAgent (AGENT-SECURITY-BE-S005)

- **GIVEN** an Extension Installation principal has only ingress grant
- **WHEN** it calls Agent config, Extension install/uninstall, Schedule management, Thread query, or Tool approval RPC
- **THEN** AIAgent Durable Object denies the request with permission denied
- **AND** no config, installation, schedule, query result, or approval state is produced for that principal

#### Scenario: Idempotency replay preserves exactly-once command result (AGENT-SECURITY-BE-S006)

- **GIVEN** a mutating command succeeded with principal `p-1`, idempotency key `idem-1`, and body digest `digest-a`
- **WHEN** `p-1` repeats the command with `idem-1` and `digest-a`
- **THEN** the recorded response is returned without duplicate mutation
- **AND** a repeat with `idem-1` and `digest-b` is rejected as a conflict

#### Scenario: Durable Object RPC stays behind the Connect facade (AGENT-SECURITY-BE-S009)

- **GIVEN** AIAgent Durable Object exposes Worker-internal methods for lifecycle, Event, Run, Schedule, Tool, Extension, and health operations
- **WHEN** an external caller, Browser, or Provider attempts to call those Durable Object methods without the Agent Connect RPC facade
- **THEN** no public route exposes the Durable Object RPC method directly
- **AND** all external Agent operations pass through Connect binary Protobuf authentication, validation, replay protection, and final authorization before AIAgent state is reached

### Requirement: Connect error mapping and observability

Agent Service SHALL map domain errors and observability context without leaking secrets.

**Customer Context**

Client と Provider は、失敗を retry すべきか、入力を直すべきか、認可を確認すべきかを Connect code で判断する。運用者は agent/thread/run/tool/installation 単位で問題を追跡できる必要があるが、秘密値はログに出してはならない。

**Requirement**

- Domain errors MUST map to stable Connect codes including invalid_argument, unauthenticated, permission_denied, not_found, already_exists or idempotent success, failed_precondition, aborted, resource_exhausted, unavailable, deadline_exceeded, and internal.
- Logs, metrics, and audit Events MUST include safe context such as agent_id, thread_id or thread_key hash, event_id, run_id, compaction_id, tool_invocation_id, installation_id, adapter_connection_id, RPC service/method, principal, request ID, idempotency key, correlation ID, and causation ID.
- Secrets, raw tokens, private keys, full signature base with sensitive values, and raw Provider credentials MUST NOT be logged or returned to Browser clients.
- Rate limit and security rejection metrics MUST be observable by method and principal type.

#### Scenario: Domain errors map to stable Connect codes (AGENT-SECURITY-BE-S007)

- **GIVEN** Agent domain operations produce validation, authentication, authorization, not-found, conflict, precondition, concurrency, rate limit, provider timeout, or internal errors
- **WHEN** the RPC facade returns the error to a caller
- **THEN** each error is mapped to the configured Connect code and safe error detail
- **AND** retryable and non-retryable categories are distinguishable by clients

#### Scenario: Observability context excludes secret material (AGENT-SECURITY-BE-S008)

- **GIVEN** a Client Service or Extension Provider RPC succeeds or fails
- **WHEN** logs, metrics, and audit records are emitted
- **THEN** they include safe correlation fields for troubleshooting
- **AND** they do not include raw token, private key, raw shared secret, full Provider credential, or unredacted signature material
