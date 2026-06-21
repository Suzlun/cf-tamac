## Primary Rules

- Think in English; respond in Japanese.

## Commands

- Install: `corepack enable && pnpm install`
- Dev (Agent Worker): `pnpm dev:agent`
- Dev (Management Client): `pnpm dev:management-client`
- Build foundation: `pnpm build:foundation`
- Check foundation: `pnpm check:agent && pnpm check:management-client`

## API Contract (TypeSpec)

- Agent public API source of truth: `packages/agent/src/typespec/main.tsp`
- Agent generated proto: `packages/agent/proto/cftamac/agent/v1.proto`
- Agent generated RPC outputs: `packages/agent/src/generated/rpc/**` and `packages/client/src/generated/agent-rpc/**`
- Regenerate Agent proto + RPC SDK: `pnpm gen:agent:proto && pnpm gen:agent:rpc`
- Regenerate all generated API outputs: `pnpm gen`
- Codegen drift check (CI-style): `pnpm check:codegen`
- Legacy demo OpenAPI/Orval workflow is removed from the active workspace; do not model Agent APIs with OpenAPI or Orval.

## Testing

- All unit tests: `pnpm test:run`
- Agent tests: `pnpm test:agent`
- Management Client tests: `pnpm test:management-client`
- Governance tests: `pnpm test:governance`
- E2E: `pnpm test:e2e`

## Supply Chain

- `pnpm-workspace.yaml` enforces `minimumReleaseAge: 4320` (72 hours); do not lower or bypass it.
- Dependency additions/updates must land at least 72 hours before release, unless an explicitly reviewed emergency exception is approved.
- New dependency build scripts require package-by-package approval through `allowBuilds`; never enable `dangerouslyAllowAllBuilds`.

## Architecture Notes

- Agent dependency direction: Worker entrypoint -> RPC adapter/router/interceptors -> service modules -> Agent domain/runtime modules -> Agent-owned storage/observability/types.
- Management Client direction: App Router/browser-visible modules -> Server Components/Server Actions -> server-only modules -> Client D1 repositories / generated Agent RPC client.
- Agent API contract direction: implementation must follow `packages/agent/src/typespec`; do not model Agent APIs with OpenAPI or Orval.
- Agent Worker (`packages/agent`) exposes Protobuf RPC-only via Connect unary binary Protobuf. Accept `POST` + `Content-Type: application/proto`; reject JSON/GET and fail closed for unmapped generated methods.
- Agent Worker owns `AI_AGENT` Durable Object and Agent blob storage only. It must not use `CLIENT_DB`, Agent-cross D1, Cloudflare Queues bindings, public Durable Object fetch APIs, REST/OpenAPI/Orval Agent surfaces, or ad-hoc JSON DTO APIs.
- Agent-local Queue is only a scheduler wake/coalescing boundary; accepted Events, pending Runs, Thread identity, replay/idempotency, audit, and rate-limit state stay in the `AIAgent` Durable Object SQLite foundation.
- Management Client (`packages/client`) owns `CLIENT_DB` and credential references only. It may call Agent RPC from server-only modules, but browser bundles must not contain Agent credentials, direct Agent RPC invocation logic, Agent runtime imports, or Agent API proxy routes.

## OpenSpec (Spec -> Test Contract)

- Source of truth (current behavior): `openspec/specs/**/spec.md`
- Every `#### Scenario:` heading MUST end with a stable Scenario ID: `(...-S001)`
  - Example: `#### Scenario: Create a user (USER-MGMT-S001)`
- Automated tests MUST reference Scenario IDs in the test title using brackets:
  - Example: `it('[USER-MGMT-S001] Create a user', async () => { ... })`
- To explicitly opt out of automation for a scenario, add `Tags: manual` under the scenario heading
- Guardrails are enforced by `pnpm lint`:
  - `openspec validate --all --strict`
  - Scenario ID coverage check (`scripts/openspec/verify-scenario-coverage.mjs`)
  - Coverage check uses `openspec/specs/**` as the contract (sync/archive deltas if you are working in `openspec/changes/**`)
