# Preflight Apply Memo: implement-agent-service-base

## Result

- Foundation dependency check: pass for preflight. Archived foundation tasks are complete, and current workspace entrypoints show `packages/agent`, `packages/client`, Agent TypeSpec-to-proto/RPC generation, Connect facade, Client D1, and guardrails are present.
- Active legacy graph check: pass for preflight. `packages/typespec`, `packages/frontend`, and `packages/backend` are absent from the active workspace glob; grep hits for OpenAPI/Orval/Hono/REST health/proxy are negative guidance, tests, governance fixtures, or current Connect health modules, not active legacy Agent surfaces.
- Scope boundary: no Stage 1+ functional implementation was performed in this batch.

## Stage 1-8 implementation order

1. Stage 1: Protobuf contract and Connect RPC facade first, including TypeSpec source, generated proto/RPC outputs by command, binary-only adapter, fail-closed routing, health RPC, and interceptors.
2. Cross-cutting security/observability/error handling before domain mutation behavior: Client JWT, Integration signature/replay/idempotency, final authorization seams, Connect error mapping, audit, metrics, and Provider signature metadata.
3. Stage 2: AIAgent lifecycle, credentials/grants, Thread/Section/Event, Mailbox semantics, idempotency/replay storage, final authorization, and Agent-local Queue wake/coalescing.
4. Stage 3: Run scheduler, immutable Run snapshots, Context Builder, interrupt/generation checks, harness decisions, and budget enforcement.
5. Stage 4: Compaction, Handoff, History, ThreadMemory/AgentMemory, R2 offload, storage thresholds, and Memory rebase.
6. Stage 5: Agent-owned Schedule with Thread-scoped trigger Events, overlap/idempotency, cancellation, and Integration cleanup.
7. Stage 6: Tool definitions, ToolInvocation lifecycle, approval, signed Provider Tool RPC, result Events, reconciliation, and cancellation propagation.
8. Stage 7: generic Integration manifest/Installation, Adapter Connection, IntegrationIngressService, DeliveryContext/Delivery RPC, uninstall cleanup, and generic Provider boundary.
9. Stage 8: Client D1 registry, server-only generated Agent RPC client, Server Actions, and management UI routes without Browser credentials or public Agent proxy routes.

## Out-of-scope and interop boundary

- Stage 7/8 interop vocabulary is limited to Integration, Installation, Adapter, Tool, Delivery, DeliveryContext, and AgentEvent. External platform protocols stay behind the Integration Provider boundary and do not appear in Agent-facing artifact names.
- Provider-facing interop remains in scope for Stage 1-8 only as generic Agent-side Integration/Tool/Delivery capability: `IntegrationToolService.InvokeTool/GetOperation/CancelOperation`, `IntegrationDeliveryService.Deliver`, signed Connect + binary Protobuf metadata, Integration manifest/trust/grants, Adapter ingress, DeliveryContext, ToolInvocation, and Delivery result handling.

## Dependency and supply-chain plan

- Current dependency state already includes the foundation runtime/codegen packages in root and package manifests: TypeSpec Protobuf, Buf/Protobuf-ES, Connect, Cloudflare Agents SDK, Next.js/OpenNext, Wrangler, Vitest, and Playwright.
- Current supply-chain policy keeps `minimumReleaseAge: 4320`, has no `minimumReleaseAgeExclude`, and does not enable `dangerouslyAllowAllBuilds`; `allowBuilds` remains package-by-package.
- No dependency, version, lockfile, `allowBuilds`, or permission/binding changes were made in this preflight batch.
- Future ask-first items remain for any new dependency addition/update, version change, build-script approval change, release-age bypass, permission/binding boundary change, or dependency remediation required by Stage 1-8 implementation.

## Evidence index

- Archived foundation completion: `openspec/changes/archive/2026-06-21-establish-agent-service-foundation/tasks.md` shows all prerequisite, package/codegen, Agent/Client, governance, deletion, and final verification tasks checked.
- Archived foundation scope: `openspec/changes/archive/2026-06-21-establish-agent-service-foundation/design.md` defines Agent/Client package foundations, TypeSpec-to-proto generation, Connect facade, Client D1, guardrails, and old demo graph removal conditions.
- Current command graph: `package.json` exposes Agent/Client dev/build/check/test, Agent proto/RPC generation, codegen drift, lint, governance, supply-chain, and build scripts.
- Current workspace/supply-chain: `pnpm-workspace.yaml` includes only `packages/agent` and `packages/client`, preserves `minimumReleaseAge: 4320`, and uses explicit `allowBuilds`.
- Current Agent foundation: `packages/agent/package.json`, `packages/agent/wrangler.toml`, `packages/agent/src/typespec/main.tsp`, `packages/agent/proto/cftamac/agent/v1.proto`, `packages/agent/src/rpc/router.ts`, `packages/agent/src/rpc/connect-worker-adapter.ts`, `packages/agent/src/AIAgent.ts`, and `packages/agent/src/storage/schema.ts` show package scripts, AI_AGENT/R2 bindings, TypeSpec imports, generated proto package, Connect service registration, binary/fail-closed adapter, AIAgent DO foundation, and DO SQLite foundation tables.
- Current Client foundation: `packages/client/package.json`, `packages/client/wrangler.toml`, `packages/client/src/server/db/schema.ts`, and `packages/client/src/server/agent-rpc/create-client.ts` show Next/OpenNext scripts, CLIENT_DB-only binding, management-ledger-only tables, and server-only generated Connect client usage.
- Active legacy graph check: required glob returned no `packages/typespec`, `packages/frontend`, or `packages/backend` files; required grep results were docs/negative guidance/tests/governance fixtures/current health modules rather than active legacy Agent OpenAPI/Orval/Hono route graph.
