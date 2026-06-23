# Release notes: implement-agent-service-base

## Agent RPC profile

- Agent public API is Protobuf RPC-only, generated from `packages/agent/src/typespec/main.tsp` into `packages/agent/proto/**`, `packages/agent/src/generated/rpc/**`, and `packages/client/src/generated/agent-rpc/**`.
- The supported production transport profile is Connect unary binary Protobuf. REST resources, OpenAPI/Orval Agent clients, ad-hoc JSON DTO APIs, browser-direct Agent RPC, and public Durable Object fetch surfaces remain outside the Agent boundary.
- Every public Agent operation remains scoped by `agent_id`; command-style requests keep idempotency metadata, and external Event ingress keeps validated `thread_key` identity.

## Client management setup

- Management Client runs as a Next.js Cloudflare Worker and owns only Client D1 registry data plus credential references.
- Browser-visible code must not contain Agent credentials, raw signing material, Agent RPC client construction, direct Agent RPC calls, or Agent proxy routes.
- Client D1 migrations must be applied before local/staging smoke that renders registry-backed pages; otherwise registry pages fail because `client_managed_agents` and credential-reference tables are absent.

## Integration Provider interoperability

- Generic Integration Provider interop uses signed Connect binary Protobuf for ingress, Tool Provider RPC, and Delivery Provider RPC.
- Provider-specific protocol details remain outside Agent domain state; Agent stores normalized Integration, Adapter Connection, Tool, DeliveryContext, and grant metadata.
- Replay protection, nonce/idempotency checks, detached body digest verification, and safe audit fields are required for Provider calls.

## Operational metrics and observability

- Safe observability context includes agent, thread, event, run, compaction, tool invocation, installation, adapter connection, service/method, principal, request, idempotency, correlation, and causation identifiers.
- Logs, metrics, audit records, and UI errors must exclude raw tokens, private keys, shared secrets, Provider credentials, full signature bases, and unredacted internal stacks.
- Health checks use `AgentHealthService.Check` through the same binary Protobuf RPC boundary rather than REST `/health`.

## Rollback steps

- Roll back Agent and Client Workers together when the generated RPC contract or Client server-side RPC usage changes.
- Re-run `pnpm gen:agent:proto`, `pnpm gen:agent:rpc`, and `pnpm check:codegen` after any contract rollback to verify generated artifacts match TypeSpec.
- Preserve Client D1 ownership: rollback must not copy Agent-domain snapshots into Client D1 or expose Agent operations through `/api` proxy routes.
- Re-run `pnpm lint`, `pnpm check`, focused Agent/Client tests, `pnpm test:run`, and `pnpm build` before declaring rollback readiness.

## External protocol boundary

- Discord, Slack, Email, Webhook, or other external protocol differences are normalized by Integration Providers before entering Agent RPC.
- Agent domain receives only normalized Event, Tool, Delivery, Installation, Adapter Connection, and grant records.
- New external protocol behavior requires its own OpenSpec change when it changes Agent-facing contracts, authorization, storage, or Client management behavior.
