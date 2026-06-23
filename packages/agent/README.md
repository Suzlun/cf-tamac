# Agent Service runbook

`packages/agent` is the Cloudflare Worker that exposes the Agent public API as Connect unary binary Protobuf RPC and routes each `agent_id` to one `AIAgent` Durable Object. It owns `AI_AGENT`, Agent-owned blob storage, DO SQLite state, Agent-local Queue wake/coalescing, and Stage 1-7 Agent domain behavior. It does not expose Agent REST, OpenAPI, Orval, ad-hoc JSON, browser-direct RPC, or public Durable Object APIs.

## Stage 1-8 generated outputs

- Source of truth: `src/typespec/main.tsp` and imported TypeSpec modules.
- Command-owned outputs: `proto/**`, `src/generated/rpc/**`, and the Client descriptors in `../client/src/generated/agent-rpc/**`.
- Regenerate after contract changes from the repository root:
  ```bash
  pnpm gen:agent:proto
  pnpm gen:agent:rpc
  pnpm check:codegen
  ```
- Do not hand-edit generated proto or RPC descriptor files. Stage 1 contract changes must flow TypeSpec -> proto -> generated RPC before Stage 2-8 implementation or smoke testing.

## Local development

```bash
corepack enable
pnpm install
pnpm dev:agent
```

Useful local checks:

```bash
pnpm check:agent
pnpm test:agent
pnpm lint
```

The local Worker should be exercised through generated Connect clients using `POST` with `Content-Type: application/proto`; JSON and GET are expected to fail closed.

## Secret handling

- Configure non-secret local defaults in `wrangler.toml` only.
- Provision secrets with `wrangler secret put --config packages/agent/wrangler.toml <NAME>`; never commit secret values.
- Required secret references today are documented in `wrangler.toml`: `AGENT_CLIENT_JWT_PUBLIC_KEYS`, `AGENT_INTEGRATION_SIGNATURE_KEYS`, and `AGENT_MODEL_PROVIDER_SECRET_REFS`.
- Logs, audit records, and smoke output must redact raw tokens, private keys, Provider credentials, and complete signature bases.

## Deployment notes

- Deploy the Agent Worker with `packages/agent/wrangler.toml`; keep `AI_AGENT` and Agent-owned blob storage as the only stateful product bindings.
- After deployment, run smoke checks with generated Protobuf RPC clients instead of REST, JSON, OpenAPI, Orval, or public Durable Object probes.

## Provider interop profile

Stage 1-8 Provider interoperability is generic. Integration Providers call Agent ingress through signed Connect unary binary Protobuf (`IntegrationIngressService`) with `agent_id`, installation/connection metadata, timestamp, nonce, idempotency key, and raw protobuf body digest. Agent-to-Provider Tool and Delivery calls use generated Provider-facing Protobuf clients (`IntegrationToolService`, `IntegrationDeliveryService`) with the same binary profile and detached-signature discipline. Discord-specific Provider implementation is Stage 9 and is not part of this package runbook.

## Staging smoke checklist

After deploy to staging, use generated Protobuf RPC clients and secret-safe fixtures to verify:

1. `AgentHealthService.Check` returns safe serving/degraded metadata.
2. `InitializeAgent`, `GetAgent`, `GetState`, and `GetConfig` stay scoped to the target `agent_id`.
3. `PublishEvent` accepts a valid `thread_key`, persists before scheduler wake, and rejects JSON/GET/manual REST probes.
4. Thread, Run, Compaction/Memory, Schedule, Tool, and Integration RPCs return Agent-owned data only.
5. Provider ingress, Tool, and Delivery smoke calls use signed binary Protobuf and reject replay or tampered-body attempts.
