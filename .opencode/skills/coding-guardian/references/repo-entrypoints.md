# Repository entrypoints

Read these files before applying `coding-guardian` in this repository.

## Core flow

- `AGENTS.md`: project workflow, required commands, language policy
- `CODING_STANDARDS.md`: mechanically enforced rules summary
- `CONTRIBUTING.md`: contributor workflow and required checks
- `package.json`: root command graph for dev, build, lint, check, codegen, and tests
- `.github/workflows/ci.yml`: default CI order

## Agent foundation enforcement

- Scope: `packages/agent/**`
- `packages/agent/package.json`: Agent Worker package scripts and dependencies
- `packages/agent/wrangler.toml`: `AI_AGENT` Durable Object and Agent-owned blob bindings; no D1, `CLIENT_DB`, or Cloudflare Queues bindings
- `packages/agent/src/index.ts`: Agent Worker fetch entrypoint
- `packages/agent/src/AIAgent.ts`: Cloudflare Agents SDK Durable Object foundation
- `packages/agent/src/env.ts`: Agent binding types and no-Client-D1 boundary
- `packages/agent/src/rpc/**`: Connect Worker adapter, router, fail-closed service modules, interceptors, and Durable Object dispatcher
- `packages/agent/src/storage/schema/agent-storage.ts`: Agent-owned DO SQLite schema constants
- `packages/agent/src/tests/*.test.ts`: `AGENT-PLATFORM-*` Scenario ID coverage

## Agent TypeSpec, proto, and RPC codegen

- `packages/agent/src/typespec/main.tsp`: Agent API contract source of truth
- `packages/agent/src/typespec/tspconfig.yaml`: TypeSpec protobuf emitter output config
- `packages/agent/src/typespec/src/common/*.tsp`: Agent common model stubs
- `packages/agent/src/typespec/src/models/*.tsp`: Agent domain model stubs
- `packages/agent/src/typespec/src/services/*.tsp`: RPC Service Inventory stubs, including `agent-adapter.tsp` for `IntegrationIngressService`
- `packages/agent/src/typespec/src/services/integration-tool.tsp`: Provider-facing `IntegrationToolService` contract generated from Agent TypeSpec/proto
- `packages/agent/src/typespec/src/services/integration-delivery.tsp`: Provider-facing `IntegrationDeliveryService` contract generated from Agent TypeSpec/proto
- `packages/agent/buf.yaml`: Buf lint/breaking configuration
- `packages/agent/buf.gen.yaml`: Protobuf-ES generation targets for Agent and Client outputs
- `packages/agent/proto/cftamac/agent/v1.proto`: command-owned generated proto output; do not hand-edit
- `packages/agent/src/generated/rpc/cftamac/agent/v1_pb.ts`: command-owned generated Agent RPC descriptors; do not hand-edit
- `packages/client/src/generated/agent-rpc/cftamac/agent/v1_pb.ts`: command-owned generated Client RPC descriptors; do not hand-edit
- `scripts/codegen/check-agent-codegen-drift.mjs`: Agent proto/RPC drift, public Agent OpenAPI absence, RPC Service Inventory, descriptor invariant, and Protobuf field stability checks

## Management Client foundation enforcement

- Scope: `packages/client/**`
- `packages/client/package.json`: Next.js Client Worker package scripts and dependencies
- `packages/client/wrangler.toml`: `CLIENT_DB` and credential secret references; no `AI_AGENT` or Agent-owned storage bindings
- `packages/client/next.config.ts`: Next.js App Router configuration
- `packages/client/open-next.config.ts`: Cloudflare/OpenNext adapter configuration
- `packages/client/app/**`: management route shells for `/agents` and detail sections; no `hello` or `users` experience
- `packages/client/src/server/actions/managed-agents.ts`: Server Actions for Client-owned management ledger interactions
- `packages/client/src/server/agent-rpc/**`: server-only generated Agent RPC client factory and auth metadata
- `packages/client/src/server/db/**`: Client D1 schema, migrations, managed Agent records, and credential reference repositories only
- `packages/client/src/tests/*.test.ts*`: `client-*` Scenario ID coverage

## Git hooks

- `.husky/pre-commit`: `pnpm lint-staged` then `pnpm check:codegen`
- `.husky/commit-msg`: `pnpm commitlint --edit $1`
- `.lintstagedrc.json`: staged-file formatting rules for TS, TSX, JS, JSX, JSON, and Markdown
- `commitlint.config.js`: conventional commit type policy

## Legacy demo deletion note

- Old demo contract/server/UI package graph is removed from the active workspace and must not be used as the implementation or review baseline.
- Do not model Agent APIs with the old demo OpenAPI/Orval flow; use `packages/agent/src/typespec/**` and Agent proto/RPC generation instead.
- Do not route new work to removed backend/frontend unit agents; use `unit/agent/*`, `unit/client/*`, or `unit/build/*`.

## OpenSpec enforcement

- `scripts/openspec/verify-scenario-coverage.mjs`: Scenario ID coverage checks used by `pnpm lint`

## Workspace governance enforcement

- `scripts/governance/verify-agent-surface.mjs`: forbidden Agent REST/OpenAPI/Orval/JSON surface and documentation command checks
- `scripts/governance/verify-package-boundaries.mjs`: Agent/Client runtime coupling, binding boundary, and `.opencode` workflow alignment checks
- `scripts/security/verify-pnpm-supply-chain.mjs`: release-age and package-by-package build-script approval checks
- `.opencode/skills/coding-guardian/SKILL.md`: coding baseline for Agent/Client foundation and generated RPC policy
- `.opencode/agents/openspec/applier.md`: delegation map for Agent/Client/codegen/governance/docs work
- `.opencode/agents/unit/agent/*.md`: Agent package and Agent Service governance implementation/review guidance
- `.opencode/agents/unit/client/*.md`: Client package, management UI, server-only RPC, no-proxy route, and UI review guidance
- `.opencode/agents/unit/build/*.md`: Agent/Client generation, lint, test, build, and final validation guidance

## Important reality checks

- There is no old frontend web alias
- There is no old backend internal alias
- There is no Go backend in this repository
- There is no `openapi.gen.go`
- There is no `docs/brand/**` baseline today
- Agent API must not use REST/OpenAPI/Orval as the public contract
- Generated RPC output is command-owned even when checked into git
